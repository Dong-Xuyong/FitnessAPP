/** Mirrors src/lib/shop-billing.ts for Cloud Functions (no cross-package import). */

export type ShopLine = { itemId: string; quantity: number };

export type ShopCatalogItem = {
  name: string;
  price: number;
  active?: boolean;
};

export type ShopRegistrationLike = {
  date?: string;
  lines?: ShopLine[];
};

export function periodFromShopDate(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || "").trim());
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${m[1]}-${m[2]}`;
}

export function paymentPeriodForShopMonth(shopPeriod: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(shopPeriod || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  if (mo === 12) return `${y + 1}-01`;
  return `${y}-${String(mo + 1).padStart(2, "0")}`;
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
    const qty = Math.max(0, Math.min(999, Math.floor(Number(line.quantity) || 0)));
    if (qty <= 0) continue;
    const price = Number(item.price);
    if (!Number.isFinite(price) || price < 0) continue;
    total += price * qty;
  }
  return roundMoney(total);
}

export function computeShopTotalForStudentPeriod(
  registrations: ShopRegistrationLike[],
  catalogById: Map<string, ShopCatalogItem>,
  period: string
): number {
  let total = 0;
  for (const reg of registrations) {
    const p = reg.date ? periodFromShopDate(reg.date) : null;
    if (p !== period) continue;
    total += computeRegistrationDayTotal(reg.lines, catalogById);
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
  const t = String(s ?? "").toLowerCase().trim();
  return t === "pending" || t === "pendente";
}
