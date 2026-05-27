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
  isNewBookingBlocked,
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
  sessionAttendance: "pending" | "present" | "absent";
};

export type SessionSlot = {
  id: string;
  date: string;
  startTime: string;
  maxStudents: number;
  students: SlotStudent[];
};

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

      // 1. Vacation check
      if (isNewBookingBlocked({ dateStr, time: startTime, vacationPeriods, openBlocks })) {
        result.skippedVacation++;
        continue;
      }

      // 2. Already booked this day check
      const alreadyBookedToday = [...slotMap.values()].some(
        (s) => s.date === dateStr && s.students.some((st) => st.studentId === studentId)
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

      // 5. Capacity check on all required blocks
      let anyFull = false;
      for (const t of blocksToBook) {
        const id = slotDocId(dateStr, t);
        const existing = slotMap.get(id);
        const maxS = existing?.maxStudents ?? defaultMaxStudents;
        if ((existing?.students.length ?? 0) >= maxS) {
          anyFull = true;
          break;
        }
      }
      if (anyFull) {
        result.skippedFull++;
        continue;
      }

      // 6. Write all blocks
      const { setDoc, doc } = await import("firebase/firestore");

      const newEntry: SlotStudent = {
        studentId,
        studentName,
        sessionStart: startTime,
        sessionDurationMin,
        sessionAttendance: "pending",
        ...(studentPhotoUrl ? { studentPhotoUrl } : {}),
        ...(matchedPlan?.id ? { workoutPlanId: matchedPlan.id, workoutTitle: matchedPlan.title } : {}),
      };

      for (const t of blocksToBook) {
        const id = slotDocId(dateStr, t);
        const existing = slotMap.get(id);
        const maxS = existing?.maxStudents ?? defaultMaxStudents;
        const newStudents = [...(existing?.students ?? []), newEntry];
        const newSlot: SessionSlot = { id, date: dateStr, startTime: t, maxStudents: maxS, students: newStudents };
        await setDoc(doc(db, "personalTrainers", trainerId, "sessionSlots", id), {
          date: dateStr,
          startTime: t,
          maxStudents: maxS,
          students: newStudents,
        });
        slotMap.set(id, newSlot);
      }
      result.created++;
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

function studentMatchesIds(studentId: string, candidateIds: Set<string>): boolean {
  return candidateIds.has(studentId);
}

/** Count unique logical sessions (date + sessionStart) for matching student ids. */
export function countStudentLogicalSessions(
  sessionSlots: SessionSlot[],
  studentIds: string[],
  options?: { excludePast?: boolean; now?: Date }
): number {
  const ids = new Set(studentIds.filter(Boolean));
  const seen = new Set<string>();
  for (const slot of sessionSlots) {
    const dateStr = String(slot.date || "").substring(0, 10);
    if (options?.excludePast && isDateBeforeToday(dateStr, options.now)) continue;
    for (const st of slot.students) {
      if (!studentMatchesIds(st.studentId, ids)) continue;
      const sessionStart = st.sessionStart ?? slot.startTime;
      seen.add(`${dateStr}__${sessionStart}`);
    }
  }
  return seen.size;
}

/** Remove this student from every sessionSlots document (delete empty slot docs). */
export async function removeAllStudentSessionEnrollments(params: {
  db: Firestore;
  trainerId: string;
  studentIds: string[];
  sessionSlots: SessionSlot[];
}): Promise<RemoveAllEnrollmentsResult> {
  const { db, trainerId, studentIds, sessionSlots } = params;
  const ids = new Set(studentIds.filter(Boolean));
  const { setDoc, deleteDoc, doc } = await import("firebase/firestore");

  const removedLogical = new Set<string>();
  let updatedSlotDocs = 0;
  let deletedSlotDocs = 0;

  const now = new Date();

  for (const slot of sessionSlots) {
    const dateStr = String(slot.date || "").substring(0, 10);
    if (isDateBeforeToday(dateStr, now)) continue;

    const hasStudent = slot.students.some((st) => studentMatchesIds(st.studentId, ids));
    if (!hasStudent) continue;

    for (const st of slot.students) {
      if (!studentMatchesIds(st.studentId, ids)) continue;
      const sessionStart = st.sessionStart ?? slot.startTime;
      removedLogical.add(`${dateStr}__${sessionStart}`);
    }

    const newStudents = slot.students.filter((st) => !studentMatchesIds(st.studentId, ids));
    const ref = doc(db, "personalTrainers", trainerId, "sessionSlots", slot.id);
    if (newStudents.length === 0) {
      await deleteDoc(ref);
      deletedSlotDocs++;
    } else {
      await setDoc(ref, { ...slot, students: newStudents });
      updatedSlotDocs++;
    }
  }

  return {
    removedSessions: removedLogical.size,
    updatedSlotDocs,
    deletedSlotDocs,
  };
}
