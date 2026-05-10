/**
 * Session attendance streak: consecutive **elapsed** booked sessions where coach marked `present`.
 * Multi-block bookings (same logical session duplicated across consecutive slot docs) are deduped.
 */

export type SessionAttendanceStatus = "pending" | "present" | "absent";

export type SlotStudentAttendance = {
  studentId: string;
  studentName?: string;
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

/** End instant of logical session for streak eligibility (elapsed if <= nowMs). */
export function logicalSessionEndMs(
  date: string,
  sessionStartClock: string,
  durationMin: number
): number {
  const d = date.substring(0, 10);
  const clock = sessionStartClock && sessionStartClock.length >= 4 ? sessionStartClock : "00:00";
  const startIso = `${d}T${clock}:00`;
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return NaN;
  return startMs + durationMin * 60 * 1000;
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
