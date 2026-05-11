import { collection, getDocs, writeBatch, type DocumentReference } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

const MAX_BATCH_OPS = 450;

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
 * Does not modify `sessionSlots` (calendar registrations / bookings stay as-is).
 */
export async function clearAllTrainerWorkoutPlans(
  db: Firestore,
  trainerId: string,
  rosterStudents: RosterStudentLike[] | null | undefined,
  portalStudentIdByEmail: Map<string, string>
): Promise<{ deletedPlanCount: number; deletedWeekAssignmentCount: number }> {
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

  return { deletedPlanCount, deletedWeekAssignmentCount };
}
