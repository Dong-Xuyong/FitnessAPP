/** Mirrors src/lib/shop-billing.ts for Cloud Functions (no cross-package import). */

import type { CollectionReference } from "firebase-admin/firestore";

export type ShopLine = { itemId: string; quantity: number };

export type BillableShopLine = ShopLine & {
  billingStatus?: "unpaid" | "paid";
  paidInPaymentId?: string;
};

export type ShopCatalogItem = {
  name: string;
  price: number;
  active?: boolean;
};

export type ShopPurchaseLike = {
  id?: string;
  date?: string;
  time?: string;
  itemId?: string;
  quantity?: number;
  billingStatus?: "unpaid" | "paid";
  paidInPaymentId?: string;
};

/** @deprecated Legacy day-grouped doc with lines[] */
export type ShopRegistrationLike = {
  date?: string;
  time?: string;
  lines?: BillableShopLine[];
};

export function isShopPurchasePaid(purchase: ShopPurchaseLike): boolean {
  return purchase.billingStatus === "paid";
}

export function isShopPurchaseUnpaid(purchase: ShopPurchaseLike): boolean {
  return !isShopPurchasePaid(purchase);
}

export function isLegacyShopRegistrationDoc(data: Record<string, unknown>): boolean {
  return Array.isArray(data.lines) && data.itemId == null;
}

export function expandLegacyRegistrationDoc(
  data: Record<string, unknown>
): ShopPurchaseLike[] {
  const date = String(data.date ?? "").trim();
  const time = data.time != null ? String(data.time).trim() : undefined;
  const lines = normalizeRegistrationLines(
    Array.isArray(data.lines) ? (data.lines as BillableShopLine[]) : []
  );
  return lines.map((line) => ({
    date,
    time,
    itemId: line.itemId,
    quantity: line.quantity,
    billingStatus: line.billingStatus,
    paidInPaymentId: line.paidInPaymentId,
  }));
}

export function normalizeShopPurchaseDoc(
  data: Record<string, unknown>,
  id?: string
): ShopPurchaseLike | null {
  const itemId = String(data.itemId ?? "").trim();
  const quantity = clampLineQuantity(data.quantity);
  if (!itemId || quantity <= 0) return null;
  const date = String(data.date ?? "").trim();
  const time = data.time != null ? String(data.time).trim() : undefined;
  const billable = data as BillableShopLine;
  if (isShopLinePaid(billable)) {
    return {
      id,
      date,
      time,
      itemId,
      quantity,
      billingStatus: "paid",
      paidInPaymentId: billable.paidInPaymentId
        ? String(billable.paidInPaymentId)
        : undefined,
    };
  }
  return { id, date, time, itemId, quantity, billingStatus: "unpaid" };
}

export function normalizeShopPurchasesFromDoc(
  data: Record<string, unknown>,
  id?: string
): ShopPurchaseLike[] {
  if (isLegacyShopRegistrationDoc(data)) {
    return expandLegacyRegistrationDoc(data).map((p) => (id ? { ...p, id } : p));
  }
  const purchase = normalizeShopPurchaseDoc(data, id);
  return purchase ? [purchase] : [];
}

export function purchaseAsBillableLine(purchase: ShopPurchaseLike): BillableShopLine | null {
  const itemId = String(purchase.itemId ?? "").trim();
  const quantity = clampLineQuantity(purchase.quantity);
  if (!itemId || quantity <= 0) return null;
  if (isShopPurchasePaid(purchase)) {
    return {
      itemId,
      quantity,
      billingStatus: "paid",
      paidInPaymentId: purchase.paidInPaymentId
        ? String(purchase.paidInPaymentId)
        : undefined,
    };
  }
  return { itemId, quantity, billingStatus: "unpaid" };
}

export function computePurchaseTotal(
  purchase: ShopPurchaseLike,
  catalogById: Map<string, ShopCatalogItem>
): number {
  const line = purchaseAsBillableLine(purchase);
  if (!line) return 0;
  return computeLineTotal(line, catalogById);
}

export function isShopLinePaid(line: BillableShopLine): boolean {
  return line.billingStatus === "paid";
}

export function isShopLineUnpaid(line: BillableShopLine): boolean {
  return !isShopLinePaid(line);
}

