import type { Firestore } from "firebase/firestore";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export const PAYMENT_BLOCK_REASON = "payment";

/**
 * After a payment is recorded as paid, clear auto payment blocks only (`blockedReason === "payment"`).
 * Manual coach blocks use `blockedReason === "manual"` and are not cleared here.
 */
export async function tryAutoUnblockAfterPaymentRecorded(
  db: Firestore,
  trainerUid: string,
  rosterStudentId: string
): Promise<void> {
  const rosterRef = doc(db, "personalTrainers", trainerUid, "students", rosterStudentId);
  const rosterSnap = await getDoc(rosterRef);
  if (!rosterSnap.exists()) return;

  const roster = rosterSnap.data() as Record<string, unknown>;
  if (roster.blocked !== true) return;
  if (String(roster.blockedReason ?? "") !== PAYMENT_BLOCK_REASON) return;

  const authUid = String(roster.userId ?? "").trim() || rosterStudentId;

  await updateDoc(rosterRef, { blocked: false, blockedReason: null });
  try {
    await updateDoc(doc(db, "students", authUid), { blocked: false, blockedReason: null });
  } catch {
    /* global student doc may not exist yet */
  }
}
