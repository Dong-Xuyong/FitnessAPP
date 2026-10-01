/**
 * Bulk calendar enrollment for the "Agendamento Semanal" cycle feature.
 * Adapts the single-slot coach toggle logic from assignment-calendar/page.tsx
 * to write N weeks of slots in one pass.
 */

import type { Firestore } from "firebase/firestore";
import {
  Availability,
  VacationPeriod,
  OpenAvailabilityBlock,
  consecutiveSlotBlocksFrom,
  resolveDaySlotTimes,
  weekdayKeyFromDate,
} from "@/lib/trainer-availability";

// ── Shared slot types (mirrors assignment-calendar inline types) ──────────────

export type SlotStudent = {
  studentId: string;
  studentName: string;
  studentPhotoUrl?: string;
  sessionStart?: string;
  sessionDurationMin?: number;
  workoutPlanId?: string;
  workoutTitle?: string;
  sessionAttendance?: "pending" | "present" | "absent";
  sessionAttendanceAt?: string;
};

export type SessionSlot = {
  id: string;
  date: string;
  startTime: string;
  maxStudents: number;
  students: SlotStudent[];
  /** ISO timestamp when the coach cancelled this block (no new bookings until reactivated). */
  cancelledAt?: string;
};

export function isSessionSlotCancelled(
  slot: Pick<SessionSlot, "cancelledAt"> | null | undefined
): boolean {
  return Boolean(slot?.cancelledAt);
}

export type WorkoutPlanRecord = {
  id: string;
  title?: string;
  weekStart?: string;
  assignedAt?: string;
  createdAt?: string;
};

// ── Pattern type ──────────────────────────────────────────────────────────────

/** One selected block in the weekly template: { weekday: "monday", startTime: "09:00" } */
export type WeeklySlotPattern = { weekday: string; startTime: string }[];

// ── Result ────────────────────────────────────────────────────────────────────

export type BulkEnrollResult = {
  created: number;
  skippedFull: number;
  skippedVacation: number;
  skippedAlreadyBooked: number;
  skippedInsufficientBlocks: number;
};

export type RemoveAllEnrollmentsResult = {
  removedSessions: number;
  updatedSlotDocs: number;
  deletedSlotDocs: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function slotDocId(date: string, time: string): string {
  return `${date}_${time.replace(":", "")}`;
}

export function normalizeStudentMatchIds(ids: readonly unknown[]): string[] {
  return [...new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))];
}

export function findSlotStudent(
  slot: Pick<SessionSlot, "students"> | null | undefined,
  candidateIds: readonly string[]
): SlotStudent | undefined {
  const ids = new Set(normalizeStudentMatchIds(candidateIds));
  return slot?.students.find((student) => ids.has(String(student.studentId || "").trim()));
}

export function sessionSlotHasStudent(
  slot: Pick<SessionSlot, "students"> | null | undefined,
  candidateIds: readonly string[]
): boolean {
  return Boolean(findSlotStudent(slot, candidateIds));
}

/** A remaining continuation row whose original start block no longer contains the student. */
export function isOrphanedSessionContinuation(params: {
  slot: SessionSlot;
  student: SlotStudent;
  daySlots: SessionSlot[];
  studentIds: string[];
}): boolean {
  const { slot, student, daySlots, studentIds } = params;
  const sessionStart = student.sessionStart;
  if (!sessionStart || sessionStart === slot.startTime) return false;
  const startSlot = daySlots.find(
    (candidate) => candidate.date === slot.date && candidate.startTime === sessionStart
  );
  const startEntry = findSlotStudent(startSlot, studentIds);
  return !startEntry || (startEntry.sessionStart ?? startSlot?.startTime) !== sessionStart;
}

export type SessionSlotBlock = Pick<SessionSlot, "date" | "startTime" | "maxStudents">;

export type SessionSlotWrite = {
  id: string;
  slot: SessionSlot;
};

export type SessionSlotMutationErrorCode =
  | "slot-cancelled"
  | "slot-full"
  | "partial-enrollment";

export class SessionSlotMutationError extends Error {
  constructor(
    public readonly code: SessionSlotMutationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SessionSlotMutationError";
  }
}

