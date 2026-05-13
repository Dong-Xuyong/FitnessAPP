/**
 * Session attendance streak: consecutive **elapsed** booked sessions where coach marked `present`.
 * Multi-block bookings (same logical session duplicated across consecutive slot docs) are deduped.
 */

export type SessionAttendanceStatus = "pending" | "present" | "absent";

export type SlotStudentAttendance = {
  studentId: string;
  studentName?: string;
  studentPhotoUrl?: string;
  workoutPlanId?: string;
  workoutTitle?: string;
  sessionStart?: string;
  sessionDurationMin?: number;
  sessionAttendance?: SessionAttendanceStatus;
  sessionAttendanceAt?: string;
};

export type SessionSlotAttendance = {
  id?: string;
  date: string;
  startTime: string;
  maxStudents?: number;
  students: SlotStudentAttendance[];
};

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function addMinutesToClock(time: string, minutesToAdd: number): string {
  const total = parseTimeToMinutes(time) + minutesToAdd;
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function mergeAttendance(a?: SessionAttendanceStatus, b?: SessionAttendanceStatus): SessionAttendanceStatus {
  const pa = normalizeAttendance(a);
  const pb = normalizeAttendance(b);
  if (pa === pb) return pa;
  if (pa === "absent" || pb === "absent") return "absent";
  return "pending";
}

export function normalizeAttendance(v?: SessionAttendanceStatus | string): SessionAttendanceStatus {
  if (v === "present" || v === "absent" || v === "pending") return v;
  return "pending";
}

function localCalendarDateKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local calendar `YYYY-MM-DD` for a wall-clock instant (student device). */
export function studentLocalCalendarDateKeyMs(ms: number): string {
  return localCalendarDateKeyFromMs(ms);
}

/** Start instant of a logical booked session (local `YYYY-MM-DD` + `HH:mm`). */
export function logicalSessionStartMs(date: string, sessionStartClock: string): number {
  const d = date.substring(0, 10);
  const clock = sessionStartClock && sessionStartClock.length >= 4 ? sessionStartClock : "00:00";
  const startIso = `${d}T${clock}:00`;
  const startMs = Date.parse(startIso);
  return startMs;
}

/** Minutes before session start when the coach may record attendance (and student app unlocks). */
export const COACH_ATTENDANCE_MARKABLE_MINUTES_BEFORE_SESSION = 15;

/** After session end, students may still finish logging this workout for a short window. */
export const STUDENT_TRAINING_ACCESS_GRACE_MINUTES_AFTER_SESSION_END = 240;

/** End instant of logical session for streak eligibility (elapsed if <= nowMs). */
export function logicalSessionEndMs(
  date: string,
  sessionStartClock: string,
  durationMin: number
): number {
  const startMs = logicalSessionStartMs(date, sessionStartClock);
  if (!Number.isFinite(startMs)) return NaN;
  return startMs + durationMin * 60 * 1000;
}

/** Coach may mark attendance from N minutes before start onward (including after the session ends). */
export function canCoachMarkSessionAttendanceAt(
  nowMs: number,
  date: string,
  sessionStartClock: string
): boolean {
  const startMs = logicalSessionStartMs(date, sessionStartClock);
  if (!Number.isFinite(startMs)) return false;
  const openAt = startMs - COACH_ATTENDANCE_MARKABLE_MINUTES_BEFORE_SESSION * 60 * 1000;
  return nowMs >= openAt;
}

export type ActionablePendingAttendanceOptions = {
  /** When set, only this student's bookings are considered (coach roster filter). */
  filterStudentId?: string;
};

/**
 * ISO date strings (YYYY-MM-DD) where at least one student has `pending` session attendance
 * and the coach may mark attendance (same window as the manage-slot UI).
 */
export function datesWithActionablePendingAttendance(
  slots: SessionSlotAttendance[],
  nowMs: number,
  options?: ActionablePendingAttendanceOptions
): string[] {
  const filterId = options?.filterStudentId?.trim();
  const days = new Set<string>();

  for (const slot of slots) {
    if (!slot.date || !slot.startTime || !Array.isArray(slot.students)) continue;
    const dateKey = slot.date.substring(0, 10);
    for (const st of slot.students) {
      if (!st?.studentId) continue;
      if (filterId && st.studentId !== filterId) continue;
      if (normalizeAttendance(st.sessionAttendance) !== "pending") continue;
      const sessionStart = st.sessionStart ?? slot.startTime;
      if (!canCoachMarkSessionAttendanceAt(nowMs, dateKey, sessionStart)) continue;
      days.add(dateKey);
    }
  }
  return [...days].sort();
}

/**
 * True when the student may open the live workout for `workoutPlanId`: a booked slot on **today's
 * calendar date** (local) where the coach marked them `present`, and the slot's linked plan (if any)
 * matches `workoutPlanId`. The narrow pre-start / post-grace time window is not used — the whole
 * session day counts once present is recorded.
 */
export function studentHasCoachPresentAccessForPlan(
  slots: SessionSlotAttendance[],
  studentId: string,
  workoutPlanId: string,
  nowMs: number,
  _fallbackSessionDurationMin: number
): boolean {
  if (!studentId || !workoutPlanId) return false;
  const seenLogical = new Set<string>();
  const todayKey = localCalendarDateKeyFromMs(nowMs);

  for (const slot of slots) {
    for (const st of slot.students || []) {
      if (st.studentId !== studentId) continue;
      if (normalizeAttendance(st.sessionAttendance) !== "present") continue;
      const startClock = st.sessionStart ?? slot.startTime;
      const logicalKey = `${slot.date}|${startClock}|${studentId}`;
      if (seenLogical.has(logicalKey)) continue;
      seenLogical.add(logicalKey);

      const rowPlan = st.workoutPlanId;
      if (rowPlan && rowPlan !== workoutPlanId) continue;

      const slotDateKey = (slot.date || "").substring(0, 10);
      if (!slotDateKey || slotDateKey !== todayKey) continue;
      return true;
    }
  }
  return false;
}

export type PlanPresentCandidate = { id: string; sequenceStepIndex: number };

/**
 * Resolves which assigned plans may show "start" for the student today given coach `present`
 * and slot `workoutPlanId` data. When the slot has no linked plan id, raw Firestore checks would
 * grant every candidate; this keeps at most one (earliest `sequenceStepIndex`). If any workout
 * session was already completed today, no plan may start.
 */
export function resolveStudentPresentStartPlans(
  slots: SessionSlotAttendance[],
  studentId: string,
  candidates: readonly PlanPresentCandidate[],
  nowMs: number,
  fallbackSessionDurationMin: number,
  hasCompletedWorkoutSessionToday: boolean
): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const c of candidates) out.set(c.id, false);
  if (!studentId || candidates.length === 0 || hasCompletedWorkoutSessionToday) return out;

  const rawOk: PlanPresentCandidate[] = [];
  for (const c of candidates) {
    if (
      studentHasCoachPresentAccessForPlan(
        slots,
        studentId,
        c.id,
        nowMs,
        fallbackSessionDurationMin
      )
    ) {
      rawOk.push(c);
    }
  }
  if (rawOk.length === 0) return out;
  if (rawOk.length === 1) {
    out.set(rawOk[0]!.id, true);
    return out;
  }
  const sorted = [...rawOk].sort((a, b) => a.sequenceStepIndex - b.sequenceStepIndex || a.id.localeCompare(b.id));
  const pick = sorted[0]!;
  out.set(pick.id, true);
  return out;
}

