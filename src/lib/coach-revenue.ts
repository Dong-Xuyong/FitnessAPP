import { resolveMonthlyRate, roundMoney } from "@/lib/shop-billing";
import {
  currentBillingPeriod,
  nextBillingPeriod,
} from "@/lib/roster-payment-status";
import {
  canonicalBillingPeriodYm,
  graceDeadlineEndForPeriod,
  normalizedPaymentPaid,
  normalizedPaymentPending,
  parsePeriodYearMonth,
} from "@/lib/student-payment-due";

export type CoachRevenuePayment = {
  id?: string;
  period?: string;
  amount?: number;
  status?: string;
  method?: string;
  paidAt?: string | null;
  baseAmount?: number;
  shopAmount?: number;
};

export type CoachRevenueRosterFields = {
  billingStatus?: unknown;
  monthlyRate?: unknown;
  rate30Min?: unknown;
  rate60Min?: unknown;
  sessionDurationMin?: unknown;
  sessionsPerWeek?: unknown;
};

export type CoachRevenueStudent = {
  id: string;
  name: string;
  roster: CoachRevenueRosterFields;
  payments: CoachRevenuePayment[];
};

export type PaymentAmountSplit = {
  total: number;
  membership: number;
  shop: number;
};

export type MonthlyRevenueRow = {
  period: string;
  collected: number;
  membershipCollected: number;
  shopCollected: number;
  pending: number;
  payingStudentCount: number;
  pendingStudentCount: number;
  isForecast: boolean;
};

export type ForecastStudentRow = {
  studentId: string;
  name: string;
  amount: number;
  source: "payment_row" | "monthly_rate";
  paid: boolean;
};

export type CurrentPeriodMix = {
  paid: number;
  pending: number;
  overdue: number;
};

export type MethodMixRow = {
  method: string;
  amount: number;
};

export type ChartMonthPoint = {
  period: string;
  membership: number;
  shop: number;
  forecast: number;
};

export type CoachRevenueSnapshot = {
  currentPeriod: string;
  nextPeriod: string;
  thisMonthCollected: number;
  thisMonthPending: number;
  nextMonthForecast: number;
  outstandingPending: number;
  activeBilledStudents: number;
  payingStudentsThisMonth: number;
  collectionRate: number | null;
  lastClosedPeriod: string | null;
  momPercent: number | null;
  yoyPercent: number | null;
  chartMonths: ChartMonthPoint[];
  monthTable: MonthlyRevenueRow[];
  forecastByStudent: ForecastStudentRow[];
  currentPeriodMix: CurrentPeriodMix;
  methodMix: MethodMixRow[];
};

export function paymentFromDoc(id: string, data: Record<string, unknown>): CoachRevenuePayment {
  return {
    id,
    period: data.period != null ? String(data.period) : undefined,
    amount: Number(data.amount),
    status: data.status != null ? String(data.status) : undefined,
    method: data.method != null ? String(data.method) : undefined,
    paidAt: data.paidAt != null ? String(data.paidAt) : null,
    baseAmount: Number(data.baseAmount),
    shopAmount: Number(data.shopAmount),
  };
}

export function splitPaymentAmounts(p: CoachRevenuePayment): PaymentAmountSplit {
  const base = Number(p.baseAmount);
  const shop = Number(p.shopAmount);
  const hasBase = Number.isFinite(base) && base > 0;
  const hasShop = Number.isFinite(shop) && shop > 0;
  if (hasBase || hasShop) {
    const membership = Number.isFinite(base) && base > 0 ? roundMoney(base) : 0;
    const shopAmt = Number.isFinite(shop) && shop > 0 ? roundMoney(shop) : 0;
    return { total: roundMoney(membership + shopAmt), membership, shop: shopAmt };
  }
  const amount = Number(p.amount);
  const total = Number.isFinite(amount) && amount > 0 ? roundMoney(amount) : 0;
  return { total, membership: total, shop: 0 };
}

