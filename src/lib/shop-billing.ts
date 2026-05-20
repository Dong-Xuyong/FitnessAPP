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

/** Shop purchases in `shopPeriod` are billed on the following calendar month's payment. */
export function paymentPeriodForShopMonth(shopPeriod: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(shopPeriod || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  if (mo === 12) return `${y + 1}-01`;
  return `${y}-${String(mo + 1).padStart(2, "0")}`;
}

/** Payment period `YYYY-MM` includes shop charges from the previous calendar month. */
export function shopSourcePeriodForPaymentPeriod(paymentPeriod: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(paymentPeriod || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  if (mo === 1) return `${y - 1}-12`;
  return `${y}-${String(mo - 1).padStart(2, "0")}`;
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

export type ShopRegistrationDaySummary = {
  date: string;
  summary: string;
  dayTotal: number;
};

export function summarizeShopRegistrationsForPeriod(
  registrations: ShopRegistrationLike[],
  catalogById: ReadonlyMap<string, ShopCatalogItem>,
  period: string
): { entries: ShopRegistrationDaySummary[]; monthShopTotal: number } {
  const inPeriod = filterRegistrationsForPeriod(registrations, period);
  const entries: ShopRegistrationDaySummary[] = inPeriod
    .map((reg) => {
      const date = String(reg.date ?? "").trim();
      const dayTotal = computeRegistrationDayTotal(reg.lines, catalogById);
      return {
        date,
        summary: formatShopLinesSummary(reg.lines, catalogById),
        dayTotal,
      };
    })
    .filter((e) => e.date && e.dayTotal > 0)
    .sort((a, b) => b.date.localeCompare(a.date));

  const monthShopTotal = roundMoney(entries.reduce((sum, e) => sum + e.dayTotal, 0));
  return { entries, monthShopTotal };
}

export function computeShopTotalForStudentPeriod(
  registrations: ShopRegistrationLike[],
  catalogById: ReadonlyMap<string, ShopCatalogItem>,
  period: string
): number {
  return summarizeShopRegistrationsForPeriod(registrations, catalogById, period).monthShopTotal;
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
