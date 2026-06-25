import type { Firestore } from "firebase/firestore";
import { collection, doc, writeBatch } from "firebase/firestore";

export type WeightHistoryEntry = {
  date?: string;
  checkedAt?: string;
  weightKg?: number | null;
  weight?: number | null;
  bodyFatPercent?: number | null;
  source?: string;
};

export async function saveCoachBodyMetric(params: {
  db: Firestore;
  trainerId: string;
  rosterStudentId: string;
  globalStudentId: string;
  canWriteSession: boolean;
  weightKg: number | null;
  bodyFatPercent: number | null;
  existingWeightHistory?: unknown;
}): Promise<void> {
  const { weightKg, bodyFatPercent } = params;
  if (weightKg == null && bodyFatPercent == null) {
    throw new Error("BODY_METRIC_REQUIRED");
  }

  const recordedAt = new Date().toISOString();
  const batch = writeBatch(params.db);

  if (params.canWriteSession) {
    const sessionRef = doc(
      collection(
        params.db,
        "personalTrainers",
        params.trainerId,
        "students",
        params.rosterStudentId,
        "workoutSessions"
      )
    );
    batch.set(sessionRef, {
      source: "coach_body_metric",
      studentId: params.globalStudentId,
      personalTrainerId: params.trainerId,
      date: recordedAt,
      completedAt: recordedAt,
      bodyWeightKg: weightKg,
      sessionBodyFatPercent: bodyFatPercent,
      exercises: [],
    });
  }

  const profilePatch: Record<string, unknown> = {};
  if (weightKg != null) profilePatch.weightKg = weightKg;
  if (bodyFatPercent != null) profilePatch.bodyFatPercent = bodyFatPercent;

  const prevHistory = Array.isArray(params.existingWeightHistory)
    ? (params.existingWeightHistory as WeightHistoryEntry[])
    : [];
  profilePatch.weightHistory = [
    ...prevHistory,
    {
      date: recordedAt,
      weightKg,
      bodyFatPercent,
      source: "coach",
    },
  ];

  batch.set(doc(params.db, "students", params.globalStudentId), profilePatch, { merge: true });

  if (params.canWriteSession) {
    batch.set(
      doc(params.db, "personalTrainers", params.trainerId, "students", params.rosterStudentId),
      profilePatch,
      { merge: true }
    );
  }

  await batch.commit();
}

export function isCoachBodyMetricSession(session: Record<string, unknown> | null | undefined): boolean {
  return session?.source === "coach_body_metric";
}
