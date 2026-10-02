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

/** One Firestore document = one product purchase. */
export type ShopPurchaseLike = {
  id?: string;
  date?: string;
  time?: string;
  itemId?: string;
  quantity?: number;
  billingStatus?: "unpaid" | "paid";
  paidInPaymentId?: string;
};

/** @deprecated Legacy day-grouped doc with lines[]; expanded at read time. */
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
  return {
    id,
    date,
    time,
    itemId,
    quantity,
    billingStatus: "unpaid",
  };
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
  catalogById: ReadonlyMap<string, ShopCatalogItem>
): number {
  const line = purchaseAsBillableLine(purchase);
  if (!line) return 0;
  return computeLineTotal(line, catalogById);
}

export function formatPurchaseSummary(
  purchase: ShopPurchaseLike,
  catalogById: ReadonlyMap<string, ShopCatalogItem>
): string {
  const line = purchaseAsBillableLine(purchase);
  if (!line) return "—";
  return formatShopLinesSummary([line], catalogById);
}

export type PaymentPeriodLike = { period?: string; status?: string; createdAt?: unknown };

/** Payment row fields used to decide if a shop purchase settlement is locked. */
export type PaymentSettlementLike = {
  period?: string;
  status?: unknown;
  shopAmount?: unknown;
};

export function isShopLinePaid(line: BillableShopLine): boolean {
  return line.billingStatus === "paid";
}

export function isShopLineUnpaid(line: BillableShopLine): boolean {
  return !isShopLinePaid(line);
}

export function periodFromShopDate(date: string): string | null {
  const ymd = String(date || "").trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${m[1]}-${m[2]}`;
}

/** Local wall-clock time for shop purchase logging (`HH:mm:ss`). */
export function localTimeHms(now = new Date()): string {
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${h}:${min}:${s}`;
}

export function formatShopRegistrationDateTime(dateYmd: string, timeHms?: string): string {
  const date = String(dateYmd ?? "").trim().slice(0, 10);
  const time = String(timeHms ?? "").trim();
  if (!time) return date;
  return `${date} ${time}`;
}

/** Calendar month after `YYYY-MM`. */
export function nextBillingPeriodYm(period: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  if (mo === 12) return `${y + 1}-01`;
  return `${y}-${String(mo + 1).padStart(2, "0")}`;
}

/** @deprecated Use nextBillingPeriodYm — kept for legacy references. */
export function paymentPeriodForShopMonth(shopPeriod: string): string | null {
  return nextBillingPeriodYm(shopPeriod);
}

