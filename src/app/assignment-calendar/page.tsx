"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Calendar as MonthCalendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, getDocs, deleteDoc, setDoc, getDoc, doc, Timestamp } from "firebase/firestore";
import {
  CalendarDays, Clock, Settings2, Loader2, CheckCircle2, AlertTriangle,
  Trash2, Dumbbell, UserPlus, UserMinus, X, Users, ChevronDown, ChevronUp, ListOrdered,
  ExternalLink, ClipboardList, History, Pencil,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  blocksForLogicalSession,
  canCoachMarkSessionAttendanceAt,
  datesWithActionablePendingAttendance,
  normalizeAttendance,
  type SessionAttendanceStatus,
} from "@/lib/session-attendance-streak";
import { getStudentDisplayName } from "@/lib/student-display";
import {
  linkStudentProfileForTrainerAssignments,
  resolveWorkoutPlansStorageStudentId,
} from "@/components/AssignStudentSequenceForm";
import {
  getDefaultStudentSequenceProgram,
  type DefaultStudentSequenceProgram,
} from "@/lib/firestore/default-student-sequence";
import {
  applySequenceTemplateToStudent,
  listSequenceTemplatesFromPrograms,
} from "@/lib/firestore/sequence-templates";
import {
  buildAssignSequenceOptions,
  SequenceTemplatePicker,
} from "@/components/SequenceTemplatePicker";
import type { TrainingProgramDocument } from "@/lib/types";
import {
  EditWorkoutSessionDialog,
  type EditWorkoutSessionDialogSession,
} from "@/components/EditWorkoutSessionDialog";
import { clearAllTrainerWorkoutPlans } from "@/lib/firestore/clear-trainer-assignments";
import { cn } from "@/lib/utils";
import { slotStudentPlaceholderPhotoUrl } from "@/lib/slot-student-photo";

// ── Types ──────────────────────────────────────────────────────────────────────

type TimeRange = { startTime: string; endTime: string };
type DaySchedule = { enabled: boolean; ranges: TimeRange[] };
type Availability = Record<string, DaySchedule>;

type SlotStudent = {
  studentId: string;
  studentName: string;
  /** Denormalized roster photo when booking (student app peers cannot list roster). */
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

type DayBookedStudent = {
  studentId: string;
  studentName: string;
  workoutTitle?: string;
  workoutPlanId?: string;
  unlinkedSlotTitle?: string;
  firestoreStudentId: string;
  times: string[];
  /** Session duration for the booked slot (used for UI hints like 30/60 min). */
  sessionDurationMin?: number;
  /** Aggregated coach attendance across same-day slot rows for this student. */
  sessionAttendance?: SessionAttendanceStatus;
};

type CalendarRosterBucket = "noPlan" | "active" | "completed";

function mergeDayBookedAttendance(
  existing: SessionAttendanceStatus | undefined,
  incoming: SessionAttendanceStatus | undefined
): SessionAttendanceStatus {
  const a = normalizeAttendance(existing);
  const b = normalizeAttendance(incoming);
  if (a === "absent" || b === "absent") return "absent";
  if (a === "pending" || b === "pending") return "pending";
  return "present";
}

function attendanceAvatarClassName(att: SessionAttendanceStatus): string {
  switch (att) {
    case "present":
      return cn(
        "h-7 w-7 border-4 border-emerald-700 dark:border-emerald-400",
        "ring-[3px] ring-emerald-600 dark:ring-emerald-500 ring-offset-2 ring-offset-background"
      );
    case "absent":
      return cn(
        "h-7 w-7 border-4 border-destructive",
        "ring-[3px] ring-destructive ring-offset-2 ring-offset-background"
      );
    default:
      return cn(
        "h-7 w-7 border-4 border-amber-600 dark:border-amber-500",
        "ring-[3px] ring-amber-500 dark:ring-amber-400 ring-offset-2 ring-offset-background"
      );
  }
}

function attendanceBadgeProps(
  att: SessionAttendanceStatus,
  compact: boolean
): { variant: "destructive" | "outline"; className: string } {
  const size = compact ? "text-[9px] h-4 px-1.5" : "text-[10px] h-5 px-2";
  if (att === "present") {
    return {
      variant: "outline",
      className: cn(
        "border-2 border-emerald-900/50 dark:border-emerald-200/70 bg-emerald-600 text-white shadow-none hover:bg-emerald-700 dark:hover:bg-emerald-500",
        size
      ),
    };
  }
  if (att === "absent") {
    return {
      variant: "destructive",
      className: cn("border-2 border-destructive-foreground/30 shadow-none hover:bg-destructive/90", size),
    };
  }
  return {
    variant: "outline",
    className: cn(
      "border-2 border-amber-800 dark:border-amber-300 bg-amber-500 text-amber-950 shadow-none hover:bg-amber-600 dark:bg-amber-600 dark:text-white dark:hover:bg-amber-500",
      size
    ),
  };
}

function attendanceRosterRowAccentClassName(att: SessionAttendanceStatus): string {
  switch (normalizeAttendance(att)) {
    case "present":
      return "border-l-4 border-l-emerald-600 dark:border-l-emerald-500";
    case "absent":
      return "border-l-4 border-l-destructive";
    default:
      return "border-l-4 border-l-amber-500 dark:border-l-amber-400";
  }
}

type RosterPlanDetailEntry =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      title: string;
      exercises: Array<{
        exerciseName?: string;
        name?: string;
        notes?: string;
        sets?: number;
        reps?: string;
      }>;
    };

type RosterSessionLogExercise = { name: string; setLines: string[] };

type RosterSessionLogEntry =
  | { status: "loading" }
  | { status: "error" }
  | { status: "empty" }
  | {
      status: "ready";
      title: string;
      exercises: RosterSessionLogExercise[];
      /** Firestore `workoutPlanId` on the session doc (may differ from expand key when showing last workout of day). */
      sessionWorkoutPlanId?: string;
      sessionId: string;
      /** Firestore `exercises` field for EditWorkoutSessionDialog. */
      rawExercises: unknown;
    };

/** Normalizes `workoutSessions` exercise rows for the completed-roster expand panel. */
function buildSessionLogExercisesFromDoc(data: Record<string, unknown>): RosterSessionLogExercise[] {
  const raw = Array.isArray(data.exercises) ? (data.exercises as unknown[]) : [];
  return raw.map((ex, idx) => {
    const row = ex as Record<string, unknown>;
    const name =
      String(row.exerciseName || row.name || "").trim() ||
      `Exercise ${idx + 1}`;
    const sets = row.sets;
    if (Array.isArray(sets) && sets.length > 0) {
      const setLines = sets.map((s, si) => {
        const sr = s as Record<string, unknown>;
        const w = sr.weight != null && sr.weight !== "" ? String(sr.weight) : "—";
        const r = sr.reps != null && sr.reps !== "" ? String(sr.reps) : "—";
        return `Set ${si + 1}: ${w}kg × ${r}`;
      });
      return { name, setLines };
    }
    const nSets = typeof sets === "number" ? sets : Number(sets);
    const repsStr = String(row.reps ?? "").trim() || "—";
    const wRaw = row.weight;
    const hasW = wRaw != null && String(wRaw).trim() !== "";
    const wStr = hasW ? String(wRaw) : "";
    const detail = wStr ? `${wStr}kg × ${repsStr}` : repsStr;
    const head =
      Number.isFinite(nSets) && nSets > 0 ? `${nSets} sets · ${detail}` : detail;
    return { name, setLines: [head] };
  });
}

type CalendarDayRosterRowProps = {
  row: DayBookedStudent;
  bucket: CalendarRosterBucket;
  rosterStudentsSorted: Array<{ id: string } & Record<string, unknown>>;
  unlockedProgramByFirestoreId: Record<string, { id: string; title: string }>;
  rosterPlanMetaByKey: Record<string, { title: string; isCompleted: boolean }>;
  sessionDayInferredPlanIdByFid: Record<string, string>;
  /** `${fid}__${expandPlanId}` → same-day session title (session-log picker; active fallbacks). */
  sessionRosterSessionTitleByExpandKey: Record<string, string>;
  /** `fid` → newest same-day session `workoutTitle` (by `completedAt`); completed roster subtitle. */
  sessionLatestSameDayWorkoutTitleByFid: Record<string, string>;
  weekProgramSummaryByStudentId: Map<string, string>;
  expandedRosterPlanKey: string | null;
  setExpandedRosterPlanKey: Dispatch<SetStateAction<string | null>>;
  rosterPlanDetailByKey: Record<string, RosterPlanDetailEntry>;
  rosterSessionLogByKey: Record<string, RosterSessionLogEntry>;
  onRequestEditRosterSession?: (payload: {
    storageFid: string;
    session: EditWorkoutSessionDialogSession;
  }) => void;
  t: (key: TranslationKey) => string;
};