export function shiftBillingPeriod(period: string, monthsDelta: number): string | null {
  const parsed = parsePeriodYearMonth(period);
  if (!parsed) return null;
  const d = new Date(parsed.y, parsed.m - 1 + monthsDelta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function listPeriodsEndingAt(endPeriod: string, count: number): string[] {
  const n = Math.max(0, Math.floor(count));
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const p = shiftBillingPeriod(endPeriod, -i);
    if (p) out.push(p);
  }
  return out;
}

export function isBillingActive(roster: CoachRevenueRosterFields): boolean {
  return String(roster.billingStatus ?? "").trim().toLowerCase() === "active";
}

export function isPeriodOverdue(period: string, now: Date): boolean {
  const graceEnd = graceDeadlineEndForPeriod(period);
  if (!graceEnd || Number.isNaN(graceEnd.getTime())) return false;
  return now.getTime() > graceEnd.getTime();
}

function paymentsForPeriod(
  payments: CoachRevenuePayment[],
  period: string
): CoachRevenuePayment[] {
  return payments.filter((p) => canonicalBillingPeriodYm(p.period) === period);
}

function emptyMonth(period: string, isForecast = false): MonthlyRevenueRow {
  return {
    period,
    collected: 0,
    membershipCollected: 0,
    shopCollected: 0,
    pending: 0,
    payingStudentCount: 0,
    pendingStudentCount: 0,
    isForecast,
  };
}

function accumulateMonthFromStudents(
  students: CoachRevenueStudent[],
  period: string
): MonthlyRevenueRow {
  const row = emptyMonth(period);
  const paidIds = new Set<string>();
  const pendingIds = new Set<string>();

  for (const student of students) {
    const rows = paymentsForPeriod(student.payments, period);
    for (const payment of rows) {
      const split = splitPaymentAmounts(payment);
      if (normalizedPaymentPaid(payment.status)) {
        row.collected = roundMoney(row.collected + split.total);
        row.membershipCollected = roundMoney(row.membershipCollected + split.membership);
        row.shopCollected = roundMoney(row.shopCollected + split.shop);
        paidIds.add(student.id);
      } else if (normalizedPaymentPending(payment.status) || !normalizedPaymentPaid(payment.status)) {
        row.pending = roundMoney(row.pending + split.total);
        pendingIds.add(student.id);
      }
    }
  }

  row.payingStudentCount = paidIds.size;
  row.pendingStudentCount = pendingIds.size;
  return row;
}

export function forecastStudentAmount(
  student: CoachRevenueStudent,
  nextPeriod: string
): ForecastStudentRow | null {
  const existing = paymentsForPeriod(student.payments, nextPeriod);
  if (existing.length > 0) {
    let total = 0;
    let paid = false;
    for (const payment of existing) {
      const split = splitPaymentAmounts(payment);
      total = roundMoney(total + split.total);
      if (normalizedPaymentPaid(payment.status)) paid = true;
    }
    if (total <= 0 && !paid) return null;
    return {
      studentId: student.id,
      name: student.name,
      amount: total,
      source: "payment_row",
      paid,
    };
  }

  if (!isBillingActive(student.roster)) return null;
  const rate = resolveMonthlyRate(student.roster);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  return {
    studentId: student.id,
    name: student.name,
    amount: rate,
    source: "monthly_rate",
    paid: false,
  };
}

function classifyUnpaidCurrentAmount(
  period: string,
  amount: number,
  now: Date,
  mix: CurrentPeriodMix
): void {
  if (amount <= 0) return;
  if (isPeriodOverdue(period, now)) {
    mix.overdue = roundMoney(mix.overdue + amount);
  } else {
    mix.pending = roundMoney(mix.pending + amount);
  }
}

function currentPeriodMixFromStudents(
  students: CoachRevenueStudent[],
  currentPeriod: string,
  now: Date
): CurrentPeriodMix {
  const mix: CurrentPeriodMix = { paid: 0, pending: 0, overdue: 0 };
  const overdueNow = isPeriodOverdue(currentPeriod, now);

  for (const student of students) {
    const rows = paymentsForPeriod(student.payments, currentPeriod);
    if (rows.length > 0) {
      for (const payment of rows) {
        const split = splitPaymentAmounts(payment);
        if (normalizedPaymentPaid(payment.status)) {
          mix.paid = roundMoney(mix.paid + split.total);
        } else {
          classifyUnpaidCurrentAmount(currentPeriod, split.total, now, mix);
        }
      }
      continue;
    }

    if (!isBillingActive(student.roster)) continue;
    const rate = resolveMonthlyRate(student.roster);
    if (rate <= 0) continue;
    if (overdueNow) {
      mix.overdue = roundMoney(mix.overdue + rate);
    } else {
      mix.pending = roundMoney(mix.pending + rate);
    }
  }

  return mix;
}

function outstandingPendingFromStudents(students: CoachRevenueStudent[]): number {
  let total = 0;
  for (const student of students) {
    for (const payment of student.payments) {
      if (normalizedPaymentPaid(payment.status)) continue;
      const split = splitPaymentAmounts(payment);
      total = roundMoney(total + split.total);
    }
  }
  return total;
}

function methodMixForYear(
  students: CoachRevenueStudent[],
  year: number
): MethodMixRow[] {
  const byMethod = new Map<string, number>();
  for (const student of students) {
    for (const payment of student.payments) {
      if (!normalizedPaymentPaid(payment.status)) continue;
      const ym = canonicalBillingPeriodYm(payment.period);
      if (!ym || !ym.startsWith(`${year}-`)) continue;
      const method = String(payment.method ?? "").trim().toLowerCase() || "other";
      const split = splitPaymentAmounts(payment);
      byMethod.set(method, roundMoney((byMethod.get(method) ?? 0) + split.total));
    }
  }
  return [...byMethod.entries()]
    .map(([method, amount]) => ({ method, amount }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.method.localeCompare(b.method));
}

function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous <= 0) return null;
  if (!Number.isFinite(current)) return null;
  return roundMoney(((current - previous) / previous) * 100);
}

