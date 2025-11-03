import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import Medication from '../models/Medication';
import Schedule from '../models/Schedule';
import { catchAsync } from '../middleware/errorHandler';

const router = Router();

/**
 * @route   GET /api/medications
 * @desc    Get all medications for a user
 * @access  Private
 */
router.get('/', catchAsync(async (req: Request, res: Response) => {
  const { userId, active = true } = req.query;

  if (!userId) {
    throw new AppError('User ID is required', 400);
  }

  const medications = await Medication.find({
    userId,
    isActive: active === 'true'
  }).populate('userId', 'name telexId');

  res.status(200).json({
    status: 'success',
    results: medications.length,
    data: medications
  });
}));

/**
 * @route   GET /api/medications/:id
 * @desc    Get medication by ID
 * @access  Private
 */
router.get('/:id', catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  const medication = await Medication.findById(id).populate('userId');

  if (!medication) {
    throw new AppError('Medication not found', 404);
  }

  res.status(200).json({
    status: 'success',
    data: medication
  });
}));

/**
 * @route   POST /api/medications
 * @desc    Create new medication
 * @access  Private
 */
router.post('/', catchAsync(async (req: Request, res: Response) => {
  const {
    userId,
    name,
    dosage,
    frequencyHours,
    startTime,
    durationDays,
    notes
  } = req.body;

  // Validate required fields
  if (!userId || !name || !dosage || !frequencyHours || !startTime || !durationDays) {
    throw new AppError('Missing required fields', 400);
  }

  // Validate frequency
  const validFrequencies = [6, 8, 12, 24];
  if (!validFrequencies.includes(frequencyHours)) {
    throw new AppError('Invalid frequency. Must be 6, 8, 12, or 24 hours', 400);
  }

  // Validate time format
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(startTime)) {
    throw new AppError('Invalid time format. Use HH:MM (24-hour format)', 400);
  }

  // Create medication
  const medication = new Medication({
    userId,
    name: name.trim(),
    dosage: dosage.trim(),
    frequencyHours,
    startTime,
    durationDays,
    notes: notes?.trim()
  });

  await medication.save();

  // Generate schedules
  await generateMedicationSchedules(medication);

  logger.info('💊 New medication created', {
    medicationId: medication._id,
    userId,
    name: medication.name
  });

  res.status(201).json({
    status: 'success',
    data: medication
  });
}));

/**
 * @route   PATCH /api/medications/:id
 * @desc    Update medication
 * @access  Private
 */
router.patch('/:id', catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const updates = req.body;

  const medication = await Medication.findById(id);
  if (!medication) {
    throw new AppError('Medication not found', 404);
  }

  // Don't allow updating certain fields directly
  const allowedUpdates = ['name', 'dosage', 'frequencyHours', 'startTime', 'durationDays', 'notes', 'isActive'];
  const actualUpdates = Object.keys(updates)
    .filter(key => allowedUpdates.includes(key))
    .reduce((obj, key) => {
      obj[key] = updates[key];
      return obj;
    }, {} as any);

  Object.assign(medication, actualUpdates);
  await medication.save();

  // If schedule-related fields changed, regenerate schedules
  if (actualUpdates.frequencyHours || actualUpdates.startTime || actualUpdates.durationDays) {
    await regenerateMedicationSchedules(id);
  }

  logger.info('💊 Medication updated', {
    medicationId: id,
    updates: actualUpdates
  });

  res.status(200).json({
    status: 'success',
    data: medication
  });
}));

/**
 * @route   DELETE /api/medications/:id
 * @desc    Delete medication
 * @access  Private
 */
router.delete('/:id', catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  const medication = await Medication.findById(id);
  if (!medication) {
    throw new AppError('Medication not found', 404);
  }

  // Soft delete by deactivating
  medication.isActive = false;
  await medication.save();

  // Cancel pending schedules
  await Schedule.updateMany(
    { medicationId: id, status: 'pending' },
    { status: 'cancelled' }
  );

  logger.info('💊 Medication deactivated', {
    medicationId: id,
    name: medication.name
  });

  res.status(204).json({
    status: 'success',
    data: null
  });
}));

