
import mongoose, { Document, Schema } from 'mongoose';

export interface IMedication extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  dosage: string;
  frequencyHours: number;
  startTime: string;
  durationDays: number;
  isActive: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const medicationSchema = new Schema<IMedication>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  name: {
    type: String,
    required: [true, 'Medication name is required'],
    trim: true,
    maxlength: [100, 'Medication name cannot exceed 100 characters']
  },
  dosage: {
    type: String,
    required: [true, 'Dosage is required'],
    trim: true,
    maxlength: [50, 'Dosage cannot exceed 50 characters']
  },
  frequencyHours: {
    type: Number,
    required: [true, 'Frequency is required'],
    min: [1, 'Frequency must be at least 1 hour'],
    max: [168, 'Frequency cannot exceed 168 hours (1 week)'],
    enum: {
      values: [6, 8, 12, 24],
      message: 'Frequency must be 6, 8, 12, or 24 hours'
    }
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required'],
    validate: {
      validator: function(time: string) {
        // Validate time format HH:MM
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
      },
      message: 'Start time must be in HH:MM format (24-hour)'
    }
  },
  durationDays: {
    type: Number,
    required: [true, 'Duration is required'],
    min: [1, 'Duration must be at least 1 day'],
    max: [365, 'Duration cannot exceed 365 days']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters'],
    trim: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
medicationSchema.index({ userId: 1 });
medicationSchema.index({ isActive: 1 });
medicationSchema.index({ userId: 1, isActive: 1 });

// Virtual for schedules
medicationSchema.virtual('schedules', {
  ref: 'Schedule',
  localField: '_id',
  foreignField: 'medicationId'
});

// Virtual for next dose time
medicationSchema.virtual('nextDoseTime').get(function() {
  if (!this.isActive) return null;
  
  const now = new Date();
  const [hours, minutes] = this.startTime.split(':').map(Number);
  
  let nextDose = new Date();
  nextDose.setHours(hours, minutes, 0, 0);
  
  // If the start time has passed today, calculate next dose based on frequency
  if (nextDose <= now) {
    const hoursUntilNext = this.frequencyHours;
    nextDose.setTime(now.getTime() + (hoursUntilNext * 60 * 60 * 1000));
  }
  
  return nextDose;
});

// Pre-save middleware
medicationSchema.pre('save', function(next: any) {
  // Auto-deactivate if duration has passed
  if (this.isModified('isActive') && this.isActive) {
