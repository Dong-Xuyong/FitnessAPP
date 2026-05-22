import { eachDayOfInterval, format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";

export type TimeRange = { startTime: string; endTime: string };
export type DaySchedule = { enabled: boolean; ranges: TimeRange[] };
export type Availability = Record<string, DaySchedule>;

export type VacationPeriod = {
  id: string;
  startDate: string;
  endDate: string;
  label?: string;
};

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function weekdayKeyFromDate(date: Date): string {
  return DAY_KEYS[date.getDay()];
}

export function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseYmd(dateStr: string): Date | null {
  const s = String(dateStr || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = parseISO(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function normalizeVacationPeriods(raw: unknown): VacationPeriod[] {
  if (!Array.isArray(raw)) return [];
  const out: VacationPeriod[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const startDate = String(row.startDate || "").trim().slice(0, 10);
    const endDate = String(row.endDate || "").trim().slice(0, 10);
    if (!startDate || !endDate || !parseYmd(startDate) || !parseYmd(endDate)) continue;
    const id = String(row.id || "").trim() || `${startDate}_${endDate}`;
    const label = String(row.label || "").trim();
    out.push({
      id,
      startDate,
      endDate: endDate >= startDate ? endDate : startDate,
      ...(label ? { label } : {}),
    });
  }
  return out;
}

export function isDateInVacation(dateStr: string, periods: VacationPeriod[]): boolean {
  const d = parseYmd(dateStr);
  if (!d) return false;
  const key = toDateStr(d);
  return periods.some((p) => {
    const start = parseYmd(p.startDate);
    const end = parseYmd(p.endDate);
    if (!start || !end) return false;
    const startKey = toDateStr(start);
    const endKey = toDateStr(end);
    return key >= startKey && key <= endKey;
  });
}

export function datesInVacationPeriod(startDate: string, endDate: string): string[] {
  const start = parseYmd(startDate);
  const end = parseYmd(endDate);
  if (!start || !end) return [];
  const a = start <= end ? start : end;
  const b = start <= end ? end : start;
  return eachDayOfInterval({ start: a, end: b }).map(toDateStr);
}

export function vacationPeriodsOverlap(
  a: Pick<VacationPeriod, "startDate" | "endDate">,
  b: Pick<VacationPeriod, "startDate" | "endDate">
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function dayIsWeeklyUnavailable(date: Date, availability: Availability): boolean {
  const sched = availability[weekdayKeyFromDate(date)];
  return !sched?.enabled || !sched.ranges.length;
}

export function dayIsWeeklyAvailable(date: Date, availability: Availability): boolean {
  const sched = availability[weekdayKeyFromDate(date)];
  return !!sched?.enabled && !!sched.ranges.length;
}

export function coachDayShowsSchedule(args: {
  weeklyAvailable: boolean;
  onVacation: boolean;
  hasExistingSlots: boolean;
}): boolean {
  const { weeklyAvailable, onVacation, hasExistingSlots } = args;
  if (!weeklyAvailable) return false;
  if (onVacation) return hasExistingSlots;
  return true;
}

export function studentDayBookable(args: {
  weeklyAvailable: boolean;
  onVacation: boolean;
}): boolean {
  return args.weeklyAvailable && !args.onVacation;
}

export function formatVacationPeriodRange(
  period: Pick<VacationPeriod, "startDate" | "endDate">,
  locale: "pt" | "en" = "pt"
): string {
  const loc = locale === "pt" ? pt : undefined;
  const start = parseYmd(period.startDate);
  const end = parseYmd(period.endDate);
  if (!start || !end) return `${period.startDate} – ${period.endDate}`;
  const fmt = (d: Date) => format(d, "d MMM yyyy", loc ? { locale: loc } : undefined);
  if (period.startDate === period.endDate) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Upcoming or in-progress vacation periods, sorted by start date. */
export function upcomingVacationPeriods(
  periods: VacationPeriod[],
  todayStr: string = toDateStr(new Date())
): VacationPeriod[] {
  return [...periods]
    .filter((p) => p.endDate >= todayStr)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}