/** @deprecated Effective shop billing month is derived from registration date + pending map. */
export function shopSourcePeriodForPaymentPeriod(paymentPeriod: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(paymentPeriod || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  if (mo === 1) return `${y - 1}-12`;
  return `${y}-${String(mo - 1).padStart(2, "0")}`;
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

function paymentStatusIsPaid(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "paid" || s === "pago";
}

function paymentStatusIsPending(raw: unknown): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "pending" || s === "pendente";
}

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

function snapshotCutoffByPeriod(
  payments: readonly PaymentPeriodLike[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of payments) {
    const period = canonicalPeriodYm(p.period);
    if (!period) continue;
    if (!paymentStatusIsPending(p.status) && !paymentStatusIsPaid(p.status) && p.status != null) continue;
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
  return paymentStatusIsPaid(settlement.status) && Number(settlement.shopAmount ?? 0) > 0;
}

/** True when the period has a paid row and no pending row. */
export function isPaymentPeriodClosedPaid(
  period: string,
  payments: readonly PaymentPeriodLike[]
): boolean {
  const rows = payments.filter((p) => canonicalPeriodYm(p.period) === period);
  if (!rows.length) return false;
  if (rows.some((p) => paymentStatusIsPending(p.status))) return false;
  return rows.some((p) => paymentStatusIsPaid(p.status));
}

export function resolveBillableShopPaymentPeriod(
  purchaseMonth: string,
  purchaseDate?: string,
  purchaseTime?: string,
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
      (p) => canonicalPeriodYm(p.period) === ym && paymentStatusIsPending(p.status)
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
      (p) => canonicalPeriodYm(p.period) === ym && paymentStatusIsPending(p.status)
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

/** Effective `payments.period` for shop on a registration with `date` (YYYY-MM-DD). */
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

/** @deprecated Use shouldMarkShopPurchasePaidForPaymentRepair */
export const shouldMarkShopPurchasePaidForPaymentRepair = shouldMarkShopLinePaidForPaymentRepair;

/** Reset a purchase linked to a past payment when live cascade bills it forward. */
export function revertShopPurchasePaidForFuturePeriods(
  purchase: ShopPurchaseLike,
  payments: readonly PaymentPeriodLike[],
  paymentIdToPeriod: ReadonlyMap<string, string>,
  paymentIdToSettlement?: ReadonlyMap<string, PaymentSettlementLike>
): ShopPurchaseLike {
  if (!isShopPurchasePaid(purchase) || !purchase.paidInPaymentId) return purchase;
  const paymentId = String(purchase.paidInPaymentId);
  const settlement = paymentIdToSettlement?.get(paymentId);
  // Purchases included in a paid payment with a shop charge stay paid permanently.
  if (isPaymentSettledWithShopCharge(settlement)) return purchase;
  const paidPeriod = paymentIdToPeriod.get(paymentId);
  if (!paidPeriod) return purchase;
  const currentBillable = shopLineBillablePaymentPeriod(purchase.date, payments, purchase.time);
  if (currentBillable == null || paymentPeriodsMatch(currentBillable, paidPeriod)) return purchase;
  return {
    ...purchase,
    billingStatus: "unpaid",
    paidInPaymentId: undefined,
  };
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

/** Append a new purchase without merging into paid rows; merge qty into existing unpaid rows. */
export function appendNewPurchaseLines(
  existing: (BillableShopLine | ShopLine)[] | undefined,
  newPurchase: ShopLine[]
): BillableShopLine[] {
  const existingNorm = normalizeRegistrationLines(existing ?? []);
  const paid = existingNorm.filter(isShopLinePaid);
  const unpaidByItem = new Map<string, BillableShopLine>();
  for (const line of existingNorm.filter(isShopLineUnpaid)) {
    const cur = unpaidByItem.get(line.itemId);
    if (cur) {
      cur.quantity += line.quantity;
    } else {
      unpaidByItem.set(line.itemId, { ...line });
    }
  }
  for (const raw of newPurchase) {
    const itemId = String(raw.itemId || "").trim();
    const qty = clampLineQuantity(raw.quantity);
    if (!itemId || qty <= 0) continue;
    const cur = unpaidByItem.get(itemId);
    if (cur) {
      cur.quantity += qty;
    } else {
      unpaidByItem.set(itemId, {
        itemId,
        quantity: qty,
        billingStatus: "unpaid",
      });
    }
  }
  return [...paid, ...unpaidByItem.values()];
}

/** Strip shop lines to Firestore shapes allowed for student writes. */
export function sanitizeShopLinesForStudentWrite(
  lines: (BillableShopLine | ShopLine)[] | undefined
): BillableShopLine[] {
  return normalizeRegistrationLines(lines ?? []).map((line) => {
    const quantity = clampLineQuantity(line.quantity);
    if (isShopLinePaid(line)) {
      return {
        itemId: line.itemId,
        quantity,
        billingStatus: "paid" as const,
        ...(line.paidInPaymentId ? { paidInPaymentId: String(line.paidInPaymentId) } : {}),
      };
    }
    return {
      itemId: line.itemId,
      quantity,
      billingStatus: "unpaid" as const,
    };
  });
}

export function buildShopPurchaseWritePayload(args: {
  studentId: string;
  trainerId: string;
  date: string;
  itemId: string;
  quantity: number;
  now?: Date;
}): {
  studentId: string;
  trainerId: string;
  date: string;
  time: string;
  itemId: string;
  quantity: number;
  billingStatus: "unpaid";
  updatedAt: string;
} {
  const now = args.now ?? new Date();
  return {
    studentId: args.studentId,
    trainerId: args.trainerId,
    date: args.date,
    time: localTimeHms(now),
    itemId: String(args.itemId).trim(),
    quantity: clampLineQuantity(args.quantity),
    billingStatus: "unpaid",
    updatedAt: now.toISOString(),
  };
}

/** @deprecated Use buildShopPurchaseWritePayload per cart item */
export function buildShopRegistrationWritePayload(args: {
  studentId: string;
  trainerId: string;
  date: string;
  lines: (BillableShopLine | ShopLine)[] | undefined;
  now?: Date;
}): {
  studentId: string;
  trainerId: string;
  date: string;
  time: string;
  lines: BillableShopLine[];
  updatedAt: string;
} {
  const now = args.now ?? new Date();
  return {
    studentId: args.studentId,
    trainerId: args.trainerId,
    date: args.date,
    time: localTimeHms(now),
    lines: sanitizeShopLinesForStudentWrite(args.lines),
    updatedAt: now.toISOString(),
  };
}

export function markShopPurchasePaidForPayment(
  purchase: ShopPurchaseLike,
  paymentPeriod: string,
  paymentId: string,
  billablePeriodForPurchaseMonth: (purchaseMonth: string) => string
): ShopPurchaseLike {
  if (isShopPurchasePaid(purchase)) return purchase;
  const effective = effectiveShopPaymentPeriodForRegistrationDate(
    purchase.date,
    billablePeriodForPurchaseMonth,
    purchase.time
  );
  if (effective == null || !paymentPeriodsMatch(effective, paymentPeriod)) return purchase;
  return {
    ...purchase,
    billingStatus: "paid",
    paidInPaymentId: paymentId,
  };
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
  catalogById: ReadonlyMap<string, ShopCatalogItem>
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
  catalogById: ReadonlyMap<string, ShopCatalogItem>,
  paymentPeriod: string,
  defaultTargetByRegDate?: (
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
        ? defaultTargetByRegDate
          ? defaultTargetByRegDate(purchaseMonth, purchase.date, purchase.time)
          : purchaseMonth
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

export function sumUnpaidShopInPurchaseMonth(
  purchases: ShopPurchaseLike[],
  catalogById: ReadonlyMap<string, ShopCatalogItem>,
  purchaseMonth: string,
  _defaultTargetByRegDate?: (
    purchaseMonth: string,
    purchaseDate?: string,
    purchaseTime?: string
  ) => string
): number {
  let total = 0;
  for (const purchase of purchases) {
    if (!isShopPurchaseUnpaid(purchase)) continue;
    const pm = purchase.date ? periodFromShopDate(purchase.date) : null;
    if (pm !== purchaseMonth) continue;
    total += computePurchaseTotal(purchase, catalogById);
  }
  return roundMoney(total);
}

export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
}

export function computeRegistrationDayTotal(
  lines: ShopLine[] | undefined,
  catalogById: ReadonlyMap<string, ShopCatalogItem>
): number {
  if (!lines?.length) return 0;
  let total = 0;
  for (const line of lines) {
    const itemId = String(line.itemId || "").trim();
    if (!itemId) continue;
    const item = catalogById.get(itemId);
    if (!item || item.active === false) continue;
    const qty = Math.max(0, Math.min(999, Math.floor(Number(line.quantity) || 0)));
    if (qty <= 0) continue;
    const price = Number(item.price);
    if (!Number.isFinite(price) || price < 0) continue;
    total += price * qty;
  }
  return roundMoney(total);
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

export function filterPurchasesForPeriod(
  purchases: ShopPurchaseLike[],
  period: string
): ShopPurchaseLike[] {
  return purchases.filter((purchase) => {
    const p = purchase.date ? periodFromShopDate(purchase.date) : null;
    return p === period;
  });
}

/** @deprecated Use filterPurchasesForPeriod */
export function filterRegistrationsForPeriod(
  registrations: ShopRegistrationLike[],
  period: string
): ShopRegistrationLike[] {
  return registrations.filter((reg) => {
    const p = reg.date ? periodFromShopDate(reg.date) : null;
    return p === period;
  });
}

/** Merge multiple registration rows for the same calendar day (e.g. legacy vs auth uid studentId). */
/** Sum quantities per item across one or more line lists (e.g. append a new purchase to an existing day). */
export function mergeShopLines(...lineGroups: (ShopLine[] | undefined)[]): ShopLine[] {
  const itemMap = new Map<string, number>();
  for (const lines of lineGroups) {
    if (!lines?.length) continue;
    for (const line of lines) {
      const itemId = String(line.itemId || "").trim();
      if (!itemId) continue;
      const qty = Math.max(0, Math.min(999, Math.floor(Number(line.quantity) || 0)));
      if (qty <= 0) continue;
      itemMap.set(itemId, (itemMap.get(itemId) ?? 0) + qty);
    }
  }
  return [...itemMap.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
}

export function mergeShopRegistrationsByDate(
  registrations: ShopRegistrationLike[]
): ShopRegistrationLike[] {
  const qtyByDateItem = new Map<string, Map<string, number>>();
  for (const reg of registrations) {
    const date = String(reg.date ?? "").trim();
    if (!date) continue;
    const lines = Array.isArray(reg.lines) ? reg.lines : [];
    let itemMap = qtyByDateItem.get(date);
    if (!itemMap) {
      itemMap = new Map();
      qtyByDateItem.set(date, itemMap);
    }
    for (const line of lines) {
      const itemId = String(line.itemId || "").trim();
      if (!itemId) continue;
      const qty = Math.max(0, Math.min(999, Math.floor(Number(line.quantity) || 0)));
      if (qty <= 0) continue;
      itemMap.set(itemId, (itemMap.get(itemId) ?? 0) + qty);
    }
  }
  return [...qtyByDateItem.entries()]
    .map(([date, itemMap]) => ({
      date,
      lines: [...itemMap.entries()].map(([itemId, quantity]) => ({ itemId, quantity })),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Merge by calendar day while preserving paid vs unpaid line billing fields. */
export function mergeBillableShopRegistrationsByDate(
  registrations: ShopRegistrationLike[]
): ShopRegistrationLike[] {
  const byDate = new Map<string, BillableShopLine[]>();
  const timeByDate = new Map<string, string>();

  for (const reg of registrations) {
    const date = String(reg.date ?? "").trim();
    if (!date) continue;
    const regTime = reg.time ? String(reg.time).trim() : "";
    if (regTime) timeByDate.set(date, regTime);
    const lines = Array.isArray(reg.lines) ? reg.lines : [];
    let bucket = byDate.get(date);
    if (!bucket) {
      bucket = [];
      byDate.set(date, bucket);
    }

    for (const raw of lines) {
      const itemId = String(raw.itemId || "").trim();
      const qty = Math.max(0, Math.min(999, Math.floor(Number(raw.quantity) || 0)));
      if (!itemId || qty <= 0) continue;
      const line = raw as BillableShopLine;
      const paid = isShopLinePaid(line);

      const existing = bucket.find(
        (l) =>
          l.itemId === itemId &&
          isShopLinePaid(l) === paid &&
          (paid ? l.paidInPaymentId === line.paidInPaymentId : true)
      );
      if (existing) {
        existing.quantity += qty;
      } else if (paid) {
        bucket.push({
          itemId,
          quantity: qty,
          billingStatus: "paid",
          paidInPaymentId: line.paidInPaymentId,
        });
      } else {
        bucket.push({
          itemId,
          quantity: qty,
          billingStatus: "unpaid",
        });
      }
    }
  }

  return [...byDate.entries()]
    .map(([date, lines]) => ({
      date,
      ...(timeByDate.get(date) ? { time: timeByDate.get(date) } : {}),
      lines,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export type ShopRegistrationDaySummary = {
  /** Firestore shopRegistrations doc id when available (stable React list key). */
  purchaseId?: string;
  date: string;
  time?: string;
  summary: string;
  dayTotal: number;
};

/** Stable key for shop purchase rows in UI lists. */
export function shopRegistrationSummaryKey(
  line: ShopRegistrationDaySummary,
  index = 0
): string {
  if (line.purchaseId) return line.purchaseId;
  return `${line.date}|${line.time ?? ""}|${line.summary}|${line.dayTotal}|${index}`;
}

export type ShopRegistrationDeferredDaySummary = ShopRegistrationDaySummary & {
  billsOnPeriod: string;
};

export function summarizeShopRegistrationsForBillingMonth(
  purchases: ShopPurchaseLike[],
  catalogById: ReadonlyMap<string, ShopCatalogItem>,
  purchaseMonth: string,
  billablePeriodForPurchaseMonth: (
    purchaseMonth: string,
    purchaseDate?: string,
    purchaseTime?: string
  ) => string
): {
  entries: ShopRegistrationDaySummary[];
  deferredEntries: ShopRegistrationDeferredDaySummary[];
  monthShopTotal: number;
  deferredTotal: number;
} {
  const inPeriod = filterPurchasesForPeriod(purchases, purchaseMonth);
  const entries: ShopRegistrationDaySummary[] = [];
  const deferredEntries: ShopRegistrationDeferredDaySummary[] = [];
  for (const purchase of inPeriod) {
    const billablePeriod = billablePeriodForPurchaseMonth(
      purchaseMonth,
      purchase.date,
      purchase.time
    );
    const date = String(purchase.date ?? "").trim();
    if (!date) continue;
    const lineTotal = computePurchaseTotal(purchase, catalogById);
    if (lineTotal <= 0) continue;
    const summary = formatPurchaseSummary(purchase, catalogById);
    const paid = isShopPurchasePaid(purchase);

    if (paid || billablePeriod === purchaseMonth) {
      entries.push({
        purchaseId: purchase.id,
        date,
        time: purchase.time ? String(purchase.time).trim() : undefined,
        summary,
        dayTotal: lineTotal,
      });
    } else if (!paid && billablePeriod > purchaseMonth) {
      deferredEntries.push({
        purchaseId: purchase.id,
        date,
        time: purchase.time ? String(purchase.time).trim() : undefined,
        summary,
        dayTotal: lineTotal,
        billsOnPeriod: billablePeriod,
      });
    }
  }

  entries.sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    if (d !== 0) return d;
    return String(b.time ?? "").localeCompare(String(a.time ?? ""));
  });
  deferredEntries.sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    if (d !== 0) return d;
    return String(b.time ?? "").localeCompare(String(a.time ?? ""));
  });

  return {
    entries,
    deferredEntries,
    monthShopTotal: roundMoney(entries.reduce((sum, entry) => sum + entry.dayTotal, 0)),
    deferredTotal: roundMoney(deferredEntries.reduce((sum, entry) => sum + entry.dayTotal, 0)),
  };
}

export function summarizeUnpaidShopRegistrations(
  purchases: ShopPurchaseLike[],
  catalogById: ReadonlyMap<string, ShopCatalogItem>,
  billablePeriodForPurchaseMonth: (
    purchaseMonth: string,
    purchaseDate?: string,
    purchaseTime?: string
  ) => string
): {
  entries: ShopRegistrationDeferredDaySummary[];
  totalUnpaid: number;
} {
  const entries: ShopRegistrationDeferredDaySummary[] = [];

  for (const purchase of purchases) {
    if (!isShopPurchaseUnpaid(purchase)) continue;
    const date = String(purchase.date ?? "").trim();
    const purchaseMonth = date ? periodFromShopDate(date) : null;
    if (!date || !purchaseMonth) continue;

    const dayTotal = computePurchaseTotal(purchase, catalogById);
    if (dayTotal <= 0) continue;

    entries.push({
      purchaseId: purchase.id,
      date,
      time: purchase.time ? String(purchase.time).trim() : undefined,
      summary: formatPurchaseSummary(purchase, catalogById),
      dayTotal,
      billsOnPeriod: billablePeriodForPurchaseMonth(
        purchaseMonth,
        purchase.date,
        purchase.time
      ),
    });
  }

  entries.sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    if (d !== 0) return d;
    return String(b.time ?? "").localeCompare(String(a.time ?? ""));
  });

  return {
    entries,
    totalUnpaid: roundMoney(entries.reduce((sum, entry) => sum + entry.dayTotal, 0)),
  };
}

export type ShopPaymentLinkedDaySummary = ShopRegistrationDaySummary & {
  syncStatus: "paid" | "unpaid";
};

/** Purchase summaries for shop lines linked to a payment via paidInPaymentId. */
export function collectShopLinesPaidByPaymentId(
  purchases: ShopPurchaseLike[],
  paymentId: string,
  catalogById: ReadonlyMap<string, ShopCatalogItem>
): ShopPaymentLinkedDaySummary[] {
  const entries: ShopPaymentLinkedDaySummary[] = [];
  for (const purchase of purchases) {
    if (!isShopPurchasePaid(purchase) || purchase.paidInPaymentId !== paymentId) continue;
    const date = String(purchase.date ?? "").trim();
    if (!date) continue;
    const dayTotal = computePurchaseTotal(purchase, catalogById);
    if (dayTotal <= 0) continue;
    entries.push({
      purchaseId: purchase.id,
      date,
      time: purchase.time ? String(purchase.time).trim() : undefined,
      summary: formatPurchaseSummary(purchase, catalogById),
      dayTotal,
      syncStatus: "paid",
    });
  }
  entries.sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    if (d !== 0) return d;
    return String(b.time ?? "").localeCompare(String(a.time ?? ""));
  });
  return entries;
}

/**
 * Unpaid purchases that belong to `paymentPeriod` using mark-paid billing context
 * (historical allocation when that payment was recorded).
 */
export function collectShopLinesForPaymentPeriod(
  purchases: ShopPurchaseLike[],
  catalogById: ReadonlyMap<string, ShopCatalogItem>,
  payments: readonly PaymentPeriodLike[],
  paymentPeriod: string
): ShopPaymentLinkedDaySummary[] {
  const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextForMarkPaid(
    payments,
    paymentPeriod
  );
  const entries: ShopPaymentLinkedDaySummary[] = [];
  for (const purchase of purchases) {
    if (!isShopPurchaseUnpaid(purchase)) continue;
    const date = String(purchase.date ?? "").trim();
    if (!date) continue;
    const effective = effectiveShopPaymentPeriodForRegistrationDate(
      date,
      billablePeriodForPurchaseMonth,
      purchase.time
    );
    if (effective !== paymentPeriod) continue;
    const dayTotal = computePurchaseTotal(purchase, catalogById);
    if (dayTotal <= 0) continue;
    entries.push({
      purchaseId: purchase.id,
      date,
      time: purchase.time ? String(purchase.time).trim() : undefined,
      summary: formatPurchaseSummary(purchase, catalogById),
      dayTotal,
      syncStatus: "unpaid",
    });
  }
  entries.sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    if (d !== 0) return d;
    return String(b.time ?? "").localeCompare(String(a.time ?? ""));
  });
  return entries;
}

export function summarizeShopRegistrationsForPeriod(
  purchases: ShopPurchaseLike[],
  catalogById: ReadonlyMap<string, ShopCatalogItem>,
  period: string
): { entries: ShopRegistrationDaySummary[]; monthShopTotal: number } {
  const inPeriod = filterPurchasesForPeriod(purchases, period);
  const entries: ShopRegistrationDaySummary[] = inPeriod
    .map((purchase) => {
      const date = String(purchase.date ?? "").trim();
      const dayTotal = computePurchaseTotal(purchase, catalogById);
      return {
        purchaseId: purchase.id,
        date,
        time: purchase.time ? String(purchase.time).trim() : undefined,
        summary: formatPurchaseSummary(purchase, catalogById),
        dayTotal,
      };
    })
    .filter((e) => e.date && e.dayTotal > 0)
    .sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      if (d !== 0) return d;
      return String(b.time ?? "").localeCompare(String(a.time ?? ""));
    });

  const monthShopTotal = roundMoney(entries.reduce((sum, e) => sum + e.dayTotal, 0));
  return { entries, monthShopTotal };
}

export function computeShopTotalForStudentPeriod(
  purchases: ShopPurchaseLike[],
  catalogById: ReadonlyMap<string, ShopCatalogItem>,
  period: string
): number {
  return summarizeShopRegistrationsForPeriod(purchases, catalogById, period).monthShopTotal;
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

export function catalogMapFromItems(
  items: Array<{ id: string } & ShopCatalogItem>
): Map<string, ShopCatalogItem> {
  const map = new Map<string, ShopCatalogItem>();
  for (const item of items) {
    map.set(item.id, { name: item.name, price: item.price, active: item.active });
  }
  return map;
}

export function paymentHasShopBreakdown(p: {
  baseAmount?: unknown;
  shopAmount?: unknown;
}): boolean {
  const shop = Number(p.shopAmount ?? 0);
  const base = Number(p.baseAmount ?? 0);
  return (Number.isFinite(shop) && shop > 0) || (Number.isFinite(base) && base > 0);
}

export function formatShopLinesSummary(
  lines: ShopLine[] | undefined,
  catalogById: ReadonlyMap<string, ShopCatalogItem>
): string {
  if (!lines?.length) return "—";
  const parts: string[] = [];
  for (const line of lines) {
    const qty = Math.floor(Number(line.quantity) || 0);
    if (qty <= 0) continue;
    const name = catalogById.get(line.itemId)?.name || line.itemId.slice(0, 8);
    parts.push(`${name} ×${qty}`);
  }
  return parts.length ? parts.join(", ") : "—";
}