/**
 * @route   GET /api/medications/:id/schedules
 * @desc    Get medication schedules
 * @access  Private
 */
router.get('/:id/schedules', catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { 
    status, 
    limit = 50, 
    offset = 0,
    startDate,
    endDate 
  } = req.query;

  const medication = await Medication.findById(id);
  if (!medication) {
    throw new AppError('Medication not found', 404);
  }

  // Build query
  const query: any = { medicationId: id };
  
  if (status) {
    query.status = status;
  }
  
  if (startDate || endDate) {
    query.reminderTime = {};
    if (startDate) query.reminderTime.$gte = new Date(startDate as string);
    if (endDate) query.reminderTime.$lte = new Date(endDate as string);
  }

  const schedules = await Schedule.find(query)
    .populate('medicationId')
    .sort({ reminderTime: -1 })
    .limit(parseInt(limit as string))
    .skip(parseInt(offset as string));

  const total = await Schedule.countDocuments(query);

  res.status(200).json({
    status: 'success',
    results: schedules.length,
    total,
    data: schedules
  });
}));

/**
 * @route   GET /api/medications/:id/adherence
 * @desc    Get medication adherence statistics
 * @access  Private
 */
router.get('/:id/adherence', catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { days = 30 } = req.query;

  const medication = await Medication.findById(id);
  if (!medication) {
    throw new AppError('Medication not found', 404);
  }

  const adherenceStats = await (Schedule as any).getAdherenceStats(id, parseInt(days as string));

  // Calculate adherence rate
  const stats = adherenceStats.reduce((acc: any, stat: any) => {
    acc[stat._id] = stat.count;
    return acc;
  }, {});

  const total = Object.values(stats).reduce((sum: number, stat: any) => sum + (stat.count || 0), 0);
  const confirmed = (stats as any).confirmed || 0;
  const adherenceRate = total > 0 ? Math.round((confirmed / total) * 100) : 0;

  res.status(200).json({
    status: 'success',
    data: {
      medicationId: id,
      period: `${days} days`,
      adherenceRate,
      stats: {
        pending: stats.pending || 0,
        confirmed: stats.confirmed || 0,
        missed: stats.missed || 0
      },
      totalDoses: total
    }
  });
}));

/**
 * @route   POST /api/medications/:id/confirm
 * @desc    Confirm medication dose
 * @access  Private
 */
router.post('/:id/confirm', catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { scheduleId, notes } = req.body;

  const schedule = await Schedule.findOne({
    _id: scheduleId,
    medicationId: id,
    status: 'pending'
  });

  if (!schedule) {
    throw new AppError('Pending schedule not found', 404);
  }

  await (schedule as any).confirm(notes);

  logger.info('✅ Medication dose confirmed', {
    medicationId: id,
    scheduleId,
    confirmedAt: new Date()
  });

  res.status(200).json({
    status: 'success',
    message: 'Medication dose confirmed'
  });
}));

/**
 * Generate schedules for a medication
 */
async function generateMedicationSchedules(medication: any): Promise<void> {
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

  if (schedules.length > 0) {
    await Schedule.insertMany(schedules);
    logger.info(`Generated ${schedules.length} schedules for medication ${medication._id}`);
  }
}

/**
 * Regenerate schedules for a medication
 */
async function regenerateMedicationSchedules(medicationId: string): Promise<void> {
  // Delete existing pending schedules
  await Schedule.deleteMany({
    medicationId,
    status: 'pending'
  });

  // Generate new schedules
  const medication = await Medication.findById(medicationId);
  if (medication && medication.isActive) {
    await generateMedicationSchedules(medication);
  }
}

export default router;