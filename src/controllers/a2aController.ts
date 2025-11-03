import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { 
  A2AMessageParser, 
  A2ATemplates, 
  validateA2AMessage, 
  validateA2AResponse,
  A2AIncomingMessage,
  MedicationIntent
} from '../utils/a2aFormatter';
import { AppError } from '../middleware/errorHandler';
import User from '../models/User';
import Medication from '../models/Medication';
import Schedule from '../models/Schedule';

export class A2AController {
  /**
   * Handle incoming A2A webhook from Telex.im
   */
  static async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Log incoming request
      logger.info('📥 Received A2A webhook', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.body
      });

      // Parse and validate incoming message
      const a2aMessage = A2AMessageParser.parseIncoming(req.body);
      
      if (!validateA2AMessage(a2aMessage)) {
        throw new AppError('Invalid A2A message format', 400);
      }

      // Process the message based on event type
      let response;
      
      switch (a2aMessage.event) {
        case 'message.created':
          response = await this.handleMessageCreated(a2aMessage);
          break;
        case 'action.clicked':
          response = await this.handleActionClicked(a2aMessage);
          break;
        default:
          throw new AppError(`Unsupported event type: ${a2aMessage.event}`, 400);
      }

      // Validate response before sending
      if (!validateA2AResponse(response)) {
        throw new AppError('Invalid response format', 500);
      }

      // Log successful processing
      const processingTime = Date.now() - startTime;
      logger.info('✅ A2A webhook processed successfully', {
        processingTime: `${processingTime}ms`,
        eventType: a2aMessage.event,
        senderId: a2aMessage.data.sender_id
      });

      // Send response
      res.status(200).json(response);

    } catch (error) {
      logger.error('❌ Error processing A2A webhook:', error);
      
      // Send error response
      const errorResponse = A2ATemplates.error(
        error instanceof Error ? error.message : 'Unknown error occurred'
      );
      
      res.status(error instanceof AppError ? error.statusCode || 500 : 500)
         .json(errorResponse);
    }
  }

  /**
   * Handle new message events
   */
  private static async handleMessageCreated(message: A2AIncomingMessage): Promise<any> {
    const senderId = message.data.sender_id;
    const messageText = message.data.message?.text || '';

    if (!messageText.trim()) {
      return A2ATemplates.help();
    }

    // Get or create user
    const user = await this.getOrCreateUser(senderId);
    
    // If user doesn't have a role set, show role selection
    if (!user.role) {
      return A2ATemplates.roleSelection();
    }

    // Extract medication intent from message
    const intent = A2AMessageParser.extractMedicationIntent(messageText);
    
    // Process based on intent
    switch (intent.intent) {
      case 'add_medication':
        return await this.handleAddMedication(user, intent);
      case 'list_medications':
        return await this.handleListMedications(user);
      case 'confirm_medication':
        return await this.handleConfirmMedication(user);
      case 'help':
        return A2ATemplates.help();
      default:
        return new A2AResponseBuilder()
          .text("I'm not sure what you mean. Try saying \"help\" to see what I can do!")
          .addButton("🆘 Help", "help")
          .build();
    }
  }

  /**
   * Handle button click events
   */
  private static async handleActionClicked(message: A2AIncomingMessage): Promise<any> {
    const senderId = message.data.sender_id;
    const actionId = message.data.action_id;

    const user = await this.getOrCreateUser(senderId);

    switch (actionId) {
      case 'set_role_patient':
        return await this.handleSetRole(user, 'patient');
      case 'set_role_caregiver':
        return await this.handleSetRole(user, 'caregiver');
      case 'confirm_taken':
        return await this.handleConfirmTaken(user);
      case 'snooze_15':
        return await this.handleSnooze(user, 15);
      case 'skip_dose':
        return await this.handleSkipDose(user);
      case 'list_medications':
        return await this.handleListMedications(user);
      case 'add_medication':
        return new A2AResponseBuilder()
          .text("To add a medication, tell me:\n\n" +
                "• Medication name\n" +
                "• Dosage (e.g., 500mg)\n" +
                "• Frequency (6h, 8h, 12h, or daily)\n" +
                "• Start time (e.g., 6:00 AM)\n" +
                "• Duration (e.g., 5 days)\n\n" +
                "Example: \"Remind me to take Amoxicillin 500mg every 8 hours starting 6 AM for 5 days\"")
          .addButton("🔙 Back", "help")
          .build();
      case 'help':
        return A2ATemplates.help();
      default:
        return A2ATemplates.error(`Unknown action: ${actionId}`);
    }
  }

  /**
   * Get or create user from Telex ID
   */
  private static async getOrCreateUser(telexId: string) {
    let user = await User.findByTelexId(telexId);
    
    if (!user) {
      user = new User({
        telexId,
        role: null, // Will be set later
        name: `User ${telexId.slice(-4)}`, // Temporary name
        timezone: 'UTC'
      });
      await user.save();
      
      logger.info('👤 Created new user', { telexId, userId: user._id });
    }
    
    return user;
  }

  /**
   * Handle role selection
   */
  private static async handleSetRole(user: any, role: 'patient' | 'caregiver') {
    user.role = role;
    await user.save();
    
    return new A2AResponseBuilder()
      .text(`Great! You're set up as a ${role}. I can now help you manage medication reminders.`)
      .addButton("➕ Add Medication", "add_medication")
      .addButton("📋 List Medications", "list_medications")
      .addButton("🆘 Help", "help")
      .build();
  }

  /**
   * Handle add medication intent
   */
  private static async handleAddMedication(user: any, intent: MedicationIntent) {
    // Validate required fields
    if (!intent.medicineName || !intent.dosage || !intent.frequencyHours) {
      return new A2AResponseBuilder()
        .text("I need more information to set up this medication reminder. Please provide:\n\n" +
              "• Medication name\n" +
              "• Dosage (e.g., 500mg)\n" +
              "• Frequency (6h, 8h, 12h, or daily)\n" +
              "• Start time (e.g., 6:00 AM)\n" +
              "• Duration (e.g., 5 days)")
        .addButton("🆘 Help", "help")
        .build();
    }

    // Set defaults if not provided
    const startTime = intent.startTime || '08:00';
    const durationDays = intent.durationDays || 7;

    // Create medication
    const medication = new Medication({
      userId: user._id,
      name: intent.medicineName,
      dosage: intent.dosage,
      frequencyHours: intent.frequencyHours,
      startTime,
      durationDays,
      notes: intent.notes
    });

    await medication.save();

    // Generate schedules
    await this.generateSchedules(medication);

    logger.info('💊 Added new medication', {
      userId: user._id,
      medicationId: medication._id,
      name: medication.name
    });

    const frequencyText = this.getFrequencyText(intent.frequencyHours);
    return A2ATemplates.medicationAdded(
      medication.name,
      medication.dosage,
      frequencyText
    );
  }

  /**
   * Handle list medications
   */
  private static async handleListMedications(user: any) {
    const medications = await Medication.findActiveByUser(user._id);
    
    if (medications.length === 0) {
      return new A2AResponseBuilder()
        .text("You don't have any active medication reminders.")
        .addButton("➕ Add Medication", "add_medication")
        .build();
    }

    let medicationList = "📋 Your Active Medications:\n\n";
    
    medications.forEach((med: any, index: number) => {
      const frequencyText = this.getFrequencyText(med.frequencyHours);
      medicationList += `${index + 1}. ${med.name} - ${med.dosage}\n`;
      medicationList += `   ⏰ ${frequencyText} starting at ${med.startTime}\n`;
      medicationList += `   📅 Duration: ${med.durationDays} days\n\n`;
    });

    return new A2AResponseBuilder()
      .text(medicationList)
      .addButton("➕ Add Medication", "add_medication")
      .addButton("🆘 Help", "help")
      .build();
  }

  /**
   * Handle medication confirmation
   */
  private static async handleConfirmMedication(user: any) {
    // Find the most recent pending reminder
    const pendingSchedule = await Schedule.findOne({
      // This would need to be populated with user's medications
      // For now, return a generic response
    });

    return new A2AResponseBuilder()
      .text("Great! I've marked your medication as taken. Keep up the good work! 💪")
      .build();
  }

  /**
   * Handle confirm taken button
   */
  private static async handleConfirmTaken(user: any) {
    // Find and update the most recent pending schedule
    const pendingSchedule = await Schedule.findOneAndUpdate(
      { 
        // This would need proper user filtering
        status: 'pending',
        reminderTime: { $lte: new Date() }
      },
      { 
        status: 'confirmed',
        confirmedAt: new Date()
      },
      { sort: { reminderTime: -1 } }
    );

    if (pendingSchedule) {
      return A2ATemplates.success("Medication confirmed as taken!");
    }

    return new A2AResponseBuilder()
      .text("No pending medication found to confirm.")
      .addButton("📋 List Medications", "list_medications")
      .build();
  }

  /**
   * Handle snooze action
   */
  private static async handleSnooze(user: any, minutes: number) {
    return new A2AResponseBuilder()
      .text(`⏰ I'll remind you again in ${minutes} minutes.`)
      .build();
  }

  /**
   * Handle skip dose action
   */
  private static async handleSkipDose(user: any) {
    return new A2AResponseBuilder()
      .text("❌ Dose skipped. If this was a mistake, please take your medication as soon as possible.")
      .build();
  }

  /**
   * Generate medication schedules
   */
  private static async generateSchedules(medication: any) {
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

    while (nextDose <= endDate) {
      schedules.push({
        medicationId: medication._id,
        reminderTime: new Date(nextDose),
        status: 'pending'
      });

      nextDose.setTime(nextDose.getTime() + (medication.frequencyHours * 60 * 60 * 1000));
    }

    await Schedule.insertMany(schedules);
    logger.info(`Generated ${schedules.length} schedules for medication ${medication._id}`);
  }

  /**
   * Get human-readable frequency text
   */
  private static getFrequencyText(hours: number): string {
    switch (hours) {
      case 6: return 'Every 6 hours';
      case 8: return 'Every 8 hours';
      case 12: return 'Every 12 hours';
      case 24: return 'Daily';
      default: return `Every ${hours} hours`;
    }
  }
}

// Import A2AResponseBuilder
import { A2AResponseBuilder } from '../utils/a2aFormatter';

export default A2AController;