function uniqueBlocks(blocks: SessionSlotBlock[]): Array<SessionSlotBlock & { id: string }> {
  const unique = new Map<string, SessionSlotBlock & { id: string }>();
  for (const block of blocks) {
    const id = slotDocId(block.date, block.startTime);
    unique.set(id, { ...block, id });
  }
  return [...unique.values()];
}

export function planSessionSlotEnrollment(params: {
  blocks: SessionSlotBlock[];
  currentSlots: Array<SessionSlot | null>;
  student: SlotStudent;
  studentIds: string[];
}): { writes: SessionSlotWrite[]; slots: SessionSlot[]; changed: boolean } {
  const blocks = uniqueBlocks(params.blocks);
  const ids = normalizeStudentMatchIds([...params.studentIds, params.student.studentId]);
  const currentById = new Map(
    params.currentSlots.filter((slot): slot is SessionSlot => Boolean(slot)).map((slot) => [slot.id, slot])
  );
  const hasStudent = blocks.map((block) => sessionSlotHasStudent(currentById.get(block.id), ids));

  if (hasStudent.some(Boolean)) {
    if (hasStudent.every(Boolean)) {
      return {
        writes: [],
        slots: blocks.map((block) => currentById.get(block.id)!),
        changed: false,
      };
    }
    throw new SessionSlotMutationError(
      "partial-enrollment",
      "Foi encontrada uma inscrição incompleta. Cancela-a antes de voltares a reservar."
    );
  }

  const slots = blocks.map((block) => {
    const current = currentById.get(block.id);
    if (isSessionSlotCancelled(current)) {
      throw new SessionSlotMutationError("slot-cancelled", `O bloco ${block.startTime} foi cancelado.`);
    }
    const maxStudents =
      Number.isFinite(Number(current?.maxStudents)) && Number(current?.maxStudents) > 0
        ? Number(current!.maxStudents)
        : Math.max(1, Number(block.maxStudents) || 1);
    const students = Array.isArray(current?.students) ? current.students : [];
    if (students.length >= maxStudents) {
      throw new SessionSlotMutationError("slot-full", `O bloco ${block.startTime} está cheio.`);
    }
    return {
      ...(current ?? {}),
      id: block.id,
      date: block.date,
      startTime: block.startTime,
      maxStudents,
      students: [...students, params.student],
    } satisfies SessionSlot;
  });

  return {
    writes: slots.map((slot) => ({ id: slot.id, slot })),
    slots,
    changed: true,
  };
}

export function planSessionSlotRemoval(params: {
  currentSlots: Array<SessionSlot | null>;
  studentIds: string[];
  sessionStart?: string;
}): {
  writes: SessionSlotWrite[];
  slots: SessionSlot[];
  removedEntries: number;
} {
  const ids = new Set(normalizeStudentMatchIds(params.studentIds));
  const writes: SessionSlotWrite[] = [];
  const slots: SessionSlot[] = [];
  let removedEntries = 0;

  for (const slot of params.currentSlots) {
    if (!slot) continue;
    const students = Array.isArray(slot.students) ? slot.students : [];
    const remaining = students.filter((student) => {
      if (!ids.has(String(student.studentId || "").trim())) return true;
      const rowStart = student.sessionStart ?? slot.startTime;
      if (params.sessionStart && rowStart !== params.sessionStart) return true;
      removedEntries++;
      return false;
    });
    if (remaining.length === students.length) continue;
    const updated = { ...slot, students: remaining };
    writes.push({ id: slot.id, slot: updated });
    slots.push(updated);
  }

  return { writes, slots, removedEntries };
}

export async function mutateSessionSlotsAtomically<T>(params: {
  db: Firestore;
  trainerId: string;
  blocks: SessionSlotBlock[];
  mutate: (
    currentSlots: Array<SessionSlot | null>,
    blocks: Array<SessionSlotBlock & { id: string }>
  ) => { writes: SessionSlotWrite[]; result: T };
}): Promise<T> {
  const blocks = uniqueBlocks(params.blocks);
  const { doc, runTransaction } = await import("firebase/firestore");

  return runTransaction(params.db, async (transaction) => {
    const refs = blocks.map((block) =>
      doc(params.db, "personalTrainers", params.trainerId, "sessionSlots", block.id)
    );
    const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
    const currentSlots = snapshots.map((snapshot, index): SessionSlot | null => {
      if (!snapshot.exists()) return null;
      const block = blocks[index]!;
      const data = snapshot.data() as Partial<SessionSlot>;
      return {
        ...data,
        id: snapshot.id,
        date: String(data.date || block.date),
        startTime: String(data.startTime || block.startTime),
        maxStudents: Number(data.maxStudents) || block.maxStudents,
        students: Array.isArray(data.students) ? data.students : [],
      };
    });
    const { writes, result } = params.mutate(currentSlots, blocks);
    const refsById = new Map(refs.map((ref) => [ref.id, ref]));
    for (const write of writes) {
      const ref = refsById.get(write.id);
      if (!ref) throw new Error(`Session slot ${write.id} was not read by the transaction.`);
      const { id: _id, ...data } = write.slot;
      transaction.set(ref, data);
    }
    return result;
  });
}

