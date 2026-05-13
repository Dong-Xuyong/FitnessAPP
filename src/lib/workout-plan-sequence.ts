import type { Firestore } from "firebase/firestore";
import { collection, doc, writeBatch } from "firebase/firestore";
import type { TrainingProgramDocument } from "@/lib/types";
import { buildWorkoutPlanExercises } from "@/lib/training-program-assignment";

const STEP_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function sequenceStepLabel(stepInCycleIndex: number): string {
  if (stepInCycleIndex < 0 || stepInCycleIndex >= STEP_LABELS.length) {
    return String(stepInCycleIndex + 1);
  }
  return STEP_LABELS[stepInCycleIndex] ?? "?";
}

/** Minimal plan fields for sequence unlock checks (client + rules-adjacent heuristics). */
export type SequencePlanUnlockFields = {
  id?: string;
  studentUnlocked?: boolean;
  sequenceUnlockAfterPlanId?: string | null;
  sequenceGroupId?: string | null;
};

/**
 * Treat a sequence step as unlocked when Firestore says so, or when the prior plan id
 * is in `completedPlanIds` (doc completed / session logged) so UI matches reality if
 * `studentUnlocked` was not updated.
 */
export function isSequenceStepEffectiveUnlocked(
  plan: SequencePlanUnlockFields,
  completedPlanIds: ReadonlySet<string>
): boolean {
  if (!plan.sequenceGroupId) return true;
  if (plan.studentUnlocked !== false) return true;
  const prior = typeof plan.sequenceUnlockAfterPlanId === "string" ? plan.sequenceUnlockAfterPlanId.trim() : "";
  if (!prior) return false;
  return completedPlanIds.has(prior);
}

/**
 * Writes `repeatCycles × programsInOrder.length` workout plan docs with unlock chain metadata.
 * Only the first document is visible to the student until each prior step is completed.
 * Does not set week/assigned/created timestamps so sequences are not tied to a calendar week.
 */
export async function writeStudentSequencePlans(
  db: Firestore,
  trainerId: string,
  studentStorageId: string,
  programsInOrder: TrainingProgramDocument[],
  repeatCycles: number
): Promise<void> {
  if (!programsInOrder.length || repeatCycles < 1) return;

  const sequenceGroupId = crypto.randomUUID();
  const coll = collection(db, "personalTrainers", trainerId, "students", studentStorageId, "workoutPlans");
  const totalSteps = programsInOrder.length * repeatCycles;
  const refs = Array.from({ length: totalSteps }, () => doc(coll));
  const batch = writeBatch(db);

  let globalIdx = 0;
  for (let c = 0; c < repeatCycles; c++) {
    for (let s = 0; s < programsInOrder.length; s++) {
      const program = programsInOrder[s]!;
      const ref = refs[globalIdx]!;
      const prevRef = globalIdx > 0 ? refs[globalIdx - 1]! : null;
      const nextRef = globalIdx < totalSteps - 1 ? refs[globalIdx + 1]! : null;
      const exercises = buildWorkoutPlanExercises(program, 1);
      const label = sequenceStepLabel(s);
      const cycleLabel = repeatCycles > 1 ? ` · ${c + 1}/${repeatCycles}` : "";

      const payload: Record<string, unknown> = {
        title: `${program.name} (${label}${cycleLabel})`,
        studentId: studentStorageId,
        personalTrainerId: trainerId,
        exercises,
        sequenceGroupId,
        sequenceStepIndex: globalIdx,
        sequenceStepLabel: label,
        studentUnlocked: globalIdx === 0,
        sourceTrainingProgramId: String((program as TrainingProgramDocument & { id?: string }).id ?? ""),
      };

      if (prevRef) payload.sequenceUnlockAfterPlanId = prevRef.id;
      if (nextRef) payload.sequenceNextPlanId = nextRef.id;

      batch.set(ref, payload);
      globalIdx++;
    }
  }

  await batch.commit();
}
