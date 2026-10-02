import type { Firestore } from "firebase/firestore";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  applyStoredLoyaltyDiscount,
  buildPaymentAmounts,
  clampSocioFee,
  resolveMonthlyRate,
} from "@/lib/shop-billing";

export type RosterPaymentStatus = { status: string; period: string };

/** `YYYY-MM` for the user's current local calendar month */
export function currentBillingPeriod(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** `YYYY-MM` for the calendar month after `now` (December rolls to January next year). */
export function nextBillingPeriod(now = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Calendar days at month end when next-period payment rows may be created (local). */
export const NEXT_PERIOD_CREATION_WINDOW_DAYS = 4;

/** True when `now` is on one of the last four calendar days of the month (local). */
export function isWithinLastFourDaysOfMonth(now = new Date()): boolean {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() >= lastDay - (NEXT_PERIOD_CREATION_WINDOW_DAYS - 1);
}

/** @deprecated Use {@link isWithinLastFourDaysOfMonth}. */
export const isWithinLastThreeDaysOfMonth = isWithinLastFourDaysOfMonth;

function rosterPaymentStatusIsPaid(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "paid" || s === "pago";
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

  const monthlyRate = applyStoredLoyaltyDiscount(
    resolveMonthlyRate(roster),
    roster.loyaltyDiscountPercent,
    roster.coachingStartedOn
  );
  const amounts = buildPaymentAmounts(monthlyRate, 0, clampSocioFee(roster.socioFee));
  const method = String(roster.paymentMethod ?? "mbway") || "mbway";
  const nowIso = new Date().toISOString();

  await addDoc(paymentsCol, {
    period,
    amount: amounts.amount,
    baseAmount: amounts.baseAmount,
    shopAmount: amounts.shopAmount,
    socioAmount: amounts.socioAmount,
    method,
    status: "pending",
    paidAt: null,
    createdAt: nowIso,
    source: "auto_month_open",
  });

  return true;
}

/**
 * During the last four days of the calendar month, ensure a pending row exists for **next** `YYYY-MM`.
 * @returns true when a new Firestore document was added.
 */
export async function ensurePendingPaymentForNextPeriodIfWindow(
  db: Firestore,
  trainerUid: string,
  rosterStudentId: string,
  now = new Date()
): Promise<boolean> {
  if (!isWithinLastFourDaysOfMonth(now)) return false;

  const rosterRef = doc(db, "personalTrainers", trainerUid, "students", rosterStudentId);
  const rosterSnap = await getDoc(rosterRef);
  if (!rosterSnap.exists()) return false;

  const roster = rosterSnap.data() as Record<string, unknown>;
  if (String(roster.billingStatus ?? "").trim().toLowerCase() !== "active") {
    return false;
  }
  const monthlyRate = applyStoredLoyaltyDiscount(
    resolveMonthlyRate(roster),
    roster.loyaltyDiscountPercent,
    roster.coachingStartedOn
  );
  const socioFee = clampSocioFee(roster.socioFee);
  if ((!Number.isFinite(monthlyRate) || monthlyRate <= 0) && socioFee <= 0) return false;

  const period = nextBillingPeriod(now);
  const paymentsCol = collection(db, "personalTrainers", trainerUid, "students", rosterStudentId, "payments");
  const existing = await getDocs(query(paymentsCol, where("period", "==", period), limit(1)));
  if (!existing.empty) return false;

  const amounts = buildPaymentAmounts(monthlyRate, 0, socioFee);
  const method = String(roster.paymentMethod ?? "mbway") || "mbway";
  const nowIso = now.toISOString();

  await addDoc(paymentsCol, {
    period,
    amount: amounts.amount,
    baseAmount: amounts.baseAmount,
    shopAmount: amounts.shopAmount,
    socioAmount: amounts.socioAmount,
    method,
    status: "pending",
    paidAt: null,
    createdAt: nowIso,
    source: "auto_next_month_window",
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

export async function ensureRosterPendingNextPeriodIfWindow(
  db: Firestore,
  trainerUid: string,
  rosterStudentIds: string[]
): Promise<void> {
  await Promise.all(
    rosterStudentIds.map((id) => ensurePendingPaymentForNextPeriodIfWindow(db, trainerUid, id))
  );
}

/**
 * Latest payment-by-period per roster student id; aligns with [/students]
 * dashboard rules: if the latest recorded period does not cover the current month, status becomes pending for that period.
 */
/** Badge already stored on the roster doc. Old periods count as pending for the current month. */
export function displayedRosterPaymentStatus(
  roster: { latestPaymentStatus?: unknown; latestPaymentPeriod?: unknown } | null | undefined,
  now = new Date()
): RosterPaymentStatus | null {
  if (!roster) return null;
  const period = String(roster.latestPaymentPeriod ?? "").trim();
  const status = String(roster.latestPaymentStatus ?? "").trim();
  if (!period || !status) return null;
  const current = currentBillingPeriod(now);
  if (period >= current) {
    return { status: rosterPaymentStatusIsPaid(status) ? "paid" : status, period };
  }
  return { status: "pending", period: current };
}

export function rememberRosterPaymentBadge(
  db: Firestore,
  trainerUid: string,
  rosterStudentId: string,
  status: RosterPaymentStatus,
  previous?: { latestPaymentStatus?: unknown; latestPaymentPeriod?: unknown } | null
) {
  if (
    previous &&
    previous.latestPaymentStatus === status.status &&
    previous.latestPaymentPeriod === status.period
  ) {
    return;
  }
  void updateDoc(doc(db, "personalTrainers", trainerUid, "students", rosterStudentId), {
    latestPaymentStatus: status.status,
    latestPaymentPeriod: status.period,
  }).catch(() => {});
}

export async function fetchRosterPaymentStatusMap(
  db: Firestore,
  trainerUid: string,
  rosterStudentIds: string[],
  onItem?: (id: string, status: RosterPaymentStatus) => void
): Promise<Record<string, RosterPaymentStatus>> {
  const currentPeriod = currentBillingPeriod();
  const entries = await Promise.all(
    rosterStudentIds.map(async (id) => {
      try {
        const paymentsSnap = await getDocs(
          query(
            collection(db, "personalTrainers", trainerUid, "students", id, "payments"),
            orderBy("period", "desc"),
            limit(1)
          )
        );
        const docSnap = paymentsSnap.docs[0];
        if (!docSnap) return null;
        const data = docSnap.data();
        const period = String(data.period ?? "");
        const st = String(data.status ?? "pending");
        const best: RosterPaymentStatus = {
          status: rosterPaymentStatusIsPaid(st) ? "paid" : st,
          period,
        };
        const status =
          best.period >= currentPeriod ? best : { status: "pending", period: currentPeriod };
        onItem?.(id, status);
        return [id, status] as const;
      } catch {
        return null;
      }
    })
  );

  const map: Record<string, RosterPaymentStatus> = {};
  for (const entry of entries) {
    if (entry) map[entry[0]] = entry[1];
  }
  return map;
}