export async function enrollStudentInSessionSlots(params: {
  db: Firestore;
  trainerId: string;
  blocks: SessionSlotBlock[];
  student: SlotStudent;
  studentIds: string[];
}): Promise<{ slots: SessionSlot[]; changed: boolean }> {
  return mutateSessionSlotsAtomically({
    db: params.db,
    trainerId: params.trainerId,
    blocks: params.blocks,
    mutate: (currentSlots) => {
      const planned = planSessionSlotEnrollment({ ...params, currentSlots });
      return {
        writes: planned.writes,
        result: { slots: planned.slots, changed: planned.changed },
      };
    },
  });
}

export async function removeStudentFromSessionSlots(params: {
  db: Firestore;
  trainerId: string;
  blocks: SessionSlotBlock[];
  studentIds: string[];
  sessionStart?: string;
}): Promise<{
  slots: SessionSlot[];
  removedEntries: number;
}> {
  return mutateSessionSlotsAtomically({
    db: params.db,
    trainerId: params.trainerId,
    blocks: params.blocks,
    mutate: (currentSlots) => {
      const planned = planSessionSlotRemoval({ ...params, currentSlots });
      return { writes: planned.writes, result: planned };
    },
  });
}

export async function patchStudentInSessionSlots(params: {
  db: Firestore;
  trainerId: string;
  blocks: SessionSlotBlock[];
  studentIds: string[];
  sessionStart?: string;
  patch: Partial<Omit<SlotStudent, "studentId">>;
}): Promise<SessionSlot[]> {
  return mutateSessionSlotsAtomically({
    db: params.db,
    trainerId: params.trainerId,
    blocks: params.blocks,
    mutate: (currentSlots) => {
      const ids = new Set(normalizeStudentMatchIds(params.studentIds));
      const writes: SessionSlotWrite[] = [];
      const slots: SessionSlot[] = [];
      for (const slot of currentSlots) {
        if (!slot) continue;
        let changed = false;
        const students = slot.students.map((student) => {
          if (!ids.has(String(student.studentId || "").trim())) return student;
          const rowStart = student.sessionStart ?? slot.startTime;
          if (params.sessionStart && rowStart !== params.sessionStart) return student;
          changed = true;
          return { ...student, ...params.patch };
        });
        if (!changed) continue;
        const updated = { ...slot, students };
        writes.push({ id: slot.id, slot: updated });
        slots.push(updated);
      }
      return { writes, result: slots };
    },
  });
}

/** YYYY-MM-DD for a Date. */
export function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** True when `dateStr` (YYYY-MM-DD) is strictly before local today. */
export function isDateBeforeToday(dateStr: string, now: Date = new Date()): boolean {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(String(dateStr || "").substring(0, 10) + "T00:00:00");
  if (!Number.isFinite(target.getTime())) return false;
  return target < today;
}

/** Monday of the week containing dateStr. */
export function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr.substring(0, 10) + "T12:00:00");
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  return toDateStr(mon);
}

/** Next Monday from today (never today even if today is Monday). */
export function nextMondayFrom(now: Date): string {
  const d = new Date(now);
  const dow = d.getDay(); // 0=Sun, 1=Mon, ...
  const daysUntilNextMonday = dow === 1 ? 7 : ((8 - dow) % 7);
  d.setDate(d.getDate() + daysUntilNextMonday);
  return toDateStr(d);
}

