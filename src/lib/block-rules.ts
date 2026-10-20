/**
 * Per-weekday time rules for session blocks.
 * Missing or invalid data normalizes to an empty list so existing trainers
 * keep the single default duration and max-students behaviour.
 */

export const BLOCK_DURATION_OPTIONS = [15, 30, 45, 60, 90] as const;

/** Seg–Dom, the order shown in the block-settings UI. */
export const BLOCK_WEEKDAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export const BLOCK_WEEKDAY_SHORT: Record<(typeof BLOCK_WEEKDAY_ORDER)[number], string> = {
  monday: "Seg",
  tuesday: "Ter",
  wednesday: "Qua",
  thursday: "Qui",
  friday: "Sex",
  saturday: "Sáb",
  sunday: "Dom",
};

const WEEKDAY_SET = new Set<string>(BLOCK_WEEKDAY_ORDER);

export type BlockRule = {
  id: string;
  weekdays: string[];
  startTime: string;
  endTime: string;
  durationMin: number;
  maxStudents: number;
};

export type ResolvedBlockSettings = {
  durationMin: number;
  maxStudents: number;
  rule: BlockRule | null;
};

function parseHm(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatHm(totalMinutes: number): string {
  const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

function normalizeHm(time: string): string | null {
  const mins = parseHm(time);
  if (mins == null) return null;
  return formatHm(mins);
}

function isDurationOption(value: number): value is (typeof BLOCK_DURATION_OPTIONS)[number] {
  return (BLOCK_DURATION_OPTIONS as readonly number[]).includes(value);
}

function normalizeOne(item: unknown): BlockRule | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const id = String(row.id || "").trim();
  if (!id || id.length > 80) return null;

  const rawDays = Array.isArray(row.weekdays) ? row.weekdays : [];
  const seen = new Set<string>();
  const weekdays: string[] = [];
  for (const day of BLOCK_WEEKDAY_ORDER) {
    if (rawDays.some((value) => String(value || "").trim().toLowerCase() === day) && !seen.has(day)) {
      seen.add(day);
      weekdays.push(day);
    }
  }
  if (weekdays.length === 0) return null;

  const startTime = normalizeHm(String(row.startTime || ""));
  const endTime = normalizeHm(String(row.endTime || ""));
  if (!startTime || !endTime) return null;
  const start = parseHm(startTime);
  const end = parseHm(endTime);
  if (start == null || end == null || start >= end) return null;

  const durationMin = Number(row.durationMin);
  if (!isDurationOption(durationMin)) return null;

  const maxStudents = Number(row.maxStudents);
  if (!Number.isInteger(maxStudents) || maxStudents < 1 || maxStudents > 20) return null;

  return { id, weekdays, startTime, endTime, durationMin, maxStudents };
}

/** Drop invalid rows. A missing field becomes an empty list. */
export function normalizeBlockRules(raw: unknown): BlockRule[] {
  if (!Array.isArray(raw)) return [];
  const out: BlockRule[] = [];
  for (const item of raw) {
    const rule = normalizeOne(item);
    if (rule) out.push(rule);
  }
  return out;
}

/**
 * First rule whose weekdays include `weekday` and whose range contains `time`.
 * The start is inclusive and the end is exclusive, matching slot generation.
 */
export function firstMatchingBlockRule(
  rules: readonly BlockRule[],
  weekday: string,
  time: string
): BlockRule | null {
  const day = String(weekday || "").trim().toLowerCase();
  if (!WEEKDAY_SET.has(day)) return null;
  const mins = parseHm(time);
  if (mins == null) return null;
  for (const rule of rules) {
    if (!rule.weekdays.includes(day)) continue;
    const start = parseHm(rule.startTime);
    const end = parseHm(rule.endTime);
    if (start == null || end == null) continue;
    if (mins >= start && mins < end) return rule;
  }
  return null;
}

export function resolveBlockSettings(args: {
  rules: readonly BlockRule[];
  weekday: string;
  time: string;
  defaultDurationMin: number;
  defaultMaxStudents: number;
}): ResolvedBlockSettings {
  const fallbackDuration = Math.max(1, Math.floor(Number(args.defaultDurationMin) || 30));
  const fallbackMax = Math.min(20, Math.max(1, Math.floor(Number(args.defaultMaxStudents) || 1)));
  const rule = firstMatchingBlockRule(args.rules, args.weekday, args.time);
  if (!rule) {
    return { durationMin: fallbackDuration, maxStudents: fallbackMax, rule: null };
  }
  return { durationMin: rule.durationMin, maxStudents: rule.maxStudents, rule };
}

/**
 * A saved session-slot capacity stays in force so existing blocks are unchanged.
 * Rules apply when the block has not been materialized yet.
 */
export function effectiveBlockMaxStudents(
  persistedMaxStudents: number | null | undefined,
  resolvedMaxStudents: number
): number {
  const persisted = Number(persistedMaxStudents);
  if (Number.isFinite(persisted) && persisted > 0) return persisted;
  const resolved = Number(resolvedMaxStudents);
  if (Number.isFinite(resolved) && resolved > 0) return resolved;
  return 1;
}

export function addMinutesToClock(time: string, minutes: number): string {
  const start = parseHm(time);
  if (start == null) return time;
  return formatHm(start + minutes);
}

/** Slot starts from `startTime` until `endTime`, stepping by `durationAt(start)`. */
export function generateSlotTimesByDuration(
  startTime: string,
  endTime: string,
  durationAt: (time: string) => number
): string[] {
  const startMins = parseHm(startTime);
  const endMins = parseHm(endTime);
  if (startMins == null || endMins == null || startMins >= endMins) return [];
  const slots: string[] = [];
  let cursor = startMins;
  let guard = 0;
  while (cursor < endMins && guard < 96) {
    const label = formatHm(cursor);
    slots.push(label);
    const step = Math.max(1, Math.floor(Number(durationAt(label)) || 30));
    cursor += step;
    guard += 1;
  }
  return slots;
}

/**
 * Consecutive block starts that cover a session, stepping by each block's own duration.
 * Returns [] when the chain would leave the available grid before the session is covered.
 */
export function blocksCoveringSession(args: {
  slotTimes: readonly string[];
  startTime: string;
  sessionDurationMin: number;
  durationAt: (time: string) => number;
}): string[] {
  const available = new Set(args.slotTimes);
  if (!available.has(args.startTime)) return [];
  const target = Math.max(1, Math.floor(Number(args.sessionDurationMin) || 0));
  const blocks: string[] = [];
  let cursor = args.startTime;
  let covered = 0;
  let guard = 0;
  while (covered < target && guard < 48) {
    if (!available.has(cursor)) return [];
    const step = Math.max(1, Math.floor(Number(args.durationAt(cursor)) || 30));
    blocks.push(cursor);
    covered += step;
    if (covered >= target) return blocks;
    cursor = addMinutesToClock(cursor, step);
    guard += 1;
  }
  return [];
}

/** Start times of slot docs where this student is enrolled in the logical session. */
export function enrolledSlotTimesForSession(
  slots: ReadonlyArray<{
    date: string;
    startTime: string;
    students?: ReadonlyArray<{ studentId?: string; sessionStart?: string }>;
  }>,
  date: string,
  studentIds: readonly string[],
  sessionStart: string
): string[] {
  const ids = new Set(studentIds.map((id) => String(id || "").trim()).filter(Boolean));
  const times = new Set<string>();
  for (const slot of slots) {
    if (String(slot.date || "").slice(0, 10) !== date) continue;
    for (const student of slot.students ?? []) {
      if (!ids.has(String(student.studentId || "").trim())) continue;
      const rowStart = student.sessionStart ?? slot.startTime;
      if (rowStart !== sessionStart) continue;
      times.add(slot.startTime);
    }
  }
  return [...times].sort();
}

export function unionClockTimes(computed: readonly string[], enrolled: readonly string[]): string[] {
  return [...new Set([...computed, ...enrolled])].sort();
}

export function formatBlockRuleDays(rule: Pick<BlockRule, "weekdays">): string {
  return BLOCK_WEEKDAY_ORDER.filter((day) => rule.weekdays.includes(day))
    .map((day) => BLOCK_WEEKDAY_SHORT[day])
    .join(", ");
}
