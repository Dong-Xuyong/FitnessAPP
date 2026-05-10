import type { Firestore } from "firebase/firestore";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";

export type RosterPaymentStatus = { status: string; period: string };

/** `YYYY-MM` for the user's current local calendar month */
export function currentBillingPeriod(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * If billing is active and no payment row exists for the current `YYYY-MM`, creates a pending payment.
 * @returns true when a new Firestore document was added.
 */
export async function ensurePendingPaymentForCurrentPeriod(
  db: Firestore,
  trainerUid: string,
  rosterStudentId: string
): Promise<boolean> {
  const rosterRef = doc(db, "personalTrainers", trainerUid, "students", rosterStudentId);
  const rosterSnap = await getDoc(rosterRef);
  if (!rosterSnap.exists()) return false;

  const roster = rosterSnap.data() as Record<string, unknown>;
  if (String(roster.billingStatus ?? "").trim().toLowerCase() !== "active") {
    return false;
  }

  const period = currentBillingPeriod();
  const paymentsCol = collection(db, "personalTrainers", trainerUid, "students", rosterStudentId, "payments");
  const existing = await getDocs(query(paymentsCol, where("period", "==", period), limit(1)));
  if (!existing.empty) return false;

  const amount = Number(roster.monthlyRate ?? 0);
  const method = String(roster.paymentMethod ?? "mbway") || "mbway";
  const nowIso = new Date().toISOString();

  await addDoc(paymentsCol, {
    period,
    amount: Number.isFinite(amount) ? amount : 0,
    method,
    status: "pending",
    paidAt: null,
    createdAt: nowIso,
    source: "auto_month_open",
  });

  return true;
}

export async function ensureRosterPendingPaymentsForCurrentMonth(
  db: Firestore,
  trainerUid: string,
  rosterStudentIds: string[]
): Promise<void> {
  await Promise.all(
    rosterStudentIds.map((id) => ensurePendingPaymentForCurrentPeriod(db, trainerUid, id))
  );
}

/**
 * Latest payment-by-period per roster student id; aligns with [/students]
 * dashboard rules: if the latest recorded period does not cover the current month, status becomes pending for that period.
 */
export async function fetchRosterPaymentStatusMap(
  db: Firestore,
  trainerUid: string,
  rosterStudentIds: string[]
): Promise<Record<string, RosterPaymentStatus>> {
  const currentPeriod = currentBillingPeriod();
  const map: Record<string, RosterPaymentStatus> = {};

  for (const id of rosterStudentIds) {
    try {
      const paymentsSnap = await getDocs(
        collection(db, "personalTrainers", trainerUid, "students", id, "payments")
      );
      const best = paymentsSnap.docs.reduce<RosterPaymentStatus | null>((acc, docSnap) => {
        const data = docSnap.data();
        const period = String(data.period ?? "");
        const candidate: RosterPaymentStatus = {
          status: String(data.status ?? "pending"),
          period,
        };
        if (!acc || period > acc.period) return candidate;
        return acc;
      }, null);
      if (best) {
        map[id] =
          best.period >= currentPeriod ? best : { status: "pending", period: currentPeriod };
      }
    } catch {
      /* skip */
    }
  }

  return map;
}