/** Match a workoutPlan for a given week start date. */
const WEEKDAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function dateForWeekdayInCycle(cycleStartMonday: string, weekOffset: number, weekday: string): string {
  const dayOffset = WEEKDAY_ORDER.indexOf(weekday.toLowerCase());
  if (dayOffset === -1) return cycleStartMonday;
  const base = new Date(cycleStartMonday + "T12:00:00");
  base.setDate(base.getDate() + weekOffset * 7 + dayOffset);
  return toDateStr(base);
}

/** Match a workoutPlan for a given week start date. */
function matchPlanForWeek(plans: WorkoutPlanRecord[], weekStart: string): WorkoutPlanRecord | undefined {
  return plans.find((p) => {
    const planDate = (p.weekStart || p.assignedAt || p.createdAt || "").substring(0, 10);
    return planDate ? getWeekStart(planDate) === weekStart : false;
  });
}

// ── Main function ─────────────────────────────────────────────────────────────

export async function bulkEnrollWeeklyCycle(params: {
  db: Firestore;
  trainerId: string;
  studentId: string;
  studentIds?: string[];
  studentName: string;
  studentPhotoUrl?: string;
  pattern: WeeklySlotPattern;
  cycleStartMonday: string;
  repeatWeeks: number;
  sessionDurationMin: number;
  slotDurationMin: number;
  defaultMaxStudents: number;
  availability: Availability;
  vacationPeriods: VacationPeriod[];
  openBlocks: OpenAvailabilityBlock[];
  existingSlots: SessionSlot[];
  workoutPlans: WorkoutPlanRecord[];
}): Promise<BulkEnrollResult> {
  const {
    db, trainerId, studentId, studentName, studentPhotoUrl,
    studentIds,
    pattern, cycleStartMonday, repeatWeeks,
    sessionDurationMin, slotDurationMin, defaultMaxStudents,
    availability, vacationPeriods, openBlocks,
    existingSlots, workoutPlans,
  } = params;

  const result: BulkEnrollResult = {
    created: 0,
    skippedFull: 0,
    skippedVacation: 0,
    skippedAlreadyBooked: 0,
    skippedInsufficientBlocks: 0,
  };

  // Build a mutable map of slots so we can reflect writes within the same cycle
  // (prevents double-booking the same block for the same student across pattern entries)
  const slotMap = new Map<string, SessionSlot>(existingSlots.map((s) => [s.id, { ...s, students: [...s.students] }]));
  const matchIds = normalizeStudentMatchIds([studentId, ...(studentIds ?? [])]);

  const slotsNeeded = Math.max(1, Math.ceil(sessionDurationMin / slotDurationMin));

  for (let w = 0; w < repeatWeeks; w++) {
    const weekStart = (() => {
      const base = new Date(cycleStartMonday + "T12:00:00");
      base.setDate(base.getDate() + w * 7);
      return toDateStr(base);
    })();

    const matchedPlan = matchPlanForWeek(workoutPlans, weekStart);

    for (const { weekday, startTime } of pattern) {
      const dateStr = dateForWeekdayInCycle(cycleStartMonday, w, weekday);

      // 1. Already booked this day check
      const alreadyBookedToday = [...slotMap.values()].some(
        (s) => s.date === dateStr && sessionSlotHasStudent(s, matchIds)
      );
      if (alreadyBookedToday) {
        result.skippedAlreadyBooked++;
        continue;
      }

      // 3. Build available slot times for this day
      const dayKey = weekdayKeyFromDate(new Date(dateStr + "T12:00:00"));
      const weeklySched = availability[dayKey];
      const daySlotTimes = resolveDaySlotTimes({
        dateStr,
        weeklySched,
        openBlocks,
        slotDurationMin,
        vacationPeriods,
      });

      // 4. Verify enough consecutive blocks starting at startTime
      const blocksToBook = consecutiveSlotBlocksFrom(
        daySlotTimes,
        startTime,
        slotsNeeded,
        slotDurationMin
      );
      if (blocksToBook.length < slotsNeeded) {
        result.skippedInsufficientBlocks++;
        continue;
      }

      // 5. Write all blocks atomically from current Firestore state
      const newEntry: SlotStudent = {
        studentId,
        studentName,
        sessionStart: startTime,
        sessionDurationMin,
        sessionAttendance: "pending",
        ...(studentPhotoUrl ? { studentPhotoUrl } : {}),
        ...(matchedPlan?.id ? { workoutPlanId: matchedPlan.id, workoutTitle: matchedPlan.title } : {}),
      };

      try {
        const mutation = await enrollStudentInSessionSlots({
          db,
          trainerId,
          student: newEntry,
          studentIds: matchIds,
          blocks: blocksToBook.map((time) => ({
            date: dateStr,
            startTime: time,
            maxStudents: slotMap.get(slotDocId(dateStr, time))?.maxStudents ?? defaultMaxStudents,
          })),
        });
        if (!mutation.changed) {
          result.skippedAlreadyBooked++;
          continue;
        }
        for (const slot of mutation.slots) slotMap.set(slot.id, slot);
        result.created++;
      } catch (error) {
        if (!(error instanceof SessionSlotMutationError)) throw error;
        if (error.code === "slot-full") result.skippedFull++;
        else if (error.code === "slot-cancelled") result.skippedInsufficientBlocks++;
        else result.skippedAlreadyBooked++;
      }
    }
  }

  return result;
}

