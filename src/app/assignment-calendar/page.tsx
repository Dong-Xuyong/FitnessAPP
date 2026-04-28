"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar as MonthCalendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, getDocs, deleteDoc, setDoc, getDoc, doc } from "firebase/firestore";
import {
  CalendarDays, Clock, Settings2, Loader2, CheckCircle2, AlertTriangle,
  Trash2, Dumbbell, UserPlus, UserMinus, X, Users, ChevronDown, ChevronUp, Pencil, Save,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────────────

type TimeRange = { startTime: string; endTime: string };
type DaySchedule = { enabled: boolean; ranges: TimeRange[] };
type Availability = Record<string, DaySchedule>;

type SlotStudent = {
  studentId: string;
  studentName: string;
  workoutPlanId?: string;
  workoutTitle?: string;
};

type SessionSlot = {
  id: string;
  date: string;        // "2026-04-10"
  startTime: string;   // "09:00"
  maxStudents: number;
  students: SlotStudent[];
};

type WeekAssignment = {
  id: string;
  studentId: string;
  studentName: string;
  weekStart: string;   // "2026-04-07" (Monday)
  programId: string;
  programTitle: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const DAY_LABELS_PT: Record<string, string> = {
  sunday: "Domingo", monday: "Segunda", tuesday: "Terça",
  wednesday: "Quarta", thursday: "Quinta", friday: "Sexta", saturday: "Sábado",
};
const DAY_LABELS_SHORT: Record<string, string> = {
  sunday: "Dom", monday: "Seg", tuesday: "Ter",
  wednesday: "Qua", thursday: "Qui", friday: "Sex", saturday: "Sáb",
};

// Pre-filled with the coach's specific schedule (user can edit and save)
const DEFAULT_AVAILABILITY: Availability = {
  sunday:    { enabled: false, ranges: [] },
  monday:    { enabled: true,  ranges: [{ startTime: "08:30", endTime: "09:30" }] },
  tuesday:   { enabled: true,  ranges: [{ startTime: "07:00", endTime: "09:30" }, { startTime: "12:00", endTime: "13:00" }, { startTime: "18:30", endTime: "19:30" }] },
  wednesday: { enabled: true,  ranges: [{ startTime: "10:00", endTime: "11:00" }] },
  thursday:  { enabled: true,  ranges: [{ startTime: "08:30", endTime: "09:30" }, { startTime: "12:00", endTime: "13:00" }, { startTime: "18:30", endTime: "20:30" }] },
  friday:    { enabled: true,  ranges: [{ startTime: "07:00", endTime: "09:30" }, { startTime: "12:00", endTime: "13:00" }, { startTime: "17:15", endTime: "17:45" }] },
  saturday:  { enabled: false, ranges: [] },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function generateSlotTimes(startTime: string, endTime: string, durationMin: number): string[] {
  const slots: string[] = [];
  let [h, m] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const endTotal = eh * 60 + em;
  while (h * 60 + m < endTotal) {
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += durationMin;
    h += Math.floor(m / 60);
    m = m % 60;
  }
  return slots;
}

/** Generate all slot start-times for a day, across all its ranges, sorted. */
function generateSlotsForDay(sched: DaySchedule | undefined, durationMin: number): string[] {
  if (!sched?.enabled || !sched.ranges.length) return [];
  const all = sched.ranges.flatMap((r) => generateSlotTimes(r.startTime, r.endTime, durationMin));
  return [...new Set(all)].sort();
}

/** Migrate legacy single-range format → new multi-range format. */
function migrateDaySchedule(raw: any): DaySchedule {
  if (raw && Array.isArray(raw.ranges)) return raw as DaySchedule;
  if (raw && raw.startTime) {
    return { enabled: !!raw.enabled, ranges: [{ startTime: raw.startTime, endTime: raw.endTime || "18:00" }] };
  }
  return { enabled: false, ranges: [] };
}

function addMin(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function slotDocId(date: string, time: string): string {
  return `${date}_${time.replace(":", "")}`;
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getWeekDates(date: Date): string[] {
  const d = new Date(date);
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return toDateStr(dd);
  });
}

/** Returns the ISO date string (YYYY-MM-DD) of the Monday of the week containing dateStr. */
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr.substring(0, 10) + "T12:00:00");
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  return toDateStr(mon);
}

/** Human-readable "Mon DD MMM – Sun DD MMM YYYY" label for a week. */
function weekLabel(weekStart: string): string {
  const mon = new Date(weekStart + "T12:00:00");
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const short: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${mon.toLocaleDateString(undefined, short)} – ${sun.toLocaleDateString(undefined, { ...short, year: "numeric" })}`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AssignmentCalendarPage() {
  const { t } = useI18n();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  // Selected date
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Availability
  const [availability, setAvailability] = useState<Availability>(DEFAULT_AVAILABILITY);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [draft, setDraft] = useState<Availability>(DEFAULT_AVAILABILITY);
  const [isSavingAvailability, setIsSavingAvailability] = useState(false);
  const [applyAllStart, setApplyAllStart] = useState("");
  const [applyAllEnd, setApplyAllEnd] = useState("");

  // Slot settings
  const [slotDurationMin, setSlotDurationMin] = useState(30);
  const [defaultMaxStudents, setDefaultMaxStudents] = useState(4);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Session slots
  const [sessionSlots, setSessionSlots] = useState<SessionSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Week program assignments
  const [weekAssignments, setWeekAssignments] = useState<WeekAssignment[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [assignWeekOpen, setAssignWeekOpen] = useState(false);
  const [assignWeekStudentId, setAssignWeekStudentId] = useState("");
  const [assignWeekProgramId, setAssignWeekProgramId] = useState("");
  const [isAssigningWeek, setIsAssigningWeek] = useState(false);
  // Weekly program assignment from calendar
  const [assignWeekMode, setAssignWeekMode] = useState<"single" | "weekly">("single");
  const [assignWeeklyProgramId, setAssignWeeklyProgramId] = useState("");
  const [isAssigningWeeklyFromCal, setIsAssigningWeeklyFromCal] = useState(false);
  const [isRemovingStudentWeekAssignments, setIsRemovingStudentWeekAssignments] = useState(false);
  const [isRemovingStudentAllAssignments, setIsRemovingStudentAllAssignments] = useState(false);

  // Student filter (0 = no filter, shows all; set = student-centric view)
  const [filterStudentId, setFilterStudentId] = useState("");
  const [filterStudentSessionDuration, setFilterStudentSessionDuration] = useState<number | null>(null);
  const [isLoadingFilterStudent, setIsLoadingFilterStudent] = useState(false);
  const [isTogglingSlot, setIsTogglingSlot] = useState<string | null>(null);

  // Expandable week-assignment programs + inline note editing
  const [expandedAssignmentId, setExpandedAssignmentId] = useState<string | null>(null);
  const [editingNoteKey, setEditingNoteKey] = useState<string | null>(null); // "programId-sessionIdx-exIdx"
  const [editingNoteValue, setEditingNoteValue] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Manage slot dialog
  const [managingSlot, setManagingSlot] = useState<{
    date: string;
    startTime: string;
    slot: SessionSlot | null;
  } | null>(null);
  const [addStudentId, setAddStudentId] = useState("");
  const [studentWorkoutPlans, setStudentWorkoutPlans] = useState<any[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [isAddingStudent, setIsAddingStudent] = useState(false);
  const [slotMaxOverride, setSlotMaxOverride] = useState<number>(4);

  // Roster
  const studentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user]);
  const { data: rosterStudents, isLoading: isLoadingRoster } = useCollection(studentsQuery);

  // ── Load trainer settings ──────────────────────────────────────────────────

  useEffect(() => {
    if (!db || !user) return;
    async function load() {
      try {
        const snap = await getDoc(doc(db!, "personalTrainers", user!.uid));
        if (!snap.exists()) return;
        const data = snap.data();

        // Availability (migrate old flat / workingDays formats → new multi-range format)
        const savedAvail = data?.availability as any;
        if (savedAvail) {
          if (Array.isArray(savedAvail.workingDays)) {
            // Very old format: { workingDays[], startTime, endTime }
            const migrated: Availability = {};
            DAY_KEYS.forEach((d) => {
              migrated[d] = {
                enabled: savedAvail.workingDays.includes(d),
                ranges: [{ startTime: savedAvail.startTime || "09:00", endTime: savedAvail.endTime || "18:00" }],
              };
            });
            setAvailability(migrated);
          } else {
            // Old or new per-day format — migrate each day
            const migrated: Availability = { ...DEFAULT_AVAILABILITY };
            DAY_KEYS.forEach((d) => { if (savedAvail[d]) migrated[d] = migrateDaySchedule(savedAvail[d]); });
            setAvailability(migrated);
          }
        }

        if (data?.maxStudentsPerSlot) setDefaultMaxStudents(data.maxStudentsPerSlot);
        if (data?.slotDurationMin) setSlotDurationMin(data.slotDurationMin);
      } catch {}
    }
    load();
  }, [db, user]);

  // ── Load session slots ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!db || !user) return;
    let cancelled = false;
    async function fetchSlots() {
      setIsLoadingSlots(true);
      try {
        const snap = await getDocs(collection(db!, "personalTrainers", user!.uid, "sessionSlots"));
        if (!cancelled) setSessionSlots(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SessionSlot)));
      } catch {} finally {
        if (!cancelled) setIsLoadingSlots(false);
      }
    }
    fetchSlots();
    return () => { cancelled = true; };
  }, [db, user]);

  // ── Load programs library + week program assignments ────────────────────────

  useEffect(() => {
    if (!db || !user) return;
    let cancelled = false;
    async function loadProgramsAndAssignments() {
      try {
        const [progSnap, waSnap] = await Promise.all([
          getDocs(collection(db!, "personalTrainers", user!.uid, "personalTrainingPrograms")),
          getDocs(collection(db!, "personalTrainers", user!.uid, "weekProgramAssignments")),
        ]);
        if (!cancelled) {
          setPrograms(progSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
          setWeekAssignments(waSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WeekAssignment)));
        }
      } catch {}
    }
    loadProgramsAndAssignments();
    return () => { cancelled = true; };
  }, [db, user]);

  // ── Load selected student's session duration ───────────────────────────────

  useEffect(() => {
    if (!filterStudentId || !db || !user) {
      setFilterStudentSessionDuration(null);
      return;
    }
    let cancelled = false;
    setIsLoadingFilterStudent(true);
    async function loadStudentSession() {
      try {
        const snap = await getDoc(doc(db!, "personalTrainers", user!.uid, "students", filterStudentId));
        if (!cancelled && snap.exists()) {
          setFilterStudentSessionDuration(snap.data()?.sessionDurationMin ?? null);
        }
      } catch {} finally {
        if (!cancelled) setIsLoadingFilterStudent(false);
      }
    }
    loadStudentSession();
    return () => { cancelled = true; };
  }, [filterStudentId, db, user]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedDayKey = DAY_KEYS[selectedDate.getDay()];
  const selectedDaySchedule = availability[selectedDayKey];
  const isSelectedDayAvailable = !!selectedDaySchedule?.enabled;
  const selectedDateStr = toDateStr(selectedDate);

  const timeSlots = useMemo(
    () => generateSlotsForDay(selectedDaySchedule, slotDurationMin),
    [selectedDaySchedule, slotDurationMin]
  );

  const slotsByTime = useMemo(() => {
    const map = new Map<string, SessionSlot>();
    sessionSlots.filter((s) => s.date === selectedDateStr).forEach((s) => map.set(s.startTime, s));
    return map;
  }, [sessionSlots, selectedDateStr]);

  const slotDates = useMemo(
    () => [...new Set(sessionSlots.map((s) => s.date))].map((s) => new Date(s + "T12:00:00")),
    [sessionSlots]
  );

  // Student filter helpers
  const isFilterActive = !!filterStudentId;
  const effectiveSlotDuration = isFilterActive && filterStudentSessionDuration
    ? filterStudentSessionDuration
    : slotDurationMin;
  const slotsPerSession = Math.max(1, Math.ceil(effectiveSlotDuration / slotDurationMin));

  // Selected week helpers
  const selectedWeekStart = getWeekStart(selectedDateStr);
  const selectedWeekLabel  = weekLabel(selectedWeekStart);

  const selectedWeekAssignments = useMemo(
    () => weekAssignments.filter((a) =>
      a.weekStart === selectedWeekStart &&
      (!isFilterActive || a.studentId === filterStudentId)
    ),
    [weekAssignments, selectedWeekStart, isFilterActive, filterStudentId]
  );

  // Calendar modifier: all days belonging to weeks that have program assignments
  const assignedWeekDates = useMemo(() => {
    const weekStarts = [...new Set(weekAssignments.map((a) => a.weekStart))];
    return weekStarts.flatMap((ws) =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(ws + "T12:00:00");
        d.setDate(d.getDate() + i);
        return new Date(d);
      })
    );
  }, [weekAssignments]);

  const isUnavailableDay = useCallback(
    (date: Date) => {
      const sched = availability[DAY_KEYS[date.getDay()]];
      return !sched?.enabled || !sched.ranges.length;
    },
    [availability]
  );

  const getWeeklyCount = useCallback(
    (studentId: string, aroundDate: Date) => {
      const weekDates = getWeekDates(aroundDate);
      return sessionSlots
        .filter((s) => weekDates.includes(s.date))
        .reduce((acc, s) => acc + (s.students.some((st) => st.studentId === studentId) ? 1 : 0), 0);
    },
    [sessionSlots]
  );

  // ── Availability handlers ──────────────────────────────────────────────────

  const openAvailability = () => {
    const merged: Availability = { ...DEFAULT_AVAILABILITY };
    DAY_KEYS.forEach((d) => { if (availability[d]) merged[d] = migrateDaySchedule(availability[d]); });
    setDraft(merged);
    setApplyAllStart("");
    setApplyAllEnd("");
    setAvailabilityOpen(true);
  };

  const toggleDraftDay = (day: string) =>
    setDraft((prev) => ({
      ...prev,
      [day]: {
        enabled: !prev[day]?.enabled,
        ranges: prev[day]?.ranges.length ? prev[day].ranges : [{ startTime: "09:00", endTime: "18:00" }],
      },
    }));

  const addDraftRange = (day: string) =>
    setDraft((prev) => ({
      ...prev,
      [day]: { ...prev[day], ranges: [...(prev[day]?.ranges || []), { startTime: "09:00", endTime: "10:00" }] },
    }));

  const removeDraftRange = (day: string, idx: number) =>
    setDraft((prev) => {
      const ranges = (prev[day]?.ranges || []).filter((_, i) => i !== idx);
      return { ...prev, [day]: { enabled: ranges.length > 0, ranges } };
    });

  const updateDraftRange = (day: string, idx: number, field: keyof TimeRange, value: string) =>
    setDraft((prev) => {
      const ranges = [...(prev[day]?.ranges || [])];
      ranges[idx] = { ...ranges[idx], [field]: value };
      return { ...prev, [day]: { ...prev[day], ranges } };
    });

  const applyToAll = () => {
    if (!applyAllStart && !applyAllEnd) return;
    setDraft((prev) => {
      const next = { ...prev };
      DAY_KEYS.forEach((d) => {
        if (!next[d]?.enabled) return;
        // Replace all ranges with a single range using the given times
        next[d] = {
          ...next[d],
          ranges: [{ startTime: applyAllStart || "09:00", endTime: applyAllEnd || "18:00" }],
        };
      });
      return next;
    });
  };

  const handleSaveAvailability = async () => {
    if (!db || !user) return;
    setIsSavingAvailability(true);
    try {
      await setDoc(doc(db, "personalTrainers", user.uid), { availability: draft }, { merge: true });
      setAvailability(draft);
      setAvailabilityOpen(false);
      toast({ title: "Disponibilidade guardada" });
    } catch {
      toast({ title: t("error") || "Error", variant: "destructive" });
    } finally {
      setIsSavingAvailability(false);
    }
  };

  // ── Slot settings handler ──────────────────────────────────────────────────

  const handleSaveSettings = async () => {
    if (!db || !user) return;
    setIsSavingSettings(true);
    try {
      await setDoc(doc(db, "personalTrainers", user.uid), {
        slotDurationMin,
        maxStudentsPerSlot: defaultMaxStudents,
      }, { merge: true });
      toast({ title: "Definições guardadas" });
    } catch {
      toast({ title: t("error") || "Error", variant: "destructive" });
    } finally {
      setIsSavingSettings(false);
    }
  };

  // ── Slot management ────────────────────────────────────────────────────────

  const openManageSlot = (time: string) => {
    const existing = slotsByTime.get(time) ?? null;
    setManagingSlot({ date: selectedDateStr, startTime: time, slot: existing });
    setAddStudentId("");
    setSelectedPlanId("");
    setStudentWorkoutPlans([]);
    setSlotMaxOverride(existing?.maxStudents ?? defaultMaxStudents);
  };

  // Fetch workout plans for selected student in the add-student section
  useEffect(() => {
    if (!addStudentId || !db || !user || !managingSlot) {
      setStudentWorkoutPlans([]);
      setSelectedPlanId("");
      return;
    }
    let cancelled = false;
    async function fetchPlans() {
      try {
        const snap = await getDocs(
          collection(db!, "personalTrainers", user!.uid, "students", addStudentId, "workoutPlans")
        );
        const plans = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p: any) => !p.completedAt && p.status !== "completed" && p.status !== "expired") as any[];
        if (!cancelled) {
          setStudentWorkoutPlans(plans);
          // Auto-select plan whose week matches the slot's week
          const slotWeekStart = getWeekStart(managingSlot.date);
          const match = plans.find((p: any) => {
            const planDate = (p.weekStart || p.assignedAt || p.createdAt || "").substring(0, 10);
            return planDate ? getWeekStart(planDate) === slotWeekStart : false;
          });
          setSelectedPlanId(match?.id ?? "");
        }
      } catch {}
    }
    fetchPlans();
    return () => { cancelled = true; };
  }, [addStudentId, db, user, managingSlot]);

  const handleAddStudent = async () => {
    if (!managingSlot || !addStudentId || !db || !user) return;
    setIsAddingStudent(true);
    const { date, startTime } = managingSlot;
    const docId = slotDocId(date, startTime);
    const student = rosterStudents?.find((s) => s.id === addStudentId);
    const studentName = `${student?.firstName || ""} ${student?.lastName || ""}`.trim() || "Aluno";
    const currentStudents = managingSlot.slot?.students ?? [];
    const maxS = slotMaxOverride || defaultMaxStudents;

    if (currentStudents.length >= maxS) {
      toast({ title: "Bloco cheio", variant: "destructive" });
      setIsAddingStudent(false);
      return;
    }
    if (currentStudents.some((s) => s.studentId === addStudentId)) {
      toast({ title: "Aluno já inscrito neste bloco", variant: "destructive" });
      setIsAddingStudent(false);
      return;
    }

    const effectivePlanId = selectedPlanId && selectedPlanId !== "__none__" ? selectedPlanId : "";
    const plan = studentWorkoutPlans.find((p) => p.id === effectivePlanId);
    const newStudent: SlotStudent = {
      studentId: addStudentId,
      studentName,
      ...(effectivePlanId ? { workoutPlanId: effectivePlanId, workoutTitle: plan?.title } : {}),
    };
    const newStudents = [...currentStudents, newStudent];
    const newSlotData = { date, startTime, maxStudents: maxS, students: newStudents };

    try {
      await setDoc(doc(db, "personalTrainers", user.uid, "sessionSlots", docId), newSlotData);
      const newSlot: SessionSlot = { id: docId, ...newSlotData };
      setSessionSlots((prev) => {
        const idx = prev.findIndex((s) => s.id === docId);
        return idx >= 0 ? prev.map((s) => (s.id === docId ? newSlot : s)) : [...prev, newSlot];
      });
      setManagingSlot((prev) => (prev ? { ...prev, slot: newSlot } : null));
      setAddStudentId("");
      setSelectedPlanId("");
      setStudentWorkoutPlans([]);
      toast({ title: "Aluno inscrito no bloco" });
    } catch {
      toast({ title: t("error") || "Error", variant: "destructive" });
    } finally {
      setIsAddingStudent(false);
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!managingSlot?.slot || !db || !user) return;
    const { date, startTime, slot } = managingSlot;
    const docId = slotDocId(date, startTime);
    const newStudents = slot.students.filter((s) => s.studentId !== studentId);
    const maxS = slotMaxOverride || defaultMaxStudents;
    try {
      if (newStudents.length === 0) {
        await deleteDoc(doc(db, "personalTrainers", user.uid, "sessionSlots", docId));
        setSessionSlots((prev) => prev.filter((s) => s.id !== docId));
        setManagingSlot((prev) => (prev ? { ...prev, slot: null } : null));
      } else {
        const newSlotData = { ...slot, students: newStudents, maxStudents: maxS };
        await setDoc(doc(db, "personalTrainers", user.uid, "sessionSlots", docId), newSlotData);
        const newSlot = { ...slot, students: newStudents, maxStudents: maxS };
        setSessionSlots((prev) => prev.map((s) => (s.id === docId ? newSlot : s)));
        setManagingSlot((prev) => (prev ? { ...prev, slot: newSlot } : null));
      }
      toast({ title: "Aluno removido do bloco" });
    } catch {
      toast({ title: t("error") || "Error", variant: "destructive" });
    }
  };

  const handleSaveSlotMax = async () => {
    if (!managingSlot?.slot || !db || !user) return;
    const { date, startTime, slot } = managingSlot;
    const docId = slotDocId(date, startTime);
    const maxS = slotMaxOverride || defaultMaxStudents;
    try {
      const newSlotData = { ...slot, maxStudents: maxS };
      await setDoc(doc(db, "personalTrainers", user.uid, "sessionSlots", docId), newSlotData);
      const newSlot = { ...slot, maxStudents: maxS };
      setSessionSlots((prev) => prev.map((s) => (s.id === docId ? newSlot : s)));
      setManagingSlot((prev) => (prev ? { ...prev, slot: newSlot } : null));
      toast({ title: "Capacidade atualizada" });
    } catch {
      toast({ title: t("error") || "Error", variant: "destructive" });
    }
  };

  // ── Coach toggle student enrollment in a slot ─────────────────────────────

  const handleCoachToggleStudent = async (time: string) => {
    if (!db || !user || !filterStudentId) return;
    const startIdx = timeSlots.indexOf(time);
    if (startIdx === -1) return;

    const slot = slotsByTime.get(time);
    const entry = slot?.students.find((s) => s.studentId === filterStudentId);
    const isEnrolled = !!entry;

    const docKey = slotDocId(selectedDateStr, time);
    setIsTogglingSlot(docKey);
    try {
      if (isEnrolled) {
        // Remove from all consecutive blocks of this session
        const sessionStart = entry.sessionStart ?? time;
        const sessionIdx = timeSlots.indexOf(sessionStart);
        const blocksToFree = timeSlots.slice(Math.max(0, sessionIdx), Math.max(0, sessionIdx) + slotsPerSession);
        const nextSlots = [...sessionSlots];
        for (const t of blocksToFree) {
          const id = slotDocId(selectedDateStr, t);
          const s = slotsByTime.get(t);
          if (!s) continue;
          const newStudents = s.students.filter((st) => st.studentId !== filterStudentId);
          if (newStudents.length === 0) {
            await deleteDoc(doc(db, "personalTrainers", user.uid, "sessionSlots", id));
            const i = nextSlots.findIndex((ss) => ss.id === id);
            if (i >= 0) nextSlots.splice(i, 1);
          } else {
            await setDoc(doc(db, "personalTrainers", user.uid, "sessionSlots", id), { ...s, students: newStudents });
            const i = nextSlots.findIndex((ss) => ss.id === id);
            if (i >= 0) nextSlots[i] = { ...nextSlots[i], students: newStudents };
          }
        }
        setSessionSlots(nextSlots);
        toast({ title: "Aluno removido dos blocos" });
      } else {
        // Enroll in slotsPerSession consecutive blocks
        const blocksToBook = timeSlots.slice(startIdx, startIdx + slotsPerSession);
        if (blocksToBook.length < slotsPerSession) {
          toast({ title: `Não há blocos suficientes para sessão de ${effectiveSlotDuration} min`, variant: "destructive" });
          return;
        }
        for (const t of blocksToBook) {
          const s = slotsByTime.get(t);
          const maxS = s?.maxStudents ?? defaultMaxStudents;
          if ((s?.students.length ?? 0) >= maxS) {
            toast({ title: `Bloco ${t} está cheio`, variant: "destructive" }); return;
          }
        }
        const student = (rosterStudents || []).find((s: any) => s.id === filterStudentId) as any;
        const studentName = `${student?.firstName || ""} ${student?.lastName || ""}`.trim() || "Aluno";
        const weekMatch = weekAssignments.find((a) => a.studentId === filterStudentId && a.weekStart === selectedWeekStart);
        const nextSlots = [...sessionSlots];
        for (const t of blocksToBook) {
          const id = slotDocId(selectedDateStr, t);
          const s = slotsByTime.get(t);
          const maxS = s?.maxStudents ?? defaultMaxStudents;
          const newEntry = {
            studentId: filterStudentId,
            studentName,
            sessionStart: time,
            sessionDurationMin: effectiveSlotDuration,
            ...(weekMatch ? { workoutTitle: weekMatch.programTitle } : {}),
          };
          const newStudents = [...(s?.students || []), newEntry];
          const newSlot: SessionSlot = { id, date: selectedDateStr, startTime: t, maxStudents: maxS, students: newStudents };
          await setDoc(doc(db, "personalTrainers", user.uid, "sessionSlots", id), newSlot);
          const i = nextSlots.findIndex((ss) => ss.id === id);
          if (i >= 0) nextSlots[i] = newSlot; else nextSlots.push(newSlot);
        }
        setSessionSlots(nextSlots);
        toast({ title: `${studentName} inscrito (${effectiveSlotDuration} min)` });
      }
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setIsTogglingSlot(null);
    }
  };

  // ── Inline note editing for week-assignment programs ───────────────────────

  const handleSaveNote = async (programId: string, sessionIdx: number, exIdx: number, newNote: string) => {
    const program = programs.find((p) => p.id === programId);
    if (!program || !db || !user) return;
    setIsSavingNote(true);
    try {
      const updatedSessions = (program.sessions || []).map((s: any, si: number) => {
        if (si !== sessionIdx) return s;
        const exercises = (s.exercises || []).map((e: any, ei: number) =>
          ei === exIdx ? { ...e, notes: newNote } : e
        );
        return { ...s, exercises };
      });
      await setDoc(
        doc(db, "personalTrainers", user.uid, "personalTrainingPrograms", programId),
        { sessions: updatedSessions, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      setPrograms((prev) => prev.map((p) => p.id === programId ? { ...p, sessions: updatedSessions } : p));
      setEditingNoteKey(null);
      toast({ title: "Nota guardada" });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setIsSavingNote(false);
    }
  };

  // ── Weekly program assignment from calendar ────────────────────────────────

  const handleAssignWeeklyFromCal = async () => {
    if (!db || !user || !assignWeekStudentId || !assignWeeklyProgramId) return;
    const weeklyProg = programs.find((p) => p.id === assignWeeklyProgramId);
    if (!weeklyProg) return;
    const student = (rosterStudents || []).find((s: any) => s.id === assignWeekStudentId) as any;
    const studentName = `${student?.firstName || ""} ${student?.lastName || ""}`.trim() || "Aluno";
    const sourceProgramIds: string[] = weeklyProg.sourceProgramIds || [];
    const durationWeeks: number = weeklyProg.durationWeeks || 1;
    const baseProgs = programs.filter((p) => p.programType !== "weekly");
    setIsAssigningWeeklyFromCal(true);
    try {
      const workoutPlansRef = collection(db, "personalTrainers", user.uid, "students", assignWeekStudentId, "workoutPlans");
      for (let w = 1; w <= durationWeeks; w++) {
        const ws = w === 1 ? selectedWeekStart : (() => {
          const d = new Date(selectedWeekStart + "T12:00:00");
          d.setDate(d.getDate() + (w - 1) * 7);
          return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        })();
        for (const progId of sourceProgramIds) {
          const srcProg = baseProgs.find((p) => p.id === progId);
          if (!srcProg) continue;
          const exs = (srcProg.sessions || []).flatMap((s: any) =>
            (s.exercises || []).map((e: any) => ({
              exerciseName: e.exerciseName, sets: e.sets ?? 1, reps: e.reps ?? "",
              restTimeSeconds: e.restTimeSeconds ?? 0, notes: e.notes,
            }))
          );
          await setDoc(doc(collection(db, "personalTrainers", user.uid, "students", assignWeekStudentId, "workoutPlans")), {
            title: srcProg.name, studentId: assignWeekStudentId,
            personalTrainerId: user.uid, weekStart: ws,
            weekNumber: w, totalWeeks: durationWeeks,
            weeklyProgramId: weeklyProg.id, weeklyProgramName: weeklyProg.name,
            sourceTrainingProgramId: progId, exercises: exs,
            createdAt: new Date().toISOString(),
          });
          // Week assignment record for each unique week
          const waRef = doc(collection(db, "personalTrainers", user.uid, "weekProgramAssignments"));
          const wa: WeekAssignment = { id: waRef.id, studentId: assignWeekStudentId, studentName, weekStart: ws, programId: progId, programTitle: srcProg.name };
          await setDoc(waRef, wa);
          setWeekAssignments((prev) => [...prev, wa]);
        }
      }
      setAssignWeekOpen(false);
      setAssignWeekStudentId("");
      setAssignWeeklyProgramId("");
      toast({ title: `${weeklyProg.name} atribuído (${durationWeeks} sem.)` });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setIsAssigningWeeklyFromCal(false);
    }
  };

  // ── Week assignment handlers ───────────────────────────────────────────────

  const handleAddWeekAssignment = async () => {
    if (!db || !user || !assignWeekStudentId || !assignWeekProgramId) return;
    const program = programs.find((p) => p.id === assignWeekProgramId);
    const student = (rosterStudents || []).find((s: any) => s.id === assignWeekStudentId) as any;
    const studentName = `${student?.firstName || ""} ${student?.lastName || ""}`.trim() || "Aluno";
    setIsAssigningWeek(true);
    try {
      // 1. Save a denormalized week assignment record
      const waRef = doc(collection(db, "personalTrainers", user.uid, "weekProgramAssignments"));
      const wa: WeekAssignment = {
        id: waRef.id,
        studentId: assignWeekStudentId,
        studentName,
        weekStart: selectedWeekStart,
        programId: assignWeekProgramId,
        programTitle: program?.name || "Programa",
      };
      await setDoc(waRef, wa);

      // 2. Create a workoutPlan in the student's subcollection (week-based)
      const exercises = (program?.sessions || []).flatMap((s: any) =>
        (s.exercises || []).map((e: any) => ({
          exerciseName: e.exerciseName || "",
          sets: e.sets ?? 1,
          reps: e.reps ?? "",
          restTimeSeconds: e.restTimeSeconds ?? 0,
          notes: e.notes ?? "",
        }))
      );
      const wpRef = doc(collection(db, "personalTrainers", user.uid, "students", assignWeekStudentId, "workoutPlans"));
      await setDoc(wpRef, {
        title: program?.name || "Programa",
        studentId: assignWeekStudentId,
        personalTrainerId: user.uid,
        weekStart: selectedWeekStart,
        programId: assignWeekProgramId,
        exercises,
        createdAt: new Date().toISOString(),
      });

      setWeekAssignments((prev) => [...prev, wa]);
      setAssignWeekOpen(false);
      setAssignWeekStudentId("");
      setAssignWeekProgramId("");
      toast({ title: `Programa atribuído para a semana de ${selectedWeekLabel}` });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setIsAssigningWeek(false);
    }
  };

  const handleRemoveWeekAssignment = async (assignmentId: string) => {
    if (!db || !user) return;
    try {
      await deleteDoc(doc(db, "personalTrainers", user.uid, "weekProgramAssignments", assignmentId));
      setWeekAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
      toast({ title: "Atribuição removida" });
    } catch {
      toast({ title: "Erro", variant: "destructive" });
    }
  };

  const handleRemoveAllAssignmentsForStudentInWeek = async () => {
    if (!db || !user || !filterStudentId) return;
    const assignmentsForStudent = selectedWeekAssignments.filter((a) => a.studentId === filterStudentId);
    if (assignmentsForStudent.length === 0) {
      toast({ title: "Sem atribuições para remover" });
      return;
    }

    setIsRemovingStudentWeekAssignments(true);
    try {
      await Promise.all(
        assignmentsForStudent.map((a) =>
          deleteDoc(doc(db, "personalTrainers", user.uid, "weekProgramAssignments", a.id))
        )
      );

      const plansSnap = await getDocs(
        collection(db, "personalTrainers", user.uid, "students", filterStudentId, "workoutPlans")
      );
      const weeklyPlans = plansSnap.docs.filter(
        (d) => (d.data()?.weekStart as string | undefined) === selectedWeekStart
      );
      await Promise.all(
        weeklyPlans.map((d) =>
          deleteDoc(doc(db, "personalTrainers", user.uid, "students", filterStudentId, "workoutPlans", d.id))
        )
      );

      setWeekAssignments((prev) =>
        prev.filter((a) => !(a.studentId === filterStudentId && a.weekStart === selectedWeekStart))
      );
      toast({ title: "Todos os programas do aluno foram removidos" });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setIsRemovingStudentWeekAssignments(false);
    }
  };

  const handleRemoveAllAssignmentsForStudent = async () => {
    if (!db || !user || !filterStudentId) return;
    const confirmReset = window.confirm("Remover TODOS os programas atribuídos deste aluno?");
    if (!confirmReset) return;

    setIsRemovingStudentAllAssignments(true);
    try {
      const studentAssignmentIds = weekAssignments
        .filter((a) => a.studentId === filterStudentId)
        .map((a) => a.id);

      await Promise.all(
        studentAssignmentIds.map((id) =>
          deleteDoc(doc(db, "personalTrainers", user.uid, "weekProgramAssignments", id))
        )
      );

      const plansSnap = await getDocs(
        collection(db, "personalTrainers", user.uid, "students", filterStudentId, "workoutPlans")
      );
      await Promise.all(
        plansSnap.docs.map((d) =>
          deleteDoc(doc(db, "personalTrainers", user.uid, "students", filterStudentId, "workoutPlans", d.id))
        )
      );

      setWeekAssignments((prev) => prev.filter((a) => a.studentId !== filterStudentId));
      toast({ title: "Todos os programas atribuídos ao aluno foram removidos" });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setIsRemovingStudentAllAssignments(false);
    }
  };

  const isLoading = isUserLoading || isLoadingRoster || isLoadingSlots;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Navigation>
      <div className="space-y-6">
        <header>
          <h2 className="text-3xl font-bold font-headline">{t("assignmentCalendar")}</h2>
          <p className="text-muted-foreground">Agenda de sessões com blocos de horário</p>
        </header>

        {/* ── Assign to week dialog ─────────────────────────────────────────── */}
        <Dialog open={assignWeekOpen} onOpenChange={(o) => { setAssignWeekOpen(o); if (!o) setAssignWeekMode("single"); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Dumbbell className="h-4 w-4 text-primary" /> Atribuir Programa
              </DialogTitle>
              <DialogDescription>{selectedWeekLabel}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">

              {/* Mode toggle */}
              <div className="flex rounded-lg border overflow-hidden text-sm">
                <button
                  className={`flex-1 py-2 font-medium transition-colors ${assignWeekMode === "single" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"}`}
                  onClick={() => setAssignWeekMode("single")}>
                  Treino único
                </button>
                <button
                  className={`flex-1 py-2 font-medium transition-colors ${assignWeekMode === "weekly" ? "bg-primary text-primary-foreground" : "bg-muted/30 text-muted-foreground hover:bg-muted/50"}`}
                  onClick={() => setAssignWeekMode("weekly")}>
                  Programa semanal
                </button>
              </div>

              {/* Student selector (both modes) */}
              <div className="space-y-1.5">
                <Label>Aluno</Label>
                <Select value={assignWeekStudentId} onValueChange={setAssignWeekStudentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar aluno..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(rosterStudents || []).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {`${s.firstName || ""} ${s.lastName || ""}`.trim() || "Sem nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {assignWeekMode === "single" ? (
                /* Single base program */
                <div className="space-y-1.5">
                  <Label>Treino</Label>
                  <Select value={assignWeekProgramId} onValueChange={setAssignWeekProgramId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar treino..." />
                    </SelectTrigger>
                    <SelectContent>
                      {programs.filter((p) => p.programType !== "weekly").map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                /* Weekly cycle program */
                <div className="space-y-1.5">
                  <Label>Programa semanal</Label>
                  <Select value={assignWeeklyProgramId} onValueChange={setAssignWeeklyProgramId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar programa semanal..." />
                    </SelectTrigger>
                    <SelectContent>
                      {programs.filter((p) => p.programType === "weekly").map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} · {p.durationWeeks || "?"} sem.
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {assignWeeklyProgramId && (() => {
                    const wp = programs.find((p) => p.id === assignWeeklyProgramId);
                    const names: string[] = wp?.sourceProgramNames || [];
                    return names.length > 0 ? (
                      <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                        <p className="font-medium">Por semana:</p>
                        {names.map((n: string, i: number) => <p key={i} className="ml-2">↳ {n}</p>)}
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignWeekOpen(false)}>Cancelar</Button>
              {assignWeekMode === "single" ? (
                <Button
                  onClick={handleAddWeekAssignment}
                  disabled={!assignWeekStudentId || !assignWeekProgramId || isAssigningWeek}>
                  {isAssigningWeek && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Atribuir
                </Button>
              ) : (
                <Button
                  onClick={handleAssignWeeklyFromCal}
                  disabled={!assignWeekStudentId || !assignWeeklyProgramId || isAssigningWeeklyFromCal}>
                  {isAssigningWeeklyFromCal && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Atribuir ciclo
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Availability dialog ────────────────────────────────────────────── */}
        <Dialog open={availabilityOpen} onOpenChange={setAvailabilityOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Disponibilidade Semanal
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Aplicar horário a todos os dias
                </p>
                <div className="flex items-center gap-2">
                  <Input type="time" value={applyAllStart}
                    onChange={(e) => setApplyAllStart(e.target.value)} className="h-8 text-sm" />
                  <span className="text-muted-foreground text-sm shrink-0">até</span>
                  <Input type="time" value={applyAllEnd}
                    onChange={(e) => setApplyAllEnd(e.target.value)} className="h-8 text-sm" />
                  <Button size="sm" variant="outline" className="shrink-0 h-8" onClick={applyToAll}>
                    Aplicar
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                {DAY_KEYS.map((day) => {
                  const sched = draft[day] ?? { enabled: false, ranges: [] };
                  return (
                    <div key={day} className={`rounded-lg border transition-colors ${
                      sched.enabled ? "bg-primary/5 border-primary/20" : "bg-muted/20 border-border"}`}>
                      {/* Day header row */}
                      <div className="flex items-center gap-3 p-3">
                        <button onClick={() => toggleDraftDay(day)}
                          className={`flex items-center justify-center w-8 h-8 rounded-full border-2 shrink-0 transition-all ${
                            sched.enabled
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-border text-muted-foreground hover:border-primary/50"}`}>
                          {sched.enabled && <CheckCircle2 className="h-4 w-4" />}
                        </button>
                        <span className={`w-20 text-sm font-semibold shrink-0 ${sched.enabled ? "" : "text-muted-foreground"}`}>
                          {DAY_LABELS_PT[day]}
                        </span>
                        {sched.enabled ? (
                          <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs gap-1 text-primary"
                            onClick={() => addDraftRange(day)}>
                            + Horário
                          </Button>
                        ) : (
                          <span className="flex-1 text-sm text-muted-foreground italic">Indisponível</span>
                        )}
                      </div>

                      {/* Time range rows */}
                      {sched.enabled && sched.ranges.map((range, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-3 pb-2">
                          <div className="w-8 shrink-0" /> {/* spacer to align with toggle */}
                          <div className="w-20 shrink-0 text-xs text-muted-foreground text-right">
                            {sched.ranges.length > 1 ? `${idx + 1}.` : ""}
                          </div>
                          <Input type="time" value={range.startTime}
                            onChange={(e) => updateDraftRange(day, idx, "startTime", e.target.value)}
                            className="h-8 text-sm flex-1" />
                          <span className="text-muted-foreground text-xs shrink-0">–</span>
                          <Input type="time" value={range.endTime}
                            onChange={(e) => updateDraftRange(day, idx, "endTime", e.target.value)}
                            className="h-8 text-sm flex-1" />
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                            onClick={() => removeDraftRange(day, idx)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAvailabilityOpen(false)}>{t("cancel")}</Button>
              <Button onClick={handleSaveAvailability} disabled={isSavingAvailability}>
                {isSavingAvailability && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Manage slot dialog ─────────────────────────────────────────────── */}
        <Dialog open={!!managingSlot} onOpenChange={(open) => { if (!open) setManagingSlot(null); }}>
          <DialogContent className="max-w-md">
            {managingSlot && (() => {
              const slotStudents = managingSlot.slot?.students ?? [];
              const maxS = slotMaxOverride || defaultMaxStudents;
              const canAdd = slotStudents.length < maxS;
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      {managingSlot.startTime} – {addMin(managingSlot.startTime, slotDurationMin)}
                    </DialogTitle>
                    <DialogDescription>
                      {new Date(managingSlot.date + "T12:00:00").toLocaleDateString(undefined, {
                        weekday: "long", day: "numeric", month: "long", year: "numeric",
                      })}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-1 max-h-[70vh] overflow-y-auto pr-1">

                    {/* Capacity */}
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border">
                      <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Label className="text-sm shrink-0">Máx. alunos</Label>
                      <Input
                        type="number" min="1" max="20"
                        value={slotMaxOverride}
                        onChange={(e) => setSlotMaxOverride(Number(e.target.value) || defaultMaxStudents)}
                        className="w-16 h-7 text-sm text-center"
                      />
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={handleSaveSlotMax} disabled={!managingSlot.slot}>
                        Guardar
                      </Button>
                      <span className="ml-auto text-sm font-semibold tabular-nums">
                        <span className={slotStudents.length >= maxS ? "text-primary" : "text-muted-foreground"}>
                          {slotStudents.length}
                        </span>/{maxS}
                      </span>
                    </div>

                    {/* Enrolled students */}
                    {slotStudents.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Inscritos
                        </p>
                        {slotStudents.map((st) => {
                          const rosterSt = rosterStudents?.find((r) => r.id === st.studentId) as any;
                          const sessionsPerWeek = rosterSt?.sessionsPerWeek as number | undefined;
                          const weekCount = getWeeklyCount(st.studentId, new Date(managingSlot.date + "T12:00:00"));
                          const overLimit = sessionsPerWeek != null && weekCount > sessionsPerWeek;
                          return (
                            <div key={st.studentId}
                              className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{st.studentName}</p>
                                {st.workoutTitle && (
                                  <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                    <Dumbbell className="h-3 w-3 shrink-0" /> {st.workoutTitle}
                                  </p>
                                )}
                                {sessionsPerWeek != null && (
                                  <p className={`text-xs flex items-center gap-1 ${overLimit ? "text-destructive" : "text-muted-foreground"}`}>
                                    {overLimit && <AlertTriangle className="h-3 w-3 shrink-0" />}
                                    {weekCount}/{sessionsPerWeek}× esta semana
                                  </p>
                                )}
                              </div>
                              <Button size="icon" variant="ghost"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                                onClick={() => handleRemoveStudent(st.studentId)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add student — only shown when a student filter is active */}
                    {canAdd && isFilterActive && (
                      <div className="space-y-3 border-t pt-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Adicionar aluno
                        </p>
                        <Select value={addStudentId} onValueChange={setAddStudentId}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Selecionar aluno..." />
                          </SelectTrigger>
                          <SelectContent>
                            {(rosterStudents || [])
                              .filter((s: any) => !slotStudents.some((st) => st.studentId === s.id))
                              .map((s: any) => {
                                const name = `${s.firstName || ""} ${s.lastName || ""}`.trim() || "Unnamed";
                                const spw = s.sessionsPerWeek as number | undefined;
                                const wc = getWeeklyCount(s.id, new Date(managingSlot.date + "T12:00:00"));
                                return (
                                  <SelectItem key={s.id} value={s.id}>
                                    <span className="flex items-center gap-2">
                                      {name}
                                      {spw != null && (
                                        <span className={`text-xs ${wc >= spw ? "text-destructive" : "text-muted-foreground"}`}>
                                          ({wc}/{spw} esta sem.)
                                        </span>
                                      )}
                                    </span>
                                  </SelectItem>
                                );
                              })}
                          </SelectContent>
                        </Select>

                        {addStudentId && (
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">
                              Programa desta sessão
                            </Label>
                            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder={
                                  studentWorkoutPlans.length === 0
                                    ? "Sem plano para este dia"
                                    : "Selecionar plano..."
                                } />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Sem plano</SelectItem>
                                {studentWorkoutPlans.map((p: any) => (
                                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {selectedPlanId && (
                              <p className="text-xs text-accent flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Plano detetado automaticamente
                              </p>
                            )}
                          </div>
                        )}

                        <Button className="w-full gap-2" onClick={handleAddStudent}
                          disabled={!addStudentId || isAddingStudent}>
                          {isAddingStudent ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                          Inscrever no bloco
                        </Button>
                      </div>
                    )}

                    {!canAdd && slotStudents.length > 0 && (
                      <p className="text-xs text-center text-muted-foreground italic">
                        Bloco cheio ({maxS}/{maxS})
                      </p>
                    )}

                    {canAdd && !isFilterActive && (
                      <div className="border-t pt-3">
                        <p className="text-xs text-center text-muted-foreground italic flex items-center justify-center gap-1.5">
                          <Users className="h-3.5 w-3.5 shrink-0" />
                          Seleciona um aluno no filtro para inscrever neste bloco.
                        </p>
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setManagingSlot(null)}>Fechar</Button>
                  </DialogFooter>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* ── Main grid ──────────────────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-5 gap-6 items-start">

          {/* Left: Calendar + settings */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" /> Calendário
              </CardTitle>
              <CardDescription>Seleciona um dia para ver o horário</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <MonthCalendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => { if (d) setSelectedDate(d); }}
                modifiers={{ hasSlots: slotDates, unavailable: isUnavailableDay, hasProgram: assignedWeekDates }}
                modifiersClassNames={{
                  hasSlots:   "bg-accent/20 text-accent font-semibold rounded-full",
                  hasProgram: "bg-primary/10 font-medium",
                  unavailable: "opacity-40 line-through text-muted-foreground",
                }}
                className="w-full rounded-md border"
              />

              {/* Legend */}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-accent/30 border border-accent/40 inline-block" />
                  Com sessões
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-primary/20 inline-block" />
                  Semana com programa
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-muted border inline-block" />
                  Indisponível
                </span>
              </div>

              {/* Student filter */}
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Ver por aluno
                </p>
                <Select value={filterStudentId || "__all__"} onValueChange={(v) => setFilterStudentId(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm">
                    {isLoadingFilterStudent
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <SelectValue placeholder="Todos os alunos" />}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os alunos</SelectItem>
                    {(rosterStudents || []).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {`${s.firstName || ""} ${s.lastName || ""}`.trim() || "Sem nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isFilterActive && filterStudentSessionDuration && (
                  <p className="text-xs text-primary font-medium">
                    Sessões de {filterStudentSessionDuration} min · blocos {slotDurationMin} min
                  </p>
                )}
                {isFilterActive && !filterStudentSessionDuration && !isLoadingFilterStudent && (
                  <p className="text-xs text-muted-foreground italic">
                    Duração de sessão não definida na faturação
                  </p>
                )}
              </div>

              {/* Availability */}
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Disponibilidade
                  </p>
                  <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs" onClick={openAvailability}>
                    <Settings2 className="h-3.5 w-3.5" /> Editar
                  </Button>
                </div>
                <div className="space-y-1">
                  {DAY_KEYS.map((day) => {
                    const sched = availability[day];
                    const active = sched?.enabled && sched.ranges.length > 0;
                    return (
                      <div key={day} className={`text-xs ${active ? "" : "opacity-40"}`}>
                        <div className="flex items-start gap-1">
                          <span className="font-medium w-8 shrink-0 pt-0.5">{DAY_LABELS_SHORT[day]}</span>
                          {active ? (
                            <div className="flex flex-col gap-0.5">
                              {sched.ranges.map((r, i) => (
                                <span key={i} className="text-primary font-semibold">{r.startTime} – {r.endTime}</span>
                              ))}
                            </div>
                          ) : (
                            <span className="italic text-muted-foreground">Indisponível</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Block settings */}
              <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Definições dos blocos
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Duração</Label>
                    <Select value={String(slotDurationMin)} onValueChange={(v) => setSlotDurationMin(Number(v))}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[15, 30, 45, 60, 90].map((v) => (
                          <SelectItem key={v} value={String(v)}>{v} min</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Máx. alunos</Label>
                    <Input
                      type="number" min="1" max="20"
                      value={defaultMaxStudents}
                      onChange={(e) => setDefaultMaxStudents(Number(e.target.value) || 4)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <Button size="sm" variant="outline" className="w-full h-8 gap-1.5 text-xs"
                  onClick={handleSaveSettings} disabled={isSavingSettings}>
                  {isSavingSettings && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Guardar definições
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Right: Day schedule */}
          <Card className="lg:col-span-3">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="capitalize text-xl">
                    {selectedDate.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </CardTitle>
                  <CardDescription>
                    {isSelectedDayAvailable
                      ? isFilterActive
                        ? `${timeSlots.length} blocos de ${slotDurationMin} min · sessão ${effectiveSlotDuration} min`
                        : `${timeSlots.length} blocos · ${slotDurationMin} min cada · máx. ${defaultMaxStudents} alunos`
                      : "Dia indisponível"}
                  </CardDescription>
                </div>
                {isSelectedDayAvailable && selectedDaySchedule && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedDaySchedule.ranges.map((r, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {r.startTime} – {r.endTime}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : !isSelectedDayAvailable ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-4 text-muted-foreground">
                  <Clock className="h-12 w-12 opacity-20" />
                  <div>
                    <p className="font-medium">Dia sem disponibilidade</p>
                    <p className="text-sm">Define o horário para este dia nas definições de disponibilidade.</p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5 mt-2" onClick={openAvailability}>
                    <Settings2 className="h-3.5 w-3.5" /> Editar disponibilidade
                  </Button>
                </div>
              ) : isFilterActive ? (
                /* ── Student-centric view (when a student is selected) ── */
                <div className="space-y-1.5 max-h-[620px] overflow-y-auto pr-1">
                  {timeSlots.map((time) => {
                    const slot = slotsByTime.get(time);
                    const myEntry = slot?.students.find((s) => s.studentId === filterStudentId);
                    const isEnrolled = !!myEntry;
                    const isContinuation = isEnrolled && myEntry.sessionStart !== undefined && myEntry.sessionStart !== time;
                    const isSessionStart = isEnrolled && !isContinuation;

                    const startIdx = timeSlots.indexOf(time);
                    const blocksForSession = timeSlots.slice(startIdx, startIdx + slotsPerSession);
                    const hasEnoughBlocks = !isEnrolled && blocksForSession.length === slotsPerSession;
                    const allFree = hasEnoughBlocks && blocksForSession.every((t2) => {
                      const s2 = slotsByTime.get(t2);
                      return (s2?.students.length ?? 0) < (s2?.maxStudents ?? defaultMaxStudents);
                    });
                    const isFull = !isEnrolled && (!hasEnoughBlocks || !allFree);
                    const docKey = slotDocId(selectedDateStr, time);
                    const busy = isTogglingSlot === docKey ||
                      (isContinuation && isTogglingSlot === slotDocId(selectedDateStr, myEntry?.sessionStart ?? time));

                    return (
                      <div key={time} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                        isSessionStart  ? "border-primary/50 bg-primary/5"
                        : isContinuation ? "border-primary/20 bg-primary/5 ml-4"
                        : isFull         ? "border-border bg-muted/10 opacity-60"
                        : "border-border bg-transparent hover:bg-muted/20"
                      }`}>
                        {/* Time */}
                        <div className="flex flex-col items-end min-w-[58px] shrink-0">
                          <span className={`text-sm font-bold tabular-nums ${isContinuation ? "text-primary/50" : ""}`}>{time}</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">{addMin(time, slotDurationMin)}</span>
                        </div>
                        <div className={`w-0.5 h-8 rounded-full shrink-0 ${
                          isEnrolled ? "bg-primary" : isFull ? "bg-muted-foreground/30" : "bg-border"}`} />
                        {!isContinuation && (
                          <div className={`flex items-center gap-1 text-xs font-semibold shrink-0 tabular-nums ${
                            isEnrolled ? "text-primary" : "text-muted-foreground"}`}>
                            <Users className="h-3.5 w-3.5" />
                            {slot?.students.length ?? 0}/{slot?.maxStudents ?? defaultMaxStudents}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {isContinuation ? (
                            <span className="text-xs text-primary/60 italic">↳ continuação</span>
                          ) : isSessionStart ? (
                            <p className="text-xs font-semibold text-primary">
                              Inscrito · {slotsPerSession * slotDurationMin} min
                            </p>
                          ) : !hasEnoughBlocks ? (
                            <span className="text-xs text-muted-foreground">Bloco incompleto</span>
                          ) : isFull ? (
                            <span className="text-xs text-muted-foreground">Cheio</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {(slot?.maxStudents ?? defaultMaxStudents) - (slot?.students.length ?? 0)} lugar(es)
                            </span>
                          )}
                        </div>
                        {isSessionStart ? (
                          <Button size="sm" variant="outline"
                            className="shrink-0 h-8 gap-1.5 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                            onClick={() => handleCoachToggleStudent(time)} disabled={busy}>
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserMinus className="h-3.5 w-3.5" />}
                            Remover
                          </Button>
                        ) : isContinuation ? null : !isFull ? (
                          <Button size="sm"
                            className="shrink-0 h-8 gap-1.5 text-xs bg-primary/90"
                            onClick={() => handleCoachToggleStudent(time)} disabled={busy}>
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                            Inscrever
                          </Button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* ── General coach overview (no student filter) ── */
                <div className="space-y-1.5 max-h-[620px] overflow-y-auto pr-1">
                  {timeSlots.map((time) => {
                    const slot = slotsByTime.get(time);
                    const maxS = slot?.maxStudents ?? defaultMaxStudents;
                    const count = slot?.students.length ?? 0;
                    const isFull = count >= maxS;
                    const hasStudents = count > 0;

                    return (
                      <button
                        key={time}
                        onClick={() => openManageSlot(time)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all hover:shadow-sm ${
                          isFull
                            ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                            : hasStudents
                            ? "border-accent/30 bg-accent/5 hover:bg-accent/10"
                            : "border-border bg-transparent hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex flex-col items-end min-w-[58px] shrink-0">
                          <span className="text-sm font-bold tabular-nums">{time}</span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {addMin(time, slotDurationMin)}
                          </span>
                        </div>
                        <div className={`w-0.5 h-8 rounded-full shrink-0 ${
                          isFull ? "bg-primary" : hasStudents ? "bg-accent" : "bg-border"}`} />
                        <div className={`flex items-center gap-1 text-xs font-semibold shrink-0 tabular-nums ${
                          isFull ? "text-primary" : hasStudents ? "text-accent" : "text-muted-foreground"}`}>
                          <Users className="h-3.5 w-3.5" /> {count}/{maxS}
                        </div>
                        <div className="flex-1 min-w-0">
                          {hasStudents ? (
                            <div className="flex flex-wrap gap-1">
                              {slot!.students.map((st) => (
                                <span key={st.studentId}
                                  className="inline-flex items-center gap-1 text-xs bg-background border rounded-full px-2 py-0.5 max-w-[130px]">
                                  <span className="truncate">{st.studentName}</span>
                                  {st.workoutPlanId && <Dumbbell className="h-2.5 w-2.5 text-primary shrink-0" />}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">Vazio</span>
                          )}
                        </div>
                        <span className={`text-lg shrink-0 ${isFull ? "text-muted-foreground/40" : "text-primary/60 font-light"}`}>
                          {isFull ? "●" : "+"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Week Program Assignments ────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Dumbbell className="h-4 w-4 text-primary" /> Programas da Semana
                </CardTitle>
                <CardDescription>{selectedWeekLabel}</CardDescription>
              </div>
              <Button size="sm" className="gap-1.5 shrink-0"
                onClick={() => { setAssignWeekStudentId(isFilterActive ? filterStudentId : ""); setAssignWeekProgramId(""); setAssignWeekOpen(true); }}>
                <UserPlus className="h-4 w-4" /> Atribuir Programa
              </Button>
            </div>
            {isFilterActive && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 w-fit"
                  onClick={handleRemoveAllAssignmentsForStudentInWeek}
                  disabled={isRemovingStudentWeekAssignments || isRemovingStudentAllAssignments}
                >
                  {isRemovingStudentWeekAssignments ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Remover todos do aluno (semana)
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 w-fit"
                  onClick={handleRemoveAllAssignmentsForStudent}
                  disabled={isRemovingStudentAllAssignments || isRemovingStudentWeekAssignments}
                >
                  {isRemovingStudentAllAssignments ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Remover todos do aluno (tudo)
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {selectedWeekAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum programa atribuído para esta semana. Clica em "Atribuir Programa" para começar.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedWeekAssignments.map((a) => {
                  const prog = programs.find((p) => p.id === a.programId);
                  const exercises = (prog?.sessions || []).flatMap((s: any, si: number) =>
                    (s.exercises || []).map((e: any, ei: number) => ({ ...e, sessionIdx: si, exIdx: ei }))
                  );
                  const isExpanded = expandedAssignmentId === a.id;

                  return (
                    <div key={a.id} className="rounded-lg border overflow-hidden">
                      {/* Header row */}
                      <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/20">
                        <Dumbbell className="h-4 w-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{a.studentName}</p>
                          <p className="text-xs text-muted-foreground truncate">{a.programTitle}</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                          {exercises.length} exerc.
                        </span>
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                          onClick={() => setExpandedAssignmentId(isExpanded ? null : a.id)}>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                        <Button size="icon" variant="ghost"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                          onClick={() => handleRemoveWeekAssignment(a.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* Expanded exercise list */}
                      {isExpanded && (
                        <div className="divide-y">
                          {exercises.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              Sem exercícios neste programa.
                            </p>
                          ) : exercises.map((ex: any, flatIdx: number) => {
                            const noteKey = `${a.programId}-${ex.sessionIdx}-${ex.exIdx}`;
                            const isEditing = editingNoteKey === noteKey;
                            return (
                              <div key={flatIdx} className="px-4 py-3 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-semibold">{ex.exerciseName}</p>
                                  {!isEditing && (
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-primary shrink-0"
                                      onClick={() => {
                                        setEditingNoteKey(noteKey);
                                        setEditingNoteValue(ex.notes || "");
                                      }}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                                {isEditing ? (
                                  <div className="space-y-2">
                                    <Textarea
                                      value={editingNoteValue}
                                      onChange={(e) => setEditingNoteValue(e.target.value)}
                                      className="text-xs min-h-[80px]"
                                      placeholder="Séries, reps, descanso, instruções…"
                                    />
                                    <div className="flex gap-2">
                                      <Button size="sm" className="h-7 text-xs gap-1.5"
                                        onClick={() => handleSaveNote(a.programId, ex.sessionIdx, ex.exIdx, editingNoteValue)}
                                        disabled={isSavingNote}>
                                        {isSavingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                        Guardar
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-7 text-xs"
                                        onClick={() => setEditingNoteKey(null)}>
                                        Cancelar
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground whitespace-pre-line">
                                    {ex.notes || <span className="italic">Sem notas. Clica no lápis para adicionar.</span>}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Navigation>
  );
}