export function periodFromShopDate(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || "").trim());
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${m[1]}-${m[2]}`;
}

export function nextBillingPeriodYm(period: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  if (mo === 12) return `${y + 1}-01`;
  return `${y}-${String(mo + 1).padStart(2, "0")}`;
}

export function resolveTargetPaymentPeriodForNewPurchase(
  purchaseMonth: string,
  purchaseMonthHasPendingPayment: boolean
): string {
  if (purchaseMonthHasPendingPayment) return purchaseMonth;
  return nextBillingPeriodYm(purchaseMonth) ?? purchaseMonth;
}

function canonicalPeriodYm(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  const mo = Number(m[2]);
  if (!Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}`;
}

function paymentPeriodsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  if (a == null || b == null) return false;
  const ca = canonicalPeriodYm(a) ?? String(a).trim();
  const cb = canonicalPeriodYm(b) ?? String(b).trim();
  return ca === cb;
}

export type PaymentPeriodLike = { period?: string; status?: unknown; createdAt?: unknown };

export type PaymentSettlementLike = {
  period?: string;
  status?: unknown;
  shopAmount?: unknown;
};

function normalizeHms(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return "00:00:00";
  const h = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3] ?? "0");
  if (h < 0 || h > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return "00:00:00";
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function purchaseDateTimeKey(dateYmd: string | undefined, timeHms?: string): string | null {
  const ymd = String(dateYmd ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return `${ymd} ${normalizeHms(timeHms)}`;
}

function localDateTimeKeyFromIso(raw: unknown): string | null {
  const iso = String(raw ?? "").trim();
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  const h = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  const s = String(dt.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${mm}:${s}`;
}

function snapshotCutoffByPeriod(payments: readonly PaymentPeriodLike[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of payments) {
    const period = canonicalPeriodYm(p.period);
    if (!period) continue;
    if (!isPendingStatus(p.status) && !isPaidStatus(p.status) && p.status != null) continue;
    const key = localDateTimeKeyFromIso(p.createdAt);
    if (!key) continue;
    const cur = map.get(period);
    if (!cur || key < cur) map.set(period, key);
  }
  return map;
}

export function isPaymentSettledWithShopCharge(
  settlement: PaymentSettlementLike | undefined
): boolean {
  if (!settlement) return false;
  return isPaidStatus(settlement.status) && Number(settlement.shopAmount ?? 0) > 0;
}

export function isPaymentPeriodClosedPaid(
  period: string,
  payments: readonly PaymentPeriodLike[]
): boolean {
  const rows = payments.filter((p) => canonicalPeriodYm(p.period) === period);
  if (!rows.length) return false;
  if (rows.some((p) => isPendingStatus(p.status))) return false;
  return rows.some((p) => isPaidStatus(p.status));
}

export function resolveBillableShopPaymentPeriod(
  purchaseMonth: string,
  purchaseDate: string | undefined,
  purchaseTime: string | undefined,
  hasPendingForMonth: (ym: string) => boolean,
  isClosedPaid: (ym: string) => boolean,
  periodSnapshotCutoffKey?: (period: string) => string | null
): string {
  const purchaseKey = purchaseDateTimeKey(purchaseDate, purchaseTime);
  let period = resolveTargetPaymentPeriodForNewPurchase(
    purchaseMonth,
    hasPendingForMonth(purchaseMonth)
  );
  while (true) {
    const cutoff = periodSnapshotCutoffKey?.(period) ?? null;
    if (purchaseKey && cutoff && purchaseKey > cutoff) {
      const next = nextBillingPeriodYm(period);
      if (!next || next === period) break;
      period = next;
      continue;
    }
    if (!isClosedPaid(period)) break;
    const next = nextBillingPeriodYm(period);
    if (!next || next === period) break;
    period = next;
  }
  return period;
}

export function buildShopBillingPeriodContextFromPayments(
  payments: readonly PaymentPeriodLike[]
): {
  hasPendingForMonth: (ym: string) => boolean;
  isClosedPaid: (ym: string) => boolean;
  billablePeriodForPurchaseMonth: (
    purchaseMonth: string,
    purchaseDate?: string,
    purchaseTime?: string
  ) => string;
} {
  const cutoffMap = snapshotCutoffByPeriod(payments);
  const hasPendingForMonth = (ym: string) =>
    payments.some(
      (p) => canonicalPeriodYm(p.period) === ym && isPendingStatus(p.status)
    );
  const isClosedPaid = (ym: string) => isPaymentPeriodClosedPaid(ym, payments);
  const billablePeriodForPurchaseMonth = (
    purchaseMonth: string,
    purchaseDate?: string,
    purchaseTime?: string
  ) =>
    resolveBillableShopPaymentPeriod(
      purchaseMonth,
      purchaseDate,
      purchaseTime,
      hasPendingForMonth,
      isClosedPaid,
      (period) => cutoffMap.get(period) ?? null
    );
  return { hasPendingForMonth, isClosedPaid, billablePeriodForPurchaseMonth };
}

/**
 * Billing context when marking/repairing a specific payment period as paid.
 * Treats `paymentPeriodBeingMarked` as still open so lines that were billed to
 * that period remain matchable even after later months are also closed.
 */
export function buildShopBillingPeriodContextForMarkPaid(
  payments: readonly PaymentPeriodLike[],
  paymentPeriodBeingMarked: string
): {
  billablePeriodForPurchaseMonth: (
    purchaseMonth: string,
    purchaseDate?: string,
    purchaseTime?: string
  ) => string;
} {
  const marked = canonicalPeriodYm(paymentPeriodBeingMarked) ?? paymentPeriodBeingMarked;
  const cutoffMap = snapshotCutoffByPeriod(payments);
  const hasPendingForMonth = (ym: string) => {
    // Purchases in the payment month bill to that period while it is being closed.
    if (ym === marked) return true;
    return payments.some(
      (p) => canonicalPeriodYm(p.period) === ym && isPendingStatus(p.status)
    );
  };
  const isClosedPaid = (ym: string) => {
    if (ym === marked) return false;
    return isPaymentPeriodClosedPaid(ym, payments);
  };
  const billablePeriodForPurchaseMonth = (
    purchaseMonth: string,
    purchaseDate?: string,
    purchaseTime?: string
  ) =>
    resolveBillableShopPaymentPeriod(
      purchaseMonth,
      purchaseDate,
      purchaseTime,
      hasPendingForMonth,
      isClosedPaid,
      (period) => cutoffMap.get(period) ?? null
    );
  return { billablePeriodForPurchaseMonth };
}

export function effectiveShopPaymentPeriodForRegistrationDate(
  regDate: string | undefined,
  billablePeriodForPurchaseMonth: (
    purchaseMonth: string,
    purchaseDate?: string,
    purchaseTime?: string
  ) => string,
  regTime?: string
): string | null {
  const purchaseMonth = regDate ? periodFromShopDate(regDate) : null;
  if (!purchaseMonth) return null;
  return billablePeriodForPurchaseMonth(purchaseMonth, regDate, regTime);
}

/** Current effective payment period for a shop registration date (live cascade). */
export function shopLineBillablePaymentPeriod(
  regDate: string | undefined,
  payments: readonly PaymentPeriodLike[],
  regTime?: string
): string | null {
  const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextFromPayments(payments);
  return effectiveShopPaymentPeriodForRegistrationDate(regDate, billablePeriodForPurchaseMonth, regTime);
}

/**
 * Repair/backfill only: mark lines paid for `paymentPeriod` when the live cascade
 * still bills that registration to the same period (not deferred to a future month).
 */
export function shouldMarkShopLinePaidForPaymentRepair(
  regDate: string | undefined,
  regTime: string | undefined,
  paymentPeriod: string,
  payments: readonly PaymentPeriodLike[]
): boolean {
  const current = shopLineBillablePaymentPeriod(regDate, payments, regTime);
  return paymentPeriodsMatch(current, paymentPeriod);
}

/** Reset paid lines linked to a past payment when live cascade bills them forward. */
export function revertShopPurchasePaidForFuturePeriods(
  purchase: ShopPurchaseLike,
  payments: readonly PaymentPeriodLike[],
  paymentIdToPeriod: ReadonlyMap<string, string>,
  paymentIdToSettlement?: ReadonlyMap<string, PaymentSettlementLike>
): ShopPurchaseLike {
  if (!isShopPurchasePaid(purchase) || !purchase.paidInPaymentId) return purchase;
  const paymentId = String(purchase.paidInPaymentId);
  const settlement = paymentIdToSettlement?.get(paymentId);
  if (isPaymentSettledWithShopCharge(settlement)) return purchase;
  const paidPeriod = paymentIdToPeriod.get(paymentId);
  if (!paidPeriod) return purchase;
  const currentBillable = shopLineBillablePaymentPeriod(purchase.date, payments, purchase.time);
  if (currentBillable == null || paymentPeriodsMatch(currentBillable, paidPeriod)) return purchase;
  return { ...purchase, billingStatus: "unpaid", paidInPaymentId: undefined };
}

/** @deprecated Use revertShopPurchasePaidForFuturePeriods */
export function revertShopRegistrationLinesPaidForFuturePeriods(
  registration: ShopRegistrationLike,
  payments: readonly PaymentPeriodLike[],
  paymentIdToPeriod: ReadonlyMap<string, string>
): BillableShopLine[] {
  const lines = registration.lines;
  if (!lines?.length) return [];
  const normalized = normalizeRegistrationLines(lines);
  const currentBillable = shopLineBillablePaymentPeriod(registration.date, payments);

  return normalized.map((line) => {
    if (!isShopLinePaid(line) || !line.paidInPaymentId) return line;
    const paidPeriod = paymentIdToPeriod.get(String(line.paidInPaymentId));
    if (!paidPeriod) return line;
    if (currentBillable == null || currentBillable === paidPeriod) return line;
    return {
      itemId: line.itemId,
      quantity: line.quantity,
      billingStatus: "unpaid" as const,
    };
  });
}

function clampLineQuantity(qty: unknown): number {
  return Math.max(0, Math.min(999, Math.floor(Number(qty) || 0)));
}

export function normalizeBillableLine(line: BillableShopLine | ShopLine): BillableShopLine | null {
  const itemId = String(line.itemId || "").trim();
  const quantity = clampLineQuantity(line.quantity);
  if (!itemId || quantity <= 0) return null;
  const billable = line as BillableShopLine;
  if (isShopLinePaid(billable)) {
    return {
      itemId,
      quantity,
      billingStatus: "paid",
      paidInPaymentId: billable.paidInPaymentId ? String(billable.paidInPaymentId) : undefined,
    };
  }
  return {
    itemId,
    quantity,
    billingStatus: "unpaid",
  };
}

export function normalizeRegistrationLines(
  lines: (BillableShopLine | ShopLine)[] | undefined
): BillableShopLine[] {
  if (!lines?.length) return [];
  const out: BillableShopLine[] = [];
  for (const line of lines) {
    const normalized = normalizeBillableLine(line);
    if (normalized) out.push(normalized);
  }
  return out;
}

export function markShopPurchasePaidForPayment(
  purchase: ShopPurchaseLike,
  paymentPeriod: string,
  paymentId: string,
  billablePeriodForPurchaseMonth: (
    purchaseMonth: string,
    purchaseDate?: string,
    purchaseTime?: string
  ) => string
): ShopPurchaseLike {
  if (isShopPurchasePaid(purchase)) return purchase;
  const effective = effectiveShopPaymentPeriodForRegistrationDate(
    purchase.date,
    billablePeriodForPurchaseMonth,
    purchase.time
  );
  if (effective == null || !paymentPeriodsMatch(effective, paymentPeriod)) return purchase;
  return { ...purchase, billingStatus: "paid", paidInPaymentId: paymentId };
}

/** @deprecated Use markShopPurchasePaidForPayment */
export function markShopRegistrationLinesPaidForPayment(
  registration: ShopRegistrationLike,
  paymentPeriod: string,
  paymentId: string,
  billablePeriodForPurchaseMonth: (
    purchaseMonth: string,
    purchaseDate?: string,
    purchaseTime?: string
  ) => string
): BillableShopLine[] {
  const lines = registration.lines;
  if (!lines?.length) return [];
  const effective = effectiveShopPaymentPeriodForRegistrationDate(
    registration.date,
    billablePeriodForPurchaseMonth,
    registration.time
  );
  const normalized = normalizeRegistrationLines(lines);
  if (effective == null || effective !== paymentPeriod) return normalized;
  return normalized.map((line) => {
    if (isShopLinePaid(line)) return line;
    return {
      itemId: line.itemId,
      quantity: line.quantity,
      billingStatus: "paid" as const,
      paidInPaymentId: paymentId,
    };
  });
}

export function computeLineTotal(
  line: BillableShopLine,
  catalogById: Map<string, ShopCatalogItem>
): number {
  const item = catalogById.get(line.itemId);
  if (!item || item.active === false) return 0;
  const qty = clampLineQuantity(line.quantity);
  const price = Number(item.price);
  if (!Number.isFinite(price) || price < 0 || qty <= 0) return 0;
  return roundMoney(price * qty);
}

export function computeUnpaidShopForPaymentPeriod(
  purchases: ShopPurchaseLike[],
  catalogById: Map<string, ShopCatalogItem>,
  paymentPeriod: string,
  defaultTargetByRegDate: (
    purchaseMonth: string,
    purchaseDate?: string,
    purchaseTime?: string
  ) => string
): number {
  let total = 0;
  for (const purchase of purchases) {
    if (!isShopPurchaseUnpaid(purchase)) continue;
    const purchaseMonth = purchase.date ? periodFromShopDate(purchase.date) : null;
    const effective =
      purchaseMonth != null
        ? defaultTargetByRegDate(purchaseMonth, purchase.date, purchase.time)
        : paymentPeriod;
    if (effective !== paymentPeriod) continue;
    total += computePurchaseTotal(purchase, catalogById);
  }
  return roundMoney(total);
}

export function collectTargetPaymentPeriodsFromRegistrations(
  purchases: ShopPurchaseLike[],
  defaultTargetByRegDate: (
    purchaseMonth: string,
    purchaseDate?: string,
    purchaseTime?: string
  ) => string
): string[] {
  const periods = new Set<string>();
  for (const purchase of purchases) {
    if (!isShopPurchaseUnpaid(purchase)) continue;
    const purchaseMonth = purchase.date ? periodFromShopDate(purchase.date) : null;
    if (!purchaseMonth) continue;
    periods.add(defaultTargetByRegDate(purchaseMonth, purchase.date, purchase.time));
  }
  return [...periods];
}

export function periodDateRange(period: string): { startDate: string; endDate: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const startDate = `${period}-01`;
  const lastDay = new Date(y, mo, 0).getDate();
  const endDate = `${period}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate };
}

export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
}

export function computeRegistrationDayTotal(
  lines: ShopLine[] | undefined,
  catalogById: Map<string, ShopCatalogItem>
): number {
  if (!lines?.length) return 0;
  let total = 0;
  for (const line of lines) {
    const itemId = String(line.itemId || "").trim();
    if (!itemId) continue;
    const item = catalogById.get(itemId);
    if (!item || item.active === false) continue;
    const qty = clampLineQuantity(line.quantity);
    if (qty <= 0) continue;
    const price = Number(item.price);
    if (!Number.isFinite(price) || price < 0) continue;
    total += price * qty;
  }
  return roundMoney(total);
}

export function resolveMonthlyRate(roster: {
  monthlyRate?: unknown;
  rate30Min?: unknown;
  rate60Min?: unknown;
  sessionDurationMin?: unknown;
  sessionsPerWeek?: unknown;
}): number {
  const stored = Number(roster.monthlyRate ?? 0);
  if (Number.isFinite(stored) && stored > 0) return roundMoney(stored);
  const duration = Number(roster.sessionDurationMin ?? 60);
  const perSession =
    duration === 30 ? Number(roster.rate30Min ?? 0) : Number(roster.rate60Min ?? 0);
  const weekly = Number(roster.sessionsPerWeek ?? 0);
  if (Number.isFinite(perSession) && perSession > 0 && Number.isFinite(weekly) && weekly > 0) {
    return roundMoney(perSession * weekly * 4);
  }
  return 0;
}

export function buildPaymentAmounts(monthlyRate: number, shopTotal: number): {
  amount: number;
  baseAmount: number;
  shopAmount: number;
} {
  const baseAmount = roundMoney(Math.max(0, monthlyRate));
  const shopAmount = roundMoney(Math.max(0, shopTotal));
  return {
    amount: roundMoney(baseAmount + shopAmount),
    baseAmount,
    shopAmount,
  };
}

export function isPaidStatus(s: unknown): boolean {
  const t = String(s ?? "").toLowerCase().trim();
  return t === "paid" || t === "pago";
}

export function isPendingStatus(s: unknown): boolean {
  if (s == null || s === "") return true;
  const t = String(s).toLowerCase().trim();
  return t === "pending" || t === "pendente";
}

export async function purchaseMonthHasPendingPayment(
  paymentsCol: CollectionReference,
  purchaseMonth: string
): Promise<boolean> {
  const snap = await paymentsCol.where("period", "==", purchaseMonth).get();
  return snap.docs.some((p) => isPendingStatus(p.data().status) || !p.data().status);
}