/** Dates that the cycle will attempt to book (for preview). Includes all weeks × pattern entries. */
export function previewCycleDates(params: {
  cycleStartMonday: string;
  repeatWeeks: number;
  pattern: WeeklySlotPattern;
}): Array<{ dateStr: string; startTime: string }> {
  const { cycleStartMonday, repeatWeeks, pattern } = params;
  const out: Array<{ dateStr: string; startTime: string }> = [];
  for (let w = 0; w < repeatWeeks; w++) {
    for (const { weekday, startTime } of pattern) {
      out.push({ dateStr: dateForWeekdayInCycle(cycleStartMonday, w, weekday), startTime });
    }
  }
  return out;
}

/** Count unique logical sessions (date + sessionStart) for matching student ids. */
export function countStudentLogicalSessions(
  sessionSlots: SessionSlot[],
  studentIds: string[],
  options?: { excludePast?: boolean; now?: Date }
): number {
  const ids = new Set(normalizeStudentMatchIds(studentIds));
  const seen = new Set<string>();
  for (const slot of sessionSlots) {
    const dateStr = String(slot.date || "").substring(0, 10);
    if (options?.excludePast && isDateBeforeToday(dateStr, options.now)) continue;
    for (const st of slot.students) {
      if (!ids.has(String(st.studentId || "").trim())) continue;
      const sessionStart = st.sessionStart ?? slot.startTime;
      seen.add(`${dateStr}__${sessionStart}`);
    }
  }
  return seen.size;
}

/** Remove this student from every future session while preserving slot metadata. */
export async function removeAllStudentSessionEnrollments(params: {
  db: Firestore;
  trainerId: string;
  studentIds: string[];
  sessionSlots: SessionSlot[];
}): Promise<RemoveAllEnrollmentsResult> {
  const { db, trainerId, studentIds, sessionSlots } = params;
  const ids = new Set(normalizeStudentMatchIds(studentIds));
  const logicalSessions = new Map<string, { date: string; sessionStart: string }>();
  let updatedSlotDocs = 0;

  const now = new Date();

  for (const slot of sessionSlots) {
    const dateStr = String(slot.date || "").substring(0, 10);
    if (isDateBeforeToday(dateStr, now)) continue;
    for (const st of slot.students) {
      if (!ids.has(String(st.studentId || "").trim())) continue;
      const sessionStart = st.sessionStart ?? slot.startTime;
      logicalSessions.set(`${dateStr}__${sessionStart}`, { date: dateStr, sessionStart });
    }
  }

  let removedSessions = 0;
  for (const logical of logicalSessions.values()) {
    const dayBlocks = sessionSlots
      .filter((slot) => slot.date === logical.date)
      .map((slot) => ({
        date: slot.date,
        startTime: slot.startTime,
        maxStudents: slot.maxStudents,
      }));
    const mutation = await removeStudentFromSessionSlots({
      db,
      trainerId,
      blocks: dayBlocks,
      studentIds: [...ids],
      sessionStart: logical.sessionStart,
    });
    if (mutation.removedEntries > 0) removedSessions++;
    updatedSlotDocs += mutation.slots.length;
  }

  return {
    removedSessions,
    updatedSlotDocs,
    deletedSlotDocs: 0,
  };
}
