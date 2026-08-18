"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { collection, doc, setDoc } from "firebase/firestore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StudentSchedulingCalendarBoard } from "@/components/student-weekly-scheduling/StudentSchedulingCalendarBoard";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, CalendarClock, AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronUp, Bookmark, Trash2 } from "lucide-react";
import { useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  normalizeVacationPeriods,
  normalizeOpenAvailabilityBlocks,
  resolveDaySlotTimes,
  weekdayKeyFromDate,
  type Availability,
} from "@/lib/trainer-availability";
import {
  bulkEnrollWeeklyCycle,
  countStudentLogicalSessions,
  getWeekStart,
  isDateBeforeToday,
  nextMondayFrom,
  removeAllStudentSessionEnrollments,
  dateForWeekdayInCycle,
  previewCycleDates,
  type WeeklySlotPattern,
  type SessionSlot,
  type WorkoutPlanRecord,
} from "@/lib/session-slot-enrollment";

// ── Constants ─────────────────────────────────────────────────────────────────

const WEEKDAYS = [
  { key: "monday", label: "Seg" },
  { key: "tuesday", label: "Ter" },
  { key: "wednesday", label: "Qua" },
  { key: "thursday", label: "Qui" },
  { key: "friday", label: "Sex" },
  { key: "saturday", label: "Sáb" },
  { key: "sunday", label: "Dom" },
];

const WEEKDAY_LABEL: Record<string, string> = WEEKDAYS.reduce((acc, d) => {
  acc[d.key] = d.label;
  return acc;
}, {} as Record<string, string>);

function migrateDaySchedule(raw: unknown): { enabled: boolean; ranges: { startTime: string; endTime: string }[] } {
  if (raw && Array.isArray((raw as any).ranges)) return raw as any;
  if (raw && (raw as any).startTime) {
    return {
      enabled: !!(raw as any).enabled,
      ranges: [{ startTime: (raw as any).startTime, endTime: (raw as any).endTime || "18:00" }],
    };
  }
  return { enabled: false, ranges: [] };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  trainerId: string;
  studentId: string;
  studentName: string;
  studentPhotoUrl?: string;
  sessionsPerWeek: number;
  sessionDurationMin: number;
  trainingAccessMode: string;
  studentMatchIds?: string[];
};

