import { normalizeBirthDateInput } from "@/lib/body-metric-input";
import { getStudentDisplayName } from "@/lib/student-display";

export type BirthdayStudent = {
  id: string;
  name: string;
  birthDate: string;
  turningAge: number | null;
};

export type UpcomingBirthdayStudent = BirthdayStudent & {
  /** 0 = today, 1 = tomorrow, … */
  daysUntil: number;
};

/** How far ahead the sidebar “upcoming birthdays” list looks. */
export const UPCOMING_BIRTHDAY_WINDOW_DAYS = 14;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function startOfLocalDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Next local calendar occurrence of month/day from `birthDate` (YYYY-MM-DD).
 * Feb 29 births are treated as Feb 28 in non-leap years.
 */
export function nextBirthdayDate(birthDateRaw: unknown, now: Date = new Date()): Date | null {
  const birthDate = normalizeBirthDateInput(birthDateRaw);
  if (!birthDate) return null;
  const [, bm, bd] = birthDate.split("-").map(Number);
  if (!bm || !bd) return null;

  const today = startOfLocalDay(now);
  const year = today.getFullYear();

  const resolveForYear = (y: number): Date => {
    let month = bm;
    let day = bd;
    if (bm === 2 && bd === 29 && !isLeapYear(y)) {
      month = 2;
      day = 28;
    }
    return new Date(y, month - 1, day);
  };

  let next = resolveForYear(year);
  if (next < today) {
    next = resolveForYear(year + 1);
  }
  return next;
}

/**
 * True when `birthDate` (YYYY-MM-DD) falls on the local calendar day of `now`.
 * Feb 29 births are treated as Feb 28 in non-leap years.
 */
export function isBirthdayToday(birthDateRaw: unknown, now: Date = new Date()): boolean {
  const next = nextBirthdayDate(birthDateRaw, now);
  if (!next) return false;
  const today = startOfLocalDay(now);
  return next.getTime() === today.getTime();
}

/** Age the person turns on the next birthday occurrence (null if birth year invalid). */
export function turningAgeOnBirthday(birthDateRaw: unknown, now: Date = new Date()): number | null {
  const birthDate = normalizeBirthDateInput(birthDateRaw);
  const next = nextBirthdayDate(birthDate, now);
  if (!birthDate || !next) return null;
  const [by] = birthDate.split("-").map(Number);
  const age = next.getFullYear() - by;
  if (!Number.isFinite(age) || age < 0 || age > 120) return null;
  return age;
}

function daysBetweenLocal(from: Date, to: Date): number {
  const ms = startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export function getRosterBirthdaysToday(
  students: ReadonlyArray<Record<string, unknown> & { id: string }>,
  now: Date = new Date(),
  unnamedFallback = "Student"
): BirthdayStudent[] {
  const out: BirthdayStudent[] = [];
  for (const student of students) {
    if (!isBirthdayToday(student.birthDate, now)) continue;
    out.push({
      id: student.id,
      name: getStudentDisplayName(student, unnamedFallback),
      birthDate: normalizeBirthDateInput(student.birthDate),
      turningAge: turningAgeOnBirthday(student.birthDate, now),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return out;
}

/**
 * Students whose next birthday falls within `windowDays` (inclusive of today).
 * Sorted soonest first, then by name.
 */
export function getRosterUpcomingBirthdays(
  students: ReadonlyArray<Record<string, unknown> & { id: string }>,
  now: Date = new Date(),
  unnamedFallback = "Student",
  windowDays: number = UPCOMING_BIRTHDAY_WINDOW_DAYS
): UpcomingBirthdayStudent[] {
  const today = startOfLocalDay(now);
  const out: UpcomingBirthdayStudent[] = [];

  for (const student of students) {
    const next = nextBirthdayDate(student.birthDate, now);
    if (!next) continue;
    const daysUntil = daysBetweenLocal(today, next);
    if (daysUntil < 0 || daysUntil > windowDays) continue;
    out.push({
      id: student.id,
      name: getStudentDisplayName(student, unnamedFallback),
      birthDate: normalizeBirthDateInput(student.birthDate),
      turningAge: turningAgeOnBirthday(student.birthDate, now),
      daysUntil,
    });
  }

  out.sort((a, b) => {
    if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return out;
}
