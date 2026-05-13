import type { Firestore } from "firebase/firestore";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
} from "firebase/firestore";

function isWorkoutPlanDocCompleted(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const status = String(data.status ?? "").trim().toLowerCase();
  if (status === "completed") return true;
  const completedAt = data.completedAt;
  return typeof completedAt === "string" && completedAt.trim().length > 0;
}

/**
 * Deletes a student's workout plan. If it belongs to a linear sequence, rewires
 * `sequenceNextPlanId` / `sequenceUnlockAfterPlanId` and adjusts `studentUnlocked`
 * on the successor so head/middle/tail deletes keep the chain consistent.
 *
 * Other flows that delete many `workoutPlans` at once (for example assignment-calendar
 * week or full wipes) use plain `deleteDoc` and do not run this repair; use the student
 * profile to remove individual sequence steps when the chain must stay valid.
 */
export async function deleteSequencePlanWithChainRepair(
  db: Firestore,
  trainerId: string,
  studentStorageId: string,
  planId: string
): Promise<void> {
  const base = ["personalTrainers", trainerId, "students", studentStorageId, "workoutPlans"] as const;
  const planRef = doc(db, ...base, planId);
  const snap = await getDoc(planRef);
  if (!snap.exists()) return;

  const data = snap.data() as Record<string, unknown>;
  const sequenceGroupId =
    typeof data.sequenceGroupId === "string" ? data.sequenceGroupId.trim() : "";

  if (!sequenceGroupId) {
    await deleteDoc(planRef);
    return;
  }

  const nextIdRaw = data.sequenceNextPlanId;
  const nextId =
    typeof nextIdRaw === "string" && nextIdRaw.trim().length > 0 ? nextIdRaw.trim() : null;

  const plansCol = collection(db, "personalTrainers", trainerId, "students", studentStorageId, "workoutPlans");
  const prevSnap = await getDocs(query(plansCol, where("sequenceNextPlanId", "==", planId), limit(1)));
  const prevId = prevSnap.docs[0]?.id ?? null;

  const batch = writeBatch(db);

  if (prevId) {
    const prevRef = doc(db, ...base, prevId);
    if (nextId) {
      batch.update(prevRef, { sequenceNextPlanId: nextId });
    } else {
      batch.update(prevRef, { sequenceNextPlanId: deleteField() });
    }
  }

  if (nextId) {
    const nextRef = doc(db, ...base, nextId);
    let prevCompleted = false;
    if (prevId) {
      const prevData = (await getDoc(doc(db, ...base, prevId))).data() as Record<string, unknown> | undefined;
      prevCompleted = isWorkoutPlanDocCompleted(prevData);
    }
    const nextPatch: Record<string, unknown> = {
      studentUnlocked: !prevId || prevCompleted,
    };
    if (prevId) {
      nextPatch.sequenceUnlockAfterPlanId = prevId;
    } else {
      nextPatch.sequenceUnlockAfterPlanId = deleteField();
    }
    batch.update(nextRef, nextPatch);
  }

  batch.delete(planRef);
  await batch.commit();
}
