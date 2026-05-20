
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Progress } from "@/components/ui/progress";
import {
  Dumbbell, Clock, Play, Loader2, AlertTriangle,
  CalendarDays, Users, UserPlus, UserMinus, ChevronDown, ChevronUp, StickyNote,
} from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore } from "@/firebase";
import { doc, getDoc, collection, getDocs, updateDoc, setDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import {
  resolveStudentPresentStartPlans,
  studentLocalCalendarDateKeyMs,
  type SessionAttendanceStatus,
  type SessionSlotAttendance,
} from "@/lib/session-attendance-streak";
import { slotStudentPlaceholderPhotoUrl } from "@/lib/slot-student-photo";
import { isSequenceStepEffectiveUnlocked } from "@/lib/workout-plan-sequence";
import {
  isOpenTrainingAccess,
  normalizeTrainingAccessMode,
  type TrainingAccessMode,
} from "@/lib/student-training-access";
import {
  buildLatestPerfByExerciseName,
  buildLatestPerfByPlanId,
  formatLastSessionPerformanceLabel,
  normalizeExerciseKey,
  type LastSessionPerf,
} from "@/lib/last-session-performance";

// ── Types ──────────────────────────────────────────────────────────────────────

type TimeRange  = { startTime: string; endTime: string };
type DaySchedule = { enabled: boolean; ranges: TimeRange[] };
type Availability = Record<string, DaySchedule>;

type SlotStudent = {
  studentId: string;
  studentName: string;
  /** Denormalized profile image for peers (Firestore rules block roster reads for other students). */
  studentPhotoUrl?: string;
  workoutPlanId?: string;
  workoutTitle?: string;
  sessionStart?: string;
  sessionDurationMin?: number;
  sessionAttendance?: SessionAttendanceStatus;
  sessionAttendanceAt?: string;
};
type SessionSlot = { id: string; date: string; startTime: string; maxStudents: number; students: SlotStudent[] };

interface WorkoutPlan {
  id: string;
  title: string;
  exercises: Array<{ exerciseName: string; sets: number; reps: string; restTimeSeconds: number; notes?: string }>;
  weekStart?: string;
  createdAt?: string;
  assignedAt?: string;
  completedAt?: string;
  status?: string;
  /** When false, plan is part of a coach sequence and not yet unlocked */
  studentUnlocked?: boolean;
  sequenceGroupId?: string;
  sequenceStepIndex?: number;
  sequenceUnlockAfterPlanId?: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DAY_KEYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

/** Same window as booking: changes within 1 hour of start are not allowed. */
const SESSION_SIGNUP_CUTOFF_MS = 60 * 60 * 1000;

/** Weekly-assigned plans stay startable for this many days after the end of their week (Mon–Sun). */
const WEEKLY_PLAN_GRACE_DAYS_AFTER_WEEK = 28;

/**
 * Returns true only when every slot in the array is exactly `dur` minutes
 * after the previous one. Prevents non-adjacent slots (e.g. 09:00 + 12:00)
 * from being booked / displayed as a single multi-block session.
 */
function areConsecutiveBlocks(times: string[], dur: number): boolean {
  for (let i = 1; i < times.length; i++) {
    if (addMin(times[i - 1], dur) !== times[i]) return false;
  }
  return true;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateSlotTimes(start: string, end: string, dur: number): string[] {
  const slots: string[] = [];
  let [h, m] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const endTotal = eh * 60 + em;
  while (h * 60 + m < endTotal) {
    slots.push(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
    m += dur; h += Math.floor(m/60); m = m % 60;
  }
  return slots;
}

function generateSlotsForDay(sched: DaySchedule | undefined, dur: number): string[] {
  if (!sched?.enabled || !sched.ranges.length) return [];
  const all = sched.ranges.flatMap(r => generateSlotTimes(r.startTime, r.endTime, dur));
  return [...new Set(all)].sort();
}

function addMin(time: string, min: number): string {
  const [h, m] = time.split(":").map(Number);
  const t = h * 60 + m + min;
  return `${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`;
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function getWeekDates(date: Date): string[] {
  const d = new Date(date);
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay()+6)%7));
  return Array.from({length:7},(_,i) => {
    const dd = new Date(mon); dd.setDate(mon.getDate()+i); return toDateStr(dd);
  });
}

function slotDocId(date: string, time: string): string {
  return `${date}_${time.replace(":","")}`
}

function getSlotStartDate(dateStr: string, time: string): Date {
  return new Date(`${dateStr}T${time}:00`);
}

function slotStudentAvatarSrc(st: SlotStudent): string {
  const u = st.studentPhotoUrl?.trim();
  if (u) return u;
  return slotStudentPlaceholderPhotoUrl(st.studentId);
}

function initialsFromStudentName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]![0];
    const b = parts[parts.length - 1]![0];
    return `${a}${b}`.toUpperCase();
  }
  const one = parts[0] || "";
  if (one.length >= 2) return one.slice(0, 2).toUpperCase();
  return (one[0] || "?").toUpperCase();
}

/** Monday of the week that contains dateStr (YYYY-MM-DD). */
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr.substring(0, 10) + "T12:00:00");
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  return toDateStr(mon);
}

function daysUntilDate(raw: string | undefined): number {
  if (!raw) return 0;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return 0;
  const today = new Date();
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const planMs  = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((planMs - todayMs) / 86_400_000);
}

function getPlanReferenceDate(plan: WorkoutPlan): string | undefined {
  return plan.weekStart || plan.assignedAt || plan.createdAt;
}

