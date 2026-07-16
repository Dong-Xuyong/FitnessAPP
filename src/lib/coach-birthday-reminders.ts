import { normalizeBirthDateInput } from "@/lib/body-metric-input";
import { getStudentDisplayName } from "@/lib/student-display";

export type BirthdayStudent = {
  id: string;
  name: string;
  birthDate: string;
  turningAge: number | null;
};

function localYmdParts(now: Date): { year: number; month: number; day: number } {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * True when `birthDate` (YYYY-MM-DD) falls on the local calendar day of `now`.
 * Feb 29 births are treated as Feb 28 in non-leap years.
 */
export function isBirthdayToday(birthDateRaw: unknown, now: Date = new Date()): boolean {
  const birthDate = normalizeBirthDateInput(birthDateRaw);
  if (!birthDate) return false;
  const [, bm, bd] = birthDate.split("-").map(Number);
  const { year, month, day } = localYmdParts(now);

  if (bm === 2 && bd === 29 && !isLeapYear(year)) {
    return month === 2 && day === 28;
  }
  return month === bm && day === bd;
}

/** Age the person turns on this birthday (null if birth year invalid). */
export function turningAgeOnBirthday(birthDateRaw: unknown, now: Date = new Date()): number | null {
  const birthDate = normalizeBirthDateInput(birthDateRaw);
  if (!birthDate || !isBirthdayToday(birthDate, now)) return null;
  const [by] = birthDate.split("-").map(Number);
  const age = now.getFullYear() - by;
  if (!Number.isFinite(age) || age < 0 || age > 120) return null;
  return age;
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