export function buildCoachRevenueSnapshot(
  students: CoachRevenueStudent[],
  now = new Date()
): CoachRevenueSnapshot {
  const currentPeriod = currentBillingPeriod(now);
  const nextPeriod = nextBillingPeriod(now);
  const lastClosedPeriod = shiftBillingPeriod(currentPeriod, -1);
  const priorClosedPeriod = lastClosedPeriod ? shiftBillingPeriod(lastClosedPeriod, -1) : null;
  const lastClosedYearAgo = lastClosedPeriod ? shiftBillingPeriod(lastClosedPeriod, -12) : null;

  const monthsByPeriod = new Map<string, MonthlyRevenueRow>();
  const seenPeriods = new Set<string>([currentPeriod, nextPeriod]);
  if (lastClosedPeriod) seenPeriods.add(lastClosedPeriod);

  for (const student of students) {
    for (const payment of student.payments) {
      const ym = canonicalBillingPeriodYm(payment.period);
      if (ym) seenPeriods.add(ym);
    }
  }

  for (const period of seenPeriods) {
    monthsByPeriod.set(period, accumulateMonthFromStudents(students, period));
  }

  const forecastByStudent = students
    .map((s) => forecastStudentAmount(s, nextPeriod))
    .filter((row): row is ForecastStudentRow => row != null && row.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

  const nextMonthForecast = roundMoney(
    forecastByStudent.reduce((sum, row) => sum + row.amount, 0)
  );

  const currentMonth = monthsByPeriod.get(currentPeriod) ?? emptyMonth(currentPeriod);
  const mix = currentPeriodMixFromStudents(students, currentPeriod, now);
  const expectedThisMonth = roundMoney(mix.paid + mix.pending + mix.overdue);
  const collectionRate =
    expectedThisMonth > 0 ? roundMoney(mix.paid / expectedThisMonth) : null;

  const chartBasePeriods = listPeriodsEndingAt(currentPeriod, 12);
  const chartMonths: ChartMonthPoint[] = chartBasePeriods.map((period) => {
    const row = monthsByPeriod.get(period) ?? emptyMonth(period);
    return {
      period,
      membership: row.membershipCollected,
      shop: row.shopCollected,
      forecast: 0,
    };
  });
  chartMonths.push({
    period: nextPeriod,
    membership: 0,
    shop: 0,
    forecast: nextMonthForecast,
  });

  const monthTable = [...monthsByPeriod.values()].sort((a, b) => b.period.localeCompare(a.period));

  const lastClosedCollected = lastClosedPeriod
    ? (monthsByPeriod.get(lastClosedPeriod)?.collected ?? 0)
    : 0;
  const priorClosedCollected = priorClosedPeriod
    ? (monthsByPeriod.get(priorClosedPeriod)?.collected ?? 0)
    : 0;
  const yearAgoCollected = lastClosedYearAgo
    ? (monthsByPeriod.get(lastClosedYearAgo)?.collected ?? 0)
    : 0;

  const activeBilledStudents = students.filter(
    (s) => isBillingActive(s.roster) && resolveMonthlyRate(s.roster) > 0
  ).length;

  return {
    currentPeriod,
    nextPeriod,
    thisMonthCollected: currentMonth.collected,
    thisMonthPending: roundMoney(mix.pending + mix.overdue),
    nextMonthForecast,
    outstandingPending: outstandingPendingFromStudents(students),
    activeBilledStudents,
    payingStudentsThisMonth: currentMonth.payingStudentCount,
    collectionRate,
    lastClosedPeriod,
    momPercent: lastClosedPeriod ? percentChange(lastClosedCollected, priorClosedCollected) : null,
    yoyPercent: lastClosedPeriod ? percentChange(lastClosedCollected, yearAgoCollected) : null,
    chartMonths,
    monthTable,
    forecastByStudent,
    currentPeriodMix: mix,
    methodMix: methodMixForYear(students, now.getFullYear()),
  };
}
