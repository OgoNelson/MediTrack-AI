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
medicationSchema.virtual('nextDoseTime').get(function(this: IMedication) {
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
    const endDate = new Date(this.createdAt);
    endDate.setDate(endDate.getDate() + this.durationDays);
    
    if (endDate < new Date()) {
      this.isActive = false;
    }
  }
  next();
});

// Static methods
(medicationSchema.statics as any).findActiveByUser = function(userId: string) {
  return this.find({ userId, isActive: true }).populate('userId');
};

(medicationSchema.statics as any).findDueMedications = function() {
  const now = new Date();
  return this.find({
    isActive: true,
    $or: [
      { startTime: { $lte: now.toTimeString().slice(0, 5) } }
    ]
  });
};

// Instance methods
medicationSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

medicationSchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

medicationSchema.methods.isExpired = function() {
  const endDate = new Date(this.createdAt);
  endDate.setDate(endDate.getDate() + this.durationDays);
  return endDate < new Date();
};

medicationSchema.methods.calculateNextDoses = function(count: number = 5) {
  const doses = [];
  const [hours, minutes] = this.startTime.split(':').map(Number);
  
  let nextDose = new Date();
  nextDose.setHours(hours, minutes, 0, 0);
  
  // If start time has passed today, start from tomorrow
  const now = new Date();
  if (nextDose <= now) {
    nextDose.setDate(nextDose.getDate() + 1);
  }
  
  for (let i = 0; i < count; i++) {
    doses.push(new Date(nextDose));
    nextDose.setTime(nextDose.getTime() + (this.frequencyHours * 60 * 60 * 1000));
  }
  
  return doses;
};

medicationSchema.methods.toJSON = function() {
  const medicationObject = this.toObject();
  delete medicationObject.__v;
  return medicationObject;
};

const Medication = mongoose.model<IMedication>('Medication', medicationSchema);

export default Medication;