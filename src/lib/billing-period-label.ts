/** Human label for `YYYY-MM` (e.g. "June 2026"). */
export function formatBillingPeriodLabel(period: string, locale?: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period || "").trim());
  if (!m) return period;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
}
