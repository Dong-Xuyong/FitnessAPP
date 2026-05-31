import {
  currentBillingPeriod,
  isWithinLastFourDaysOfMonth,
  nextBillingPeriod,
} from "@/lib/roster-payment-status";

/**
 * Client-side billing dates use the device local calendar (same as `Date` getters).
 * The scheduled payment-enforcement job uses `Europe/Lisbon` — keep logic aligned in `functions/src/`.
 */

/** End of calendar day 6 of the payment month for `YYYY-MM` (local). On-time through this instant. */
export function graceDeadlineEndForPeriod(period: string): Date | null {
  const parsed = parsePeriodYearMonth(period);
  if (!parsed) return null;
  const { y, m } = parsed;
  return new Date(y, m - 1, 6, 23, 59, 59, 999);
}

/** Start of calendar day 7 of the payment month (local). Blocking applies from here if still unpaid. */
export function blockStartsAtForPeriod(period: string): Date | null {
  const parsed = parsePeriodYearMonth(period);
  if (!parsed) return null;
  const { y, m } = parsed;
  return new Date(y, m - 1, 7, 0, 0, 0, 0);
}

export function parsePeriodYearMonth(period: string): { y: number; m: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(String(period || "").trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return { y, m };
}

/** Last instant (local) of the last calendar day of the `YYYY-MM` month. */
export function endOfDueDayForPeriod(period: string): Date | null {
  const parsed = parsePeriodYearMonth(period);
  if (!parsed) return null;
  const { y, m } = parsed;
  return new Date(y, m, 0, 23, 59, 59, 999);
}

/**
 * Normalize stored period values to `YYYY-MM` for comparison
 * (handles `2026-5`, `2026-05-01`, numeric `202605`, etc.).
 */
export function canonicalBillingPeriodYm(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.trunc(raw);
    if (n >= 100001 && n <= 999912) {
      const y = Math.floor(n / 100);
      const mo = n % 100;
      if (mo >= 1 && mo <= 12) return `${y}-${String(mo).padStart(2, "0")}`;
    }
    return null;
  }
  const s = String(raw).trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(s);
  if (!m) return null;
  const mo = Number(m[2]);
  if (!Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}`;
}

/** True if stored Firestore status means the payment was received (EN/PT). */
export function normalizedPaymentPaid(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "paid" || s === "pago";
}

export function normalizedPaymentPending(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "pending" || s === "pendente";
}

type PaymentPeriodRow = { period?: string; status?: string };

/**
 * Pending payment to highlight on the student dashboard:
 * 1) current calendar month, else
 * 2) nearest future pending (e.g. June row created in late May), else
 * 3) most recent past unpaid period (overdue).
 */
export function selectDashboardPendingPayment<T extends PaymentPeriodRow>(
  payments: T[],
  now = new Date()
): T | null {
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const pending = payments.filter((p) => normalizedPaymentPending(p.status));
  if (!pending.length) return null;

  const ym = (p: PaymentPeriodRow) => canonicalBillingPeriodYm(p.period);

  const currentMatch = pending.find((p) => ym(p) === current);
  if (currentMatch) return currentMatch;

  const future = pending
    .filter((p) => {
      const pYm = ym(p);
      return pYm && pYm > current;
    })
    .sort((a, b) => (ym(a) ?? "").localeCompare(ym(b) ?? ""));
  if (future[0]) return future[0];

  const past = pending
    .filter((p) => {
      const pYm = ym(p);
      return pYm && pYm < current;
    })
    .sort((a, b) => (ym(b) ?? "").localeCompare(ym(a) ?? ""));
  return past[0] ?? null;
}

export function isPeriodPaid(
  payments: Array<{ period?: string; status?: string }>,
  period: string
): boolean {
  const targetYm = canonicalBillingPeriodYm(period);
  if (!targetYm) return false;
  return payments.some((p) => {
    const pYm = canonicalBillingPeriodYm(p.period);
    if (!pYm || pYm !== targetYm) return false;
    return normalizedPaymentPaid(p.status);
  });
}

export type PaymentReminderState =
  | { show: false }
  | { show: true; variant: "soon" | "overdue"; dueDate: Date };

function uniqueCanonicalPeriodsFromPayments(
  payments: Array<{ period?: string; status?: string }>
): string[] {
  const set = new Set<string>();
  for (const p of payments) {
    const ym = canonicalBillingPeriodYm(p.period);
    if (ym) set.add(ym);
  }
  return [...set];
}

/** Most recent `YYYY-MM` that is unpaid and past grace deadline (local `now`). */
function latestOverduePeriod(
  now: Date,
  payments: Array<{ period?: string; status?: string }>
): string | null {
  const nowMs = now.getTime();
  const candidates = new Set(uniqueCanonicalPeriodsFromPayments(payments));
  candidates.add(currentBillingPeriod(now));

  let best: string | null = null;
  for (const p of candidates) {
    if (isPeriodPaid(payments, p)) continue;
    const graceEnd = graceDeadlineEndForPeriod(p);
    if (!graceEnd || Number.isNaN(graceEnd.getTime())) continue;
    if (nowMs <= graceEnd.getTime()) continue;
    if (!best || p > best) best = p;
  }
  return best;
}

/**
 * Warn when billing is active and monthly fee set:
 * - "overdue": any tracked period (current + periods in `payments`) is unpaid after end of day 6 of that month
 * - "soon": during the last 4 calendar days of the current month, if next month's period is not yet paid
 *   (due by the 6th of next month)
 */
export function getPaymentReminderState(args: {
  now: Date;
  billingStatus: string;
  monthlyRate: number;
  payments: Array<{ period?: string; status?: string }>;
}): PaymentReminderState {
  const { now, billingStatus, monthlyRate, payments } = args;
  if (billingStatus.trim().toLowerCase() !== "active" || !Number.isFinite(monthlyRate) || monthlyRate <= 0) {
    return { show: false };
  }

  const overduePeriod = latestOverduePeriod(now, payments);
  if (overduePeriod) {
    const dueDate = graceDeadlineEndForPeriod(overduePeriod);
    if (dueDate && !Number.isNaN(dueDate.getTime())) {
      return { show: true, variant: "overdue", dueDate };
    }
  }

  if (isWithinLastFourDaysOfMonth(now)) {
    const next = nextBillingPeriod(now);
    if (!isPeriodPaid(payments, next)) {
      const dueDate = graceDeadlineEndForPeriod(next);
      if (dueDate && !Number.isNaN(dueDate.getTime())) {
        return { show: true, variant: "soon", dueDate };
      }
    }
  }

  return { show: false };
}
