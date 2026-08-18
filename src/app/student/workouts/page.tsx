
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
  Dumbbell, Clock, Play, ExternalLink, Loader2, AlertTriangle,
  CalendarDays, Users, UserPlus, UserMinus, ChevronDown, ChevronUp, StickyNote,
  CheckCircle2, Lock, CalendarCheck, TrendingUp, Zap,
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
import { isSessionSlotCancelled } from "@/lib/session-slot-enrollment";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  buildLatestPerfByExerciseName,
  buildLatestPerfByPlanId,
  formatLastSessionPerformanceLabel,
  normalizeExerciseKey,
  type LastSessionPerf,
} from "@/lib/last-session-performance";
import { getYouTubeEmbedUrl } from "@/lib/exercise-video";
import type { LibraryExerciseVideo } from "@/lib/find-library-exercises-in-text";
import {
  ExactExerciseDemoButton,
  MentionedExerciseDemoChips,
} from "@/components/ExerciseTextDemoButtons";
import {
  dayHasOpenBlocks,
  getEffectiveSessionDurationMin,
  isDateInVacation,
  isNewBookingBlocked,
  normalizeOpenAvailabilityBlocks,
  normalizeVacationPeriods,
  openBlocksForDate,
  resolveDaySlotTimes,
  studentDayBookable,
  type OpenAvailabilityBlock,
  type VacationPeriod,
} from "@/lib/trainer-availability";

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
type SessionSlot = {
  id: string;
  date: string;
  startTime: string;
  maxStudents: number;
  students: SlotStudent[];
  cancelledAt?: string;
};

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
  const [vacationPeriods, setVacationPeriods] = useState<VacationPeriod[]>([]);
  const [openAvailabilityBlocks, setOpenAvailabilityBlocks] = useState<OpenAvailabilityBlock[]>([]);
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
  const [exerciseLibraryVideos, setExerciseLibraryVideos] = useState<LibraryExerciseVideo[]>([]);
  const [selectedExerciseVideo, setSelectedExerciseVideo] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const embeddedExerciseVideoUrl = selectedExerciseVideo
    ? getYouTubeEmbedUrl(selectedExerciseVideo.url)
    : null;

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

        const [rosterDoc, trainerDoc, slotsSnap, plansSnap, sessionsSnap, exercisesSnap] = await Promise.all([
          getDoc(doc(db!, "personalTrainers", tid, "students", rid)),
          getDoc(doc(db!, "personalTrainers", tid)),
          getDocs(collection(db!, "personalTrainers", tid, "sessionSlots")),
          getDocs(collection(db!, "personalTrainers", tid, "students", rid, "workoutPlans")),
          getDocs(collection(db!, "personalTrainers", tid, "students", rid, "workoutSessions")),
          getDocs(collection(db!, "exercises")),
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
          setVacationPeriods(normalizeVacationPeriods(td.vacationPeriods));
          setOpenAvailabilityBlocks(normalizeOpenAvailabilityBlocks(td.openAvailabilityBlocks));
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
        if (!cancelled) {
          const videos: LibraryExerciseVideo[] = [];
          for (const exerciseDoc of exercisesSnap.docs) {
            const exercise = exerciseDoc.data();
            const name = String(exercise.name || "").trim();
            const videoUrl = String(exercise.videoUrl || "").trim();
            if (name && videoUrl) videos.push({ name, videoUrl });
          }
          setExerciseLibraryVideos(videos);
        }
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
  const selectedDayWeeklyAvailable = !!(selectedDaySched?.enabled && selectedDaySched.ranges.length);
  const selectedDayOnVacation = isDateInVacation(selectedDateStr, vacationPeriods);
  const openBlocksOnSelectedDay = useMemo(
    () => openBlocksForDate(selectedDateStr, openAvailabilityBlocks),
    [selectedDateStr, openAvailabilityBlocks]
  );
  const hasBookingOnSelectedDay = sessionSlots.some(
    (s) => s.date === selectedDateStr && s.students.some((st) => st.studentId === myId)
  );

  const timeSlots = useMemo(() => {
    const bookedTimes = selectedDayOnVacation
      ? sessionSlots
          .filter((s) => s.date === selectedDateStr && s.students.some((st) => st.studentId === myId))
          .map((s) => s.startTime)
      : sessionSlots.filter((s) => s.date === selectedDateStr).map((s) => s.startTime);
    if (selectedDayOnVacation) {
      return [...new Set(bookedTimes)].sort();
    }
    const resolved = resolveDaySlotTimes({
      dateStr: selectedDateStr,
      weeklySched: selectedDaySched,
      openBlocks: openAvailabilityBlocks,
      slotDurationMin,
      vacationPeriods,
    });
    return [...new Set([...resolved, ...bookedTimes])].sort();
  }, [
    selectedDateStr,
    selectedDaySched,
    openAvailabilityBlocks,
    slotDurationMin,
    vacationPeriods,
    sessionSlots,
    selectedDayOnVacation,
    myId,
  ]);

  const showStudentDaySchedule =
    studentDayBookable({
      weeklyAvailable: selectedDayWeeklyAvailable,
      onVacation: selectedDayOnVacation,
      hasResolvableSlots: timeSlots.length > 0,
    }) || (selectedDayOnVacation && hasBookingOnSelectedDay);

  const getSessionDurationForTime = useCallback(
    (_time: string) =>
      getEffectiveSessionDurationMin({
        rosterDurationMin: sessionDurationMin,
        slotDurationMin,
      }),
    [sessionDurationMin, slotDurationMin]
  );

  const getSlotsNeededForTime = useCallback(
    (time: string) => {
      const dur = getSessionDurationForTime(time);
      return Math.max(1, Math.ceil(dur / slotDurationMin));
    },
    [getSessionDurationForTime, slotDurationMin]
  );

  const isBookingBlockedAtTime = useCallback(
    (time: string) =>
      isNewBookingBlocked({
        dateStr: selectedDateStr,
        time,
        vacationPeriods,
        openBlocks: openAvailabilityBlocks,
      }),
    [selectedDateStr, vacationPeriods, openAvailabilityBlocks]
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

  const isOnVacationDay = useCallback(
    (date: Date) => isDateInVacation(toDateStr(date), vacationPeriods),
    [vacationPeriods]
  );

  // Calendar modifiers
  const isUnavailableDay = useCallback((date: Date) => {
    const dateStr = toDateStr(date);
    if (dayHasOpenBlocks(dateStr, openAvailabilityBlocks)) return false;
    if (isDateInVacation(dateStr, vacationPeriods)) return false;
    const s = availability[DAY_KEYS[date.getDay()]];
    return !s?.enabled || !s.ranges.length;
  }, [availability, vacationPeriods, openAvailabilityBlocks]);

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
      hasCompletedWorkoutSessionToday,
      vacationPeriods
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
    vacationPeriods,
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

    if (!isEnrolled && isSessionSlotCancelled(existingAtTime)) {
      toast({
        title: t("coachSlotCancelledLabel"),
        description: t("coachReactivateSlotSessionDescription"),
        variant: "destructive",
      });
      return;
    }

    if (!isEnrolled && isBookingBlockedAtTime(time)) {
      toast({ title: "O treinador está de férias neste dia", variant: "destructive" });
      return;
    }

    const slotsNeededForTime = getSlotsNeededForTime(time);
    const sessionDurForTime = getSessionDurationForTime(time);

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
        const enrolledDur = myEntry.sessionDurationMin ?? sessionDurForTime;
        const freeCount = Math.max(1, Math.ceil(enrolledDur / slotDurationMin));
        const blocksToFree = Array.from({ length: freeCount }, (_, i) =>
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
        const blocksToBook = timeSlots.slice(startIdx, startIdx + slotsNeededForTime);
        if (
          blocksToBook.length < slotsNeededForTime ||
          !areConsecutiveBlocks(blocksToBook, slotDurationMin)
        ) {
          toast({
            title: `Não há blocos consecutivos suficientes para uma sessão de ${sessionDurForTime} min neste horário.`,
            variant: "destructive",
          });
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
        const totalSessionMin = sessionDurForTime;
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

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold font-headline">{t("myWorkouts")}</h1>
        </div>
        {!isOpenAccess && sessionsPerWeek != null && (
          <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-2.5 shadow-sm shrink-0">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${
              weeklyBookedCount >= weeklyAllowance
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary"
            }`}>
              <CalendarCheck className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground leading-none mb-1">{t("studentSessionBookingsThisWeek")}</p>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold tabular-nums ${weeklyBookedCount >= weeklyAllowance ? "text-destructive" : "text-foreground"}`}>
                  {weeklyBookedCount}<span className="text-muted-foreground font-normal">/{weeklyAllowance}</span>
                </span>
                <Progress
                  value={(weeklyBookedCount / weeklyAllowanceDisplay) * 100}
                  className="h-1.5 w-20"
                />
              </div>
            </div>
            {!canBookMore && (
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 ml-1" />
            )}
          </div>
        )}
      </div>

      {isOpenAccess ? null : (
        <div className="grid lg:grid-cols-5 gap-5 items-start">

          {/* ── Left column: Calendar ───────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="h-4 w-4 text-primary" aria-hidden /> Horário do Treinador
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={d => { if (d) setSelectedDate(d); }}
                  modifiers={{
                    booked: bookedDates,
                    workout: workoutDates,
                    unavailable: isUnavailableDay,
                    onVacation: isOnVacationDay,
                  }}
                  modifiersClassNames={{
                    booked:      "bg-accent/25 text-accent font-bold rounded-full",
                    workout:     "bg-primary/10 font-medium",
                    unavailable: "opacity-30 line-through text-muted-foreground",
                    onVacation:
                      "ring-2 ring-orange-400/80 dark:ring-orange-500 ring-offset-2 ring-offset-background rounded-full",
                  }}
                  className="rounded-md max-w-full"
                />

                {/* Legend */}
                <div className="grid grid-cols-3 gap-1.5 pt-1 border-t">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-full bg-accent/40 shrink-0" /> Inscrito
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-full bg-muted border shrink-0" /> Indisponível
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-full border-2 border-orange-400 shrink-0" /> Férias
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Weekly sessions summary card */}
            {sessionsPerWeek != null && (
              <Card className={`border ${weeklyBookedCount >= weeklyAllowance ? "border-destructive/30 bg-destructive/5" : "border-primary/20 bg-primary/5"}`}>
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className={`h-4 w-4 ${weeklyBookedCount >= weeklyAllowance ? "text-destructive" : "text-primary"}`} />
                      <span className="text-sm font-semibold">{t("studentSessionBookingsThisWeek")}</span>
                    </div>
                    <span className={`text-lg font-bold tabular-nums ${weeklyBookedCount >= weeklyAllowance ? "text-destructive" : "text-primary"}`}>
                      {weeklyBookedCount}/{weeklyAllowance}
                    </span>
                  </div>
                  <Progress value={(weeklyBookedCount / weeklyAllowanceDisplay) * 100} className="h-2" />
                  {!canBookMore ? (
                    <p className="text-xs text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {t("studentWeeklySessionLimitReached")}
                    </p>
                  ) : weeklyBookedCount > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("studentSessionsRemainingToBookThisWeek").replace(
                        "{remaining}",
                        String(weeklyAllowance - weeklyBookedCount)
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Ainda sem sessões reservadas esta semana.</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Right column: Day schedule ──────────────────────────────── */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-3">

              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="capitalize text-xl leading-tight">
                    {selectedDate.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    {showStudentDaySchedule
                      ? `${timeSlots.length} blocos · sessão ${sessionDurationMin} min`
                      : selectedDayOnVacation
                        ? "Treinador de férias"
                        : "Sem disponibilidade neste dia"}
                  </CardDescription>
                </div>
                {showStudentDaySchedule && (
                  <div className="flex flex-wrap gap-1 mt-1 justify-end">
                    {selectedDayWeeklyAvailable &&
                      selectedDaySched?.ranges.map((r, i) => (
                        <Badge key={`w-${i}`} variant="outline" className="text-xs shrink-0 font-mono">
                          {r.startTime}–{r.endTime}
                        </Badge>
                      ))}
                    {openBlocksOnSelectedDay.map((b) => (
                      <Badge
                        key={b.id}
                        variant="outline"
                        className="text-xs shrink-0 font-mono border-teal-500/50 text-teal-700 dark:text-teal-400"
                      >
                        {b.startTime}–{b.endTime}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              {!showStudentDaySchedule ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center text-muted-foreground">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
                    <Clock className="h-8 w-8 opacity-30" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {selectedDayOnVacation ? "Treinador de férias" : "Sem disponibilidade"}
                    </p>
                    <p className="text-xs mt-1">
                      {selectedDayOnVacation
                        ? "O treinador está de férias neste dia."
                        : "Escolhe outro dia no calendário."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1 -mx-1 px-1">
                  {timeSlots.map(time => {
                    const slot = slotsByTime.get(time);
                    const maxS = slot?.maxStudents ?? defaultMaxStudents;
                    const count = slot?.students.length ?? 0;
                    const mySlotEntry = slot?.students.find(s => s.studentId === myId);
                    const isEnrolled = !!mySlotEntry;
                    const slotsNeededForTime = getSlotsNeededForTime(time);
                    const sessionMinForTime = getSessionDurationForTime(time);

                    // A slot is a continuation only if it is strictly adjacent to sessionStart
                    const isContinuation = isEnrolled
                      && mySlotEntry.sessionStart !== undefined
                      && mySlotEntry.sessionStart !== time
                      && (() => {
                        const enrolledDur = mySlotEntry.sessionDurationMin ?? sessionMinForTime;
                        const needed = Math.max(1, Math.ceil(enrolledDur / slotDurationMin));
                        const [sh, sm] = mySlotEntry.sessionStart!.split(":").map(Number);
                        const [th, tm] = time.split(":").map(Number);
                        const diff = (th * 60 + tm) - (sh * 60 + sm);
                        return diff > 0 && diff < needed * slotDurationMin && diff % slotDurationMin === 0;
                      })();
                    const isSessionStart = isEnrolled && !isContinuation;

                    const startIdx = timeSlots.indexOf(time);
                    const blocksForSession = timeSlots.slice(startIdx, startIdx + slotsNeededForTime);
                    const hasEnoughBlocks = !isEnrolled
                      && blocksForSession.length === slotsNeededForTime
                      && areConsecutiveBlocks(blocksForSession, slotDurationMin);
                    const isSlotCancelled = isSessionSlotCancelled(slot);
                    const allBlocksFree = hasEnoughBlocks && blocksForSession.every(t2 => {
                      const s2 = slotsByTime.get(t2);
                      if (isSessionSlotCancelled(s2)) return false;
                      return (s2?.students.length ?? 0) < (s2?.maxStudents ?? defaultMaxStudents);
                    });
                    const isFull = !isEnrolled && (!hasEnoughBlocks || !allBlocksFree || isSlotCancelled);
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
                      (isContinuation && isRegistering === slotDocId(selectedDateStr, mySlotEntry?.sessionStart ?? time));

                    if (!isEnrolled && !isContinuation && !hasEnoughBlocks) return null;

                    /* ── Slot card ── */
                    return (
                      <div
                        key={time}
                        className={`relative flex items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                          isSessionStart
                            ? "border-accent/50 bg-accent/10 shadow-sm"
                            : isContinuation
                            ? "border-accent/20 bg-accent/5 ml-5 border-dashed"
                            : isSlotCancelled
                            ? "border-destructive/30 bg-destructive/5 opacity-70"
                            : isFull || isBookingCutoffPassed
                            ? "border-border bg-muted/20 opacity-60"
                            : "border-border bg-card hover:bg-muted/30 hover:border-primary/30 cursor-pointer"
                        }`}
                      >
                        {/* Status stripe on left edge */}
                        <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${
                          isSessionStart ? "bg-accent"
                          : isContinuation ? "bg-accent/40"
                          : isSlotCancelled ? "bg-destructive/50"
                          : isFull || isBookingCutoffPassed ? "bg-muted-foreground/20"
                          : "bg-primary/40"
                        }`} />

                        {/* Time block */}
                        <div className="flex flex-col items-center min-w-[52px] shrink-0 pl-1">
                          <span className={`text-base font-bold tabular-nums leading-none ${
                            isSessionStart ? "text-accent" : isContinuation ? "text-accent/50" : "text-foreground"
                          }`}>{time}</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums mt-0.5">{addMin(time, slotDurationMin)}</span>
                        </div>

                        {/* Main info */}
                        <div className="flex-1 min-w-0">
                          {isContinuation ? (
                            <span className="text-xs text-accent/60 italic">↳ continuação da sessão</span>
                          ) : (
                            <>
                              {/* Peer avatars */}
                              {count > 0 && slot && (
                                <div className="flex -space-x-1.5 mb-1.5">
                                  {slot.students.map((st) => (
                                    <span key={st.studentId} title={st.studentName} className="inline-flex shrink-0">
                                      <Avatar className="h-6 w-6 border-2 border-background">
                                        <AvatarImage src={slotStudentAvatarSrc(st)} alt="" />
                                        <AvatarFallback className="text-[8px]">
                                          {initialsFromStudentName(st.studentName)}
                                        </AvatarFallback>
                                      </Avatar>
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Status line */}
                              {isSessionStart ? (
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-accent shrink-0" />
                                    <p className="text-xs font-semibold text-accent">
                                      Inscrito · {mySlotEntry?.sessionDurationMin ?? sessionMinForTime} min
                                    </p>
                                  </div>
                                  {mySlotEntry?.workoutTitle && (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                      <Dumbbell className="h-3 w-3 shrink-0" /> {mySlotEntry.workoutTitle}
                                    </p>
                                  )}
                                  {isCancelCutoffPassed && (
                                    <p className="text-xs text-destructive/70">{t("sessionCancelClosedDesc")}</p>
                                  )}
                                </div>
                              ) : isSlotCancelled ? (
                                <span className="text-xs font-medium text-destructive">{t("coachSlotCancelledLabel")}</span>
                              ) : isBookingCutoffPassed ? (
                                <div className="flex items-center gap-1.5">
                                  <Lock className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                                  <span className="text-xs text-muted-foreground">Inscrição fecha 1h antes</span>
                                </div>
                              ) : isFull ? (
                                <span className="text-xs text-muted-foreground">Bloco cheio</span>
                              ) : (
                                <span className="text-xs text-muted-foreground font-medium">
                                  {maxS - count === 1
                                    ? "1 lugar disponível"
                                    : `${maxS - count} lugares disponíveis`}
                                </span>
                              )}
                            </>
                          )}
                        </div>

                        {/* Capacity pill (hide on continuation) */}
                        {!isContinuation && (
                          <div className={`flex items-center gap-1 text-xs shrink-0 tabular-nums px-1.5 py-0.5 rounded-full ${
                            isSessionStart
                              ? "bg-accent/20 text-accent font-semibold"
                              : "text-muted-foreground"
                          }`}>
                            <Users className="h-3 w-3" /> {count}/{maxS}
                          </div>
                        )}

                        {/* CTA */}
                        {isSessionStart ? (
                          isCancelCutoffPassed ? (
                            <Badge variant="secondary" className="shrink-0 text-xs gap-1">
                              <Lock className="h-3 w-3" /> {t("sessionCancelClosedBadge")}
                            </Badge>
                          ) : (
                            <Button
                              size="icon"
                              variant="outline"
                              className="shrink-0 h-8 w-8 border-destructive/40 text-destructive hover:bg-destructive/10"
                              onClick={() => handleToggleSlot(time)}
                              disabled={!!isLoading_}
                              aria-label={t("sessionBookingLeave")}
                              title={t("sessionBookingLeave")}
                            >
                              {isLoading_ ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
                            </Button>
                          )
                        ) : isContinuation ? null
                          : !isFull && !isBookingCutoffPassed ? (
                          <Button
                            size="icon"
                            className="shrink-0 h-8 w-8"
                            onClick={() => handleToggleSlot(time)}
                            disabled={!!isLoading_ || !canBookMore || isBookingBlockedAtTime(time)}
                            aria-label={t("sessionBookingJoin")}
                            title={t("sessionBookingJoin")}
                          >
                            {isLoading_ ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <UserPlus className="h-3.5 w-3.5" aria-hidden />}
                          </Button>
                        ) : (
                          <Badge variant="secondary" className="shrink-0 text-xs gap-1">
                            {isSlotCancelled ? (
                              t("coachSlotCancelledLabel")
                            ) : isBookingCutoffPassed ? (
                              <><Lock className="h-3 w-3" /> Fechado</>
                            ) : (
                              "Cheio"
                            )}
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

      {/* ── Workout plans section ──────────────────────────────────────── */}
      {trainerId ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">
              {isOpenAccess ? t("myWorkouts") : workoutsPlansSectionTitle}
            </h2>
          </div>
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
                  <div key={w.id} className={`rounded-xl border overflow-hidden bg-card transition-shadow ${canStartThisWeek ? "shadow-sm hover:shadow-md" : "opacity-70"}`}>
                    {canStartThisWeek ? (
                      <>
                        <div className={`flex items-center gap-3 px-4 py-3 ${isExpanded ? "border-b bg-muted/20" : ""}`}>
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 shrink-0">
                            <Dumbbell className="h-4 w-4 text-accent" />
                          </div>
                          <button
                            type="button"
                            id={`${panelId}-toggle`}
                            aria-expanded={isExpanded}
                            aria-controls={panelId}
                            className="flex flex-1 min-w-0 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm"
                            onClick={() => setExpandedWorkoutId(isExpanded ? null : w.id)}
                          >
                            <span className="text-sm font-semibold truncate leading-snug">{w.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {w.exercises?.length || 0} exercícios
                              {weekDate ? ` · semana de ${weekDate}` : ""}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setExpandedWorkoutId(isExpanded ? null : w.id)}
                            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                            aria-hidden
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          <Button size="icon" className="shrink-0 h-8 w-8 bg-accent text-accent-foreground hover:bg-accent/90" asChild title={t("startWorkout")}>
                            <Link href={`/student/workouts/${w.id}/session`} aria-label={t("startWorkout")}>
                              <Play className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                          </Button>
                        </div>

                        {isExpanded && (
                          <div id={panelId} role="region" aria-labelledby={`${panelId}-toggle`} className="divide-y">
                            {(w.exercises || []).length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-6">Sem exercícios definidos.</p>
                            ) : (w.exercises || []).map((ex: any, idx: number) => {
                              const prescribed = ex.sets && ex.reps ? `${ex.sets}×${ex.reps}` : null;
                              const exerciseName = String(ex.exerciseName || "");
                              const exKey = normalizeExerciseKey(exerciseName);
                              const notes = String(ex.notes || "").trim();
                              const lastPerf = lastPerfByPlanId[w.id]?.[exKey] ?? lastPerfByExercise[exKey];
                              const lastHint = formatLastSessionPerformanceLabel(lastPerf, {
                                weighted: (weight, reps) =>
                                  t("lastSessionPerformance").replace("{weight}", String(weight)).replace("{reps}", String(reps)),
                                bodyweight: (reps) =>
                                  t("lastSessionPerformanceBodyweight").replace("{reps}", String(reps)),
                              });
                              return (
                                <div key={idx} className="px-4 py-3 flex gap-3 items-start">
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground shrink-0 mt-0.5">
                                    {idx + 1}
                                  </div>
                                  <div className="space-y-0.5 min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-sm font-semibold whitespace-pre-wrap break-words">{exerciseName}</p>
                                      <ExactExerciseDemoButton
                                        title={exerciseName}
                                        libraryVideos={exerciseLibraryVideos}
                                        onSelect={setSelectedExerciseVideo}
                                        watchDemoLabel={t("watchDemo")}
                                      />
                                    </div>
                                    {prescribed && (
                                      <p className="text-xs text-muted-foreground">
                                        {t("prescribedSetsReps")}: <span className="font-medium text-foreground">{prescribed}</span>
                                      </p>
                                    )}
                                    {lastHint && (
                                      <p className="text-xs font-medium text-primary/90">{lastHint}</p>
                                    )}
                                    {notes ? (
                                      <div className="flex items-start gap-1.5 mt-1">
                                        <StickyNote className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                        <p className="text-xs text-muted-foreground whitespace-pre-line">{notes}</p>
                                      </div>
                                    ) : !prescribed && !lastHint ? (
                                      <p className="text-xs text-muted-foreground italic">Sem notas do treinador.</p>
                                    ) : null}
                                    <MentionedExerciseDemoChips
                                      title={exerciseName}
                                      extraText={notes}
                                      libraryVideos={exerciseLibraryVideos}
                                      onSelect={setSelectedExerciseVideo}
                                      watchDemoLabel={t("watchDemo")}
                                      matchedDemosLabel={t("matchedExerciseDemos")}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted shrink-0">
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground leading-snug flex-1 min-w-0">
                          {t("studentWorkoutsLockedPlanMessage")}
                        </p>
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="shrink-0 h-8 w-8"
                          disabled
                          title={t("studentTrainingRequiresPresentDescription")}
                          aria-label={t("startWorkout")}
                        >
                          <Play className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
              <Dumbbell className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t("studentWorkoutsNoPlansForSelectedWeek")}</p>
            </div>
          )}
        </div>
      ) : null}

      <Dialog
        open={!!selectedExerciseVideo}
        onOpenChange={(open) => !open && setSelectedExerciseVideo(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("watchDemo")} — {selectedExerciseVideo?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedExerciseVideo ? (
            embeddedExerciseVideoUrl ? (
              <div className="aspect-video overflow-hidden rounded-md bg-muted">
                <iframe
                  className="h-full w-full"
                  src={embeddedExerciseVideoUrl}
                  title={`${t("watchDemo")}: ${selectedExerciseVideo.title}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            ) : (
              <a
                href={selectedExerciseVideo.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-1 text-sm text-primary hover:underline"
              >
                {t("watchDemo")}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )
          ) : null}
        </DialogContent>
      </Dialog>

    </div>
  );
}
