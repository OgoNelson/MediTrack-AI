import mongoose, { Document, Schema } from 'mongoose';

export interface ISchedule extends Document {
  medicationId: mongoose.Types.ObjectId;
  reminderTime: Date;
  status: 'pending' | 'confirmed' | 'missed';
  confirmedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const scheduleSchema = new Schema<ISchedule>({
  medicationId: {
    type: Schema.Types.ObjectId,
    ref: 'Medication',
    required: [true, 'Medication ID is required']
  },
  reminderTime: {
    type: Date,
    required: [true, 'Reminder time is required'],
    index: true
  },
  status: {
    type: String,
    required: [true, 'Status is required'],
    enum: {
      values: ['pending', 'confirmed', 'missed'],
      message: 'Status must be pending, confirmed, or missed'
    },
    default: 'pending'
  },
  confirmedAt: {
    type: Date,
    validate: {
      validator: function(this: ISchedule, value: Date) {
        // If confirmedAt is set, status must be confirmed
        return !value || this.status === 'confirmed';
      },
      message: 'Confirmed time can only be set when status is confirmed'
    }
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
scheduleSchema.index({ medicationId: 1 });
scheduleSchema.index({ reminderTime: 1 });
scheduleSchema.index({ status: 1 });
scheduleSchema.index({ medicationId: 1, status: 1 });
scheduleSchema.index({ reminderTime: 1, status: 1 });

// Virtual for medication details
scheduleSchema.virtual('medication', {
  ref: 'Medication',
  localField: 'medicationId',
  foreignField: '_id'
});

// Virtual for time until reminder
scheduleSchema.virtual('timeUntilReminder').get(function(this: ISchedule) {
  if (this.status !== 'pending') return null;
  
  const now = new Date();
  const diffMs = this.reminderTime.getTime() - now.getTime();
  
  if (diffMs <= 0) return 'Overdue';
  
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffHours > 24) {
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
  }
  
  if (diffHours > 0) {
    return `${diffHours}h ${diffMinutes}m`;
  }
  
  return `${diffMinutes}m`;
});

// Pre-save middleware
scheduleSchema.pre('save', function(next: any) {
  // Auto-set confirmedAt when status changes to confirmed
  if (this.isModified('status') && this.status === 'confirmed' && !this.confirmedAt) {
    this.confirmedAt = new Date();
  }
  
  // Auto-miss overdue reminders
  if (this.status === 'pending' && this.reminderTime < new Date()) {
    this.status = 'missed';
  }
  
  next();
});

// Static methods
(scheduleSchema.statics as any).findPendingReminders = function(limit: number = 100) {
  const now = new Date();
  return this.find({
    status: 'pending',
    reminderTime: { $lte: now }
  })
  .populate('medicationId')
  .limit(limit)
  .sort({ reminderTime: 1 });
};

(scheduleSchema.statics as any).findUpcomingReminders = function(hours: number = 24) {
  const now = new Date();
  const endTime = new Date(now.getTime() + (hours * 60 * 60 * 1000));
  
  return this.find({
    status: 'pending',
    reminderTime: { $gte: now, $lte: endTime }
  })
  .populate('medicationId')
  .sort({ reminderTime: 1 });
};

(scheduleSchema.statics as any).findByMedication = function(medicationId: string, limit: number = 50) {
  return this.find({ medicationId })
    .populate('medicationId')
    .sort({ reminderTime: -1 })
    .limit(limit);
};

(scheduleSchema.statics as any).getAdherenceStats = function(medicationId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.aggregate([
    {
      $match: {
        medicationId: new mongoose.Types.ObjectId(medicationId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
};

// Instance methods
scheduleSchema.methods.confirm = function(notes?: string) {
  this.status = 'confirmed';
  this.confirmedAt = new Date();
  if (notes) this.notes = notes;
  return this.save();
};

scheduleSchema.methods.markMissed = function(notes?: string) {
  this.status = 'missed';
  if (notes) this.notes = notes;
  return this.save();
};

scheduleSchema.methods.isOverdue = function() {
  return this.status === 'pending' && this.reminderTime < new Date();
};

scheduleSchema.methods.toJSON = function() {
  const scheduleObject = this.toObject();
  delete scheduleObject.__v;
  return scheduleObject;
};

const Schedule = mongoose.model<ISchedule>('Schedule', scheduleSchema);

export default Schedule;