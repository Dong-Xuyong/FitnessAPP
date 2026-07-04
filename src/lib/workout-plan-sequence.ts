import type { Firestore } from "firebase/firestore";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
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

/** Existing plan row used to decide whether a new assignment continues the chain. */
export type SequencePlanForAppend = {
  id: string;
  sequenceGroupId?: string | null;
  sequenceStepIndex?: number;
  status?: string;
  completedAt?: string;
};

export type SequenceAppendContext = {
  sequenceGroupId: string;
  tailPlanId: string;
  tailCompleted: boolean;
  nextStepIndex: number;
  existingCycles: number;
};

function isWorkoutPlanDocCompleted(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const status = String(data.status ?? "").trim().toLowerCase();
  if (status === "completed") return true;
  const completedAt = data.completedAt;
  return typeof completedAt === "string" && completedAt.trim().length > 0;
}

/**
 * When the student already has sequence plans, returns metadata to append new steps
 * to the chain with the highest step index (single continuing sequence per student).
 */
export function findSequenceAppendContext(
  existingPlans: SequencePlanForAppend[],
  programsPerCycle: number
): SequenceAppendContext | null {
  const sequencePlans = existingPlans.filter(
    (p) => typeof p.sequenceGroupId === "string" && p.sequenceGroupId.trim().length > 0
  );
  if (sequencePlans.length === 0) return null;

  const byGroup = new Map<string, SequencePlanForAppend[]>();
  for (const p of sequencePlans) {
    const gid = String(p.sequenceGroupId).trim();
    const list = byGroup.get(gid) ?? [];
    list.push(p);
    byGroup.set(gid, list);
  }

  let best: { groupId: string; tail: SequencePlanForAppend; plans: SequencePlanForAppend[] } | null =
    null;

  for (const [groupId, plans] of byGroup) {
    const tail = plans.reduce((a, b) =>
      (Number(a.sequenceStepIndex) || 0) >= (Number(b.sequenceStepIndex) || 0) ? a : b
    );
    const tailIdx = Number(tail.sequenceStepIndex) || 0;
    if (!best || tailIdx > (Number(best.tail.sequenceStepIndex) || 0)) {
      best = { groupId, tail, plans };
    }
  }

  if (!best) return null;

  const programsPerCycleSafe = Math.max(1, programsPerCycle);
  const existingCycles =
    best.plans.length % programsPerCycleSafe === 0
      ? best.plans.length / programsPerCycleSafe
      : 0;

  return {
    sequenceGroupId: best.groupId,
    tailPlanId: best.tail.id,
    tailCompleted: isWorkoutPlanDocCompleted(best.tail as Record<string, unknown>),
    nextStepIndex: (Number(best.tail.sequenceStepIndex) || 0) + 1,
    existingCycles,
  };
}

/**
 * Plan ids completed via plan doc fields or logged workout sessions.
 * Matches student profile and calendar roster unlock heuristics.
 */
export function buildCompletedWorkoutPlanIds(
  plans: Array<Record<string, unknown> & { id?: string }>,
  sessions: Array<Record<string, unknown> & { workoutPlanId?: string; completedAt?: unknown }> = []
): Set<string> {
  const completed = new Set<string>();
  for (const p of plans) {
    const pid = String(p.id || "").trim();
    if (!pid) continue;
    if (isWorkoutPlanDocCompleted(p)) completed.add(pid);
  }
  for (const sess of sessions) {
    const wid = String(sess.workoutPlanId || "").trim();
    if (wid && sess.completedAt) completed.add(wid);
  }
  return completed;
}

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