function CalendarDayRosterRow({
  row,
  bucket,
  rosterStudentsSorted,
  unlockedProgramByFirestoreId,
  rosterPlanMetaByKey,
  sessionDayInferredPlanIdByFid,
  sessionRosterSessionTitleByExpandKey,
  sessionLatestSameDayWorkoutTitleByFid,
  weekProgramSummaryByStudentId,
  expandedRosterPlanKey,
  setExpandedRosterPlanKey,
  rosterPlanDetailByKey,
  rosterSessionLogByKey,
  onRequestEditRosterSession,
  t,
}: CalendarDayRosterRowProps) {
  const fid = row.firestoreStudentId || resolveFirestoreStudentId(rosterStudentsSorted, row.studentId);
  const hasDayLatestWorkoutTitle =
    bucket === "completed" &&
    Object.prototype.hasOwnProperty.call(sessionLatestSameDayWorkoutTitleByFid, fid);
  const completedDayLatestTitle =
    hasDayLatestWorkoutTitle
      ? String(sessionLatestSameDayWorkoutTitleByFid[fid] ?? "").trim() || t("calendarRosterUntitledSession")
      : "";
  const slotPlanId = String(row.workoutPlanId || "").trim();
  const unlockedPick =
    unlockedProgramByFirestoreId[fid] ||
    (fid !== row.studentId ? unlockedProgramByFirestoreId[row.studentId] : undefined);
  const unlockedId = String(unlockedPick?.id || "").trim();
  const inferredIdRaw =
    bucket === "completed" ? String(sessionDayInferredPlanIdByFid[fid] || "").trim() : "";
  const inferredMetaKey = inferredIdRaw ? `${fid}__${inferredIdRaw}` : "";
  const hasInferredMeta =
    !!inferredMetaKey && Object.prototype.hasOwnProperty.call(rosterPlanMetaByKey, inferredMetaKey);
  const inferredMeta = inferredMetaKey ? rosterPlanMetaByKey[inferredMetaKey] : undefined;
  const displayPlanId = slotPlanId || unlockedId || inferredIdRaw;
  const unlockedTitle = unlockedPick?.title || "";
  const weekProgramLine =
    weekProgramSummaryByStudentId.get(fid) ||
    (fid !== row.studentId ? weekProgramSummaryByStudentId.get(row.studentId) : undefined) ||
    "";
  const unlinked = String(row.unlinkedSlotTitle || "").trim();
  const fallbackLine = unlockedTitle || weekProgramLine || unlinked;

  const slotMetaKey = slotPlanId ? `${fid}__${slotPlanId}` : "";
  const unlockedMetaKey = unlockedId ? `${fid}__${unlockedId}` : "";
  const hasSlotMeta = !!slotMetaKey && Object.prototype.hasOwnProperty.call(rosterPlanMetaByKey, slotMetaKey);
  const hasUnlockedMeta =
    !!unlockedMetaKey && Object.prototype.hasOwnProperty.call(rosterPlanMetaByKey, unlockedMetaKey);
  const slotMeta = slotMetaKey ? rosterPlanMetaByKey[slotMetaKey] : undefined;
  const unlockedMeta = unlockedMetaKey ? rosterPlanMetaByKey[unlockedMetaKey] : undefined;

  const expandPlanId =
    bucket === "completed" && slotPlanId && slotMeta?.isCompleted ? slotPlanId : displayPlanId;
  const rosterExpandKey = expandPlanId ? `${fid}__${expandPlanId}` : "";
  const prefetchedSessionTitle =
    rosterExpandKey ? String(sessionRosterSessionTitleByExpandKey[rosterExpandKey] || "").trim() : "";
  const sessionLogForSubtitle = rosterExpandKey ? rosterSessionLogByKey[rosterExpandKey] : undefined;
  const sessionLogTitleForSubtitle =
    sessionLogForSubtitle?.status === "ready"
      ? String(sessionLogForSubtitle.title || "").trim() || t("calendarRosterUntitledSession")
      : "";

  let programLabel: string;
  if (!displayPlanId) {
    if (bucket === "completed") {
      if (completedDayLatestTitle) {
        programLabel = completedDayLatestTitle;
      } else if (!slotPlanId && !unlockedId) {
        programLabel = t("calendarRosterCompletedDayNoPlanId");
      } else {
        programLabel = fallbackLine || t("calendarDayNoProgramLinked");
      }
    } else {
      programLabel = fallbackLine || t("calendarDayNoProgramLinked");
    }
  } else if (slotPlanId) {
    if (!hasSlotMeta) {
      programLabel = t("calendarDayPlanResolving");
    } else {
      const slotTitle = String(slotMeta?.title || "").trim();
      if (bucket === "completed") {
        if (completedDayLatestTitle) {
          programLabel = completedDayLatestTitle;
        } else if (sessionLogTitleForSubtitle) {
          programLabel = sessionLogTitleForSubtitle;
        } else if (prefetchedSessionTitle) {
          programLabel = prefetchedSessionTitle;
        } else if (slotTitle) {
          programLabel = slotTitle;
        } else {
          programLabel = t("calendarRosterSlotPlanNotOnProfile");
        }
      } else if (slotTitle) {
        programLabel = slotTitle;
      } else if (sessionLogTitleForSubtitle) {
        programLabel = sessionLogTitleForSubtitle;
      } else if (prefetchedSessionTitle) {
        programLabel = prefetchedSessionTitle;
      } else {
        programLabel = t("calendarRosterSlotPlanNotOnProfile");
      }
    }
  } else if (unlockedId) {
    if (!hasUnlockedMeta) {
      programLabel = fallbackLine || t("calendarDayPlanResolving");
    } else {
      const unlockedResolved = String(unlockedMeta?.title || "").trim();
      if (bucket === "completed" && completedDayLatestTitle) {
        programLabel = completedDayLatestTitle;
      } else {
        programLabel = unlockedResolved || fallbackLine || t("calendarDayNoProgramLinked");
      }
    }
  } else {
    if (!hasInferredMeta) {
      programLabel = fallbackLine || t("calendarDayPlanResolving");
    } else {
      const inferredResolved = String(inferredMeta?.title || "").trim();
      if (bucket === "completed") {
        programLabel =
          completedDayLatestTitle ||
          sessionLogTitleForSubtitle ||
          prefetchedSessionTitle ||
          inferredResolved ||
          fallbackLine ||
          t("calendarRosterSlotPlanNotOnProfile");
      } else {
        programLabel =
          inferredResolved ||
          sessionLogTitleForSubtitle ||
          prefetchedSessionTitle ||
          fallbackLine ||
          t("calendarRosterSlotPlanNotOnProfile");
      }
    }
  }

  const nextProgramLine =
    slotPlanId &&
    slotMeta?.isCompleted &&
    unlockedId &&
    unlockedId !== slotPlanId &&
    (String(unlockedMeta?.title || "").trim() || unlockedTitle)
      ? t("calendarRosterNextProgramHint").replace(
          "{title}",
          String(unlockedMeta?.title || "").trim() || unlockedTitle
        )
      : "";

  const rosterMatch = rosterStudentsSorted.find(
    (s) => s.id === row.studentId || String((s as Record<string, unknown>).userId || "") === row.studentId
  ) as (Record<string, unknown> & { id: string }) | undefined;
  const studentProfileId = rosterMatch?.id ?? row.studentId;
  const resolvedTitleForContext = slotPlanId
    ? hasSlotMeta
      ? String(slotMeta?.title || "").trim()
      : ""
    : unlockedId
      ? hasUnlockedMeta
        ? String(unlockedMeta?.title || "").trim()
        : ""
      : inferredIdRaw
        ? hasInferredMeta
          ? String(inferredMeta?.title || "").trim()
          : ""
        : "";
  const hasProgramContext =
    Boolean(displayPlanId) &&
    (Boolean(resolvedTitleForContext) ||
      Boolean(fallbackLine) ||
      (Boolean(slotPlanId) && !hasSlotMeta) ||
      (Boolean(unlockedId) && !hasUnlockedMeta && !slotPlanId) ||
      (Boolean(inferredIdRaw) && !hasInferredMeta && !slotPlanId && !unlockedId));
  const defaultProfileHref =
    hasProgramContext &&
    (resolvedTitleForContext ||
      fallbackLine ||
      (Boolean(slotPlanId) && !hasSlotMeta) ||
      (Boolean(unlockedId) && !hasUnlockedMeta && !slotPlanId) ||
      (Boolean(inferredIdRaw) && !hasInferredMeta && !slotPlanId && !unlockedId))
      ? `/students/${studentProfileId}`
      : `/students/${studentProfileId}?tab=management`;
  const profileHref =
    bucket === "completed" ? `/students/${studentProfileId}?tab=workoutHistory` : defaultProfileHref;
  const displayName = rosterMatch ? getStudentDisplayName(rosterMatch, row.studentName) : row.studentName;
  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  const avatarSrc =
    (rosterMatch?.photoUrl as string) ||
    `https://picsum.photos/seed/${encodeURIComponent(rosterMatch?.id ?? row.studentId)}/100/100`;
  const isRosterExpanded = !!rosterExpandKey && expandedRosterPlanKey === rosterExpandKey;
  const rosterDetail = rosterExpandKey ? rosterPlanDetailByKey[rosterExpandKey] : undefined;
  const sessionLog = sessionLogForSubtitle;

  const coachSessionHrefForPlan = (plan: string) => {
    const pid = String(plan || "").trim();
    if (!pid) return "";
    return `/students/${fid}/workouts/${encodeURIComponent(pid)}/coach-session`;
  };

  const rosterSessionDur = Number((rosterMatch as Record<string, unknown>)?.sessionDurationMin);
  const durMin =
    Number.isFinite(rosterSessionDur) && rosterSessionDur > 0
      ? rosterSessionDur
      : row.sessionDurationMin;
  const sessionDurationSuffix =
    durMin != null && Number.isFinite(durMin) && durMin > 0
      ? ` ${t("calendarRosterSessionDurationSuffix").replace("{minutes}", String(Math.round(durMin)))}`
      : "";

  return (
    <Collapsible
      open={isRosterExpanded}
      onOpenChange={(next) => {
        if (!expandPlanId || !rosterExpandKey) return;
        setExpandedRosterPlanKey(next ? rosterExpandKey : null);
      }}
      className={cn(
        "rounded-lg border bg-background transition-colors hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background",
        attendanceRosterRowAccentClassName(normalizeAttendance(row.sessionAttendance))
      )}
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        <Link
          href={profileHref}
          title={displayName}
          aria-label={`${t("viewStudentProfile")}: ${displayName}`}
          className="flex items-start gap-3 min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
        >
          <Avatar className="h-9 w-9 shrink-0 border border-border/50">
            <AvatarImage src={avatarSrc} alt="" />
            <AvatarFallback className="text-xs">{initial}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
              <Dumbbell className="h-3 w-3 shrink-0" />
              {programLabel}
            </p>
            {nextProgramLine ? (
              <p className="text-xs text-muted-foreground/90 mt-0.5 leading-snug">{nextProgramLine}</p>
            ) : null}
            {row.times.length > 0 ? (
              <p className="text-xs text-muted-foreground/80 mt-0.5 tabular-nums">
                {t("calendarDayBookedTimes")}: {row.times.join(", ")}
                {sessionDurationSuffix}
              </p>
            ) : null}
          </div>
        </Link>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={!expandPlanId}
            title={t("calendarRosterExpandDetails")}
            aria-expanded={isRosterExpanded}
          >
            {isRosterExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent className="border-t bg-muted/10 px-3 pb-3 pt-2 space-y-3">
        {!expandPlanId ? (
          <p className="text-xs text-muted-foreground">{t("calendarRosterNoEffectivePlan")}</p>
        ) : bucket === "completed" ? (
          !sessionLog || sessionLog.status === "loading" ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-[60%]" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : sessionLog.status === "error" ? (
            <>
              <p className="text-xs text-destructive">{t("calendarRosterPlanDetailError")}</p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-1">
                <Button size="sm" className="gap-2 w-full sm:w-auto" asChild>
                  <Link href={coachSessionHrefForPlan(expandPlanId)}>
                    <ClipboardList className="h-4 w-4 shrink-0" />
                    {t("calendarRosterLogOrEditSession")}
                  </Link>
                </Button>
                <Button variant="secondary" size="sm" className="gap-2 w-full sm:w-auto" asChild>
                  <Link
                    href={`/students/${studentProfileId}?tab=management&expandPlan=${encodeURIComponent(expandPlanId)}`}
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    {t("calendarRosterOpenManagement")}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto" asChild>
                  <Link href={`/students/${studentProfileId}?tab=workoutHistory`}>
                    <History className="h-4 w-4 shrink-0" />
                    {t("calendarRosterViewWorkoutHistory")}
                  </Link>
                </Button>
              </div>
            </>
          ) : sessionLog.status === "ready" ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t("calendarRosterSessionLogTitle")}
                    <span className="font-medium text-foreground normal-case">
                      {" "}
                      — {sessionLog.title.trim() ? sessionLog.title : t("calendarRosterUntitledSession")}
                    </span>
                  </p>
                </div>
                {onRequestEditRosterSession ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    title={t("editSession")}
                    aria-label={t("editSession")}
                    onClick={() =>
                      onRequestEditRosterSession({
                        storageFid: fid,
                        session: {
                          id: sessionLog.sessionId,
                          workoutTitle: sessionLog.title,
                          exercises: sessionLog.rawExercises,
                        },
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
              {sessionLog.exercises.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("calendarRosterPlanDetailEmpty")}</p>
              ) : (
                <ul className="space-y-2">
                  {sessionLog.exercises.map((exercise, index) => (
                    <li
                      key={`${exercise.name}-${index}`}
                      className="rounded-md border bg-background p-2 text-sm"
                    >
                      <p className="font-medium">{exercise.name}</p>
                      <div className="text-xs text-muted-foreground mt-1 space-y-0.5 tabular-nums leading-relaxed">
                        {exercise.setLines.map((line, li) => (
                          <p key={li}>{line}</p>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-1">
                <Button variant="secondary" size="sm" className="gap-2 w-full sm:w-auto" asChild>
                  <Link
                    href={`/students/${studentProfileId}?tab=management&expandPlan=${encodeURIComponent(expandPlanId)}`}
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    {t("calendarRosterOpenManagement")}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto" asChild>
                  <Link href={`/students/${studentProfileId}?tab=workoutHistory`}>
                    <History className="h-4 w-4 shrink-0" />
                    {t("calendarRosterViewWorkoutHistory")}
                  </Link>
                </Button>
              </div>
            </>
          ) : sessionLog.status === "empty" ? (
            <>
              <p className="text-xs text-muted-foreground mb-2">{t("calendarRosterSessionLogEmpty")}</p>
              <p className="text-xs text-muted-foreground/90 mb-2 leading-snug">
                {t("calendarRosterSessionLogCoachHint")}
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-1">
                <Button size="sm" className="gap-2 w-full sm:w-auto" asChild>
                  <Link href={coachSessionHrefForPlan(expandPlanId)}>
                    <ClipboardList className="h-4 w-4 shrink-0" />
                    {t("calendarRosterLogOrEditSession")}
                  </Link>
                </Button>
                <Button variant="secondary" size="sm" className="gap-2 w-full sm:w-auto" asChild>
                  <Link
                    href={`/students/${studentProfileId}?tab=management&expandPlan=${encodeURIComponent(expandPlanId)}`}
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    {t("calendarRosterOpenManagement")}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto" asChild>
                  <Link href={`/students/${studentProfileId}?tab=workoutHistory`}>
                    <History className="h-4 w-4 shrink-0" />
                    {t("calendarRosterViewWorkoutHistory")}
                  </Link>
                </Button>
              </div>
            </>
          ) : null
        ) : rosterDetail?.status === "loading" || !rosterDetail ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-[60%]" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rosterDetail.status === "error" ? (
          <p className="text-xs text-destructive">{t("calendarRosterPlanDetailError")}</p>
        ) : (
          <>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {t("calendarRosterPlanDetailsTitle")}
              {rosterDetail.title ? (
                <span className="font-medium text-foreground normal-case"> — {rosterDetail.title}</span>
              ) : null}
            </p>
            {rosterDetail.exercises.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("calendarRosterPlanDetailEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {rosterDetail.exercises.map((exercise, index) => (
                  <li
                    key={`${exercise.exerciseName || exercise.name || "ex"}-${index}`}
                    className="rounded-md border bg-background p-2 text-sm"
                  >
                    <p className="font-medium">
                      {exercise.exerciseName || exercise.name || `${t("exerciseName")} ${index + 1}`}
                    </p>
                    {exercise.notes ? (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{exercise.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button variant="secondary" size="sm" className="gap-2 w-full sm:w-auto" asChild>
                <Link
                  href={`/students/${studentProfileId}?tab=management&expandPlan=${encodeURIComponent(expandPlanId)}`}
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  {t("calendarRosterOpenManagement")}
                </Link>
              </Button>
              <Button size="sm" className="gap-2 w-full sm:w-auto" asChild>
                <Link href={coachSessionHrefForPlan(displayPlanId)}>
                  <ClipboardList className="h-4 w-4 shrink-0" />
                  {t("calendarRosterLogSession")}
                </Link>
              </Button>
            </div>
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

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

function rosterTimeLabelToMinutes(label: string): number | null {
  const s = String(label || "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Earliest booked slot start in `row.times` for roster ordering (minutes since midnight). */
function earliestRosterSlotMinutes(row: DayBookedStudent): number {
  let best = Number.MAX_SAFE_INTEGER;
  for (const t of row.times) {
    const mm = rosterTimeLabelToMinutes(t);
    if (mm != null && mm < best) best = mm;
  }
  return best;
}

function slotDocId(date: string, time: string): string {
  return `${date}_${time.replace(":", "")}`;
}

function toDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Parse Firestore Timestamp, ISO string, or Date-like for calendar-day comparison. */
function firestoreScalarToDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Timestamp) {
    const d = value.toDate();
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value === "object" && "toDate" in (value as object)) {
    const fn = (value as { toDate?: () => Date }).toDate;
    if (typeof fn === "function") {
      const d = fn.call(value);
      return d instanceof Date && Number.isFinite(d.getTime()) ? d : null;
    }
  }
  return null;
}

/** YYYY-MM-DD when session is finished (`completedAt` set); uses `date` only as fallback for parsing. */
function sessionCompletionCalendarDay(data: Record<string, unknown>): string | null {
  if (!data.completedAt) return null;
  const d = firestoreScalarToDate(data.completedAt) ?? firestoreScalarToDate(data.date);
  if (!d) return null;
  return toDateStr(d);
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

/** Doc id under `students/{id}/workoutPlans` — slot rows may use roster id or linked auth `userId`. */
function resolveFirestoreStudentId(
  roster: Array<{ id: string } & Record<string, unknown>>,
  slotStudentId: string
): string {
  const match = roster.find(
    (s) => s.id === slotStudentId || String(s.userId || "") === slotStudentId
  );
  return match?.id ?? slotStudentId;
}

/** Profile image URL for a slot `studentId` (roster doc id or linked `userId`). */
function rosterPhotoUrlForSlotStudent(
  roster: Array<{ id: string } & Record<string, unknown>>,
  slotStudentId: string
): string {
  const rosterMatch = roster.find(
    (s) => s.id === slotStudentId || String(s.userId || "") === slotStudentId
  ) as (Record<string, unknown> & { id: string }) | undefined;
  const seedId = rosterMatch?.id ?? slotStudentId;
  const fromRoster = (rosterMatch?.photoUrl as string) || "";
  if (fromRoster.trim()) return fromRoster.trim();
  return slotStudentPlaceholderPhotoUrl(seedId);
}

function isActiveWorkoutPlanDoc(p: Record<string, unknown>): boolean {
  if (p.completedAt || p.status === "completed" || p.status === "expired") return false;
  return true;
}

type PrimaryUnlockedPlan = { id: string; title: string };

/**
 * Primary unlocked active plan: first unlocked step in the earliest sequence group
 * (lexicographic group id), else the most recently assigned non-sequence active plan.
 */
function pickPrimaryUnlockedPlan(
  plans: Array<Record<string, unknown> & { id?: string }>
): PrimaryUnlockedPlan | null {
  const active = plans.filter(isActiveWorkoutPlanDoc);
  const unlocked = active.filter((p) => p.studentUnlocked !== false);
  if (!unlocked.length) return null;
  const asRow = (p: Record<string, unknown> & { id?: string }): PrimaryUnlockedPlan | null => {
    const id = String(p?.id || "").trim();
    const title = String(p?.title || "").trim();
    if (!id || !title) return null;
    return { id, title };
  };
  const inSequence = unlocked.filter((p) => p.sequenceGroupId);
  if (inSequence.length) {
    const sorted = [...inSequence].sort((a, b) => {
      const g = String(a.sequenceGroupId || "").localeCompare(String(b.sequenceGroupId || ""));
      if (g !== 0) return g;
      return (Number(a.sequenceStepIndex) || 0) - (Number(b.sequenceStepIndex) || 0);
    });
    return asRow(sorted[0]!);
  }
  const sortedLoose = [...unlocked].sort((a, b) => {
    const ta = Date.parse(String(a.assignedAt || a.createdAt || "")) || 0;
    const tb = Date.parse(String(b.assignedAt || b.createdAt || "")) || 0;
    return tb - ta;
  });
  return asRow(sortedLoose[0]!);
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
  /** Sidebar preview panels (calendar card); collapsed by default to save space. */
  const [availabilityPreviewOpen, setAvailabilityPreviewOpen] = useState(false);
  const [blockSettingsPreviewOpen, setBlockSettingsPreviewOpen] = useState(false);

  // Session slots
  const [sessionSlots, setSessionSlots] = useState<SessionSlot[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Week program assignments
  const [weekAssignments, setWeekAssignments] = useState<WeekAssignment[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [assignWeekOpen, setAssignWeekOpen] = useState(false);
  const [assignWeekStudentIds, setAssignWeekStudentIds] = useState<string[]>([]);
  const [isApplyingDefaultSequence, setIsApplyingDefaultSequence] = useState(false);
  const [defaultSequenceForAssign, setDefaultSequenceForAssign] =
    useState<DefaultStudentSequenceProgram | null>(null);
  const [selectedAssignSequenceId, setSelectedAssignSequenceId] = useState<string | null>(null);
  const [isLoadingDefaultSequenceForAssign, setIsLoadingDefaultSequenceForAssign] = useState(false);
  const [isRemovingStudentAllAssignments, setIsRemovingStudentAllAssignments] = useState(false);

  // Student filter (0 = no filter, shows all; set = student-centric view)
  const [filterStudentId, setFilterStudentId] = useState("");
  const [filterStudentSessionDuration, setFilterStudentSessionDuration] = useState<number | null>(null);
  const [filterStudentSessionsPerWeek, setFilterStudentSessionsPerWeek] = useState<number | null>(null);
  const [isLoadingFilterStudent, setIsLoadingFilterStudent] = useState(false);
  const [isTogglingSlot, setIsTogglingSlot] = useState<string | null>(null);
  const [isSavingAttendance, setIsSavingAttendance] = useState<string | null>(null);

  /** Per `firestoreStudentId__planId`: title + completion (for roster labels and grouping). */
  const [rosterPlanMetaByKey, setRosterPlanMetaByKey] = useState<
    Record<string, { title: string; isCompleted: boolean }>
  >({});
  /**
   * Incremented whenever the page regains visibility (tab focus / back-navigation).
   * Drives re-fetch of plan meta + unlocked programs so completing a workout in the
   * coach-session page is reflected without a full reload.
   */
  const [planMetaRefreshTick, setPlanMetaRefreshTick] = useState(0);
  /** `fid` → student had a completed `workoutSessions` doc on `selectedDateStr` (any plan). */
  const [sessionCompletedOnSelectedDayByFid, setSessionCompletedOnSelectedDayByFid] = useState<Record<string, boolean>>(
    {}
  );
  /** `fid__slotPlanId` → same-day completed session with `workoutPlanId` matching the slot plan (stale plan meta). */
  const [sessionCompletedSlotPlanByKey, setSessionCompletedSlotPlanByKey] = useState<Record<string, boolean>>({});
  /** `fid` → `workoutPlanId` from latest same-day completed session (roster expand when booking has no plan). */
  const [sessionDayInferredPlanIdByFid, setSessionDayInferredPlanIdByFid] = useState<Record<string, string>>({});
  /** `${fid}__${expandPlanId}` → same-day session title (matches session-log picker). */
  const [sessionRosterSessionTitleByExpandKey, setSessionRosterSessionTitleByExpandKey] = useState<
    Record<string, string>
  >({});
  /** Newest same-day `workoutSessions.workoutTitle` per `fid` (by `completedAt`); completed roster subtitle. */
  const [sessionLatestSameDayWorkoutTitleByFid, setSessionLatestSameDayWorkoutTitleByFid] = useState<
    Record<string, string>
  >({});
  /** Primary unlocked active plan `{ id, title }` per Firestore `students/{id}` id (roster when slot has no plan). */
  const [unlockedProgramByFirestoreId, setUnlockedProgramByFirestoreId] = useState<
    Record<string, { id: string; title: string }>
  >({});

  /** `${firestoreStudentId}__${planId}` → fetched plan detail for day roster expand. */
  const [expandedRosterPlanKey, setExpandedRosterPlanKey] = useState<string | null>(null);
  const [rosterPlanDetailByKey, setRosterPlanDetailByKey] = useState<Record<string, RosterPlanDetailEntry>>({});
  /** Same key as plan detail: logged session (weight/reps) for completed roster expand. */
  const [rosterSessionLogByKey, setRosterSessionLogByKey] = useState<Record<string, RosterSessionLogEntry>>({});
  /** Bumped after inline session edit save/delete so roster session effect refetches. */
  const [sessionLogRefreshTick, setSessionLogRefreshTick] = useState(0);
  const [rosterSessionEdit, setRosterSessionEdit] = useState<{
    storageFid: string;
    session: EditWorkoutSessionDialogSession;
  } | null>(null);

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

  const portalStudentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "students");
  }, [db, user]);
  const { data: portalStudents } = useCollection(portalStudentsQuery);

  type PortalStudentRow = Record<string, unknown> & { id: string };
  const portalStudentIdByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const student of (portalStudents || []) as PortalStudentRow[]) {
      const email = String(student.email || "").trim().toLowerCase();
      if (email && student.id) map.set(email, student.id);
    }
    return map;
  }, [portalStudents]);

  const [bulkClearOpen, setBulkClearOpen] = useState(false);
  const [bulkClearConfirm, setBulkClearConfirm] = useState("");
  const [isBulkClearing, setIsBulkClearing] = useState(false);

  const handleBulkClearPlans = useCallback(async () => {
    if (!db || !user) return;
    if (bulkClearConfirm !== "DELETE") return;
    setIsBulkClearing(true);
    try {
      const { deletedPlanCount, deletedWeekAssignmentCount } = await clearAllTrainerWorkoutPlans(
        db,
        user.uid,
        (rosterStudents || []) as { id: string; userId?: string; email?: string }[],
        portalStudentIdByEmail
      );
      toast({
        title: t("bulkClearPlansSuccess"),
        description: [
          t("bulkClearPlansCountDetail").replace("{count}", String(deletedPlanCount)),
          t("bulkClearWeekAssignmentsCountDetail").replace("{count}", String(deletedWeekAssignmentCount)),
        ].join(" "),
      });
      setBulkClearOpen(false);
      setBulkClearConfirm("");
      const [progSnap, waSnap, slotsSnap] = await Promise.all([
        getDocs(collection(db, "personalTrainers", user.uid, "personalTrainingPrograms")),
        getDocs(collection(db, "personalTrainers", user.uid, "weekProgramAssignments")),
        getDocs(collection(db, "personalTrainers", user.uid, "sessionSlots")),
      ]);
      setPrograms(progSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setWeekAssignments(waSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WeekAssignment)));
      const newSlots = slotsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as SessionSlot));
      setSessionSlots(newSlots);
      setManagingSlot((prev) => {
        if (!prev?.slot) return prev;
        const updated = newSlots.find((s) => s.id === prev.slot!.id);
        return updated ? { ...prev, slot: updated } : prev;
      });
      setPlanMetaRefreshTick((n) => n + 1);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("bulkClearPlansFailed");
      toast({ variant: "destructive", title: t("bulkClearPlansFailed"), description: msg });
    } finally {
      setIsBulkClearing(false);
    }
  }, [db, user, bulkClearConfirm, rosterStudents, portalStudentIdByEmail, t, toast]);

  const rosterStudentsSorted = useMemo(() => {
    const list = [...(rosterStudents || [])] as Array<{ id: string } & Record<string, unknown>>;
    return list.sort((a, b) =>
      getStudentDisplayName(a, "Sem nome").localeCompare(getStudentDisplayName(b, "Sem nome"), undefined, {
        sensitivity: "base",
      })
    );
  }, [rosterStudents]);

  // ── Refresh on page visibility (back-nav from coach session / student profile) ─

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        setPlanMetaRefreshTick((n) => n + 1);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

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
      setFilterStudentSessionsPerWeek(null);
      return;
    }
    let cancelled = false;
    setIsLoadingFilterStudent(true);
    async function loadStudentSession() {
      try {
        const snap = await getDoc(doc(db!, "personalTrainers", user!.uid, "students", filterStudentId));
        if (!cancelled && snap.exists()) {
          setFilterStudentSessionDuration(snap.data()?.sessionDurationMin ?? null);
          setFilterStudentSessionsPerWeek(snap.data()?.sessionsPerWeek ?? null);
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

  const slotDates = useMemo(() => {
    const relevantSlots = filterStudentId
      ? sessionSlots.filter(
          (s) =>
            Array.isArray(s.students) &&
            s.students.some((st) => st.studentId === filterStudentId)
        )
      : sessionSlots.filter((s) => Array.isArray(s.students) && s.students.length > 0);
    return [...new Set(relevantSlots.map((s) => s.date))].map((s) => new Date(s + "T12:00:00"));
  }, [sessionSlots, filterStudentId]);

  // Student filter helpers
  const isFilterActive = !!filterStudentId;

  const pendingAttendanceDates = useMemo(
    () =>
      datesWithActionablePendingAttendance(sessionSlots, Date.now(), {
        filterStudentId: isFilterActive ? filterStudentId : undefined,
      }).map((d) => new Date(d + "T12:00:00")),
    [sessionSlots, isFilterActive, filterStudentId]
  );

  const studentsBookedOnSelectedDay = useMemo((): DayBookedStudent[] => {
    const map = new Map<string, DayBookedStudent>();

    const resolvedSessionDurationMin = (studentId: string, st: SlotStudent): number => {
      const rosterSt = rosterStudentsSorted.find(
        (s) => s.id === studentId || String((s as Record<string, unknown>).userId || "") === studentId
      ) as Record<string, unknown> | undefined;
      const rosterDur = Number(rosterSt?.sessionDurationMin);
      const fromSlot = st.sessionDurationMin ?? slotDurationMin;
      if (Number.isFinite(rosterDur) && rosterDur > 0) return rosterDur;
      return fromSlot;
    };

    for (const slot of sessionSlots) {
      if (slot.date !== selectedDateStr) continue;
      for (const st of slot.students || []) {
        if (isFilterActive && st.studentId !== filterStudentId) continue;
        const timeLabel = String(st.sessionStart || slot.startTime || "");
        const title = String(st.workoutTitle || "").trim();
        const pid = String(st.workoutPlanId || "").trim();
        const durationMin = resolvedSessionDurationMin(st.studentId, st);
        const firestoreStudentId = resolveFirestoreStudentId(rosterStudentsSorted, st.studentId);
        const prev = map.get(st.studentId);
        if (!prev) {
          map.set(st.studentId, {
            studentId: st.studentId,
            studentName: String(st.studentName || "").trim() || st.studentId,
            workoutTitle: pid && title ? title : undefined,
            workoutPlanId: pid || undefined,
            unlinkedSlotTitle: !pid && title ? title : undefined,
            firestoreStudentId,
            times: timeLabel ? [timeLabel] : [],
            sessionDurationMin: durationMin,
            sessionAttendance: normalizeAttendance(st.sessionAttendance),
          });
        } else {
          if (timeLabel && !prev.times.includes(timeLabel)) prev.times.push(timeLabel);
          prev.times.sort();
          if (pid) {
            prev.workoutPlanId = pid;
            if (title) prev.workoutTitle = title;
            prev.unlinkedSlotTitle = undefined;
          } else if (title && !prev.unlinkedSlotTitle) {
            prev.unlinkedSlotTitle = title;
          }
          const nm = String(st.studentName || "").trim();
          if (nm) prev.studentName = nm;
          prev.firestoreStudentId = resolveFirestoreStudentId(rosterStudentsSorted, st.studentId);
          if (prev.sessionDurationMin == null) prev.sessionDurationMin = durationMin;
          else prev.sessionDurationMin = Math.max(prev.sessionDurationMin, durationMin);
          prev.sessionAttendance = mergeDayBookedAttendance(prev.sessionAttendance, st.sessionAttendance);
        }
      }
    }
    return [...map.values()].sort((a, b) => {
      const ta = earliestRosterSlotMinutes(a);
      const tb = earliestRosterSlotMinutes(b);
      if (ta !== tb) return ta - tb;
      return a.studentName.localeCompare(b.studentName, undefined, { sensitivity: "base" });
    });
  }, [sessionSlots, selectedDateStr, isFilterActive, filterStudentId, rosterStudentsSorted, slotDurationMin]);

  const selectedCalendarDayLabel = useMemo(
    () =>
      selectedDate.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    [selectedDate]
  );

  const calendarFilterStudentLabel = useMemo(() => {
    if (!filterStudentId) return "Todos os alunos";
    const row = rosterStudentsSorted.find((x) => x.id === filterStudentId) as Record<string, unknown> | undefined;
    return row ? getStudentDisplayName(row, "Sem nome") : "Aluno";
  }, [filterStudentId, rosterStudentsSorted]);

  const calendarFilterSelectedRow = useMemo(() => {
    if (!filterStudentId) return undefined;
    return rosterStudentsSorted.find((x) => x.id === filterStudentId) as
      | (Record<string, unknown> & { id: string })
      | undefined;
  }, [filterStudentId, rosterStudentsSorted]);
  const effectiveSlotDuration = isFilterActive && filterStudentSessionDuration
    ? filterStudentSessionDuration
    : slotDurationMin;
  const slotsPerSession = Math.max(1, Math.ceil(effectiveSlotDuration / slotDurationMin));

  // Selected week helpers
  const selectedWeekStart = getWeekStart(selectedDateStr);

  const selectedWeekAssignments = useMemo(
    () => weekAssignments.filter((a) =>
      a.weekStart === selectedWeekStart &&
      (!isFilterActive || a.studentId === filterStudentId)
    ),
    [weekAssignments, selectedWeekStart, isFilterActive, filterStudentId]
  );

  const weekProgramSummaryByStudentId = useMemo(() => {
    const buckets = new Map<string, string[]>();
    for (const a of selectedWeekAssignments) {
      const label = String(a.programTitle || "").trim();
      if (!label) continue;
      const arr = buckets.get(a.studentId) ?? [];
      if (!arr.includes(label)) arr.push(label);
      buckets.set(a.studentId, arr);
    }
    const flat = new Map<string, string>();
    for (const [sid, arr] of buckets) flat.set(sid, arr.join(", "));
    return flat;
  }, [selectedWeekAssignments]);

  useEffect(() => {
    if (!db || !user) return;
    let cancelled = false;
    const rows = studentsBookedOnSelectedDay;
    if (rows.length === 0) {
      setUnlockedProgramByFirestoreId({});
      return;
    }
    const fids = [...new Set(rows.map((r) => r.firestoreStudentId || resolveFirestoreStudentId(rosterStudentsSorted, r.studentId)))];
    (async () => {
      const next: Record<string, { id: string; title: string }> = {};
      await Promise.all(
        fids.map(async (fid) => {
          try {
            const snap = await getDocs(
              collection(db, "personalTrainers", user.uid, "students", fid, "workoutPlans")
            );
            if (cancelled) return;
            const planRows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id?: string }));
            const picked = pickPrimaryUnlockedPlan(planRows);
            if (picked) next[fid] = picked;
          } catch {
            /* skip */
          }
        })
      );
      if (!cancelled) {
        setUnlockedProgramByFirestoreId(next);
        // Clear cached plan-detail panels so re-expanding shows fresh Firestore data.
        setRosterPlanDetailByKey({});
        setRosterSessionLogByKey({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, user, studentsBookedOnSelectedDay, rosterStudentsSorted, planMetaRefreshTick]);

  useEffect(() => {
    if (!db || !user || !expandedRosterPlanKey) return;
    const sep = expandedRosterPlanKey.indexOf("__");
    if (sep < 0) return;
    const storageFid = expandedRosterPlanKey.slice(0, sep);
    const planId = expandedRosterPlanKey.slice(sep + 2);
    if (!storageFid || !planId) return;

    setRosterPlanDetailByKey((prev) => {
      const cur = prev[expandedRosterPlanKey];
      if (cur?.status === "ready" || cur?.status === "loading") return prev;
      return { ...prev, [expandedRosterPlanKey]: { status: "loading" } };
    });

    let cancelled = false;
    const key = expandedRosterPlanKey;
    (async () => {
      try {
        const snap = await getDoc(
          doc(db, "personalTrainers", user.uid, "students", storageFid, "workoutPlans", planId)
        );
        if (cancelled) return;
        if (!snap.exists()) {
          setRosterPlanDetailByKey((p) => ({ ...p, [key]: { status: "error" } }));
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        const exercises = Array.isArray(data.exercises)
          ? (data.exercises as Array<{ exerciseName?: string; name?: string; notes?: string }>)
          : [];
        const title = String(data.title || "").trim();
        setRosterPlanDetailByKey((p) => ({
          ...p,
          [key]: { status: "ready", title, exercises },
        }));
      } catch {
        if (!cancelled) setRosterPlanDetailByKey((p) => ({ ...p, [key]: { status: "error" } }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expandedRosterPlanKey, db, user]);

  /** Load same-day `workoutSessions` row for expanded roster key (plan id match) — completed section UI. */
  useEffect(() => {
    if (!db || !user || !expandedRosterPlanKey) return;
    const sep = expandedRosterPlanKey.indexOf("__");
    if (sep < 0) return;
    const storageFid = expandedRosterPlanKey.slice(0, sep);
    const planId = expandedRosterPlanKey.slice(sep + 2);
    if (!storageFid || !planId) return;

    setRosterSessionLogByKey((prev) => ({
      ...prev,
      [expandedRosterPlanKey]: { status: "loading" },
    }));

    let cancelled = false;
    const key = expandedRosterPlanKey;
    (async () => {
      try {
        const snap = await getDocs(
          collection(db, "personalTrainers", user.uid, "students", storageFid, "workoutSessions")
        );
        if (cancelled) return;
        type Cand = { t: number; data: Record<string, unknown>; id: string };
        const sameDay: Cand[] = [];
        for (const docSnap of snap.docs) {
          const data = docSnap.data() as Record<string, unknown>;
          const dayStr = sessionCompletionCalendarDay(data);
          if (!dayStr || dayStr !== selectedDateStr) continue;
          const t = firestoreScalarToDate(data.completedAt)?.getTime() ?? 0;
          sameDay.push({ t, data, id: docSnap.id });
        }
        sameDay.sort((a, b) => b.t - a.t);
        const planMatches = sameDay.filter((c) => String(c.data.workoutPlanId || "").trim() === planId);
        const bestMatch: Cand | null = planMatches[0] ?? sameDay[0] ?? null;
        if (!bestMatch) {
          setRosterSessionLogByKey((p) => ({ ...p, [key]: { status: "empty" } }));
          return;
        }
        const title = String(bestMatch.data.workoutTitle || "").trim();
        const exercises = buildSessionLogExercisesFromDoc(bestMatch.data);
        const sessionWorkoutPlanId = String(bestMatch.data.workoutPlanId || "").trim() || undefined;
        setRosterSessionLogByKey((p) => ({
          ...p,
          [key]: {
            status: "ready",
            title,
            exercises,
            sessionWorkoutPlanId,
            sessionId: bestMatch.id,
            rawExercises: bestMatch.data.exercises,
          },
        }));
      } catch {
        if (!cancelled) setRosterSessionLogByKey((p) => ({ ...p, [key]: { status: "error" } }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expandedRosterPlanKey, selectedDateStr, db, user, planMetaRefreshTick, sessionLogRefreshTick]);

  useEffect(() => {
    if (!db || !user) return;
    let cancelled = false;
    const rows = studentsBookedOnSelectedDay;
    const keysToFetch = new Map<string, { fid: string; planId: string }>();
    for (const row of rows) {
      const fid = row.firestoreStudentId || resolveFirestoreStudentId(rosterStudentsSorted, row.studentId);
      const slotPlanId = String(row.workoutPlanId || "").trim();
      const unlockedPick =
        unlockedProgramByFirestoreId[fid] ||
        (fid !== row.studentId ? unlockedProgramByFirestoreId[row.studentId] : undefined);
      const unlockedId = String(unlockedPick?.id || "").trim();
      if (slotPlanId) {
        const slotKey = `${fid}__${slotPlanId}`;
        if (!keysToFetch.has(slotKey)) keysToFetch.set(slotKey, { fid, planId: slotPlanId });
      }
      if (unlockedId && unlockedId !== slotPlanId) {
        const uKey = `${fid}__${unlockedId}`;
        if (!keysToFetch.has(uKey)) keysToFetch.set(uKey, { fid, planId: unlockedId });
      }
    }
    const rowFids = new Set(
      rows.map((r) => r.firestoreStudentId || resolveFirestoreStudentId(rosterStudentsSorted, r.studentId))
    );
    for (const [fid, inferredPlanId] of Object.entries(sessionDayInferredPlanIdByFid)) {
      if (!rowFids.has(fid)) continue;
      const pid = String(inferredPlanId || "").trim();
      if (!pid) continue;
      const ik = `${fid}__${pid}`;
      if (!keysToFetch.has(ik)) keysToFetch.set(ik, { fid, planId: pid });
    }
    if (keysToFetch.size === 0) {
      setRosterPlanMetaByKey({});
      return;
    }
    (async () => {
      const next: Record<string, { title: string; isCompleted: boolean }> = {};
      await Promise.all(
        [...keysToFetch.entries()].map(async ([key, { fid, planId }]) => {
          try {
            const snap = await getDoc(
              doc(db, "personalTrainers", user.uid, "students", fid, "workoutPlans", planId)
            );
            if (cancelled) return;
            if (!snap.exists()) {
              next[key] = { title: "", isCompleted: false };
              return;
            }
            const data = snap.data() as Record<string, unknown>;
            const title = String(data?.title || "").trim();
            const isCompleted =
              Boolean(data?.completedAt) ||
              data?.status === "completed" ||
              data?.status === "expired";
            next[key] = { title, isCompleted };
          } catch {
            if (!cancelled) next[key] = { title: "", isCompleted: false };
          }
        })
      );
      if (!cancelled) setRosterPlanMetaByKey(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    db,
    user,
    studentsBookedOnSelectedDay,
    rosterStudentsSorted,
    unlockedProgramByFirestoreId,
    sessionDayInferredPlanIdByFid,
    planMetaRefreshTick,
  ]);

  /** Same-day `workoutSessions` with `completedAt` → bucket flags (any session per fid; slot-plan match for stale meta). */
  useEffect(() => {
    if (!db || !user) return;
    let cancelled = false;
    const rows = studentsBookedOnSelectedDay;
    if (rows.length === 0) {
      setSessionCompletedOnSelectedDayByFid({});
      setSessionCompletedSlotPlanByKey({});
      setSessionDayInferredPlanIdByFid({});
      setSessionRosterSessionTitleByExpandKey({});
      setSessionLatestSameDayWorkoutTitleByFid({});
      return;
    }
    const fids = [
      ...new Set(
        rows.map((r) => r.firestoreStudentId || resolveFirestoreStudentId(rosterStudentsSorted, r.studentId))
      ),
    ];
    const slotKeysForFid = new Map<string, Set<string>>();
    for (const row of rows) {
      const fid = row.firestoreStudentId || resolveFirestoreStudentId(rosterStudentsSorted, row.studentId);
      const slot = String(row.workoutPlanId || "").trim();
      if (!slot) continue;
      if (!slotKeysForFid.has(fid)) slotKeysForFid.set(fid, new Set());
      slotKeysForFid.get(fid)!.add(`${fid}__${slot}`);
    }
    (async () => {
      const partials = await Promise.all(
        fids.map(async (fid) => {
          const titlesByExpandKey: Record<string, string> = {};
          const dayByFidPart: Record<string, boolean> = {};
          const slotByKeyPart: Record<string, boolean> = {};
          const inferredByFidPart: Record<string, string> = {};
          const latestSameDayTitleByFidPart: Record<string, string> = {};
          try {
            if (cancelled) {
              return {
                titlesByExpandKey,
                dayByFid: dayByFidPart,
                slotByKey: slotByKeyPart,
                inferredByFid: inferredByFidPart,
                latestSameDayTitleByFid: latestSameDayTitleByFidPart,
              };
            }
            const snap = await getDocs(
              collection(db, "personalTrainers", user.uid, "students", fid, "workoutSessions")
            );
            if (cancelled) {
              return {
                titlesByExpandKey,
                dayByFid: dayByFidPart,
                slotByKey: slotByKeyPart,
                inferredByFid: inferredByFidPart,
                latestSameDayTitleByFid: latestSameDayTitleByFidPart,
              };
            }
            const slotsToMatch = slotKeysForFid.get(fid);
            const sameDayCands: Array<{ t: number; wp: string; title: string }> = [];
            snap.forEach((docSnap) => {
              const data = docSnap.data() as Record<string, unknown>;
              const dayStr = sessionCompletionCalendarDay(data);
              if (!dayStr || dayStr !== selectedDateStr) return;
              dayByFidPart[fid] = true;
              const wp = String(data.workoutPlanId || "").trim();
              const title = String(data.workoutTitle || "").trim();
              if (wp && slotsToMatch?.has(`${fid}__${wp}`)) {
                slotByKeyPart[`${fid}__${wp}`] = true;
              }
              const t = firestoreScalarToDate(data.completedAt)?.getTime() ?? 0;
              sameDayCands.push({ t, wp, title });
            });
            sameDayCands.sort((a, b) => b.t - a.t);
            const newestSameDay = sameDayCands[0];
            if (newestSameDay) {
              latestSameDayTitleByFidPart[fid] = newestSameDay.title
                ? String(newestSameDay.title).trim()
                : "";
            }
            const inferredWp = sameDayCands.find((c) => c.wp)?.wp;
            if (inferredWp) inferredByFidPart[fid] = inferredWp;

            if (sameDayCands.length > 0) {
              const planIds = new Set<string>();
              for (const c of sameDayCands) {
                if (c.wp) planIds.add(c.wp);
              }
              const inferredPid = String(inferredByFidPart[fid] || "").trim();
              if (inferredPid) planIds.add(inferredPid);
              for (const row of rows) {
                const rfid = row.firestoreStudentId || resolveFirestoreStudentId(rosterStudentsSorted, row.studentId);
                if (rfid !== fid) continue;
                const sp = String(row.workoutPlanId || "").trim();
                if (sp) planIds.add(sp);
                const unlockedPickRow =
                  unlockedProgramByFirestoreId[rfid] ||
                  (rfid !== row.studentId ? unlockedProgramByFirestoreId[row.studentId] : undefined);
                const uid = String(unlockedPickRow?.id || "").trim();
                if (uid) planIds.add(uid);
              }
              for (const planId of planIds) {
                const planMatches = sameDayCands.filter((c) => c.wp === planId);
                const pick = planMatches[0] ?? sameDayCands[0];
                const tit = pick?.title ? String(pick.title).trim() : "";
                if (tit) titlesByExpandKey[`${fid}__${planId}`] = tit;
              }
            }
          } catch {
            /* skip */
          }
          return {
            titlesByExpandKey,
            dayByFid: dayByFidPart,
            slotByKey: slotByKeyPart,
            inferredByFid: inferredByFidPart,
            latestSameDayTitleByFid: latestSameDayTitleByFidPart,
          };
        })
      );

      const mergedTitles: Record<string, string> = {};
      const mergedDay: Record<string, boolean> = {};
      const mergedSlot: Record<string, boolean> = {};
      const mergedInferred: Record<string, string> = {};
      const mergedLatestSameDayTitle: Record<string, string> = {};
      for (const part of partials) {
        Object.assign(mergedTitles, part.titlesByExpandKey);
        Object.assign(mergedDay, part.dayByFid);
        Object.assign(mergedSlot, part.slotByKey);
        Object.assign(mergedInferred, part.inferredByFid);
        Object.assign(mergedLatestSameDayTitle, part.latestSameDayTitleByFid);
      }

      if (!cancelled) {
        setSessionCompletedOnSelectedDayByFid(mergedDay);
        setSessionCompletedSlotPlanByKey(mergedSlot);
        setSessionDayInferredPlanIdByFid(mergedInferred);
        setSessionRosterSessionTitleByExpandKey(mergedTitles);
        setSessionLatestSameDayWorkoutTitleByFid(mergedLatestSameDayTitle);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    db,
    user,
    selectedDateStr,
    studentsBookedOnSelectedDay,
    rosterStudentsSorted,
    unlockedProgramByFirestoreId,
    planMetaRefreshTick,
    sessionLogRefreshTick,
  ]);

  const calendarRosterBuckets = useMemo(() => {
    const noPlan: DayBookedStudent[] = [];
    const active: DayBookedStudent[] = [];
    const completed: DayBookedStudent[] = [];
    for (const row of studentsBookedOnSelectedDay) {
      const fid = row.firestoreStudentId || resolveFirestoreStudentId(rosterStudentsSorted, row.studentId);
      const slotPlanId = String(row.workoutPlanId || "").trim();
      const unlockedPick =
        unlockedProgramByFirestoreId[fid] ||
        (fid !== row.studentId ? unlockedProgramByFirestoreId[row.studentId] : undefined);
      const unlockedId = String(unlockedPick?.id || "").trim();
      if (!slotPlanId && !unlockedId) {
        if (sessionCompletedOnSelectedDayByFid[fid]) {
          completed.push(row);
        } else {
          noPlan.push(row);
        }
        continue;
      }

      let intoCompleted = false;
      if (slotPlanId) {
        const sk = `${fid}__${slotPlanId}`;
        const slotMeta = rosterPlanMetaByKey[sk];
        if (slotMeta?.isCompleted || sessionCompletedSlotPlanByKey[sk]) {
          intoCompleted = true;
        }
      } else {
        const uMeta = rosterPlanMetaByKey[`${fid}__${unlockedId}`];
        if (uMeta?.isCompleted) intoCompleted = true;
      }

      if (!intoCompleted && sessionCompletedOnSelectedDayByFid[fid]) {
        intoCompleted = true;
      }

      if (intoCompleted) completed.push(row);
      else active.push(row);
    }
    return { noPlan, active, completed };
  }, [
    studentsBookedOnSelectedDay,
    rosterStudentsSorted,
    unlockedProgramByFirestoreId,
    rosterPlanMetaByKey,
    sessionCompletedOnSelectedDayByFid,
    sessionCompletedSlotPlanByKey,
  ]);

  const assignableBasePrograms = useMemo(
    () =>
      programs.filter(
        (p: { programType?: string }) => p.programType !== "weekly" && p.programType !== "sequence"
      ) as Array<TrainingProgramDocument & { id: string }>,
    [programs]
  );

  const assignSequenceOptions = useMemo(
    () =>
      buildAssignSequenceOptions({
        defaultSequence: defaultSequenceForAssign,
        programs: programs as Array<Record<string, unknown> & { id: string }>,
        defaultOptionLabel: t("defaultSequenceOptionLabel"),
        listTemplates: listSequenceTemplatesFromPrograms,
      }),
    [defaultSequenceForAssign, programs, t]
  );

  const selectedAssignSequence = useMemo(
    () => assignSequenceOptions.find((o) => o.id === selectedAssignSequenceId) ?? null,
    [assignSequenceOptions, selectedAssignSequenceId]
  );

  useEffect(() => {
    if (!assignWeekOpen || !db || !user) {
      setDefaultSequenceForAssign(null);
      setSelectedAssignSequenceId(null);
      setIsLoadingDefaultSequenceForAssign(false);
      return;
    }
    let cancelled = false;
    setIsLoadingDefaultSequenceForAssign(true);
    void getDefaultStudentSequenceProgram(db, user.uid)
      .then((def) => {
        if (!cancelled) setDefaultSequenceForAssign(def);
      })
      .catch(() => {
        if (!cancelled) setDefaultSequenceForAssign(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDefaultSequenceForAssign(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignWeekOpen, db, user]);

  useEffect(() => {
    if (!assignWeekOpen || !db || !user) return;
    let cancelled = false;
    void getDocs(collection(db, "personalTrainers", user.uid, "personalTrainingPrograms")).then((snap) => {
      if (!cancelled) {
        setPrograms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [assignWeekOpen, db, user]);

  useEffect(() => {
    if (!assignWeekOpen) return;
    if (assignSequenceOptions.length === 0) {
      setSelectedAssignSequenceId(null);
      return;
    }
    setSelectedAssignSequenceId((prev) =>
      prev && assignSequenceOptions.some((o) => o.id === prev) ? prev : assignSequenceOptions[0].id
    );
  }, [assignWeekOpen, assignSequenceOptions]);

  // Calendar modifier: days in weeks that have program assignments (scoped to filter student when active)
  const assignedWeekDates = useMemo(() => {
    const source = filterStudentId
      ? weekAssignments.filter((a) => a.studentId === filterStudentId)
      : weekAssignments;
    const weekStarts = [...new Set(source.map((a) => a.weekStart))];
    return weekStarts.flatMap((ws) =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(ws + "T12:00:00");
        d.setDate(d.getDate() + i);
        return new Date(d);
      })
    );
  }, [weekAssignments, filterStudentId]);

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
      const uniqueSessions = new Set<string>();
      sessionSlots
        .filter((s) => weekDates.includes(s.date))
        .forEach((slot) => {
          const entry = slot.students.find((st: any) => st.studentId === studentId);
          if (!entry) return;
          // A multi-block booking (e.g. 60 min over 2x30 blocks) should count as one session.
          const sessionStart = (entry as any).sessionStart || slot.startTime;
          uniqueSessions.add(`${slot.date}__${sessionStart}`);
        });
      return uniqueSessions.size;
    },
    [sessionSlots]
  );

  const selectedStudentWeeklyCount = useMemo(
    () => (isFilterActive ? getWeeklyCount(filterStudentId, selectedDate) : 0),
    [isFilterActive, getWeeklyCount, filterStudentId, selectedDate]
  );
  const selectedStudentWeeklyProgress = useMemo(() => {
    if (!filterStudentSessionsPerWeek || filterStudentSessionsPerWeek <= 0) return 0;
    return Math.min(100, (selectedStudentWeeklyCount / filterStudentSessionsPerWeek) * 100);
  }, [selectedStudentWeeklyCount, filterStudentSessionsPerWeek]);

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
    const manageSlotDate = managingSlot.date;
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
          const slotWeekStart = getWeekStart(manageSlotDate);
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
    const rosterPhoto = String(student?.photoUrl ?? "").trim();
    const newStudent: SlotStudent = {
      studentId: addStudentId,
      studentName,
      sessionAttendance: "pending",
      ...(rosterPhoto ? { studentPhotoUrl: rosterPhoto } : {}),
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
        const rosterPhoto = String(student?.photoUrl || "").trim();
        const weekMatch = weekAssignments.find((a) => a.studentId === filterStudentId && a.weekStart === selectedWeekStart);
        let weekPlanId = "";
        if (weekMatch && db && user) {
          try {
            const plansSnap = await getDocs(
              collection(db, "personalTrainers", user.uid, "students", filterStudentId, "workoutPlans")
            );
            const ws = selectedWeekStart;
            const pidMatch = String(weekMatch.programId || "").trim();
            let matchDoc = plansSnap.docs.find((d) => {
              const data = d.data() as Record<string, unknown>;
              const wk = String(data.weekStart || "").slice(0, 10);
              if (wk !== ws) return false;
              return (
                String(data.programId || "") === pidMatch ||
                String(data.sourceTrainingProgramId || "") === pidMatch
              );
            });
            if (!matchDoc) {
              matchDoc = plansSnap.docs.find((d) => {
                const data = d.data() as Record<string, unknown>;
                return String(data.weekStart || "").slice(0, 10) === ws;
              });
            }
            weekPlanId = matchDoc?.id ?? "";
          } catch {
            weekPlanId = "";
          }
        }
        const nextSlots = [...sessionSlots];
        for (const t of blocksToBook) {
          const id = slotDocId(selectedDateStr, t);
          const s = slotsByTime.get(t);
          const maxS = s?.maxStudents ?? defaultMaxStudents;
          const newEntry: SlotStudent = {
            studentId: filterStudentId,
            studentName,
            sessionStart: time,
            sessionDurationMin: effectiveSlotDuration,
            sessionAttendance: "pending",
            ...(rosterPhoto ? { studentPhotoUrl: rosterPhoto } : {}),
            ...(weekMatch ? { workoutTitle: weekMatch.programTitle } : {}),
            ...(weekPlanId ? { workoutPlanId: weekPlanId } : {}),
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

  const handleSessionAttendanceSave = async (st: SlotStudent, status: SessionAttendanceStatus) => {
    if (!db || !user || !managingSlot) return;
    const date = managingSlot.date;
    const sessionStartResolved = st.sessionStart ?? managingSlot.startTime;
    const durationMin = st.sessionDurationMin ?? slotDurationMin;
    const key = `${date}-${sessionStartResolved}-${st.studentId}`;
    const nowMs = Date.now();
    if (!canCoachMarkSessionAttendanceAt(nowMs, date, sessionStartResolved)) {
      toast({
        title: t("coachAttendanceTooEarlyTitle"),
        description: t("coachAttendanceTooEarlyDescription"),
        variant: "destructive",
      });
      return;
    }

    setIsSavingAttendance(key);
    const blockTimes = blocksForLogicalSession(sessionStartResolved, durationMin, slotDurationMin);
    const atIso = new Date().toISOString();

    try {
      const nextSlots = [...sessionSlots];
      for (const t of blockTimes) {
        const id = slotDocId(date, t);
        const slotIdx = nextSlots.findIndex((s) => s.id === id && s.date === date);
        if (slotIdx < 0) continue;
        const slot = nextSlots[slotIdx];
        const newStudents = slot.students.map((row) => {
          if (row.studentId !== st.studentId) return row;
          const rowStart = row.sessionStart ?? slot.startTime;
          if (rowStart !== sessionStartResolved) return row;
          return { ...row, sessionAttendance: status, sessionAttendanceAt: atIso };
        });
        const newSlot: SessionSlot = { ...slot, students: newStudents };
        await setDoc(doc(db, "personalTrainers", user.uid, "sessionSlots", id), newSlot);
        nextSlots[slotIdx] = newSlot;
      }
      setSessionSlots(nextSlots);
      const dialogDocId = slotDocId(date, managingSlot.startTime);
      const updatedSlot = nextSlots.find((s) => s.id === dialogDocId && s.date === date) ?? null;
      setManagingSlot((prev) => (prev ? { ...prev, slot: updatedSlot } : null));
      toast({
        title:
          status === "present"
            ? "Presença registada"
            : status === "absent"
              ? "Falta registada"
              : "Marcado como pendente",
      });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally {
      setIsSavingAttendance(null);
    }
  };

  const handleApplyDefaultSequenceFromCal = async () => {
    if (!db || !user || assignWeekStudentIds.length === 0 || !selectedAssignSequence) return;
    const studentCount = assignWeekStudentIds.length;
    const portalRows = (portalStudents || []) as Array<{ id: string; email?: string }>;
    setIsApplyingDefaultSequence(true);
    try {
      let anyAppended = false;
      for (const rosterStudentId of assignWeekStudentIds) {
        await linkStudentProfileForTrainerAssignments(
          db,
          user.uid,
          rosterStudentId,
          rosterStudents as Array<{ id: string; userId?: string; email?: string }> | null,
          portalRows
        );
        const storageId = resolveWorkoutPlansStorageStudentId(
          rosterStudentId,
          rosterStudents as Array<{ id: string; userId?: string; email?: string }> | null,
          portalRows
        );
        const { appended } = await applySequenceTemplateToStudent(
          db,
          user.uid,
          selectedAssignSequence,
          storageId,
          assignableBasePrograms
        );
        if (appended) anyAppended = true;
      }
      setAssignWeekOpen(false);
      setAssignWeekStudentIds([]);
      toast({
        title:
          studentCount > 1
            ? anyAppended
              ? t("sequenceAssignedAppendedToast")
              : t("sequenceAssignedToast")
            : anyAppended
              ? t("sequenceAssignedAppendedToast")
              : t("sequenceAssignedToast"),
      });
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "SEQUENCE_TEMPLATE_PROGRAMS_MISSING") {
        toast({ variant: "destructive", title: t("sequenceTemplateProgramsMissing") });
      } else {
        const msg = e instanceof Error ? e.message : t("sequenceAssignFailed");
        toast({ variant: "destructive", title: t("sequenceAssignFailed"), description: msg });
      }
    } finally {
      setIsApplyingDefaultSequence(false);
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
        <Dialog open={assignWeekOpen} onOpenChange={(o) => {
          setAssignWeekOpen(o);
          if (!o) setAssignWeekStudentIds([]);
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ListOrdered className="h-4 w-4 text-primary" /> {t("applyDefaultStudentSequence")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">

              <SequenceTemplatePicker
                options={assignSequenceOptions}
                selectedId={selectedAssignSequenceId}
                onSelect={setSelectedAssignSequenceId}
                loading={isLoadingDefaultSequenceForAssign}
                assignablePrograms={assignableBasePrograms}
              />

              {/* Student multi-select */}
              <div className="space-y-1.5">
                <Label>Alunos</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full justify-between font-normal px-3"
                    >
                      <span
                        className={cn(
                          "truncate text-left",
                          assignWeekStudentIds.length === 0 && "text-muted-foreground"
                        )}
                      >
                        {assignWeekStudentIds.length === 0
                          ? "Selecionar alunos..."
                          : assignWeekStudentIds.length === 1
                            ? getStudentDisplayName(
                                (rosterStudentsSorted.find((s) => s.id === assignWeekStudentIds[0]) as Record<string, unknown>) ?? {},
                                "Sem nome"
                              )
                            : `${assignWeekStudentIds.length} alunos selecionados`}
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
                    <div className="max-h-60 overflow-y-auto space-y-0.5">
                      {rosterStudentsSorted.length === 0 ? (
                        <p className="text-sm text-muted-foreground px-2 py-1.5">Sem alunos na lista</p>
                      ) : (
                        rosterStudentsSorted.map((s) => {
                          const checked = assignWeekStudentIds.includes(s.id);
                          const name = getStudentDisplayName(s, "Sem nome");
                          const initial =
                            name !== "Sem nome"
                              ? name.trim().charAt(0).toUpperCase() || "?"
                              : "?";
                          const photoSrc = rosterPhotoUrlForSlotStudent(rosterStudentsSorted, s.id);
                          return (
                            <div
                              key={s.id}
                              role="button"
                              tabIndex={0}
                              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
                              onClick={() => {
                                setAssignWeekStudentIds((prev) =>
                                  checked ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                                );
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  setAssignWeekStudentIds((prev) =>
                                    checked ? prev.filter((id) => id !== s.id) : [...prev, s.id]
                                  );
                                }
                              }}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) => {
                                  setAssignWeekStudentIds((prev) =>
                                    value ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                                  );
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <Avatar className="h-7 w-7 shrink-0 border border-border/50">
                                <AvatarImage src={photoSrc} alt="" />
                                <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
                              </Avatar>
                              <span className="truncate">{name}</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignWeekOpen(false)}>{t("cancel")}</Button>
              <Button
                onClick={() => void handleApplyDefaultSequenceFromCal()}
                disabled={
                  assignWeekStudentIds.length === 0 ||
                  !selectedAssignSequence ||
                  isApplyingDefaultSequence ||
                  isLoadingDefaultSequenceForAssign
                }
                className="gap-2"
              >
                {isApplyingDefaultSequence && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("applyDefaultStudentSequence")}
              </Button>
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
                          const sessionSr = st.sessionStart ?? managingSlot.startTime;
                          const durMin = st.sessionDurationMin ?? slotDurationMin;
                          const tooEarlyForAttendance = !canCoachMarkSessionAttendanceAt(
                            Date.now(),
                            managingSlot.date,
                            sessionSr
                          );
                          const attKey = `${managingSlot.date}-${sessionSr}-${st.studentId}`;
                          const savingAtt = isSavingAttendance === attKey;
                          const att = normalizeAttendance(st.sessionAttendance);
                          return (
                            <div
                              key={`${st.studentId}-${sessionSr}`}
                              className="flex flex-col gap-2 p-2.5 rounded-lg bg-muted/30 border">
                              <div className="flex items-start gap-2">
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
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wide shrink-0">
                                  Presença
                                </span>
                                <Badge
                                  {...attendanceBadgeProps(att, false)}
                                >
                                  {att === "present" ? "Presente" : att === "absent" ? "Falta" : "Pendente"}
                                </Badge>
                                {tooEarlyForAttendance && (
                                  <span className="text-[10px] text-muted-foreground italic">
                                    {t("coachAttendanceNotYetWindowHint")}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="default"
                                  className="h-7 text-[10px] border-2 border-emerald-900/40 bg-emerald-600 text-white shadow-none hover:bg-emerald-700 dark:border-emerald-200/50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                                  disabled={tooEarlyForAttendance || savingAtt}
                                  onClick={() => handleSessionAttendanceSave(st, "present")}
                                >
                                  Presente
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 text-[10px] border-2 border-destructive-foreground/35 shadow-none"
                                  disabled={tooEarlyForAttendance || savingAtt}
                                  onClick={() => handleSessionAttendanceSave(st, "absent")}
                                >
                                  Falta
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="default"
                                  className="h-7 text-[10px] border-2 border-amber-900/40 bg-amber-500 text-amber-950 shadow-none hover:bg-amber-600 dark:border-amber-200/50 dark:bg-amber-600 dark:text-white dark:hover:bg-amber-500"
                                  disabled={tooEarlyForAttendance || savingAtt}
                                  onClick={() => handleSessionAttendanceSave(st, "pending")}
                                >
                                  Pendente
                                </Button>
                                {savingAtt && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                              </div>
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
              {/* Student filter */}
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Ver por aluno
                </p>
                <Select value={filterStudentId || "__all__"} onValueChange={(v) => setFilterStudentId(v === "__all__" ? "" : v)}>
                  <SelectTrigger
                    className="min-h-9 h-auto py-1.5 text-sm gap-2"
                    aria-label={`Ver por aluno: ${calendarFilterStudentLabel}`}
                  >
                    {isLoadingFilterStudent ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    ) : filterStudentId ? (
                      /* div (not span): SelectTrigger applies [&>span]:line-clamp-1 which breaks horizontal flex */
                      <div className="flex min-w-0 flex-1 flex-row items-center gap-2">
                        <Avatar className="h-7 w-7 shrink-0 border border-border/50">
                          <AvatarImage
                            src={
                              (calendarFilterSelectedRow?.photoUrl as string) ||
                              `https://picsum.photos/seed/${filterStudentId}/100/100`
                            }
                            alt=""
                          />
                          <AvatarFallback className="text-[10px]">
                            {calendarFilterSelectedRow
                              ? (() => {
                                  const n = getStudentDisplayName(calendarFilterSelectedRow, "Sem nome");
                                  return n !== "Sem nome" ? n.trim().charAt(0).toUpperCase() || "?" : "?";
                                })()
                              : "?"}
                          </AvatarFallback>
                        </Avatar>
                        {/* No SelectValue: Radix would mirror SelectItem (avatar+text) */}
                        <span className="min-w-0 flex-1 truncate text-left" aria-hidden="true">
                          {calendarFilterStudentLabel}
                        </span>
                      </div>
                    ) : (
                      <SelectValue placeholder="Todos os alunos" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os alunos</SelectItem>
                    {rosterStudentsSorted.map((s) => {
                      const row = s as Record<string, unknown> & { id: string };
                      const displayName = getStudentDisplayName(row, "Sem nome");
                      const initial =
                        displayName !== "Sem nome"
                          ? displayName.trim().charAt(0).toUpperCase() || "?"
                          : "?";
                      const src =
                        (row.photoUrl as string) || `https://picsum.photos/seed/${row.id}/100/100`;
                      return (
                        <SelectItem key={row.id} value={row.id}>
                          <span className="flex items-center gap-2 min-w-0">
                            <Avatar className="h-7 w-7 shrink-0 border border-border/50">
                              <AvatarImage src={src} alt="" />
                              <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
                            </Avatar>
                            <span className="truncate">{displayName}</span>
                          </span>
                        </SelectItem>
                      );
                    })}
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
                {isFilterActive && (filterStudentSessionsPerWeek ?? 0) > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">Aulas esta semana</span>
                      <span className="font-semibold">
                        {selectedStudentWeeklyCount}/{filterStudentSessionsPerWeek}
                      </span>
                    </div>
                    <Progress value={selectedStudentWeeklyProgress} className="h-2" />
                  </div>
                )}
              </div>

              <MonthCalendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => { if (d) setSelectedDate(d); }}
                modifiers={{
                  hasSlots: slotDates,
                  unavailable: isUnavailableDay,
                  hasProgram: assignedWeekDates,
                  pendingAttendance: pendingAttendanceDates,
                }}
                modifiersClassNames={{
                  hasSlots:   "bg-accent/20 text-accent font-semibold rounded-full",
                  hasProgram: "bg-primary/10 font-medium",
                  unavailable: "opacity-40 line-through text-muted-foreground",
                  pendingAttendance:
                    "ring-2 ring-amber-500/90 dark:ring-amber-400 ring-offset-2 ring-offset-background relative z-[1] rounded-full",
                }}
                className="rounded-md border max-w-full"
              />

              {/* Legend */}
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-accent/30 border border-accent/40 inline-block" />
                  Com sessões
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border-2 border-amber-500 dark:border-amber-400 inline-block" />
                  Presença pendente
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-muted border inline-block" />
                  Indisponível
                </span>
              </div>

              {/* Availability (collapsible preview) */}
              <Collapsible open={availabilityPreviewOpen} onOpenChange={setAvailabilityPreviewOpen}>
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex flex-1 min-w-0 items-center justify-between gap-2 rounded-md py-0.5 text-left outline-none ring-offset-background hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 min-w-0">
                          <Clock className="h-3.5 w-3.5 shrink-0" /> Disponibilidade
                        </span>
                        {availabilityPreviewOpen ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                    </CollapsibleTrigger>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 gap-1 text-xs shrink-0"
                      onClick={(e) => {
                        e.preventDefault();
                        openAvailability();
                      }}
                    >
                      <Settings2 className="h-3.5 w-3.5" /> Editar
                    </Button>
                  </div>
                  <CollapsibleContent className="space-y-1">
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
                  </CollapsibleContent>
                </div>
              </Collapsible>

              {/* Block settings (collapsible) */}
              <Collapsible open={blockSettingsPreviewOpen} onOpenChange={setBlockSettingsPreviewOpen}>
                <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-md py-0.5 text-left outline-none ring-offset-background hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Definições dos blocos
                      </span>
                      {blockSettingsPreviewOpen ? (
                        <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3">
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
                  </CollapsibleContent>
                </div>
              </Collapsible>
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
                          {!isContinuation && (slot?.students?.length ?? 0) > 0 && (
                            <div
                              className="flex flex-wrap items-center gap-1.5 mb-1.5"
                              aria-label="Inscritos neste bloco"
                            >
                              {slot!.students.map((st) => {
                                const src =
                                  st.studentPhotoUrl?.trim() ||
                                  rosterPhotoUrlForSlotStudent(rosterStudentsSorted, st.studentId);
                                const initial =
                                  (st.studentName || "").trim().charAt(0).toUpperCase() || "?";
                                const stAtt = normalizeAttendance(st.sessionAttendance);
                                return (
                                  <span
                                    key={st.studentId}
                                    title={st.studentName}
                                    className="relative inline-flex shrink-0"
                                  >
                                    <Avatar className={attendanceAvatarClassName(stAtt)}>
                                      <AvatarImage src={src} alt="" />
                                      <AvatarFallback className="text-[9px]">{initial}</AvatarFallback>
                                    </Avatar>
                                    {st.workoutPlanId ? (
                                      <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm ring-2 ring-background">
                                        <Dumbbell className="h-2 w-2" aria-hidden />
                                      </span>
                                    ) : null}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          {isContinuation ? (
                            <span className="text-xs text-primary/60 italic">↳ continuação</span>
                          ) : isSessionStart ? (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-primary">
                                Inscrito · {slotsPerSession * slotDurationMin} min
                              </p>
                              {myEntry && (
                                <Badge
                                  {...attendanceBadgeProps(
                                    normalizeAttendance(myEntry.sessionAttendance),
                                    true
                                  )}
                                >
                                  {normalizeAttendance(myEntry.sessionAttendance) === "present"
                                    ? "Presente"
                                    : normalizeAttendance(myEntry.sessionAttendance) === "absent"
                                      ? "Falta"
                                      : "Presença pendente"}
                                </Badge>
                              )}
                            </div>
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
                            <div className="flex flex-wrap items-center gap-1.5">
                              {slot!.students.map((st) => {
                                const src =
                                  st.studentPhotoUrl?.trim() ||
                                  rosterPhotoUrlForSlotStudent(rosterStudentsSorted, st.studentId);
                                const initial = st.studentName.trim().charAt(0).toUpperCase() || "?";
                                const stAtt = normalizeAttendance(st.sessionAttendance);
                                return (
                                  <span
                                    key={st.studentId}
                                    title={st.studentName}
                                    className="relative inline-flex shrink-0"
                                  >
                                    <Avatar className={attendanceAvatarClassName(stAtt)}>
                                      <AvatarImage src={src} alt="" />
                                      <AvatarFallback className="text-[9px]">{initial}</AvatarFallback>
                                    </Avatar>
                                    {st.workoutPlanId ? (
                                      <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm ring-2 ring-background">
                                        <Dumbbell className="h-2 w-2" aria-hidden />
                                      </span>
                                    ) : null}
                                  </span>
                                );
                              })}
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

        {/* ── Students booked on selected day (calendar) ─────────────────────── */}
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-primary" /> {t("calendarDayRosterTitle")}
                </CardTitle>
                <CardDescription>{selectedCalendarDayLabel}</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0 sm:justify-end">
                {db && user ? (
                  <AlertDialog
                    open={bulkClearOpen}
                    onOpenChange={(open) => {
                      setBulkClearOpen(open);
                      setBulkClearConfirm(open ? "" : "");
                    }}
                  >
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("bulkClearPlansButton")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("bulkClearPlansTitle")}</AlertDialogTitle>
                        <AlertDialogDescription className="space-y-3">
                          <span className="block">{t("bulkClearPlansDescription")}</span>
                          <span className="block font-medium text-foreground">{t("bulkClearPlansConfirmHint")}</span>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <div className="space-y-2 py-2">
                        <Label htmlFor="bulk-clear-plans-confirm">{t("bulkClearPlansConfirmPlaceholder")}</Label>
                        <Input
                          id="bulk-clear-plans-confirm"
                          autoComplete="off"
                          value={bulkClearConfirm}
                          onChange={(e) => setBulkClearConfirm(e.target.value)}
                          placeholder={t("bulkClearPlansConfirmPlaceholder")}
                          disabled={isBulkClearing}
                        />
                      </div>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isBulkClearing}>{t("cancel")}</AlertDialogCancel>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={bulkClearConfirm !== "DELETE" || isBulkClearing}
                          className="gap-2"
                          onClick={() => void handleBulkClearPlans()}
                        >
                          {isBulkClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {t("confirm")}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
                <Button
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => {
                    setAssignWeekStudentIds(isFilterActive && filterStudentId ? [filterStudentId] : []);
                    setAssignWeekOpen(true);
                  }}
                >
                  <UserPlus className="h-4 w-4" /> {t("assignProgram")}
                </Button>
              </div>
            </div>
            {isFilterActive && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10 w-fit"
                  onClick={handleRemoveAllAssignmentsForStudent}
                  disabled={isRemovingStudentAllAssignments}
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
            {studentsBookedOnSelectedDay.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("calendarDayRosterEmpty")}</p>
            ) : (
              <div className="space-y-6">
                {calendarRosterBuckets.noPlan.length > 0 ? (
                  <div className="rounded-lg border border-border/60 bg-muted/15 p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {t("calendarRosterSectionNoPlan")}
                    </p>
                    <div className="space-y-2">
                      {calendarRosterBuckets.noPlan.map((row) => (
                        <CalendarDayRosterRow
                          key={row.studentId}
                          row={row}
                          bucket="noPlan"
                          rosterStudentsSorted={rosterStudentsSorted}
                          unlockedProgramByFirestoreId={unlockedProgramByFirestoreId}
                          rosterPlanMetaByKey={rosterPlanMetaByKey}
                          sessionDayInferredPlanIdByFid={sessionDayInferredPlanIdByFid}
                          sessionRosterSessionTitleByExpandKey={sessionRosterSessionTitleByExpandKey}
                          sessionLatestSameDayWorkoutTitleByFid={sessionLatestSameDayWorkoutTitleByFid}
                          weekProgramSummaryByStudentId={weekProgramSummaryByStudentId}
                          expandedRosterPlanKey={expandedRosterPlanKey}
                          setExpandedRosterPlanKey={setExpandedRosterPlanKey}
                          rosterPlanDetailByKey={rosterPlanDetailByKey}
                          rosterSessionLogByKey={rosterSessionLogByKey}
                          t={t}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                {calendarRosterBuckets.active.length > 0 ? (
                  <div className="rounded-lg border border-border/60 bg-background p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {t("calendarRosterSectionActivePlan")}
                    </p>
                    <div className="space-y-2">
                      {calendarRosterBuckets.active.map((row) => (
                        <CalendarDayRosterRow
                          key={row.studentId}
                          row={row}
                          bucket="active"
                          rosterStudentsSorted={rosterStudentsSorted}
                          unlockedProgramByFirestoreId={unlockedProgramByFirestoreId}
                          rosterPlanMetaByKey={rosterPlanMetaByKey}
                          sessionDayInferredPlanIdByFid={sessionDayInferredPlanIdByFid}
                          sessionRosterSessionTitleByExpandKey={sessionRosterSessionTitleByExpandKey}
                          sessionLatestSameDayWorkoutTitleByFid={sessionLatestSameDayWorkoutTitleByFid}
                          weekProgramSummaryByStudentId={weekProgramSummaryByStudentId}
                          expandedRosterPlanKey={expandedRosterPlanKey}
                          setExpandedRosterPlanKey={setExpandedRosterPlanKey}
                          rosterPlanDetailByKey={rosterPlanDetailByKey}
                          rosterSessionLogByKey={rosterSessionLogByKey}
                          t={t}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                {calendarRosterBuckets.completed.length > 0 ? (
                  <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/25 p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {t("calendarRosterSectionCompletedPlan")}
                    </p>
                    <div className="space-y-2">
                      {calendarRosterBuckets.completed.map((row) => (
                        <CalendarDayRosterRow
                          key={row.studentId}
                          row={row}
                          bucket="completed"
                          rosterStudentsSorted={rosterStudentsSorted}
                          unlockedProgramByFirestoreId={unlockedProgramByFirestoreId}
                          rosterPlanMetaByKey={rosterPlanMetaByKey}
                          sessionDayInferredPlanIdByFid={sessionDayInferredPlanIdByFid}
                          sessionRosterSessionTitleByExpandKey={sessionRosterSessionTitleByExpandKey}
                          sessionLatestSameDayWorkoutTitleByFid={sessionLatestSameDayWorkoutTitleByFid}
                          weekProgramSummaryByStudentId={weekProgramSummaryByStudentId}
                          expandedRosterPlanKey={expandedRosterPlanKey}
                          setExpandedRosterPlanKey={setExpandedRosterPlanKey}
                          rosterPlanDetailByKey={rosterPlanDetailByKey}
                          rosterSessionLogByKey={rosterSessionLogByKey}
                          onRequestEditRosterSession={(p) => setRosterSessionEdit(p)}
                          t={t}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <EditWorkoutSessionDialog
        open={!!rosterSessionEdit}
        onOpenChange={(o) => !o && setRosterSessionEdit(null)}
        db={db}
        trainerUid={user?.uid}
        storageStudentId={rosterSessionEdit?.storageFid ?? ""}
        session={rosterSessionEdit?.session ?? null}
        t={t}
        toast={toast}
        onMutated={() => {
          setSessionLogRefreshTick((n) => n + 1);
          setPlanMetaRefreshTick((n) => n + 1);
        }}
      />
    </Navigation>
  );
}
