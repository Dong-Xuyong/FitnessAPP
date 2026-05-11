import type { Firestore } from "firebase/firestore";
import { collection, doc, writeBatch } from "firebase/firestore";

export type FinishWorkoutSetLog = { weight: string; reps: string };

export type FinishWorkoutExerciseRow = {
  exerciseName?: string;
  name?: string;
};

const DEFAULT_NOTE_MAX = 500;

/** True when reps (>0) are set; empty weight OK for bodyweight. */
export function exerciseHasLoggedSet(log: FinishWorkoutSetLog | undefined): boolean {
  if (!log) return false;
  const reps = Number(String(log.reps).trim());
  if (!Number.isFinite(reps) || reps <= 0) return false;
  const wStr = String(log.weight).trim();
  if (wStr === "") return true;
  const w = Number(wStr);
  return Number.isFinite(w) && w >= 0;
}

/**
 * Writes workout session + completed plan + optional sequence unlock + optional profile patches.
 * `storageStudentId` is the Firestore segment under `students/{storageStudentId}/workoutPlans`.
 * `sessionStudentAuthUid` is stored on the session document as `studentId` and used for `students/{uid}` global doc.
 */
export async function commitFinishedWorkoutSession(params: {
  db: Firestore;
  trainerId: string;
  storageStudentId: string;
  sessionStudentAuthUid: string;
  workoutPlanId: string;
  workoutTitle: string;
  sequenceNextPlanId?: string | null;
  exercises: FinishWorkoutExerciseRow[];
  logs: Record<number, FinishWorkoutSetLog>;
  bodyWeightKg?: number | null;
  bodyFatPercent?: number | null;
  difficultyNotes?: string;
  moodNotes?: string;
  sessionDifficultyRating?: number | null;
  sessionMoodRating?: number | null;
  noteMaxLength?: number;
}): Promise<void> {
  const NOTE_MAX = params.noteMaxLength ?? DEFAULT_NOTE_MAX;
  const dn = String(params.difficultyNotes ?? "").trim().slice(0, NOTE_MAX);
  const mn = String(params.moodNotes ?? "").trim().slice(0, NOTE_MAX);
  const batch = writeBatch(params.db);
  const sessionsCol = collection(
    params.db,
    "personalTrainers",
    params.trainerId,
    "students",
    params.storageStudentId,
    "workoutSessions"
  );
  const sessionRef = doc(sessionsCol);
  batch.set(sessionRef, {
    workoutPlanId: params.workoutPlanId,
    workoutTitle: params.workoutTitle,
    studentId: params.sessionStudentAuthUid,
    personalTrainerId: params.trainerId,
    date: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    bodyWeightKg: params.bodyWeightKg ?? null,
    sessionBodyFatPercent: params.bodyFatPercent ?? null,
    difficultyNotes: dn,
    moodNotes: mn,
    sessionDifficultyRating: params.sessionDifficultyRating ?? null,
    sessionMoodRating: params.sessionMoodRating ?? null,
    exercises: params.exercises.map((ex, i) => {
      const log = params.logs[i] ?? { weight: "", reps: "" };
      return {
        exerciseName: ex.exerciseName || ex.name || "",
        sets: [
          {
            setNumber: 1,
            weight: Number(log.weight) || 0,
            reps: Number(log.reps) || 0,
            completed: exerciseHasLoggedSet(log),
          },
        ],
      };
    }),
  });
  const planRef = doc(
    params.db,
    "personalTrainers",
    params.trainerId,
    "students",
    params.storageStudentId,
    "workoutPlans",
    params.workoutPlanId
  );
  const finishedAt = new Date().toISOString();
  batch.update(planRef, {
    completedAt: finishedAt,
    status: "completed",
  });
  const nextPlanId = typeof params.sequenceNextPlanId === "string" ? params.sequenceNextPlanId.trim() : "";
  if (nextPlanId) {
    const nextRef = doc(
      params.db,
      "personalTrainers",
      params.trainerId,
      "students",
      params.storageStudentId,
      "workoutPlans",
      nextPlanId
    );
    batch.update(nextRef, { studentUnlocked: true });
  }
  if (params.bodyWeightKg != null || params.bodyFatPercent != null) {
    const profilePatch: Record<string, number> = {};
    if (params.bodyWeightKg != null) profilePatch.weightKg = params.bodyWeightKg;
    if (params.bodyFatPercent != null) profilePatch.bodyFatPercent = params.bodyFatPercent;
    batch.set(doc(params.db, "students", params.sessionStudentAuthUid), profilePatch, { merge: true });
    batch.set(
      doc(params.db, "personalTrainers", params.trainerId, "students", params.storageStudentId),
      profilePatch,
      { merge: true }
    );
  }
  await batch.commit();
}
