import { currentBillingPeriod } from "@/lib/roster-payment-status";

const REMINDER_LEAD_MS = 7 * 24 * 60 * 60 * 1000;

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

/**
 * Warn when billing is active, monthly fee set, current month unpaid, and:
 * - "soon": within 7 days before month-end due (local)
 * - "overdue": after month-end due
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

  const period = currentBillingPeriod(now);
  if (isPeriodPaid(payments, period)) {
    return { show: false };
  }

  const dueDate = endOfDueDayForPeriod(period);
  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    return { show: false };
  }

  const nowMs = now.getTime();

  if (nowMs > dueDate.getTime()) {
    return { show: true, variant: "overdue", dueDate };
  }

  const windowStart = new Date(dueDate.getTime() - REMINDER_LEAD_MS);
  windowStart.setHours(0, 0, 0, 0);

  if (nowMs >= windowStart.getTime() && nowMs <= dueDate.getTime()) {
    return { show: true, variant: "soon", dueDate };
  }

  return { show: false };
}
