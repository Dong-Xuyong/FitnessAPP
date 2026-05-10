import type { Firestore } from "firebase/firestore";
import { collection, getDocs } from "firebase/firestore";

export type RosterPaymentStatus = { status: string; period: string };

/** `YYYY-MM` for the user's current local calendar month */
export function currentBillingPeriod(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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
