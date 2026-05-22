export const LISBON_TZ = "Europe/Lisbon";

export function lisbonYmd(now: Date): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: LISBON_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = s.split("-").map((x) => Number(x));
  return { y, m, d };
}

export function currentBillingPeriod(parts: { y: number; m: number }): string {
  return `${parts.y}-${String(parts.m).padStart(2, "0")}`;
}

/** Calendar month after Lisbon `YYYY-MM` parts (month is 1–12). */
export function nextBillingPeriod(parts: { y: number; m: number }): string {
  if (parts.m === 12) return `${parts.y + 1}-01`;
  return `${parts.y}-${String(parts.m + 1).padStart(2, "0")}`;
}

/** True on the last three calendar days of the month (Lisbon). */
export function isWithinLastThreeDaysOfMonth(parts: { y: number; m: number; d: number }): boolean {
  const lastDay = new Date(parts.y, parts.m, 0).getDate();
  return parts.d >= lastDay - 2;
}

/** `YYYY-MM` strictly after the current Lisbon calendar month. */
export function isFutureBillingPeriod(period: string, now = new Date()): boolean {
  const lisbon = lisbonYmd(now);
  const current = currentBillingPeriod(lisbon);
  return String(period || "").trim() > current;
}

export function maySyncFuturePaymentPeriod(paymentPeriod: string, now = new Date()): boolean {
  if (!isFutureBillingPeriod(paymentPeriod, now)) return true;
  const lisbon = lisbonYmd(now);
  return isWithinLastThreeDaysOfMonth(lisbon);
}
