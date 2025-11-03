import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  telexId: string;
  role: 'patient' | 'caregiver';
  name: string;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>({
  telexId: {
    type: String,
    required: [true, 'Telex ID is required'],
    unique: true,
    trim: true,
  },
  role: {
    type: String,
    required: [true, 'Role is required'],
    enum: {
      values: ['patient', 'caregiver'],
      message: 'Role must be either patient or caregiver'
    },
    default: 'patient'
  },
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  timezone: {
    type: String,
    required: [true, 'Timezone is required'],
    default: 'UTC',
    validate: {
      validator: function(timezone: string) {
        // Basic timezone validation - could be enhanced with a proper timezone library
        return /^[A-Za-z_\/+-]+$/.test(timezone);
      },
      message: 'Invalid timezone format'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
userSchema.index({ telexId: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// Virtual for medications (will be populated in queries)
userSchema.virtual('medications', {
  ref: 'Medication',
  localField: '_id',
  foreignField: 'userId'
});

// Pre-save middleware
userSchema.pre('save', function(next: any) {
  // Ensure timezone is valid before saving
  if (this.isModified('timezone')) {
    this.timezone = this.timezone || 'UTC';
  }
  next();
});

// Static methods
(userSchema.statics as any).findByTelexId = function(telexId: string) {
  return this.findOne({ telexId, isActive: true });
};

(userSchema.statics as any).findActivePatients = function() {
  return this.find({ role: 'patient', isActive: true });
};

(userSchema.statics as any).findActiveCaregivers = function() {
  return this.find({ role: 'caregiver', isActive: true });
};

// Instance methods
userSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

userSchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.__v;
  return userObject;
};

const User = mongoose.model<IUser>('User', userSchema);

export default User;