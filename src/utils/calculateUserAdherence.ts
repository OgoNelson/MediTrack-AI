import Medication from "../models/Medication";
import MedicationLog from "../models/MedicationLog";
import { IMedication } from "../models/Medication";

interface AdherenceStats {
  medicationId: string;
  name: string;
  prescribedDoses: number;
  takenDoses: number;
  adherenceRate: number;
}

interface AdherenceResult {
  userId: string;
  period: string;
  overallAdherenceRate: number;
  medicationStats: AdherenceStats[];
}

/**
 * Calculates adherence for a user within the given number of days.
 */
export const calculateUserAdherence = async (
  userId: string,
  days: number
): Promise<AdherenceResult> => {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);

  const medications: IMedication[] = await Medication.find({
    userId,
    isActive: true,
    createdAt: { $lte: endDate },
  });

  if (!medications.length) {
    return {
      userId,
      period: `${days} days`,
      overallAdherenceRate: 0,
      medicationStats: [],
    };
  }

  let totalPrescribed = 0;
  let totalTaken = 0;

  const medicationStats: AdherenceStats[] = [];

  for (const med of medications) {
    // Calculate total prescribed doses in the period
    const freqPerDay = 24 / med.frequencyHours;
    const prescribedDoses = Math.min(days, med.durationDays) * freqPerDay;

    // Get logs for this medication
    const logs = await MedicationLog.find({
      userId,
      medicationId: med._id,
      takenAt: { $gte: startDate, $lte: endDate },
      status: "taken",
    });

    const takenDoses = logs.length;
    const adherenceRate = prescribedDoses
      ? Math.min(100, (takenDoses / prescribedDoses) * 100)
      : 0;

    totalPrescribed += prescribedDoses;
    totalTaken += takenDoses;

    medicationStats.push({
      medicationId: med._id.toString(),
      name: med.name,
      prescribedDoses: Math.round(prescribedDoses),
      takenDoses,
      adherenceRate: Number(adherenceRate.toFixed(1)),
    });
  }

  const overallAdherenceRate = totalPrescribed
    ? Number(((totalTaken / totalPrescribed) * 100).toFixed(1))
    : 0;

  return {
    userId,
    period: `${days} days`,
    overallAdherenceRate,
    medicationStats,
  };
};
