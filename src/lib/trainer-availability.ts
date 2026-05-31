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

export type OpenAvailabilityBlock = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
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

function parseHm(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function normalizeHm(time: string): string {
  const mins = parseHm(time);
  if (mins == null) return "09:00";
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

function addMinutesToHm(time: string, minutes: number): string {
  const start = parseHm(time);
  if (start == null) return time;
  const total = start + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Return N consecutive slot start-times from `startTime`, each `slotDurationMin` apart. */
export function consecutiveSlotBlocksFrom(
  allSlotTimes: string[],
  startTime: string,
  count: number,
  slotDurationMin: number
): string[] {
  if (count <= 0) return [];
  const available = new Set(allSlotTimes);
  const blocks: string[] = [];
  let t = startTime;
  for (let i = 0; i < count; i++) {
    if (!available.has(t)) return [];
    blocks.push(t);
    if (i < count - 1) t = addMinutesToHm(t, slotDurationMin);
  }
  return blocks;
}

/** Generate slot start-times from `startTime` (inclusive) until `endTime` (exclusive). */
export function generateSlotTimes(startTime: string, endTime: string, slotDurationMin: number): string[] {
  const step = Math.max(1, Math.floor(slotDurationMin));
  const startMins = parseHm(startTime);
  const endMins = parseHm(endTime);
  if (startMins == null || endMins == null || startMins >= endMins) return [];
  const slots: string[] = [];
  for (let t = startMins; t < endMins; t += step) {
    slots.push(`${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`);
  }
  return slots;
}

export function generateSlotsForDay(
  sched: DaySchedule | undefined,
  slotDurationMin: number
): string[] {
  if (!sched?.enabled || !sched.ranges.length) return [];
  const all = sched.ranges.flatMap((r) =>
    generateSlotTimes(r.startTime, r.endTime, slotDurationMin)
  );
  return [...new Set(all)].sort();
}

export function normalizeOpenAvailabilityBlocks(raw: unknown): OpenAvailabilityBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: OpenAvailabilityBlock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const date = String(row.date || "").trim().slice(0, 10);
    if (!date || !parseYmd(date)) continue;
    const startTime = normalizeHm(String(row.startTime || ""));
    const endTime = normalizeHm(String(row.endTime || ""));
    const startMins = parseHm(startTime);
    const endMins = parseHm(endTime);
    if (startMins == null || endMins == null || startMins >= endMins) continue;
    const id = String(row.id || "").trim() || `${date}_${startTime}_${endTime}`;
    out.push({ id, date, startTime, endTime });
  }
  return out;
}

export function openBlocksForDate(
  dateStr: string,
  blocks: OpenAvailabilityBlock[]
): OpenAvailabilityBlock[] {
  const key = String(dateStr || "").trim().slice(0, 10);
  return blocks.filter((b) => b.date === key);
}

export function timeWithinOpenBlock(time: string, block: OpenAvailabilityBlock): boolean {
  const t = parseHm(time);
  const start = parseHm(block.startTime);
  const end = parseHm(block.endTime);
  if (t == null || start == null || end == null) return false;
  return t >= start && t < end;
}

export function openBlockAtTime(
  dateStr: string,
  time: string,
  blocks: OpenAvailabilityBlock[]
): OpenAvailabilityBlock | undefined {
  return openBlocksForDate(dateStr, blocks).find((b) => timeWithinOpenBlock(time, b));
}

function timeWithinAnyOpenBlock(
  time: string,
  blocksOnDate: OpenAvailabilityBlock[]
): boolean {
  return blocksOnDate.some((b) => timeWithinOpenBlock(time, b));
}

/** Weekly slots outside open-block windows, plus slots from each open block on the date.
 *  On vacation days with open blocks, only the open-block windows are returned. */
export function resolveDaySlotTimes(args: {
  dateStr: string;
  weeklySched: DaySchedule | undefined;
  openBlocks: OpenAvailabilityBlock[];
  slotDurationMin: number;
  vacationPeriods?: VacationPeriod[];
}): string[] {
  const { dateStr, weeklySched, openBlocks, slotDurationMin, vacationPeriods = [] } = args;
  const onDate = openBlocksForDate(dateStr, openBlocks);
  const onVacation = isDateInVacation(dateStr, vacationPeriods);

  if (onVacation) {
    if (onDate.length === 0) return [];
    return [...new Set(onDate.flatMap((b) => generateSlotTimes(b.startTime, b.endTime, slotDurationMin)))].sort();
  }

  const weeklySlots = generateSlotsForDay(weeklySched, slotDurationMin).filter(
    (t) => !timeWithinAnyOpenBlock(t, onDate)
  );
  const openSlots = onDate.flatMap((b) =>
    generateSlotTimes(b.startTime, b.endTime, slotDurationMin)
  );
  return [...new Set([...weeklySlots, ...openSlots])].sort();
}

export function dayHasOpenBlocks(dateStr: string, blocks: OpenAvailabilityBlock[]): boolean {
  return openBlocksForDate(dateStr, blocks).length > 0;
}

export function getEffectiveSessionDurationMin(args: {
  rosterDurationMin: number;
  slotDurationMin: number;
}): number {
  const roster = args.rosterDurationMin;
  if (Number.isFinite(roster) && roster > 0) return roster;
  return Math.max(1, args.slotDurationMin);
}

export function isNewBookingBlocked(args: {
  dateStr: string;
  time: string;
  vacationPeriods: VacationPeriod[];
  openBlocks: OpenAvailabilityBlock[];
}): boolean {
  if (!isDateInVacation(args.dateStr, args.vacationPeriods)) return false;
  return !openBlockAtTime(args.dateStr, args.time, args.openBlocks);
}

export function coachDayShowsSchedule(args: {
  weeklyAvailable: boolean;
  onVacation: boolean;
  hasExistingSlots: boolean;
  hasResolvableSlots?: boolean;
}): boolean {
  if (args.hasResolvableSlots) return true;
  const { weeklyAvailable, onVacation, hasExistingSlots } = args;
  if (!weeklyAvailable) return hasExistingSlots;
  if (onVacation) return hasExistingSlots;
  return true;
}

export function studentDayBookable(args: {
  weeklyAvailable: boolean;
  onVacation: boolean;
  hasResolvableSlots?: boolean;
}): boolean {
  if (args.hasResolvableSlots) return true;
  return args.weeklyAvailable && !args.onVacation;
}

/** Upcoming open blocks on or after today, sorted by date then start time. */
export function upcomingOpenAvailabilityBlocks(
  blocks: OpenAvailabilityBlock[],
  todayStr: string = toDateStr(new Date()),
  limit = 5
): OpenAvailabilityBlock[] {
  return [...blocks]
    .filter((b) => b.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .slice(0, limit);
}

export function formatOpenBlockLabel(
  block: Pick<OpenAvailabilityBlock, "date" | "startTime" | "endTime">,
  locale: "pt" | "en" = "pt"
): string {
  const loc = locale === "pt" ? pt : undefined;
  const d = parseYmd(block.date);
  const datePart = d
    ? format(d, "d MMM yyyy", loc ? { locale: loc } : undefined)
    : block.date;
  return `${datePart} · ${block.startTime}–${block.endTime}`;
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
