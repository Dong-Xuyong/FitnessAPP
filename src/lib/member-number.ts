import { getStudentDisplayName } from "@/lib/student-display";

/** Stored on the coach roster student doc and mirrored onto the global student doc. */
export const MEMBER_NUMBER_FIELD = "memberNumber";

/** Matches the Firestore rules limit. */
export const MEMBER_NUMBER_MAX_LENGTH = 64;

const UNNAMED_STUDENT_PT = "Aluno sem nome";

export type MemberNumberRosterRow = {
  id: string;
  memberNumber?: unknown;
  name?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  userId?: unknown;
  email?: unknown;
};

export type MemberNumberMatch = {
  id: string;
  /** Trimmed value as stored, preserving leading zeros and original case. */
  memberNumber: string;
  name: string;
};

/** Trim surrounding whitespace. Empty means the student has no member number. */
export function normalizeMemberNumber(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/** Comparison key: trimmed and case-insensitive (PT-PT). */
export function memberNumberKey(value: unknown): string {
  return normalizeMemberNumber(value).toLocaleLowerCase("pt-PT");
}

export function memberNumbersEqual(a: unknown, b: unknown): boolean {
  const left = memberNumberKey(a);
  const right = memberNumberKey(b);
  return left.length > 0 && left === right;
}

/** First non-empty member number among roster and global copies. */
export function firstMemberNumber(...values: unknown[]): string {
  for (const value of values) {
    const normalized = normalizeMemberNumber(value);
    if (normalized) return normalized;
  }
  return "";
}

export function memberNumberMatchesQuery(memberNumber: unknown, query: string): boolean {
  const needle = memberNumberKey(query);
  if (!needle) return false;
  return memberNumberKey(memberNumber).includes(needle);
}

/**
 * Warning shown when a coach tries to save a number another student already has.
 * Always PT-PT, and it names the other student.
 */
export function memberNumberTakenWarning(memberNumber: string, otherStudentName: string): string {
  const number = normalizeMemberNumber(memberNumber);
  const name = otherStudentName.trim() || UNNAMED_STUDENT_PT;
  return `O n.º de sócio «${number}» já está atribuído a ${name}. Escolha outro número.`;
}

function rowName(row: MemberNumberRosterRow): string {
  return getStudentDisplayName(row as Record<string, unknown>, UNNAMED_STUDENT_PT);
}

function isExcluded(row: MemberNumberRosterRow, excludeIds: ReadonlySet<string>): boolean {
  if (excludeIds.has(row.id)) return true;
  const userId = typeof row.userId === "string" ? row.userId.trim() : "";
  return userId.length > 0 && excludeIds.has(userId);
}

/**
 * Find another student on this coach's roster with the same member number.
 * Blank numbers are not conflicts. Comparison ignores case and surrounding whitespace.
 */
export function findRosterStudentByMemberNumber(
  students: readonly MemberNumberRosterRow[],
  memberNumber: string,
  options?: { excludeIds?: readonly string[] }
): MemberNumberMatch | null {
  const key = memberNumberKey(memberNumber);
  if (!key) return null;
  const excludeIds = new Set(
    (options?.excludeIds ?? []).map((id) => id.trim()).filter((id) => id.length > 0)
  );

  const matches: MemberNumberMatch[] = [];
  for (const student of students) {
    if (!student?.id || isExcluded(student, excludeIds)) continue;
    if (memberNumberKey(student.memberNumber) !== key) continue;
    matches.push({
      id: student.id,
      memberNumber: normalizeMemberNumber(student.memberNumber),
      name: rowName(student),
    });
  }

  matches.sort((a, b) => a.name.localeCompare(b.name, "pt-PT", { sensitivity: "base" }) || a.id.localeCompare(b.id));
  return matches[0] ?? null;
}

