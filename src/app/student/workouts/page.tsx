
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

// ── Types ──────────────────────────────────────────────────────────────────────

type TimeRange  = { startTime: string; endTime: string };
type DaySchedule = { enabled: boolean; ranges: TimeRange[] };
type Availability = Record<string, DaySchedule>;

type SlotStudent = {
  studentId: string;
  studentName: string;
  workoutPlanId?: string;
  workoutTitle?: string;
  sessionStart?: string;       // start time of the full session (first block)
  sessionDurationMin?: number; // total session length in minutes
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
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DAY_KEYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

/** Same window as booking: changes within 1 hour of start are not allowed. */
const SESSION_SIGNUP_CUTOFF_MS = 60 * 60 * 1000;

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
    // Weekly plans should remain active until the end of the assigned week.
    const weekStartDate = new Date(plan.weekStart.substring(0, 10) + "T12:00:00");
    if (isNaN(weekStartDate.getTime())) return 0;
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    return daysUntilDate(toDateStr(weekEndDate));
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
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);

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
        if (cancelled) return;
        setTrainerId(tid);
        setRosterDocId(rid);

        const [rosterDoc, trainerDoc, slotsSnap, plansSnap] = await Promise.all([
          getDoc(doc(db!, "personalTrainers", tid, "students", rid)),
          getDoc(doc(db!, "personalTrainers", tid)),
          getDocs(collection(db!, "personalTrainers", tid, "sessionSlots")),
          getDocs(collection(db!, "personalTrainers", tid, "students", rid, "workoutPlans")),
        ]);
        if (cancelled) return;

        // 2. Roster doc → student name + sessionsPerWeek + sessionDurationMin
        if (rosterDoc.exists()) {
          const rd = rosterDoc.data();
          setStudentName(`${rd.firstName || ""} ${rd.lastName || ""}`.trim() || "Aluno");
          if (rd.sessionsPerWeek)   setSessionsPerWeek(Number(rd.sessionsPerWeek));
          if (rd.sessionDurationMin) setSessionDurationMin(Number(rd.sessionDurationMin));
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

        // 5. Workout plans
        const plans: WorkoutPlan[] = plansSnap.docs.map(d => ({ id: d.id, ...d.data() })) as WorkoutPlan[];

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

  // ── Derived ───────────────────────────────────────────────────────────────────

  const myId            = rosterDocId || user?.uid || "";
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

  // Weekly booked count — count unique sessions, not blocks.
  // A session key is (date + sessionStart). Old slots without sessionStart use their own startTime.
  // This prevents double-counting when a 60-min session occupies 2 × 30-min blocks.
  const weeklyBookedCount = useMemo(() => {
    if (!myId) return 0;
    const weekDates = getWeekDates(selectedDate);
    const seen = new Set<string>();
    for (const slot of sessionSlots) {
      if (!weekDates.includes(slot.date)) continue;
      const entry = slot.students.find(s => s.studentId === myId);
      if (!entry) continue;
      const sessionKey = `${slot.date}_${entry.sessionStart ?? slot.startTime}`;
      seen.add(sessionKey);
    }
    return seen.size;
  }, [sessionSlots, selectedDate, myId]);


  // Limit applies to the week of the currently selected date
  const canBookMore = sessionsPerWeek == null || weeklyBookedCount < sessionsPerWeek;

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

  // Program assigned for the selected week (if any)
  const selectedWeekStart = getWeekStart(selectedDateStr);
  const selectedWeekProgram = useMemo(() => {
    return workouts.find((w) => {
      const planDate = (w.weekStart || w.assignedAt || w.createdAt || "").substring(0, 10);
      return planDate ? getWeekStart(planDate) === selectedWeekStart : false;
    }) ?? null;
  }, [workouts, selectedWeekStart]);

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
          toast({ title: `Limite semanal atingido (${sessionsPerWeek}×/semana)`, variant: "destructive" });
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

        // Match plan by week (not specific date)
        const matchingPlan = workouts.find((w) => {
          const planDate = (w.weekStart || w.assignedAt || w.createdAt || "").substring(0, 10);
          return planDate ? getWeekStart(planDate) === selectedWeekStart : false;
        });
        const totalSessionMin = slotsNeeded * slotDurationMin;
        const nextSlots = [...sessionSlots];

        for (const t of blocksToBook) {
          const docId = slotDocId(selectedDateStr, t);
          const slot = slotsByTime.get(t);
          const maxS = slot?.maxStudents ?? defaultMaxStudents;
          const newStudent: SlotStudent = {
            studentId: myId,
            studentName,
            sessionStart: time,              // always mark the session's first block
            sessionDurationMin: totalSessionMin,
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
      <StudentNavigation>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StudentNavigation>
    );
  }

  return (
    <StudentNavigation>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">{t("myWorkouts")}</h1>
          <p className="text-muted-foreground">Agenda de sessões com o teu treinador</p>
        </header>

        {/* Main grid */}
        <div className="grid lg:grid-cols-5 gap-6 items-start">

          {/* Left: Calendar + weekly status */}
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
                className="w-full rounded-md border"
              />

              {/* Legend */}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-accent/30 inline-block" /> Inscrito
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-primary/20 inline-block" /> Semana com programa
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-muted border inline-block" /> Indisponível
                </span>
              </div>

              {/* Weekly limit card */}
              {sessionsPerWeek != null && (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">Sessões esta semana</span>
                    <span className={`font-bold tabular-nums ${weeklyBookedCount >= sessionsPerWeek ? "text-destructive" : "text-primary"}`}>
                      {weeklyBookedCount}/{sessionsPerWeek}
                    </span>
                  </div>
                  <Progress
                    value={(weeklyBookedCount / sessionsPerWeek) * 100}
                    className="h-2"
                  />
                  {!canBookMore && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Limite semanal atingido
                    </p>
                  )}
                  {canBookMore && weeklyBookedCount > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {sessionsPerWeek - weeklyBookedCount} sessão(ões) por reservar esta semana
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: Day schedule */}
          <Card className="lg:col-span-3">
            <CardHeader>
              {/* Week program banner */}
              {selectedWeekProgram && (
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 mb-2">
                  <Dumbbell className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Programa desta semana</p>
                    <p className="text-sm font-semibold text-primary truncate">{selectedWeekProgram.title}</p>
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
                          ) : !hasEnoughBlocks ? (
                            <span className="text-xs text-muted-foreground">Bloco incompleto</span>
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

        {/* Assigned workout plans — any active assignment can be started */}
        {workouts.length > 0 && (() => {
          const weekPlans = workouts.filter(w => {
            const planDate = (w.weekStart || w.assignedAt || w.createdAt || "").substring(0, 10);
            return planDate ? getWeekStart(planDate) === selectedWeekStart : false;
          });
          if (weekPlans.length === 0) return null;
          return (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Programa desta semana</h2>
            <div className="space-y-2">
              {weekPlans.map(w => {
                const isExpanded = expandedWorkoutId === w.id;
                const weekDate = w.weekStart
                  ? new Date(w.weekStart + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })
                  : w.assignedAt
                  ? new Date(w.assignedAt).toLocaleDateString()
                  : null;

                return (
                  <div key={w.id} className="rounded-lg border overflow-hidden bg-card">
                    {/* Header */}
                    <div className={`flex items-center gap-3 px-3 py-2.5 ${
                      isExpanded ? "border-b" : ""
                    }`}>
                      <Dumbbell className="h-4 w-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{w.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {w.exercises?.length || 0} exercícios
                          {weekDate ? ` · semana de ${weekDate}` : ""}
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                        onClick={() => setExpandedWorkoutId(isExpanded ? null : w.id)}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" className="shrink-0 h-7 bg-accent text-accent-foreground gap-1.5 text-xs" asChild>
                        <Link href={`/student/workouts/${w.id}/session`}>
                          <Play className="h-3 w-3" /> Iniciar
                        </Link>
                      </Button>
                    </div>

                    {/* Expanded exercises */}
                    {isExpanded && (
                      <div className="divide-y">
                        {(w.exercises || []).length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">Sem exercícios.</p>
                        ) : (w.exercises || []).map((ex: any, idx: number) => (
                          <div key={idx} className="px-4 py-3 space-y-1.5">
                            <p className="text-sm font-semibold">{ex.exerciseName}</p>
                            {ex.notes ? (
                              <div className="flex items-start gap-1.5">
                                <StickyNote className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                                <p className="text-xs text-muted-foreground whitespace-pre-line">{ex.notes}</p>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">Sem notas do treinador.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          );
        })()}

      </div>
    </StudentNavigation>
  );
}
