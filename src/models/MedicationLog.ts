import mongoose, { Schema, Document } from "mongoose";

export interface IMedicationLog extends Document {
  userId: mongoose.Types.ObjectId;
  medicationId: mongoose.Types.ObjectId;
  takenAt: Date;
  status: "taken" | "missed";
}

const medicationLogSchema = new Schema<IMedicationLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    medicationId: {
      type: Schema.Types.ObjectId,
      ref: "Medication",
      required: true,
    },
    takenAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["taken", "missed"],
      default: "taken",
    },
  },
  { timestamps: true }
);

export default mongoose.model<IMedicationLog>(
  "MedicationLog",
  medicationLogSchema
);
