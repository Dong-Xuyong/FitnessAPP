import { collection, getDocs, writeBatch, type DocumentReference } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

const MAX_BATCH_OPS = 450;

/**
 * Removes denormalized `workoutPlanId` / `workoutTitle` from each student on every session slot.
 * Keeps bookings (names, attendance, session spans). Call after deleting assigned plans so UI matches Firestore.
 */
export async function stripAssignedWorkoutFromSessionSlots(db: Firestore, trainerId: string): Promise<number> {
  const snap = await getDocs(collection(db, "personalTrainers", trainerId, "sessionSlots"));
  let batch = writeBatch(db);
  let ops = 0;
  let strippedDocCount = 0;

  const commit = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const raw = data.students;
    if (!Array.isArray(raw) || raw.length === 0) continue;

    let changed = false;
    const nextStudents = raw.map((st: unknown) => {
      const row = st as Record<string, unknown>;
      const hasPlan = String(row.workoutPlanId || "").trim() !== "";
      const hasTitle = String(row.workoutTitle || "").trim() !== "";
      if (!hasPlan && !hasTitle) return row;
      changed = true;
      const { workoutPlanId: _pid, workoutTitle: _title, ...rest } = row;
      return rest;
    });

    if (!changed) continue;
    batch.update(d.ref, { students: nextStudents });
    ops++;
    strippedDocCount++;
    if (ops >= MAX_BATCH_OPS) await commit();
  }
  await commit();
  return strippedDocCount;
}

export type RosterStudentLike = {
  id: string;
  userId?: string;
  email?: string;
};

/**
 * Deletes:
 * 1. Every document under `personalTrainers/{trainerId}/students/{candidateId}/workoutPlans`
 *    for each roster student (all candidate path ids: roster id, auth uid, portal id from email).
 * 2. Every document in `personalTrainers/{trainerId}/weekProgramAssignments` (assignment calendar rows).
 *
 * Also clears denormalized plan fields on `sessionSlots` student rows (see `stripAssignedWorkoutFromSessionSlots`).
 */
export async function clearAllTrainerWorkoutPlans(
  db: Firestore,
  trainerId: string,
  rosterStudents: RosterStudentLike[] | null | undefined,
  portalStudentIdByEmail: Map<string, string>
): Promise<{
  deletedPlanCount: number;
  deletedWeekAssignmentCount: number;
  sessionSlotsStrippedCount: number;
}> {
  let deletedPlanCount = 0;
  let deletedWeekAssignmentCount = 0;
  let batch = writeBatch(db);
  let ops = 0;

  const commitBatch = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };

  const enqueueDelete = async (ref: DocumentReference, kind: "plan" | "week") => {
    batch.delete(ref);
    ops++;
    if (kind === "plan") deletedPlanCount++;
    else deletedWeekAssignmentCount++;
    if (ops >= MAX_BATCH_OPS) await commitBatch();
  };

  if (rosterStudents?.length) {
    for (const student of rosterStudents) {
      const rosterStudentId = String(student.id || "");
      const userId = String(student.userId || "");
      const email = String(student.email || "").trim().toLowerCase();
      const globalStudentId = email ? portalStudentIdByEmail.get(email) || "" : "";
      const candidateIds = [...new Set([rosterStudentId, userId, globalStudentId].filter(Boolean))];

      for (const candidateId of candidateIds) {
        const plansRef = collection(db, "personalTrainers", trainerId, "students", candidateId, "workoutPlans");
        const snap = await getDocs(plansRef);
        for (const d of snap.docs) {
          await enqueueDelete(d.ref, "plan");
        }
      }
    }
  }

  await commitBatch();

  const weekCol = collection(db, "personalTrainers", trainerId, "weekProgramAssignments");
  const weekSnap = await getDocs(weekCol);
  for (const d of weekSnap.docs) {
    await enqueueDelete(d.ref, "week");
  }
  await commitBatch();

  const sessionSlotsStrippedCount = await stripAssignedWorkoutFromSessionSlots(db, trainerId);

  return { deletedPlanCount, deletedWeekAssignmentCount, sessionSlotsStrippedCount };
}

/**
 * Deletes all `workoutPlans` under each candidate storage path for one student, and
 * `weekProgramAssignments` whose `studentId` matches any candidate id.
 */
export async function clearStudentAssignedPlans(
  db: Firestore,
  trainerId: string,
  candidateIds: string[]
): Promise<{ deletedPlanCount: number; deletedWeekAssignmentCount: number }> {
  const ids = [...new Set(candidateIds.map((x) => String(x || "").trim()).filter(Boolean))];
  if (ids.length === 0) return { deletedPlanCount: 0, deletedWeekAssignmentCount: 0 };

  let deletedPlanCount = 0;
  let deletedWeekAssignmentCount = 0;
  let batch = writeBatch(db);
  let ops = 0;

  const commitBatch = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };

  const enqueueDelete = async (ref: DocumentReference, kind: "plan" | "week") => {
    batch.delete(ref);
    ops++;
    if (kind === "plan") deletedPlanCount++;
    else deletedWeekAssignmentCount++;
    if (ops >= MAX_BATCH_OPS) await commitBatch();
  };

  for (const candidateId of ids) {
    const plansRef = collection(db, "personalTrainers", trainerId, "students", candidateId, "workoutPlans");
    const snap = await getDocs(plansRef);
    for (const d of snap.docs) {
      await enqueueDelete(d.ref, "plan");
    }
  }

  const weekCol = collection(db, "personalTrainers", trainerId, "weekProgramAssignments");
  const weekSnap = await getDocs(weekCol);
  for (const d of weekSnap.docs) {
    const studentId = String((d.data() as { studentId?: string }).studentId || "");
    if (ids.includes(studentId)) {
      await enqueueDelete(d.ref, "week");
    }
  }
  await commitBatch();

  return { deletedPlanCount, deletedWeekAssignmentCount };
}
