"use client";

import { useCallback, useMemo } from "react";
import { CalendarDays, Clock, Loader2, Users } from "lucide-react";
import { Calendar as MonthCalendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  coachDayShowsSchedule,
  dayHasOpenBlocks,
  dayIsWeeklyAvailable,
  getEffectiveSessionDurationMin,
  isDateInVacation,
  openBlocksForDate,
  resolveDaySlotTimes,
  toDateStr,
  type Availability,
  type OpenAvailabilityBlock,
  type VacationPeriod,
} from "@/lib/trainer-availability";
import {
  datesWithActionablePendingAttendance,
  normalizeAttendance,
  type SessionAttendanceStatus,
} from "@/lib/session-attendance-streak";
import { getWeekStart, isDateBeforeToday, type SessionSlot } from "@/lib/session-slot-enrollment";

const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function addMin(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function getWeekDates(around: Date): string[] {
  const monday = getWeekStart(toDateStr(around));
  const base = new Date(`${monday}T12:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return toDateStr(d);
  });
}

function attendanceBadgeClass(att: SessionAttendanceStatus): string {
  if (att === "present") {
    return "border-emerald-600/50 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300";
  }
  if (att === "absent") {
    return "border-destructive/50 bg-destructive/10 text-destructive";
  }
  return "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300";
}

type Props = {
  studentName: string;
  studentPhotoUrl?: string;
  sessionsPerWeek: number;
  sessionDurationMin: number;
  slotDurationMin: number;
  defaultMaxStudents: number;
  availability: Availability;
  vacationPeriods: VacationPeriod[];
  openBlocks: OpenAvailabilityBlock[];
  sessionSlots: SessionSlot[];
  matchIds: string[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  cycleStartMonday: string;
  isLoading?: boolean;
};

export function StudentSchedulingCalendarBoard({
  studentName,
  studentPhotoUrl,
  sessionsPerWeek,
  sessionDurationMin,
  slotDurationMin,
  defaultMaxStudents,
  availability,
  vacationPeriods,
  openBlocks,
  sessionSlots,
  matchIds,
  selectedDate,
  onSelectDate,
  cycleStartMonday,
  isLoading,
}: Props) {
  const { t } = useI18n();
  const idSet = useMemo(() => new Set(matchIds.filter(Boolean)), [matchIds]);

  const selectedDateStr = toDateStr(selectedDate);
  const selectedDayKey = DAY_KEYS[selectedDate.getDay()];
  const selectedDaySchedule = availability[selectedDayKey];
  const selectedDayWeeklyAvailable = dayIsWeeklyAvailable(selectedDate, availability);
  const selectedDayOnVacation = isDateInVacation(selectedDateStr, vacationPeriods);
  const hasSlotsOnSelectedDay = sessionSlots.some((s) => s.date === selectedDateStr);
  const openBlocksOnSelectedDay = openBlocksForDate(selectedDateStr, openBlocks);

  const timeSlots = useMemo(
    () =>
      resolveDaySlotTimes({
        dateStr: selectedDateStr,
        weeklySched: selectedDaySchedule,
        openBlocks,
        slotDurationMin,
      }),
    [selectedDateStr, selectedDaySchedule, openBlocks, slotDurationMin]
  );

  const showDaySchedule = coachDayShowsSchedule({
    weeklyAvailable: selectedDayWeeklyAvailable,
    onVacation: selectedDayOnVacation,
    hasExistingSlots: hasSlotsOnSelectedDay,
    hasResolvableSlots: timeSlots.length > 0,
  });

  const slotsByTime = useMemo(() => {
    const map = new Map<string, SessionSlot>();
    sessionSlots.filter((s) => s.date === selectedDateStr).forEach((s) => map.set(s.startTime, s));
    return map;
  }, [sessionSlots, selectedDateStr]);

  const slotDates = useMemo(() => {
    const relevant = sessionSlots.filter((s) =>
      (s.students ?? []).some((st) => idSet.has(st.studentId))
    );
    return [...new Set(relevant.map((s) => s.date))].map((s) => new Date(`${s}T12:00:00`));
  }, [sessionSlots, idSet]);

  const pendingAttendanceDates = useMemo(() => {
    const days = new Set<string>();
    for (const id of matchIds) {
      for (const d of datesWithActionablePendingAttendance(sessionSlots, Date.now(), {
        filterStudentId: id,
      })) {
        days.add(d);
      }
    }
    return [...days].map((d) => new Date(`${d}T12:00:00`));
  }, [sessionSlots, matchIds]);

  const isOnVacationDay = useCallback(
    (date: Date) => isDateInVacation(toDateStr(date), vacationPeriods),
    [vacationPeriods]
  );

  const isUnavailableDay = useCallback(
    (date: Date) => {
      const dateStr = toDateStr(date);
      if (dayHasOpenBlocks(dateStr, openBlocks)) return false;
      if (isDateInVacation(dateStr, vacationPeriods)) return false;
      const sched = availability[DAY_KEYS[date.getDay()]];
      return !sched?.enabled || !sched.ranges.length;
    },
    [availability, vacationPeriods, openBlocks]
  );

  const rosterSessionDuration =
    sessionDurationMin > 0 ? sessionDurationMin : slotDurationMin;

  const getSessionDurationForTime = useCallback(
    () =>
      getEffectiveSessionDurationMin({
        rosterDurationMin: rosterSessionDuration,
        slotDurationMin,
      }),
    [rosterSessionDuration, slotDurationMin]
  );

  const getSlotsPerSessionForTime = useCallback(
    () => {
      const dur = getSessionDurationForTime();
      return Math.max(1, Math.ceil(dur / slotDurationMin));
    },
    [getSessionDurationForTime, slotDurationMin]
  );

  const weeklySessionCount = useMemo(() => {
    const weekDates = getWeekDates(selectedDate);
    const seen = new Set<string>();
    for (const slot of sessionSlots) {
      if (!weekDates.includes(slot.date)) continue;
      for (const st of slot.students ?? []) {
        if (!idSet.has(st.studentId)) continue;
        const sessionStart = st.sessionStart ?? slot.startTime;
        seen.add(`${slot.date}__${sessionStart}`);
      }
    }
    return seen.size;
  }, [sessionSlots, selectedDate, idSet]);

  const weeklyProgress =
    sessionsPerWeek > 0 ? Math.min(100, (weeklySessionCount / sessionsPerWeek) * 100) : 0;

  const cycleStartDisplay = new Date(`${cycleStartMonday}T12:00:00`).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const studentInitial =
    studentName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="grid lg:grid-cols-5 gap-6 items-start">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-primary" />
            {t("weeklySchedulingCalendarTitle")}
          </CardTitle>
          <CardDescription>{t("weeklySchedulingCalendarDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("weeklySchedulingViewingStudent")}
            </p>
            <div className="flex items-center gap-2 min-w-0">
              <Avatar className="h-8 w-8 shrink-0 border border-border/50">
                <AvatarImage src={studentPhotoUrl} alt="" />
                <AvatarFallback className="text-xs">{studentInitial}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium truncate">{studentName}</span>
            </div>
            {sessionsPerWeek > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground">
                    {t("weeklySchedulingClassesThisWeek")}
                  </span>
                  <span className="font-semibold">
                    {weeklySessionCount}/{sessionsPerWeek}
                  </span>
                </div>
                <Progress value={weeklyProgress} className="h-2" />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t("weeklySchedulingActiveWeek")} {cycleStartDisplay}
            </p>
            <p className="text-xs text-muted-foreground">{t("weeklySchedulingWeekPickerDesc")}</p>
          </div>

          <MonthCalendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => {
              if (!d) return;
              const ymd = toDateStr(d);
              if (isDateBeforeToday(ymd)) return;
              onSelectDate(d);
            }}
            disabled={(date) => isDateBeforeToday(toDateStr(date))}
            modifiers={{
              hasSlots: slotDates,
              unavailable: isUnavailableDay,
              onVacation: isOnVacationDay,
              pendingAttendance: pendingAttendanceDates,
            }}
            modifiersClassNames={{
              hasSlots: "bg-accent/20 text-accent font-semibold rounded-full",
              unavailable: "opacity-40 line-through text-muted-foreground",
              onVacation:
                "ring-2 ring-orange-400/80 dark:ring-orange-500 ring-offset-2 ring-offset-background rounded-full",
              pendingAttendance:
                "ring-2 ring-amber-500/90 dark:ring-amber-400 ring-offset-2 ring-offset-background relative z-[1] rounded-full",
            }}
            className="rounded-md border max-w-full"
          />

          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-accent/30 border border-accent/40 inline-block" />
              {t("weeklySchedulingLegendHasSessions")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border-2 border-amber-500 dark:border-amber-400 inline-block" />
              {t("weeklySchedulingLegendPendingAttendance")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-muted border inline-block" />
              {t("weeklySchedulingUnavailableLegend")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border-2 border-orange-400 dark:border-orange-500 inline-block" />
              {t("weeklySchedulingLegendVacation")}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="capitalize text-xl">
                {selectedDate.toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </CardTitle>
              <CardDescription>
                {showDaySchedule
                  ? t("weeklySchedulingDaySlotsDesc")
                      .replace("{n}", String(timeSlots.length))
                      .replace("{d}", String(slotDurationMin))
                      .replace("{s}", String(rosterSessionDuration))
                  : selectedDayOnVacation
                    ? t("weeklySchedulingDayVacation")
                    : t("weeklySchedulingDayUnavailable")}
              </CardDescription>
            </div>
            {showDaySchedule && (
              <div className="flex flex-wrap gap-1 mt-1">
                {selectedDayWeeklyAvailable &&
                  selectedDaySchedule?.ranges.map((r, i) => (
                    <Badge key={`w-${i}`} variant="outline" className="text-xs">
                      {r.startTime} – {r.endTime}
                    </Badge>
                  ))}
                {openBlocksOnSelectedDay.map((b) => (
                  <Badge
                    key={b.id}
                    variant="outline"
                    className="text-xs border-teal-500/50 text-teal-700 dark:text-teal-400"
                  >
                    {b.startTime} – {b.endTime}
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
          ) : !showDaySchedule ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4 text-muted-foreground">
              <Clock className="h-12 w-12 opacity-20" />
              <p className="font-medium">
                {selectedDayOnVacation
                  ? t("weeklySchedulingDayVacation")
                  : t("weeklySchedulingDayUnavailable")}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[620px] overflow-y-auto pr-1">
              {timeSlots.map((time) => {
                const slot = slotsByTime.get(time);
                const myEntry = slot?.students.find((s) => idSet.has(s.studentId));
                const isEnrolled = !!myEntry;
                const isContinuation =
                  isEnrolled &&
                  myEntry.sessionStart !== undefined &&
                  myEntry.sessionStart !== time;
                const isSessionStart = isEnrolled && !isContinuation;

                const startIdx = timeSlots.indexOf(time);
                const slotsNeeded = getSlotsPerSessionForTime();
                const sessionMin = getSessionDurationForTime();
                const blocksForSession = timeSlots.slice(startIdx, startIdx + slotsNeeded);
                const hasEnoughBlocks = !isEnrolled && blocksForSession.length === slotsNeeded;
                const allFree =
                  hasEnoughBlocks &&
                  blocksForSession.every((t2) => {
                    const s2 = slotsByTime.get(t2);
                    return (s2?.students.length ?? 0) < (s2?.maxStudents ?? defaultMaxStudents);
                  });
                const isFull = !isEnrolled && (!hasEnoughBlocks || !allFree);
                const att = normalizeAttendance(myEntry?.sessionAttendance);

                return (
                  <div
                    key={time}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all",
                      isSessionStart && "border-primary/50 bg-primary/5",
                      isContinuation && "border-primary/20 bg-primary/5 ml-4",
                      !isEnrolled && isFull && "border-border bg-muted/10 opacity-60",
                      !isEnrolled && !isFull && "border-border bg-transparent"
                    )}
                  >
                    <div className="flex flex-col items-end min-w-[58px] shrink-0">
                      <span
                        className={cn(
                          "text-sm font-bold tabular-nums",
                          isContinuation && "text-primary/50"
                        )}
                      >
                        {time}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {addMin(time, slotDurationMin)}
                      </span>
                    </div>
                    <div
                      className={cn(
                        "w-0.5 h-8 rounded-full shrink-0",
                        isEnrolled ? "bg-primary" : isFull ? "bg-muted-foreground/30" : "bg-border"
                      )}
                    />
                    {!isContinuation && (
                      <div
                        className={cn(
                          "flex items-center gap-1 text-xs font-semibold shrink-0 tabular-nums",
                          isEnrolled ? "text-primary" : "text-muted-foreground"
                        )}
                      >
                        <Users className="h-3.5 w-3.5" />
                        {slot?.students.length ?? 0}/{slot?.maxStudents ?? defaultMaxStudents}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {!isContinuation && (slot?.students?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                          {slot!.students.map((st) => {
                            const initial =
                              (st.studentName || "").trim().charAt(0).toUpperCase() || "?";
                            const isThisStudent = idSet.has(st.studentId);
                            return (
                              <span
                                key={st.studentId}
                                title={st.studentName}
                                className={cn(
                                  "relative inline-flex shrink-0",
                                  isThisStudent && "ring-2 ring-primary ring-offset-1 rounded-full"
                                )}
                              >
                                <Avatar className="h-7 w-7 border border-border/50">
                                  <AvatarImage src={st.studentPhotoUrl} alt="" />
                                  <AvatarFallback className="text-[9px]">{initial}</AvatarFallback>
                                </Avatar>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {isContinuation ? (
                        <span className="text-xs text-primary/60 italic">
                          {t("weeklySchedulingSlotContinuation")}
                        </span>
                      ) : isSessionStart ? (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-primary">
                            {t("weeklySchedulingSlotEnrolled").replace(
                              "{d}",
                              String(myEntry?.sessionDurationMin ?? sessionMin)
                            )}
                          </p>
                          <Badge variant="outline" className={cn("text-[10px]", attendanceBadgeClass(att))}>
                            {att === "present"
                              ? t("weeklySchedulingAttendancePresent")
                              : att === "absent"
                                ? t("weeklySchedulingAttendanceAbsent")
                                : t("weeklySchedulingAttendancePending")}
                          </Badge>
                        </div>
                      ) : !hasEnoughBlocks ? (
                        <span className="text-xs text-muted-foreground">
                          {t("weeklySchedulingSlotIncomplete")}
                        </span>
                      ) : isFull ? (
                        <span className="text-xs text-muted-foreground">
                          {t("weeklySchedulingSlotFull")}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t("weeklySchedulingSlotPlaces").replace(
                            "{n}",
                            String(
                              (slot?.maxStudents ?? defaultMaxStudents) -
                                (slot?.students.length ?? 0)
                            )
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