/** Times of each occupied block start for one logical booking. */
export function blocksForLogicalSession(sessionStartClock: string, sessionDurationMin: number, slotDurationMin: number): string[] {
  const step = slotDurationMin > 0 ? slotDurationMin : 30;
  const n = Math.max(1, Math.ceil(sessionDurationMin / step));
  return Array.from({ length: n }, (_, i) => addMinutesToClock(sessionStartClock, i * step));
}

/**
 * Highest streak across multiple stored student IDs (roster vs auth UID vs portal id).
 */
export function maxAttendanceStreakForCandidates(
  slots: SessionSlotAttendance[],
  candidateStudentIds: string[],
  nowMs: number,
  trainerSlotDurationMin: number
): number {
  let max = 0;
  const seen = new Set<string>();
  for (const sid of candidateStudentIds) {
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    max = Math.max(max, computeSessionAttendanceStreak(slots, sid, nowMs, trainerSlotDurationMin));
  }
  return max;
}

/**
 * Unique logical sessions → merged attendance; elapsed only; descending by end; count leading present.
 */
export function computeSessionAttendanceStreak(
  slots: SessionSlotAttendance[],
  studentId: string,
  nowMs: number,
  trainerSlotDurationMin: number
): number {
  const step = trainerSlotDurationMin > 0 ? trainerSlotDurationMin : 30;
  type Accum = {
    attendance: SessionAttendanceStatus;
    endMs: number;
  };
  const byKey = new Map<string, Accum>();

  for (const slot of slots) {
    if (!slot.date || !slot.startTime || !Array.isArray(slot.students)) continue;

    for (const st of slot.students) {
      if (!st?.studentId || st.studentId !== studentId) continue;
      const startClock = st.sessionStart ?? slot.startTime;
      const dur = st.sessionDurationMin && st.sessionDurationMin > 0 ? st.sessionDurationMin : step;
      const key = `${slot.date}|${startClock}|${studentId}`;
      const endMs = logicalSessionEndMs(slot.date, startClock, dur);
      const att = normalizeAttendance(st.sessionAttendance);
      const existing = byKey.get(key);

      const endResolved = Number.isFinite(endMs) ? endMs : logicalSessionEndMs(slot.date, startClock, dur);

      if (!existing || !Number.isFinite(existing.endMs)) {
        byKey.set(key, { attendance: att, endMs: endResolved });
      } else {
        const mergedAttendance = mergeAttendance(existing.attendance, att);
        const mergedEndMs = Number.isFinite(endResolved) ? Math.max(existing.endMs, endResolved) : existing.endMs;
        byKey.set(key, {
          attendance: mergedAttendance,
          endMs: mergedEndMs,
        });
      }
    }
  }

  const elapsed = [...byKey.values()]
    .map((val) => ({
      attendance: normalizeAttendance(val.attendance),
      endMs: val.endMs,
    }))
    .filter((x) => Number.isFinite(x.endMs) && x.endMs <= nowMs);

  elapsed.sort((a, b) => b.endMs - a.endMs);

  let streak = 0;
  for (const row of elapsed) {
    if (row.attendance === "present") {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}