/** Loads completion data and applies the same unlock heuristic as profile/calendar UI. */
export async function resolveSequenceEffectiveUnlock(
  db: Firestore,
  trainerId: string,
  storageStudentId: string,
  plan: SequencePlanUnlockFields
): Promise<boolean> {
  if (!plan.sequenceGroupId || plan.studentUnlocked !== false) {
    return isSequenceStepEffectiveUnlocked(plan, new Set());
  }
  const plansColl = collection(db, "personalTrainers", trainerId, "students", storageStudentId, "workoutPlans");
  const sessionsColl = collection(
    db,
    "personalTrainers",
    trainerId,
    "students",
    storageStudentId,
    "workoutSessions"
  );
  const [plansSnap, sessionsSnap] = await Promise.all([getDocs(plansColl), getDocs(sessionsColl)]);
  const plans = plansSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const sessions = sessionsSnap.docs.map((d) => d.data());
  return isSequenceStepEffectiveUnlocked(plan, buildCompletedWorkoutPlanIds(plans, sessions));
}

/**
 * Writes `repeatCycles × programsInOrder.length` workout plan docs with unlock chain metadata.
 * If the student already has a sequence, new steps are appended to that chain (same group id,
 * continued indices, locked until the prior tail is completed).
 * Does not set week/assigned/created timestamps so sequences are not tied to a calendar week.
 */
export async function writeStudentSequencePlans(
  db: Firestore,
  trainerId: string,
  studentStorageId: string,
  programsInOrder: TrainingProgramDocument[],
  repeatCycles: number
): Promise<{ appended: boolean }> {
  if (!programsInOrder.length || repeatCycles < 1) return { appended: false };

  const coll = collection(db, "personalTrainers", trainerId, "students", studentStorageId, "workoutPlans");
  const existingSnap = await getDocs(coll);
  const existingPlans: SequencePlanForAppend[] = existingSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<SequencePlanForAppend, "id">),
  }));

  const appendContext = findSequenceAppendContext(existingPlans, programsInOrder.length);
  const sequenceGroupId = appendContext?.sequenceGroupId ?? crypto.randomUUID();
  const startStepIndex = appendContext?.nextStepIndex ?? 0;
  const existingCycles = appendContext?.existingCycles ?? 0;

  const totalSteps = programsInOrder.length * repeatCycles;
  const refs = Array.from({ length: totalSteps }, () => doc(coll));
  const batch = writeBatch(db);

  if (appendContext) {
    const tailRef = doc(coll, appendContext.tailPlanId);
    batch.update(tailRef, { sequenceNextPlanId: refs[0]!.id });
  }

  let localIdx = 0;
  for (let c = 0; c < repeatCycles; c++) {
    for (let s = 0; s < programsInOrder.length; s++) {
      const program = programsInOrder[s]!;
      const ref = refs[localIdx]!;
      const prevInBatchRef = localIdx > 0 ? refs[localIdx - 1]! : null;
      const nextRef = localIdx < totalSteps - 1 ? refs[localIdx + 1]! : null;
      const exercises = buildWorkoutPlanExercises(program, 1);
      const label = sequenceStepLabel(s);
      const totalCycles = existingCycles + repeatCycles;
      const cycleNum = existingCycles + c + 1;
      const cycleLabel = totalCycles > 1 ? ` · ${cycleNum}/${totalCycles}` : "";

      const stepIndex = startStepIndex + localIdx;
      const isFirstInBatch = localIdx === 0;
      const isChainHead = !appendContext && isFirstInBatch;

      const payload: Record<string, unknown> = {
        title: `${program.name} (${label}${cycleLabel})`,
        studentId: studentStorageId,
        personalTrainerId: trainerId,
        exercises,
        sequenceGroupId,
        sequenceStepIndex: stepIndex,
        sequenceStepLabel: label,
        studentUnlocked: isChainHead
          ? true
          : isFirstInBatch && appendContext
            ? appendContext.tailCompleted
            : false,
        sourceTrainingProgramId: String((program as TrainingProgramDocument & { id?: string }).id ?? ""),
      };

      if (isFirstInBatch && appendContext) {
        payload.sequenceUnlockAfterPlanId = appendContext.tailPlanId;
      } else if (prevInBatchRef) {
        payload.sequenceUnlockAfterPlanId = prevInBatchRef.id;
      }

      if (nextRef) payload.sequenceNextPlanId = nextRef.id;

      batch.set(ref, payload);
      localIdx++;
    }
  }

  await batch.commit();
  return { appended: !!appendContext };
}