function getPlanDaysUntilExpiry(plan: WorkoutPlan): number {
  if (plan.weekStart) {
    // Weekly plans: active through end of assigned week, then a grace window so students
    // can still open them from the calendar for recent past weeks until completed.
    const weekStartDate = new Date(plan.weekStart.substring(0, 10) + "T12:00:00");
    if (isNaN(weekStartDate.getTime())) return 0;
    const accessEnd = new Date(weekStartDate);
    accessEnd.setDate(accessEnd.getDate() + 6 + WEEKLY_PLAN_GRACE_DAYS_AFTER_WEEK);
    return daysUntilDate(toDateStr(accessEnd));
  }
  return daysUntilDate(plan.assignedAt || plan.createdAt);
}

function migrateDaySchedule(raw: any): DaySchedule {
  if (raw && Array.isArray(raw.ranges)) return raw as DaySchedule;
  if (raw && raw.startTime) return { enabled: !!raw.enabled, ranges: [{ startTime: raw.startTime, endTime: raw.endTime || "18:00" }] };
  return { enabled: false, ranges: [] };
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function StudentWorkoutsPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { t } = useI18n();
  const { toast } = useToast();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(true);

  // Student profile
  const [trainerId, setTrainerId]       = useState("");
  const [rosterDocId, setRosterDocId]   = useState("");
  const [studentName, setStudentName]   = useState("");
  const [myPhotoUrl, setMyPhotoUrl]     = useState("");
  const [sessionsPerWeek, setSessionsPerWeek]   = useState<number | null>(null);
  const [sessionDurationMin, setSessionDurationMin] = useState<number>(60);

  // Coach settings
  const [availability, setAvailability] = useState<Availability>({});
  const [slotDurationMin, setSlotDurationMin]       = useState(30);
  const [defaultMaxStudents, setDefaultMaxStudents] = useState(4);

  // Schedule
  const [sessionSlots, setSessionSlots] = useState<SessionSlot[]>([]);
  const [isRegistering, setIsRegistering] = useState<string | null>(null);

  // Workout plans
  const [workouts, setWorkouts]           = useState<WorkoutPlan[]>([]);
  /** Plan ids completed on roster (used with sequence `sequenceUnlockAfterPlanId`). */
  const [completedPlanIds, setCompletedPlanIds] = useState<ReadonlySet<string>>(new Set());
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);
  /** Re-evaluate “coach marked present” access periodically without full refetch. */
  const [presentAccessTick, setPresentAccessTick] = useState(0);
  const [hasCompletedWorkoutSessionToday, setHasCompletedWorkoutSessionToday] = useState(false);
  const [trainingAccessMode, setTrainingAccessMode] = useState<TrainingAccessMode>("scheduled");
  /** Latest logged weight/reps per exercise for each plan (from completed sessions). */
  const [lastPerfByPlanId, setLastPerfByPlanId] = useState<
    Record<string, Record<string, LastSessionPerf>>
  >({});
  /** Newest logged weight/reps per exercise name (any completed session). */
  const [lastPerfByExercise, setLastPerfByExercise] = useState<Record<string, LastSessionPerf>>(
    {}
  );

  /** Roster document id under the trainer (falls back to auth uid until first fetch). */
  const myId = rosterDocId || user?.uid || "";

  // ── Data fetching ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!db || !user?.uid) { setIsLoading(false); return; }
    let cancelled = false;

    async function fetchAll() {
      setIsLoading(true);
      try {
        // 1. Student global doc
        const studentDoc = await getDoc(doc(db!, "students", user!.uid));
        if (!studentDoc.exists()) { setIsLoading(false); return; }
        const tid = studentDoc.data()?.trainerId as string | undefined;
        if (!tid) { setIsLoading(false); return; }
        const rid = (studentDoc.data()?.rosterDocId as string | undefined) || user!.uid;
        const globalAccessMode = normalizeTrainingAccessMode(studentDoc.data()?.trainingAccessMode);
        if (cancelled) return;
        setTrainerId(tid);
        setRosterDocId(rid);
        setTrainingAccessMode(globalAccessMode);

        const [rosterDoc, trainerDoc, slotsSnap, plansSnap, sessionsSnap] = await Promise.all([
          getDoc(doc(db!, "personalTrainers", tid, "students", rid)),
          getDoc(doc(db!, "personalTrainers", tid)),
          getDocs(collection(db!, "personalTrainers", tid, "sessionSlots")),
          getDocs(collection(db!, "personalTrainers", tid, "students", rid, "workoutPlans")),
          getDocs(collection(db!, "personalTrainers", tid, "students", rid, "workoutSessions")),
        ]);
        if (cancelled) return;

        // 2. Roster doc → student name + sessionsPerWeek + sessionDurationMin
        if (rosterDoc.exists()) {
          const rd = rosterDoc.data();
          setStudentName(`${rd.firstName || ""} ${rd.lastName || ""}`.trim() || "Aluno");
          setMyPhotoUrl(String(rd.photoUrl || "").trim());
          if (rd.sessionsPerWeek)   setSessionsPerWeek(Number(rd.sessionsPerWeek));
          if (rd.sessionDurationMin) setSessionDurationMin(Number(rd.sessionDurationMin));
          if (rd.trainingAccessMode != null) {
            setTrainingAccessMode(normalizeTrainingAccessMode(rd.trainingAccessMode));
          }
        } else {
          setMyPhotoUrl("");
        }

        // 3. Trainer doc → availability + slot settings
        if (trainerDoc.exists()) {
          const td = trainerDoc.data();
          if (td.slotDurationMin)   setSlotDurationMin(td.slotDurationMin);
          if (td.maxStudentsPerSlot) setDefaultMaxStudents(td.maxStudentsPerSlot);
          const savedAvail = td.availability as any;
          if (savedAvail) {
            if (Array.isArray(savedAvail.workingDays)) {
              const mig: Availability = {};
              DAY_KEYS.forEach(d => {
                mig[d] = { enabled: savedAvail.workingDays.includes(d), ranges: [{ startTime: savedAvail.startTime || "09:00", endTime: savedAvail.endTime || "18:00" }] };
              });
              setAvailability(mig);
            } else {
              const mig: Availability = {};
              DAY_KEYS.forEach(d => { if (savedAvail[d]) mig[d] = migrateDaySchedule(savedAvail[d]); });
              setAvailability(mig);
            }
          }
        }

        // 4. All session slots
        setSessionSlots(slotsSnap.docs.map(d => ({ id: d.id, ...d.data() } as SessionSlot)));

        const todayKey = studentLocalCalendarDateKeyMs(Date.now());
        let completedSessionToday = false;
        const sessionRows: Array<{
          workoutPlanId?: string;
          completedAt?: unknown;
          exercises?: unknown[];
        }> = [];
        for (const sd of sessionsSnap.docs) {
          const data = sd.data() as {
            completedAt?: unknown;
            workoutPlanId?: string;
            exercises?: unknown[];
          };
          sessionRows.push(data);
          const ca = data.completedAt;
          if (ca == null) continue;
          let ms: number | null = null;
          if (typeof ca === "object" && ca !== null && "toDate" in (ca as object) && typeof (ca as { toDate?: () => Date }).toDate === "function") {
            ms = (ca as { toDate: () => Date }).toDate().getTime();
          } else if (typeof ca === "string" && ca.trim()) {
            ms = Date.parse(ca);
          }
          if (ms == null || !Number.isFinite(ms)) continue;
          if (studentLocalCalendarDateKeyMs(ms) === todayKey) {
            completedSessionToday = true;
          }
        }
        sessionRows.sort((a, b) => {
          const parseMs = (ca: unknown) => {
            if (ca == null) return 0;
            if (typeof ca === "object" && ca !== null && "toDate" in (ca as object) && typeof (ca as { toDate?: () => Date }).toDate === "function") {
              return (ca as { toDate: () => Date }).toDate().getTime();
            }
            if (typeof ca === "string" && ca.trim()) {
              const p = Date.parse(ca);
              return Number.isFinite(p) ? p : 0;
            }
            return 0;
          };
          return parseMs(b.completedAt) - parseMs(a.completedAt);
        });
        if (!cancelled) {
          setHasCompletedWorkoutSessionToday(completedSessionToday);
          setLastPerfByPlanId(buildLatestPerfByPlanId(sessionRows));
          setLastPerfByExercise(buildLatestPerfByExerciseName(sessionRows));
        }

        // 5. Workout plans
        const plans: WorkoutPlan[] = plansSnap.docs.map(d => ({ id: d.id, ...d.data() })) as WorkoutPlan[];

        const completedIds = new Set<string>();
        for (const p of plans) {
          if (p.completedAt || p.status === "completed") completedIds.add(p.id);
        }
        if (!cancelled) setCompletedPlanIds(completedIds);

        const expiredPlans = plans.filter(p => {
          if (p.completedAt || p.status === "completed") return false;
          return getPlanDaysUntilExpiry(p) < 0;
        });
        void Promise.allSettled(
          expiredPlans.map((p) =>
            updateDoc(doc(db!, "personalTrainers", tid, "students", rid, "workoutPlans", p.id), {
              status: "expired",
              expiredAt: new Date().toISOString(),
            })
          )
        );

        const activePlans = plans.filter(p => {
          if (p.completedAt || p.status === "completed") return false;
          if (expiredPlans.some(e => e.id === p.id)) return false;
          if (!isSequenceStepEffectiveUnlocked(p, completedIds)) return false;
          return getPlanDaysUntilExpiry(p) >= 0;
        });
        activePlans.sort((a,b) => Date.parse(getPlanReferenceDate(a) || "") - Date.parse(getPlanReferenceDate(b) || ""));

        if (!cancelled) { setWorkouts(activePlans); }
      } catch (e) { console.error(e); }
      finally { if (!cancelled) setIsLoading(false); }
    }

    fetchAll();
    return () => { cancelled = true; };
  }, [db, user?.uid]);

  useEffect(() => {
    const id = window.setInterval(() => setPresentAccessTick((x) => x + 1), 25_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!db || !user?.uid || !trainerId || !myId) return;
    let cancelled = false;
    async function refreshCompletedToday() {
      try {
        const sessionsSnap = await getDocs(
          collection(db!, "personalTrainers", trainerId, "students", myId, "workoutSessions")
        );
        if (cancelled) return;
        const todayKey = studentLocalCalendarDateKeyMs(Date.now());
        let completedSessionToday = false;
        const sessionRows: Array<{
          workoutPlanId?: string;
          completedAt?: unknown;
          exercises?: unknown[];
        }> = [];
        for (const sd of sessionsSnap.docs) {
          const data = sd.data() as {
            completedAt?: unknown;
            workoutPlanId?: string;
            exercises?: unknown[];
          };
          sessionRows.push(data);
          const ca = data.completedAt;
          if (ca == null) continue;
          let ms: number | null = null;
          if (typeof ca === "object" && ca !== null && "toDate" in (ca as object) && typeof (ca as { toDate?: () => Date }).toDate === "function") {
            ms = (ca as { toDate: () => Date }).toDate().getTime();
          } else if (typeof ca === "string" && ca.trim()) {
            ms = Date.parse(ca);
          }
          if (ms == null || !Number.isFinite(ms)) continue;
          if (studentLocalCalendarDateKeyMs(ms) === todayKey) {
            completedSessionToday = true;
          }
        }
        sessionRows.sort((a, b) => {
          const parseMs = (ca: unknown) => {
            if (ca == null) return 0;
            if (typeof ca === "object" && ca !== null && "toDate" in (ca as object) && typeof (ca as { toDate?: () => Date }).toDate === "function") {
              return (ca as { toDate: () => Date }).toDate().getTime();
            }
            if (typeof ca === "string" && ca.trim()) {
              const p = Date.parse(ca);
              return Number.isFinite(p) ? p : 0;
            }
            return 0;
          };
          return parseMs(b.completedAt) - parseMs(a.completedAt);
        });
        if (!cancelled) {
          setHasCompletedWorkoutSessionToday(completedSessionToday);
          setLastPerfByPlanId(buildLatestPerfByPlanId(sessionRows));
          setLastPerfByExercise(buildLatestPerfByExerciseName(sessionRows));
        }
      } catch {
        /* ignore */
      }
    }
    void refreshCompletedToday();
    return () => {
      cancelled = true;
    };
  }, [db, user?.uid, trainerId, myId, presentAccessTick]);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const selectedDateStr = toDateStr(selectedDate);
  const selectedDaySched = availability[DAY_KEYS[selectedDate.getDay()]];
  const isSelectedDayAvailable = !!(selectedDaySched?.enabled && selectedDaySched.ranges.length);

  // How many consecutive 30-min blocks a single session occupies
  const slotsNeeded = Math.max(1, Math.ceil(sessionDurationMin / slotDurationMin));

  const timeSlots = useMemo(
    () => generateSlotsForDay(selectedDaySched, slotDurationMin),
    [selectedDaySched, slotDurationMin]
  );

  const slotsByTime = useMemo(() => {
    const map = new Map<string, SessionSlot>();
    sessionSlots.filter(s => s.date === selectedDateStr).forEach(s => map.set(s.startTime, s));
    return map;
  }, [sessionSlots, selectedDateStr]);

  /** Distinct calendar days in the Monday-week of `selectedDate` where the student has any booking. */
  const weeklyBookedCount = useMemo(() => {
    if (!myId) return 0;
    const weekDateSet = new Set(getWeekDates(selectedDate));
    const daysWithBooking = new Set<string>();
    for (const slot of sessionSlots) {
      if (!weekDateSet.has(slot.date)) continue;
      if (slot.students.some((s) => s.studentId === myId)) {
        daysWithBooking.add(slot.date);
      }
    }
    return daysWithBooking.size;
  }, [sessionSlots, selectedDate, myId]);

  const weeklyAllowance = sessionsPerWeek ?? 0;
  const weeklyAllowanceDisplay = Math.max(1, weeklyAllowance);

  const canBookMore =
    sessionsPerWeek == null || weeklyBookedCount < sessionsPerWeek;

  // Calendar modifiers
  const isUnavailableDay = useCallback((date: Date) => {
    const s = availability[DAY_KEYS[date.getDay()]];
    return !s?.enabled || !s.ranges.length;
  }, [availability]);

  const bookedDates = useMemo(() => {
    if (!myId) return [];
    return [...new Set(sessionSlots.filter(s => s.students.some(st => st.studentId === myId)).map(s => s.date))]
      .map(s => new Date(s + "T12:00:00"));
  }, [sessionSlots, myId]);

  // Highlight every day in weeks that have an assigned program
  const workoutDates = useMemo(() => {
    const seenWeeks = new Set<string>();
    const dates: Date[] = [];
    for (const w of workouts) {
      const planDate = (w.weekStart || w.assignedAt || w.createdAt || "").substring(0, 10);
      if (!planDate) continue;
      const ws = getWeekStart(planDate);
      if (seenWeeks.has(ws)) continue;
      seenWeeks.add(ws);
      for (let i = 0; i < 7; i++) {
        const d = new Date(ws + "T12:00:00");
        d.setDate(d.getDate() + i);
        dates.push(new Date(d));
      }
    }
    return dates;
  }, [workouts]);

  const selectedWeekStart = getWeekStart(selectedDateStr);

  /** Plans for the week selected on the calendar (Monday of that week), sorted by reference date. */
  const weekPlansOrdered = useMemo(() => {
    return [...workouts]
      .filter((w) => {
        const planDate = (w.weekStart || w.assignedAt || w.createdAt || "").substring(0, 10);
        if (planDate) return getWeekStart(planDate) === selectedWeekStart;
        // Program sequences created without week/assigned/created dates apply to any week view.
        if (w.sequenceGroupId) return true;
        return false;
      })
      .sort((a, b) => {
        const ra = getPlanReferenceDate(a);
        const rb = getPlanReferenceDate(b);
        const ta = ra ? Date.parse(ra) : 0;
        const tb = rb ? Date.parse(rb) : 0;
        if (ta !== tb) return ta - tb;
        return (Number(a.sequenceStepIndex) || 0) - (Number(b.sequenceStepIndex) || 0);
      });
  }, [workouts, selectedWeekStart]);

  const isOpenAccess = isOpenTrainingAccess(trainingAccessMode);

  const plansToShow = useMemo(
    () => (isOpenAccess ? workouts : weekPlansOrdered),
    [isOpenAccess, workouts, weekPlansOrdered]
  );

  const planPresentAccess = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!myId) return map;
    if (isOpenAccess) {
      for (const w of plansToShow) {
        map.set(w.id, isSequenceStepEffectiveUnlocked(w, completedPlanIds));
      }
      return map;
    }
    const now = Date.now();
    const slots = sessionSlots as SessionSlotAttendance[];
    const candidates = weekPlansOrdered.map((w) => ({
      id: w.id,
      sequenceStepIndex: Number(w.sequenceStepIndex) || 0,
    }));
    const resolved = resolveStudentPresentStartPlans(
      slots,
      myId,
      candidates,
      now,
      sessionDurationMin,
      hasCompletedWorkoutSessionToday
    );
    for (const w of weekPlansOrdered) {
      map.set(w.id, resolved.get(w.id) === true);
    }
    return map;
  }, [
    myId,
    isOpenAccess,
    plansToShow,
    completedPlanIds,
    sessionSlots,
    weekPlansOrdered,
    sessionDurationMin,
    presentAccessTick,
    hasCompletedWorkoutSessionToday,
  ]);

  const workoutsPlansSectionTitle = useMemo(() => {
    const today = toDateStr(new Date());
    return toDateStr(selectedDate) === today
      ? t("studentWorkoutsPlansHeadingToday")
      : t("studentWorkoutsPlansHeadingWeek");
  }, [selectedDate, t]);

  // ── Register / unregister ─────────────────────────────────────────────────────

  const handleToggleSlot = async (time: string) => {
    if (!db || !user || !trainerId || !myId) return;

    const startIdx = timeSlots.indexOf(time);
    if (startIdx === -1) return;

    const existingAtTime = slotsByTime.get(time);
    const myEntry = existingAtTime?.students.find(s => s.studentId === myId);
    const isEnrolled = !!myEntry;

    setIsRegistering(slotDocId(selectedDateStr, time));
    try {
      if (isEnrolled) {
        const sessionStart = myEntry.sessionStart ?? time;
        const sessionStartsAt = getSlotStartDate(selectedDateStr, sessionStart);
        if (sessionStartsAt.getTime() - Date.now() <= SESSION_SIGNUP_CUTOFF_MS) {
          toast({
            title: t("sessionCancelClosedTitle"),
            description: t("sessionCancelClosedDesc"),
            variant: "destructive",
          });
          return;
        }
        // ── Unregister: free exactly the consecutive blocks that were booked ──
        // Build by time arithmetic so non-adjacent slots (different ranges) are never touched.
        const blocksToFree = Array.from({ length: slotsNeeded }, (_, i) =>
          addMin(sessionStart, i * slotDurationMin)
        );

        const nextSlots = [...sessionSlots];
        for (const t of blocksToFree) {
          const docId = slotDocId(selectedDateStr, t);
          const slot = slotsByTime.get(t);
          if (!slot) continue;
          const newStudents = slot.students.filter(s => s.studentId !== myId);
          await setDoc(doc(db, "personalTrainers", trainerId, "sessionSlots", docId),
            { ...slot, students: newStudents });
          const idx = nextSlots.findIndex(s => s.id === docId);
          if (idx >= 0) nextSlots[idx] = { ...nextSlots[idx], students: newStudents };
        }
        setSessionSlots(nextSlots);
        toast({ title: "Inscrição cancelada" });
      } else {
        // ── Register: book slotsNeeded consecutive blocks ──
        const selectedSlotStart = getSlotStartDate(selectedDateStr, time);
        const msUntilStart = selectedSlotStart.getTime() - Date.now();
        if (msUntilStart <= SESSION_SIGNUP_CUTOFF_MS) {
          toast({
            title: "Inscrição fechada",
            description: "Só podes inscrever-te até 1 hora antes do início da sessão.",
            variant: "destructive",
          });
          return;
        }
        if (!canBookMore) {
          toast({
            title: t("studentWeeklyBookingLimitToast").replace("{n}", String(sessionsPerWeek ?? 0)),
            variant: "destructive",
          });
          return;
        }
        const hasSessionThisDay = sessionSlots.some(
          (s) => s.date === selectedDateStr && s.students.some((st) => st.studentId === myId)
        );
        if (hasSessionThisDay) {
          toast({
            title: t("studentAlreadyBookedTodayTitle"),
            description: t("studentAlreadyBookedTodayDesc"),
            variant: "destructive",
          });
          return;
        }
        const blocksToBook = timeSlots.slice(startIdx, startIdx + slotsNeeded);
        if (blocksToBook.length < slotsNeeded || !areConsecutiveBlocks(blocksToBook, slotDurationMin)) {
          toast({ title: `Não há blocos consecutivos suficientes para uma sessão de ${sessionDurationMin} min neste horário.`, variant: "destructive" });
          return;
        }

        // Check capacity for all required blocks
        for (const t of blocksToBook) {
          const slot = slotsByTime.get(t);
          const maxS = slot?.maxStudents ?? defaultMaxStudents;
          if ((slot?.students.length ?? 0) >= maxS) {
            toast({ title: `Bloco ${t} está cheio`, variant: "destructive" }); return;
          }
        }

        // Match plan by week (not specific date), else first unlocked undated sequence step
        const matchingPlan =
          workouts.find((w) => {
            const planDate = (w.weekStart || w.assignedAt || w.createdAt || "").substring(0, 10);
            return planDate ? getWeekStart(planDate) === selectedWeekStart : false;
          }) ||
          [...workouts]
            .filter(
              (w) =>
                !!w.sequenceGroupId &&
                !(w.weekStart || w.assignedAt || w.createdAt) &&
                isSequenceStepEffectiveUnlocked(w, completedPlanIds)
            )
            .sort((a, b) => (Number(a.sequenceStepIndex) || 0) - (Number(b.sequenceStepIndex) || 0))[0];
        const totalSessionMin = slotsNeeded * slotDurationMin;
        const nextSlots = [...sessionSlots];

        for (const t of blocksToBook) {
          const docId = slotDocId(selectedDateStr, t);
          const slot = slotsByTime.get(t);
          const maxS = slot?.maxStudents ?? defaultMaxStudents;
          const bookPhotoUrl = (myPhotoUrl || user?.photoURL || "").trim();
          const newStudent: SlotStudent = {
            studentId: myId,
            studentName,
            sessionStart: time,
            sessionDurationMin: totalSessionMin,
            sessionAttendance: "pending",
            ...(bookPhotoUrl ? { studentPhotoUrl: bookPhotoUrl } : {}),
            ...(matchingPlan ? { workoutPlanId: matchingPlan.id, workoutTitle: matchingPlan.title } : {}),
          };
          const newStudents = [...(slot?.students || []), newStudent];
          const newSlotData: SessionSlot = { id: docId, date: selectedDateStr, startTime: t, maxStudents: maxS, students: newStudents };
          await setDoc(doc(db, "personalTrainers", trainerId, "sessionSlots", docId), newSlotData);
          const idx = nextSlots.findIndex(s => s.id === docId);
          if (idx >= 0) nextSlots[idx] = newSlotData;
          else nextSlots.push(newSlotData);
        }

        setSessionSlots(nextSlots);
        toast({ title: `Sessão de ${totalSessionMin} min reservada! (${blocksToBook[0]} – ${addMin(blocksToBook[blocksToBook.length-1], slotDurationMin)})` });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setIsRegistering(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (isUserLoading || isLoading) {
    return (
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
  }

  return (
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">{t("myWorkouts")}</h1>
          <p className="text-muted-foreground">
            {isOpenAccess ? t("trainingAccessModeOpen") : "Agenda de sessões com o teu treinador"}
          </p>
        </header>

        {isOpenAccess ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{t("studentOpenAccessWorkoutsIntro")}</p>
            </CardContent>
          </Card>
        ) : (
        <div className="grid lg:grid-cols-5 gap-6 items-start">

          {/* Left: Calendar + weekly booking limit */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" /> Horário do Treinador
              </CardTitle>
              <CardDescription>Seleciona um dia para ver os blocos disponíveis</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={d => { if (d) setSelectedDate(d); }}
                modifiers={{ booked: bookedDates, workout: workoutDates, unavailable: isUnavailableDay }}
                modifiersClassNames={{
                  booked:      "bg-accent/25 text-accent font-bold rounded-full",
                  workout:     "bg-primary/10 font-medium",
                  unavailable: "opacity-30 line-through text-muted-foreground",
                }}
                className="rounded-md border max-w-full"
              />

              {/* Legend */}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-accent/30 inline-block" /> Inscrito
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-muted border inline-block" /> Indisponível
                </span>
              </div>

              {sessionsPerWeek != null && (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{t("studentSessionBookingsThisWeek")}</span>
                    <span
                      className={`font-bold tabular-nums ${weeklyBookedCount >= weeklyAllowance ? "text-destructive" : "text-primary"}`}
                    >
                      {weeklyBookedCount}/{weeklyAllowance}
                    </span>
                  </div>
                  <Progress value={(weeklyBookedCount / weeklyAllowanceDisplay) * 100} className="h-2" />
                  {!canBookMore && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" /> {t("studentWeeklySessionLimitReached")}
                    </p>
                  )}
                  {canBookMore && weeklyBookedCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("studentSessionsRemainingToBookThisWeek").replace(
                        "{remaining}",
                        String(weeklyAllowance - weeklyBookedCount)
                      )}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: Day schedule */}
          <Card className="lg:col-span-3">
            <CardHeader>
              {/* Week selected on calendar — same filter as program list below */}
              {weekPlansOrdered.length > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 mb-2">
                  <Dumbbell className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{workoutsPlansSectionTitle}</p>
                    <p className="text-sm font-semibold text-primary">
                      {weekPlansOrdered.length === 1
                        ? weekPlansOrdered[0].title
                        : `${weekPlansOrdered.length} programas nesta semana`}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="capitalize text-xl">
                    {selectedDate.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
                  </CardTitle>
                  <CardDescription>
                    {isSelectedDayAvailable
                      ? `${timeSlots.length} blocos de ${slotDurationMin} min · sessão ${slotsNeeded * slotDurationMin} min`
                      : "Sem disponibilidade neste dia"}
                  </CardDescription>
                </div>
                {isSelectedDayAvailable && selectedDaySched && (
                  <div className="flex flex-wrap gap-1 mt-1 justify-end">
                    {selectedDaySched.ranges.map((r,i) => (
                      <Badge key={i} variant="outline" className="text-xs shrink-0">
                        {r.startTime} – {r.endTime}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!isSelectedDayAvailable ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center text-muted-foreground">
                  <Clock className="h-12 w-12 opacity-20" />
                  <p>O treinador não tem disponibilidade neste dia.</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[560px] overflow-y-auto pr-1">
                  {timeSlots.map(time => {
                    const slot = slotsByTime.get(time);
                    const maxS = slot?.maxStudents ?? defaultMaxStudents;
                    const count = slot?.students.length ?? 0;
                    const mySlotEntry = slot?.students.find(s => s.studentId === myId);
                    const isEnrolled = !!mySlotEntry;

                    // A slot is a continuation only if it is strictly adjacent to sessionStart
                    // (i.e. an exact multiple of slotDurationMin away, within the session window).
                    // Slots in a different time range (e.g. 12:00 when sessionStart is 09:00)
                    // are independent bookings and must NOT be collapsed into "continuação".
                    const isContinuation = isEnrolled
                      && mySlotEntry.sessionStart !== undefined
                      && mySlotEntry.sessionStart !== time
                      && (() => {
                        const [sh, sm] = mySlotEntry.sessionStart!.split(":").map(Number);
                        const [th, tm] = time.split(":").map(Number);
                        const diff = (th * 60 + tm) - (sh * 60 + sm);
                        return diff > 0 && diff < slotsNeeded * slotDurationMin && diff % slotDurationMin === 0;
                      })();
                    const isSessionStart = isEnrolled && !isContinuation;

                    // For non-enrolled: need slotsNeeded truly consecutive free slots to book
                    const startIdx = timeSlots.indexOf(time);
                    const blocksForSession = timeSlots.slice(startIdx, startIdx + slotsNeeded);
                    const hasEnoughBlocks = !isEnrolled
                      && blocksForSession.length === slotsNeeded
                      && areConsecutiveBlocks(blocksForSession, slotDurationMin);
                    const allBlocksFree = hasEnoughBlocks && blocksForSession.every(t2 => {
                      const s2 = slotsByTime.get(t2);
                      return (s2?.students.length ?? 0) < (s2?.maxStudents ?? defaultMaxStudents);
                    });
                    const isFull = !isEnrolled && (!hasEnoughBlocks || !allBlocksFree);
                    const slotStartsAt = getSlotStartDate(selectedDateStr, time);
                    const isBookingCutoffPassed =
                      !isEnrolled && slotStartsAt.getTime() - Date.now() <= SESSION_SIGNUP_CUTOFF_MS;
                    const sessionStartForCancel =
                      isSessionStart && mySlotEntry ? (mySlotEntry.sessionStart ?? time) : time;
                    const sessionStartsAtForCancel = getSlotStartDate(selectedDateStr, sessionStartForCancel);
                    const isCancelCutoffPassed =
                      isSessionStart &&
                      sessionStartsAtForCancel.getTime() - Date.now() <= SESSION_SIGNUP_CUTOFF_MS;
                    const docId = slotDocId(selectedDateStr, time);
                    const isLoading_ = isRegistering === docId ||
                      // also show loading on continuation while session-start is processing
                      (isContinuation && isRegistering === slotDocId(selectedDateStr, mySlotEntry?.sessionStart ?? time));

                    // Cannot start a session here (tail of day / range shorter than slotsNeeded × slot length)
                    if (!isEnrolled && !isContinuation && !hasEnoughBlocks) return null;

                    return (
                      <div
                        key={time}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                          isSessionStart
                            ? "border-accent/60 bg-accent/10"
                            : isContinuation
                            ? "border-accent/30 bg-accent/5 ml-4"  // indented continuation
                            : isFull
                            ? "border-border bg-muted/10 opacity-60"
                            : "border-border bg-transparent hover:bg-muted/20"
                        }`}
                      >
                        {/* Time — always 30-min block duration */}
                        <div className="flex flex-col items-end min-w-[58px] shrink-0">
                          <span className={`text-sm font-bold tabular-nums ${isContinuation ? "text-accent/60" : ""}`}>{time}</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">{addMin(time, slotDurationMin)}</span>
                        </div>

                        {/* Colour bar */}
                        <div className={`w-0.5 h-8 rounded-full shrink-0 ${
                          isEnrolled ? "bg-accent" : isFull ? "bg-muted-foreground/30" : "bg-border"
                        }`} />

                        {/* Capacity (hide on continuation to reduce noise) */}
                        {!isContinuation && (
                          <div className={`flex items-center gap-1 text-xs font-semibold shrink-0 tabular-nums ${
                            isEnrolled ? "text-accent" : "text-muted-foreground"
                          }`}>
                            <Users className="h-3.5 w-3.5" /> {count}/{maxS}
                          </div>
                        )}

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          {!isContinuation && count > 0 && slot && (
                            <div className="flex -space-x-2 mb-1.5" aria-label="Inscritos neste bloco">
                              {slot.students.map((st) => (
                                <span key={st.studentId} title={st.studentName} className="inline-flex shrink-0">
                                  <Avatar className="h-7 w-7 border-2 border-background">
                                    <AvatarImage src={slotStudentAvatarSrc(st)} alt="" />
                                    <AvatarFallback className="text-[9px]">
                                      {initialsFromStudentName(st.studentName)}
                                    </AvatarFallback>
                                  </Avatar>
                                </span>
                              ))}
                            </div>
                          )}
                          {isContinuation ? (
                            <span className="text-xs text-accent/70 italic">↳ continuação da sessão</span>
                          ) : isSessionStart ? (
                            <div className="space-y-0.5">
                              <p className="text-xs font-semibold text-accent">
                                Inscrito · sessão {slotsNeeded * slotDurationMin} min
                              </p>
                              {mySlotEntry?.workoutTitle && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                  <Dumbbell className="h-3 w-3 shrink-0" /> {mySlotEntry.workoutTitle}
                                </p>
                              )}
                              {isCancelCutoffPassed && (
                                <p className="text-xs text-destructive/70">{t("sessionCancelClosedDesc")}</p>
                              )}
                            </div>
                          ) : isBookingCutoffPassed ? (
                            <span className="text-xs text-muted-foreground">Inscrição fecha 1h antes</span>
                          ) : isFull ? (
                            <span className="text-xs text-muted-foreground">Bloco cheio</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {maxS - count} lugar(es) disponível(is)
                            </span>
                          )}
                        </div>

                        {/* Action: Sair until 1h before start; locked badge afterwards */}
                        {isSessionStart ? (
                          isCancelCutoffPassed ? (
                            <Badge variant="secondary" className="shrink-0 text-xs">
                              {t("sessionCancelClosedBadge")}
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0 h-8 gap-1.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                              onClick={() => handleToggleSlot(time)}
                              disabled={!!isLoading_}
                            >
                              {isLoading_ ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <UserMinus className="h-3.5 w-3.5" />
                              )}
                              {t("sessionBookingLeave")}
                            </Button>
                          )
                        ) : isContinuation ? null
                          : !isFull && !isBookingCutoffPassed ? (
                          <Button size="sm"
                            className="shrink-0 h-8 gap-1.5 text-xs bg-primary/90"
                            onClick={() => handleToggleSlot(time)}
                            disabled={!!isLoading_ || !canBookMore}>
                            {isLoading_
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <UserPlus className="h-3.5 w-3.5" />}
                            Inscrever
                          </Button>
                        ) : (
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            {isBookingCutoffPassed ? "Fechado" : "Cheio"}
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        )}

        {trainerId ? (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">
              {isOpenAccess ? t("myWorkouts") : workoutsPlansSectionTitle}
            </h2>
            {plansToShow.length > 0 ? (
              <div className="space-y-2">
                {plansToShow.map((w) => {
                  const isExpanded = expandedWorkoutId === w.id;
                  const weekDate = w.weekStart
                    ? new Date(w.weekStart + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })
                    : w.assignedAt
                    ? new Date(w.assignedAt).toLocaleDateString()
                    : null;

                  const canStartThisWeek = planPresentAccess.get(w.id) === true;
                  const panelId = `student-workout-plan-${w.id}`;
                  return (
                    <div key={w.id} className="rounded-lg border overflow-hidden bg-card">
                      {canStartThisWeek ? (
                        <>
                          <div
                            className={`flex items-center gap-2 px-3 py-2.5 ${
                              isExpanded ? "border-b" : ""
                            }`}
                          >
                            <button
                              type="button"
                              id={`${panelId}-toggle`}
                              aria-expanded={isExpanded}
                              aria-controls={panelId}
                              className="flex flex-1 min-w-0 items-center gap-3 rounded-md py-0.5 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                              onClick={() => setExpandedWorkoutId(isExpanded ? null : w.id)}
                            >
                              <Dumbbell className="h-4 w-4 text-primary shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold truncate">{w.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {w.exercises?.length || 0} exercícios
                                  {weekDate ? ` · semana de ${weekDate}` : ""}
                                </p>
                              </div>
                              <span className="shrink-0 text-muted-foreground" aria-hidden>
                                {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                              </span>
                            </button>
                            <Button size="sm" className="shrink-0 h-7 bg-accent text-accent-foreground gap-1.5 text-xs" asChild>
                              <Link href={`/student/workouts/${w.id}/session`}>
                                <Play className="h-3 w-3" /> Iniciar
                              </Link>
                            </Button>
                          </div>

                          {isExpanded && (
                            <div id={panelId} role="region" aria-labelledby={`${panelId}-toggle`} className="divide-y">
                              {(w.exercises || []).length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">Sem exercícios.</p>
                              ) : (w.exercises || []).map((ex: any, idx: number) => {
                                const prescribed =
                                  ex.sets && ex.reps
                                    ? `${ex.sets}×${ex.reps}`
                                    : null;
                                const exKey = normalizeExerciseKey(String(ex.exerciseName || ""));
                                const lastPerf =
                                  lastPerfByPlanId[w.id]?.[exKey] ?? lastPerfByExercise[exKey];
                                const lastHint = formatLastSessionPerformanceLabel(lastPerf, {
                                  weighted: (weight, reps) =>
                                    t("lastSessionPerformance")
                                      .replace("{weight}", String(weight))
                                      .replace("{reps}", String(reps)),
                                  bodyweight: (reps) =>
                                    t("lastSessionPerformanceBodyweight").replace("{reps}", String(reps)),
                                });
                                return (
                                <div key={idx} className="px-4 py-3 space-y-1.5">
                                  <p className="text-sm font-semibold">{ex.exerciseName}</p>
                                  {prescribed ? (
                                    <p className="text-xs text-muted-foreground">
                                      {t("prescribedSetsReps")}: {prescribed}
                                    </p>
                                  ) : null}
                                  {lastHint ? (
                                    <p className="text-xs font-medium text-primary/90">{lastHint}</p>
                                  ) : null}
                                  {ex.notes ? (
                                    <div className="flex items-start gap-1.5">
                                      <StickyNote className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                      <p className="text-xs text-muted-foreground whitespace-pre-line">{ex.notes}</p>
                                    </div>
                                  ) : !prescribed && !lastHint ? (
                                    <p className="text-xs text-muted-foreground italic">Sem notas do treinador.</p>
                                  ) : null}
                                </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2.5">
                          <div className="flex flex-1 min-w-0 items-start gap-3">
                            <Dumbbell className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
                            <p className="text-sm text-muted-foreground leading-snug">
                              {t("studentWorkoutsLockedPlanMessage")}
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="shrink-0 h-7 gap-1.5 text-xs"
                            disabled
                            title={t("studentTrainingRequiresPresentDescription")}
                          >
                            <Play className="h-3 w-3" /> Iniciar
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("studentWorkoutsNoPlansForSelectedWeek")}</p>
            )}
          </div>
        ) : null}

      </div>
  );
}
