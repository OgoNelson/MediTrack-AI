import * as cron from 'node-cron';
import { logger } from '../utils/logger';
import Medication from '../models/Medication';
import Schedule from '../models/Schedule';
import { A2AResponseBuilder } from '../utils/a2aFormatter';
import axios from 'axios';

/**
 * Scheduler Service for Medication Reminders
 * Handles automated medication reminders using cron jobs
 */
export class SchedulerService {
  private static instance: SchedulerService;
  private isRunning: boolean = false;
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private reminderCheckJob?: cron.ScheduledTask;

  private constructor() {
    this.initialize();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService();
    }
    return SchedulerService.instance;
  }

  /**
   * Initialize the scheduler service
   */
  private initialize(): void {
    if (process.env.SCHEDULER_ENABLED !== 'true') {
      logger.info('⏸️ Scheduler service is disabled');
      return;
    }

    this.startReminderCheckJob();
    this.isRunning = true;
    logger.info('⏰ Scheduler service initialized');
  }

  /**
   * Start the main reminder check job (runs every minute)
   */
  private startReminderCheckJob(): void {
    // Check for due reminders every minute
    this.reminderCheckJob = cron.schedule('* * * * * *', async () => {
      await this.checkDueReminders();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.reminderCheckJob.start();
    logger.info('🔄 Reminder check job started (every minute)');
  }

  /**
   * Check for due reminders and send notifications
   */
  private async checkDueReminders(): Promise<void> {
    try {
      const now = new Date();
      const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
      const oneMinuteFromNow = new Date(now.getTime() + 60 * 1000);

      // Find reminders that are due (within the next minute)
      const dueReminders = await (Schedule as any).findPendingReminders(50);
      
      if (dueReminders.length === 0) {
        return; // No due reminders
      }

      logger.info(`📬 Processing ${dueReminders.length} due reminders`);

      for (const reminder of dueReminders) {
        await this.processReminder(reminder);
      }

    } catch (error) {
      logger.error('❌ Error checking due reminders:', error);
    }
  }

  /**
   * Process a single reminder
   */
  private async processReminder(reminder: any): Promise<void> {
    try {
      // Check if reminder is actually due (within 1 minute window)
      const now = new Date();
      const reminderTime = new Date(reminder.reminderTime);
      const timeDiff = Math.abs(reminderTime.getTime() - now.getTime());
      
      if (timeDiff > 60000) { // More than 1 minute difference
        return;
      }

      // Get medication details
      const medication = await Medication.findById(reminder.medicationId).populate('userId');
      if (!medication || !medication.isActive) {
        // Mark as missed if medication is inactive
        await reminder.markMissed('Medication inactive');
        return;
      }

      // Send reminder notification
      await this.sendReminderNotification(medication, reminder);

      // Update reminder status
      reminder.status = 'sent';
      await reminder.save();

      logger.info('✅ Reminder sent', {
        reminderId: reminder._id,
        medicationId: medication._id,
        userId: medication.userId._id
      });

    } catch (error) {
      logger.error('❌ Error processing reminder:', error);
    }
  }

  /**
   * Send reminder notification via Telex.im
   */
  private async sendReminderNotification(medication: any, reminder: any): Promise<void> {
    try {
      const user = medication.userId;
      const telexId = user.telexId;

      // Generate reminder message
      const message = new A2AResponseBuilder()
        .text(`💊 Time to take your ${medication.dosage} ${medication.name}.`)
        .addButton('✅ Taken', `confirm_taken_${reminder._id}`, 'primary')
        .addButton('⏰ Snooze 15min', `snooze_15_${reminder._id}`, 'secondary')
        .addButton('❌ Skip', `skip_dose_${reminder._id}`, 'danger')
        .build();

      // Send to Telex.im webhook
      const webhookUrl = process.env.TELEX_WEBHOOK_URL;
      if (!webhookUrl) {
        logger.warn('⚠️ TELEX_WEBHOOK_URL not configured, skipping notification');
        return;
      }

      await axios.post(webhookUrl, {
        chat_id: telexId,
        message: message.response.data
      });

      logger.info('📤 Reminder notification sent', {
        telexId,
        medicationId: medication._id,
        reminderId: reminder._id
      });

    } catch (error) {
      logger.error('❌ Error sending reminder notification:', error);
    }
  }

  /**
   * Schedule reminders for a medication
   */
  async scheduleMedicationReminders(medicationId: string): Promise<void> {
    try {
      const medication = await Medication.findById(medicationId);
      if (!medication) {
        throw new Error(`Medication not found: ${medicationId}`);
      }

      // Generate schedules for the medication
      await this.generateMedicationSchedules(medication);

      logger.info('📅 Medication reminders scheduled', {
        medicationId,
        medicationName: medication.name
      });

    } catch (error) {
      logger.error('❌ Error scheduling medication reminders:', error);
    }
  }

  /**
   * Generate schedules for a medication
   */
  private async generateMedicationSchedules(medication: any): Promise<void> {
    const schedules = [];
    const now = new Date();
    const [hours, minutes] = medication.startTime.split(':').map(Number);
    
    let nextDose = new Date();
    nextDose.setHours(hours, minutes, 0, 0);
    
    // If start time has passed today, start from tomorrow
    if (nextDose <= now) {
      nextDose.setDate(nextDose.getDate() + 1);
    }

    const endDate = new Date(medication.createdAt);
    endDate.setDate(endDate.getDate() + medication.durationDays);

    // Generate schedules up to the end date
    while (nextDose <= endDate) {
      schedules.push({
        medicationId: medication._id,
        reminderTime: new Date(nextDose),
        status: 'pending'
      });

      nextDose.setTime(nextDose.getTime() + (medication.frequencyHours * 60 * 60 * 1000));
    }

    // Insert schedules in batch
    if (schedules.length > 0) {
      await Schedule.insertMany(schedules);
      logger.info(`Generated ${schedules.length} schedules for medication ${medication._id}`);
    }
  }

  /**
   * Handle snooze action
   */
  async snoozeReminder(reminderId: string, minutes: number = 15): Promise<void> {
    try {
      const reminder = await Schedule.findById(reminderId);
      if (!reminder || reminder.status !== 'pending') {
        throw new Error('Reminder not found or not pending');
      }

      // Calculate new reminder time
      const newTime = new Date();
      newTime.setTime(newTime.getTime() + (minutes * 60 * 1000));

      // Update reminder time
      reminder.reminderTime = newTime;
      await reminder.save();

      logger.info('⏰ Reminder snoozed', {
        reminderId,
        minutes,
        newTime: newTime.toISOString()
      });

    } catch (error) {
      logger.error('❌ Error snoozing reminder:', error);
    }
  }

  /**
   * Handle skip dose action
   */
  async skipDose(reminderId: string, reason?: string): Promise<void> {
    try {
      const reminder = await Schedule.findById(reminderId);
      if (!reminder || reminder.status !== 'pending') {
        throw new Error('Reminder not found or not pending');
      }

      await (reminder as any).markMissed(reason || 'User skipped dose');

      logger.info('❌ Dose skipped', {
        reminderId,
        reason
      });

    } catch (error) {
      logger.error('❌ Error skipping dose:', error);
    }
  }

  /**
   * Clean up old completed schedules
   */
  async cleanupOldSchedules(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await Schedule.deleteMany({
        createdAt: { $lt: thirtyDaysAgo },
        status: { $in: ['confirmed', 'missed'] }
      });

      if (result.deletedCount > 0) {
        logger.info(`🧹 Cleaned up ${result.deletedCount} old schedules`);
      }

    } catch (error) {
      logger.error('❌ Error cleaning up old schedules:', error);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isRunning: boolean;
    activeJobs: number;
    nextCheck: string;
  } {
    return {
      isRunning: this.isRunning,
      activeJobs: this.jobs.size,
      nextCheck: this.reminderCheckJob ? 'Running' : 'Stopped'
    };
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    if (this.reminderCheckJob) {
      this.reminderCheckJob.stop();
    }

    this.jobs.forEach(job => job.stop());
    this.jobs.clear();
    this.isRunning = false;

    logger.info('⏹️ Scheduler service stopped');
  }

  /**
   * Restart the scheduler service
   */
  restart(): void {
    this.stop();
    this.initialize();
  }
}

// Export singleton instance
export const schedulerService = SchedulerService.getInstance();

export default schedulerService;