import type { Locale } from "@/lib/i18n";

/** Start of local calendar day (midnight local). */
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Interprets a stored milestone due as a **calendar date** (not UTC instant).
 * ISO `YYYY-MM-DD` or `YYYY-MM-DDTHH:...` uses the date part only in **local** context
 * so time zones do not shift the visible day (avoids UTC midnight drift).
 */
export function parseMilestoneDueCalendarDate(isoLike: string): Date {
  if (!isoLike?.trim()) return new Date(NaN);
  const head = isoLike.trim().split("T")[0];
  const cal = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (cal) {
    return new Date(Number(cal[1]), Number(cal[2]) - 1, Number(cal[3]));
  }
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return d;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatMilestoneDueLong(isoLike: string, locale: Locale): string {
  const d = parseMilestoneDueCalendarDate(isoLike);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale === "pt" ? "pt-PT" : "en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatMilestoneCompletedLong(isoLike: string | undefined, locale: Locale): string {
  if (!isoLike?.trim()) return "—";
  const d = new Date(isoLike);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale === "pt" ? "pt-PT" : "en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** True when calendar due date is strictly before today's local calendar date. */
export function isPastMilestoneDueDateLocal(isoLike: string): boolean {
  const due = parseMilestoneDueCalendarDate(isoLike);
  if (Number.isNaN(due.getTime())) return false;
  const today = startOfLocalDay(new Date());
  const dueDay = startOfLocalDay(due);
  return dueDay < today;
}
