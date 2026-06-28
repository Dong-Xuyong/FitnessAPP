import type { Firestore } from "firebase/firestore";
import { collection, doc, writeBatch } from "firebase/firestore";
import type { BodyMetricHistoryEntry, BodyMetricKey, BodyMetricsSnapshot, BodyMetricSource } from "@/lib/body-metrics-types";
import {
  BODY_METRIC_FIELDS,
  METRIC_TO_SESSION_FIELD,
  computeLeanAndFatMass,
  hasAnyBodyMetricValue,
} from "@/lib/body-metrics-types";

export type WeightHistoryEntry = BodyMetricHistoryEntry;

export async function saveBodyMetrics(params: {
  db: Firestore;
  trainerId: string;
  rosterStudentId: string;
  globalStudentId: string;
  canWriteSession: boolean;
  source: BodyMetricSource;
  metrics: BodyMetricsSnapshot;
  existingWeightHistory?: unknown;
}): Promise<void> {
  const metrics = { ...params.metrics };
  const { leanMassKg, fatMassKg } = computeLeanAndFatMass(metrics.weightKg, metrics.bodyFatPercent);
  if (leanMassKg != null) metrics.leanMassKg = leanMassKg;
  if (fatMassKg != null) metrics.fatMassKg = fatMassKg;

  if (!hasAnyBodyMetricValue(metrics)) {
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

    const sessionDoc: Record<string, unknown> = {
      source: "coach_body_metric",
      studentId: params.globalStudentId,
      personalTrainerId: params.trainerId,
      date: recordedAt,
      completedAt: recordedAt,
      exercises: [],
      metricSource: params.source,
    };

    for (const key of Object.keys(BODY_METRIC_FIELDS) as BodyMetricKey[]) {
      const value = metrics[key];
      if (value == null) continue;
      const sessionField = METRIC_TO_SESSION_FIELD[key] ?? key;
      sessionDoc[sessionField] = value;
    }

    batch.set(sessionRef, sessionDoc);
  }

  const profilePatch: Record<string, unknown> = {};
  for (const key of Object.keys(BODY_METRIC_FIELDS) as BodyMetricKey[]) {
    const value = metrics[key];
    if (value != null) profilePatch[key] = value;
  }

  const prevHistory = Array.isArray(params.existingWeightHistory)
    ? (params.existingWeightHistory as BodyMetricHistoryEntry[])
    : [];
  profilePatch.weightHistory = [
    ...prevHistory,
    {
      date: recordedAt,
      source: params.source,
      ...metrics,
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

/** @deprecated Use saveBodyMetrics */
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
  return saveBodyMetrics({
    db: params.db,
    trainerId: params.trainerId,
    rosterStudentId: params.rosterStudentId,
    globalStudentId: params.globalStudentId,
    canWriteSession: params.canWriteSession,
    source: "coach",
    metrics: {
      weightKg: params.weightKg,
      bodyFatPercent: params.bodyFatPercent,
    },
    existingWeightHistory: params.existingWeightHistory,
  });
}

export function isCoachBodyMetricSession(session: Record<string, unknown> | null | undefined): boolean {
  return session?.source === "coach_body_metric";
}

export const BODY_METRIC_PROFILE_KEYS = Object.keys(BODY_METRIC_FIELDS) as BodyMetricKey[];