type WeeklySchedulingDefault = {
  pattern: WeeklySlotPattern;
  repeatWeeks?: number;
  cycleStartMonday?: string;
  updatedAt?: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function StudentWeeklySchedulingTab({
  trainerId,
  studentId,
  studentName,
  studentPhotoUrl,
  sessionsPerWeek,
  sessionDurationMin,
  trainingAccessMode,
  studentMatchIds,
}: Props) {
  const { t } = useI18n();
  const db = useFirestore();
  const { toast } = useToast();

  const [selectedCycleStartMonday, setSelectedCycleStartMonday] = useState(() =>
    nextMondayFrom(new Date())
  );
  const [calendarViewDate, setCalendarViewDate] = useState(() => {
    const monday = nextMondayFrom(new Date());
    return new Date(`${monday}T12:00:00`);
  });

  const [selectedPattern, setSelectedPattern] = useState<WeeklySlotPattern>([]);
  const [repeatWeeks, setRepeatWeeks] = useState(4);
  const [isApplying, setIsApplying] = useState(false);
  const [isDefaultOpen, setIsDefaultOpen] = useState(false);
  const [removeDialogStep, setRemoveDialogStep] = useState<null | 1 | 2>(null);
  const lastHydratedDefaultKey = useRef<string | null>(null);
  const [isRemovingAll, setIsRemovingAll] = useState(false);
  const [isSavingDefault, setIsSavingDefault] = useState(false);

  const matchIds = useMemo(() => {
    const ids = new Set<string>([studentId]);
    for (const id of studentMatchIds ?? []) {
      if (id) ids.add(String(id));
    }
    return [...ids];
  }, [studentId, studentMatchIds]);

  // ── Firestore refs ─────────────────────────────────────────────────────────

  const trainerRef = useMemoFirebase(
    () => (db && trainerId ? doc(db, "personalTrainers", trainerId) : null),
    [db, trainerId]
  );

  // Load all session slots for the full cycle range so we can show live occupancy
  const slotsRef = useMemoFirebase(
    () => (db && trainerId ? collection(db, "personalTrainers", trainerId, "sessionSlots") : null),
    [db, trainerId]
  );

  const plansRef = useMemoFirebase(
    () =>
      db && trainerId && studentId
        ? collection(db, "personalTrainers", trainerId, "students", studentId, "workoutPlans")
        : null,
    [db, trainerId, studentId]
  );
  const studentConfigRef = useMemoFirebase(
    () =>
      db && trainerId && studentId
        ? doc(db, "personalTrainers", trainerId, "students", studentId)
        : null,
    [db, trainerId, studentId]
  );

  const { data: trainerDoc } = useDoc(trainerRef);
  const { data: rawSlots, isLoading: slotsLoading } = useCollection<SessionSlot>(slotsRef);
  const { data: rawPlans } = useCollection<WorkoutPlanRecord>(plansRef);
  const { data: studentConfigDoc } = useDoc(studentConfigRef);

  // ── Derived trainer data ───────────────────────────────────────────────────

  const trainerData = trainerDoc as (Record<string, unknown> & { id: string }) | null;

  const { availability, vacationPeriods, openBlocks, slotDurationMin, defaultMaxStudents } = useMemo(() => {
    if (!trainerData) {
      return {
        availability: {} as Availability,
        vacationPeriods: [],
        openBlocks: [],
        slotDurationMin: 30,
        defaultMaxStudents: 1,
      };
    }
    const rawAvail = (trainerData.availability as Record<string, unknown>) ?? {};
    const av: Availability = {};
    for (const k of Object.keys(rawAvail)) {
      av[k] = migrateDaySchedule(rawAvail[k]);
    }
    return {
      availability: av,
      vacationPeriods: normalizeVacationPeriods(trainerData.vacationPeriods),
      openBlocks: normalizeOpenAvailabilityBlocks(trainerData.openAvailabilityBlocks),
      slotDurationMin: Number(trainerData.slotDurationMin) || 30,
      defaultMaxStudents: Number(trainerData.maxStudentsPerSlot) || 1,
    };
  }, [trainerData]);

  const sessionSlots: SessionSlot[] = useMemo(() => {
    if (!rawSlots) return [];
    return rawSlots.map((s: any) => ({
      id: s.id,
      date: s.date ?? "",
      startTime: s.startTime ?? "",
      maxStudents: s.maxStudents ?? defaultMaxStudents,
      students: Array.isArray(s.students) ? s.students : [],
    }));
  }, [rawSlots, defaultMaxStudents]);

  const workoutPlans: WorkoutPlanRecord[] = useMemo(() => {
    if (!rawPlans) return [];
    return rawPlans.map((p: any) => ({
      id: p.id,
      title: p.title,
      weekStart: p.weekStart,
      assignedAt: p.assignedAt,
      createdAt: p.createdAt,
    }));
  }, [rawPlans]);

  const savedDefault = useMemo(() => {
    const raw = (studentConfigDoc as Record<string, unknown> | null)?.weeklySchedulingDefault;
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    const pattern = Array.isArray(row.pattern)
      ? (row.pattern
          .map((it) => {
            if (!it || typeof it !== "object") return null;
            const day = String((it as Record<string, unknown>).weekday || "").trim().toLowerCase();
            const time = String((it as Record<string, unknown>).startTime || "").trim();
            if (!day || !time) return null;
            return { weekday: day, startTime: time };
          })
          .filter(Boolean) as WeeklySlotPattern)
      : [];
    if (pattern.length === 0) return null;
    const repeat = Math.max(1, Number(row.repeatWeeks) || 4);
    const start = String(row.cycleStartMonday || "").trim().slice(0, 10);
    return {
      pattern,
      repeatWeeks: repeat,
      cycleStartMonday: start || undefined,
      updatedAt: String(row.updatedAt || ""),
    } as WeeklySchedulingDefault;
  }, [studentConfigDoc]);

  useEffect(() => {
    if (!savedDefault) return;
    const hydrateKey =
      savedDefault.updatedAt || JSON.stringify(savedDefault.pattern);
    if (lastHydratedDefaultKey.current === hydrateKey) return;
    lastHydratedDefaultKey.current = hydrateKey;
    setSelectedPattern(savedDefault.pattern);
    setRepeatWeeks(savedDefault.repeatWeeks ?? 4);
    if (savedDefault.cycleStartMonday) {
      setSelectedCycleStartMonday(savedDefault.cycleStartMonday);
    }
  }, [savedDefault]);

  /** Pattern shown in grid: draft selection, or saved predefined when draft is empty. */
  const effectivePattern = useMemo(() => {
    if (selectedPattern.length > 0) return selectedPattern;
    return savedDefault?.pattern ?? [];
  }, [selectedPattern, savedDefault]);

  const removableSessionCount = useMemo(
    () => countStudentLogicalSessions(sessionSlots, matchIds, { excludePast: true }),
    [sessionSlots, matchIds]
  );

  // ── Build weekly grid for the selected start week ─────────────────────────

  const weekGrid = useMemo(() => {
    return WEEKDAYS.map(({ key, label }) => {
      const dateStr = dateForWeekdayInCycle(selectedCycleStartMonday, 0, key);
      const date = new Date(dateStr + "T12:00:00");
      const dayKey = weekdayKeyFromDate(date);
      const weeklySched = availability[dayKey];
      const slotTimes = resolveDaySlotTimes({
        dateStr,
        weeklySched,
        openBlocks,
        slotDurationMin,
        vacationPeriods,
      });

      const slotsForPick = slotTimes.map((time) => ({
        time,
        isSelected: effectivePattern.some((p) => p.weekday === key && p.startTime === time),
      }));

      return { key, label, dateStr, slots: slotsForPick, available: slotTimes.length > 0 };
    });
  }, [
    availability,
    selectedCycleStartMonday,
    vacationPeriods,
    openBlocks,
    slotDurationMin,
    effectivePattern,
  ]);

  const hasAnySlots = weekGrid.some((d) => d.slots.length > 0);

  const handleCalendarDateSelect = useCallback((date: Date) => {
    const pickedYmd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    if (isDateBeforeToday(pickedYmd)) return;
    setCalendarViewDate(date);
    const monday = getWeekStart(pickedYmd);
    if (monday !== selectedCycleStartMonday) {
      setSelectedCycleStartMonday(monday);
    }
  }, [selectedCycleStartMonday]);

  useEffect(() => {
    const d = new Date(`${selectedCycleStartMonday}T12:00:00`);
    if (Number.isFinite(d.getTime())) setCalendarViewDate(d);
  }, [selectedCycleStartMonday]);

  // ── Pattern selection ──────────────────────────────────────────────────────

  const toggleSlot = useCallback(
    (weekday: string, startTime: string) => {
      setSelectedPattern((prev) => {
        const base = prev.length > 0 ? prev : (savedDefault?.pattern ?? []);
        const exists = base.some((p) => p.weekday === weekday && p.startTime === startTime);
        if (exists) {
          return base.filter((p) => !(p.weekday === weekday && p.startTime === startTime));
        }
        if (sessionsPerWeek > 0 && base.length >= sessionsPerWeek) return base;
        return [...base, { weekday, startTime }];
      });
    },
    [sessionsPerWeek, savedDefault]
  );

  const isDraftPatternComplete =
    sessionsPerWeek > 0 && effectivePattern.length === sessionsPerWeek;

  const isPredefinedComplete =
    !!savedDefault && savedDefault.pattern.length === sessionsPerWeek;

  const predefinedPattern = savedDefault?.pattern ?? [];

  // ── Preview (predefined cycle to apply) ────────────────────────────────────

  const previewDates = useMemo(() => {
    if (!isPredefinedComplete || repeatWeeks < 1) return [];
    return previewCycleDates({
      cycleStartMonday: selectedCycleStartMonday,
      repeatWeeks,
      pattern: predefinedPattern,
    });
  }, [isPredefinedComplete, selectedCycleStartMonday, repeatWeeks, predefinedPattern]);

  const handleSavePredefined = async () => {
    if (!studentConfigRef || !isDraftPatternComplete) return;
    const patternToSave = selectedPattern.length > 0 ? selectedPattern : effectivePattern;
    setIsSavingDefault(true);
    try {
      await setDoc(
        studentConfigRef,
        {
          weeklySchedulingDefault: {
            pattern: patternToSave,
            repeatWeeks,
            cycleStartMonday: selectedCycleStartMonday,
            updatedAt: new Date().toISOString(),
          },
        },
        { merge: true }
      );
      setSelectedPattern(patternToSave);
      toast({ title: t("weeklySchedulingDefaultSaved") });
      setIsDefaultOpen(true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast({ title: "Erro", description: message, variant: "destructive" });
    } finally {
      setIsSavingDefault(false);
    }
  };

  // ── Apply ──────────────────────────────────────────────────────────────────

  const handleRemoveAllSessions = async () => {
    if (!db || removableSessionCount === 0) return;
    setIsRemovingAll(true);
    try {
      const result = await removeAllStudentSessionEnrollments({
        db,
        trainerId,
        studentIds: matchIds,
        sessionSlots,
      });
      setRemoveDialogStep(null);
      toast({
        title: t("weeklySchedulingRemoveAllSuccess"),
        description: t("weeklySchedulingRemoveAllSuccessDesc").replace(
          "{n}",
          String(result.removedSessions)
        ),
      });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setIsRemovingAll(false);
    }
  };

  const handleApply = async () => {
    if (!db || !isPredefinedComplete || repeatWeeks < 1) return;
    setIsApplying(true);
    try {
      const result = await bulkEnrollWeeklyCycle({
        db,
        trainerId,
        studentId,
        studentName,
        studentPhotoUrl,
        pattern: predefinedPattern,
        cycleStartMonday: selectedCycleStartMonday,
        repeatWeeks,
        sessionDurationMin,
        slotDurationMin,
        defaultMaxStudents,
        availability,
        vacationPeriods,
        openBlocks,
        existingSlots: sessionSlots,
        workoutPlans,
      });
      toast({
        title: t("weeklySchedulingSuccess"),
        description: t("weeklySchedulingSuccessDesc")
          .replace("{c}", String(result.created))
          .replace("{f}", String(result.skippedFull))
          .replace("{v}", String(result.skippedVacation))
          .replace("{a}", String(result.skippedAlreadyBooked))
          .replace("{i}", String(result.skippedInsufficientBlocks)),
      });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setIsApplying(false);
    }
  };

  // ── Guards ─────────────────────────────────────────────────────────────────

  if (trainingAccessMode === "open") {
    return (
      <Card>
        <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
          <Info className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("weeklySchedulingOpenAccess")}</p>
        </CardContent>
      </Card>
    );
  }

  if (sessionsPerWeek <= 0) {
    return (
      <Card>
        <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("weeklySchedulingNoPlan")}</p>
        </CardContent>
      </Card>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const planSummary = t("weeklySchedulingPlanSummary")
    .replace("{n}", String(sessionsPerWeek))
    .replace("{d}", String(sessionDurationMin));

  const savedDefaultSummary = savedDefault
    ? savedDefault.pattern
        .slice()
        .sort((a, b) => a.weekday.localeCompare(b.weekday) || a.startTime.localeCompare(b.startTime))
        .map((p) => `${WEEKDAY_LABEL[p.weekday] ?? p.weekday}: ${p.startTime}`)
        .join(" · ")
    : "";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <CalendarClock className="h-5 w-5 text-primary shrink-0" />
            <div>
              <CardTitle className="text-base">{t("weeklySchedulingTab")}</CardTitle>
              <CardDescription className="mt-0.5">{planSummary}</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <StudentSchedulingCalendarBoard
        studentName={studentName}
        studentPhotoUrl={studentPhotoUrl}
        sessionsPerWeek={sessionsPerWeek}
        sessionDurationMin={sessionDurationMin}
        slotDurationMin={slotDurationMin}
        defaultMaxStudents={defaultMaxStudents}
        availability={availability}
        vacationPeriods={vacationPeriods}
        openBlocks={openBlocks}
        sessionSlots={sessionSlots}
        matchIds={matchIds}
        selectedDate={calendarViewDate}
        onSelectDate={handleCalendarDateSelect}
        cycleStartMonday={selectedCycleStartMonday}
        isLoading={slotsLoading}
      />

      <Collapsible open={isDefaultOpen} onOpenChange={setIsDefaultOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between rounded-none px-6 py-4 h-auto"
            >
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <Bookmark className="h-4 w-4" />
                {t("weeklySchedulingDefaultTitle")}
                <Badge
                  variant={isDraftPatternComplete ? "default" : "secondary"}
                  className="text-[10px] font-normal"
                >
                  {effectivePattern.length}/{sessionsPerWeek}
                </Badge>
              </span>
              {isDefaultOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 pb-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {t("weeklySchedulingSelectBlocks").replace("{n}", String(sessionsPerWeek))}
                </p>
                <Badge variant={isDraftPatternComplete ? "default" : "secondary"} className="text-xs">
                  {t("weeklySchedulingBlocksSelected")
                    .replace("{s}", String(effectivePattern.length))
                    .replace("{n}", String(sessionsPerWeek))}
                </Badge>
              </div>

              {slotsLoading ? (
                <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  A carregar disponibilidade…
                </div>
              ) : !hasAnySlots ? (
                <p className="text-sm text-muted-foreground py-4">{t("weeklySchedulingNoAvailability")}</p>
              ) : (
                <div className="space-y-4">
                  {weekGrid.map(({ key, label, dateStr, slots, available }) => (
                    <div key={key}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground w-8 shrink-0">
                          {label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(dateStr + "T12:00:00").toLocaleDateString("pt-PT", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                        {!available && (
                          <span className="text-xs text-muted-foreground italic">
                            {t("weeklySchedulingDayUnavailable")}
                          </span>
                        )}
                      </div>
                      {available && (
                        <div className="flex flex-wrap gap-2 pl-10">
                          {slots.map(({ time, isSelected }) => {
                            const disabledDueToLimit =
                              !isSelected &&
                              sessionsPerWeek > 0 &&
                              effectivePattern.length >= sessionsPerWeek;
                            return (
                              <Button
                                key={time}
                                type="button"
                                variant={isSelected ? "default" : "outline"}
                                size="sm"
                                disabled={disabledDueToLimit}
                                onClick={() => toggleSlot(key, time)}
                                className={cn(
                                  "rounded-md px-3 py-1.5 text-xs font-medium h-auto",
                                  disabledDueToLimit && "bg-muted text-muted-foreground border-muted opacity-40"
                                )}
                              >
                                {time}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-4 space-y-3">
              <p className="text-xs text-muted-foreground">{t("weeklySchedulingDefaultSaveHint")}</p>
              {savedDefault ? (
                <>
                  <p className="text-sm font-medium text-foreground">{savedDefaultSummary}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("weeklySchedulingDefaultMeta")
                      .replace("{count}", String(savedDefault.pattern.length))
                      .replace("{weeks}", String(savedDefault.repeatWeeks ?? repeatWeeks))}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("weeklySchedulingDefaultEmpty")}</p>
              )}
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={!isDraftPatternComplete || isSavingDefault || isApplying}
                onClick={() => void handleSavePredefined()}
              >
                {isSavingDefault ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("weeklySchedulingDefaultSaving")}
                  </>
                ) : (
                  <>
                    <Bookmark className="h-4 w-4 mr-2" />
                    {t("weeklySchedulingDefaultSave")}
                  </>
                )}
              </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Repeat weeks + apply predefined cycle */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <p className="text-xs text-muted-foreground">{t("weeklySchedulingApplyPredefinedHint")}</p>
          <div className="flex items-center gap-4">
            <Label htmlFor="repeat-weeks" className="text-sm shrink-0">
              {t("weeklySchedulingRepeatWeeks")}
            </Label>
            <Input
              id="repeat-weeks"
              type="number"
              min={1}
              max={52}
              value={repeatWeeks}
              onChange={(e) => setRepeatWeeks(Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
              className="w-20 text-center"
            />
          </div>

          {/* Preview */}
          {isPredefinedComplete && previewDates.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t("weeklySchedulingPreviewTitle")} ({previewDates.length} sessões)
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                {previewDates.map(({ dateStr, startTime }, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {new Date(dateStr + "T12:00:00").toLocaleDateString("pt-PT", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    {startTime}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={handleApply}
              disabled={!isPredefinedComplete || isApplying || isRemovingAll || repeatWeeks < 1}
              className="w-full sm:flex-1"
            >
              {isApplying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("weeklySchedulingApplying")}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {t("weeklySchedulingApply")}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={removableSessionCount === 0 || isApplying || isRemovingAll}
              onClick={() => setRemoveDialogStep(1)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("weeklySchedulingRemoveAll")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={removeDialogStep === 1}
        onOpenChange={(open) => {
          if (!open) setRemoveDialogStep(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t("weeklySchedulingRemoveAllTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("weeklySchedulingRemoveAllStep1Desc").replace("{n}", String(removableSessionCount))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setRemoveDialogStep(2);
              }}
            >
              {t("weeklySchedulingRemoveAllContinue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removeDialogStep === 2}
        onOpenChange={(open) => {
          if (!open) setRemoveDialogStep(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {t("weeklySchedulingRemoveAllConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("weeklySchedulingRemoveAllStep2Desc").replace("{n}", String(removableSessionCount))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemovingAll}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isRemovingAll}
              onClick={(e) => {
                e.preventDefault();
                void handleRemoveAllSessions();
              }}
            >
              {isRemovingAll ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("weeklySchedulingRemoveAllProcessing")}
                </>
              ) : (
                t("weeklySchedulingRemoveAllConfirm")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
