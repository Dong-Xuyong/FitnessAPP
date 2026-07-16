"use client";

import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TrendingUp, Users, Award, Calendar, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { collection, deleteDoc, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import {
  countMonthlySessionAttendanceStats,
  monthlySessionAllowance,
  type SessionSlotAttendance,
} from "@/lib/session-attendance-streak";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RosterMonthlySessionChart } from "@/components/RosterMonthlySessionChart";

const COACH_DASH_TABS = ["students", "progress", "milestones"] as const;
type CoachDashTab = (typeof COACH_DASH_TABS)[number];

function parseCoachDashTab(raw: string | null): CoachDashTab {
  if (raw && (COACH_DASH_TABS as readonly string[]).includes(raw)) {
    return raw as CoachDashTab;
  }
  return "students";
}

function computeEpleyOneRm(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const limit = Math.max(1, Math.min(concurrency, items.length));

  async function runWorker() {
    while (nextIndex < items.length) {
      const i = nextIndex;
      nextIndex += 1;
      results[i] = await worker(items[i]);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}

type LeaderboardRow = {
  studentId: string;
  name: string;
  booked: number;
  present: number;
  absent: number;
  monthlyAllowance: number | null;
};

function ProgressPageContent() {
  const { t } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeCoachTab = useMemo(() => parseCoachDashTab(tabParam), [tabParam]);

  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const [pendingDeleteMilestoneId, setPendingDeleteMilestoneId] = useState<string | null>(null);
  const [deletingMilestoneId, setDeletingMilestoneId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [growthMetric, setGrowthMetric] = useState(0);
  const [topPerformer, setTopPerformer] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsReady, setMetricsReady] = useState(false);
  const [metricsLoadFailed, setMetricsLoadFailed] = useState(false);
  const [presenceLoadFailed, setPresenceLoadFailed] = useState(false);
  /** Global `students/{docId}` display names for milestone.studentId / roster id fallbacks */
  const [directoryNamesByStudentDocId, setDirectoryNamesByStudentDocId] = useState<
    Record<string, string>
  >({});

  const milestonesRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return query(collection(db, "milestones"), where("trainerId", "==", user.uid));
  }, [db, user]);

  const rosterStudentsRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user]);

  const { data: allMilestones } = useCollection(milestonesRef);
  const { data: rosterStudents } = useCollection(rosterStudentsRef);

  /** Display name (never Firestore IDs) + student profile URL slug (roster doc id preferred). */
  const rosterMilestoneRouting = useMemo(() => {
    const displayByKey = new Map<string, string>();
    const rosterIdByKey = new Map<string, string>();
    type RosterRow = { id?: string; firstName?: string; lastName?: string; name?: string; email?: string; userId?: string };

    for (const row of rosterStudents || []) {
      const s = row as RosterRow;
      const rosterId = typeof s?.id === "string" ? s.id : "";
      if (!rosterId) continue;
      const display =
        `${s.firstName || ""} ${s.lastName || ""}`.trim() ||
        (typeof s.name === "string" ? s.name.trim() : "") ||
        (typeof s.email === "string" ? s.email.trim() : "");
      rosterIdByKey.set(rosterId, rosterId);
      if (display) {
        displayByKey.set(rosterId, display);
      }

      const authUid =
        typeof s.userId === "string" && s.userId.trim().length > 0 ? s.userId.trim() : "";
      if (authUid && authUid !== rosterId) {
        rosterIdByKey.set(authUid, rosterId);
        if (display) {
          displayByKey.set(authUid, display);
        }
      }
    }

    function resolve(studentId?: string): {
      rosterPathId: string;
      displayName: string | null;
    } | null {
      if (!studentId?.trim()) return null;
      const sid = studentId.trim();
      const rosterPathId = rosterIdByKey.get(sid) ?? sid;
      const displayName = displayByKey.get(sid) ?? displayByKey.get(rosterPathId) ?? null;
      return { rosterPathId, displayName };
    }

    return { resolve };
  }, [rosterStudents]);

  // Fast path: Presence leaderboard only needs roster + sessionSlots.
  useEffect(() => {
    if (!db || !user || isUserLoading) return;

    let cancelled = false;

    async function loadPresenceLeaderboard() {
      setIsLoading(true);
      setPresenceLoadFailed(false);
      try {
        const rosterRef = collection(db, "personalTrainers", user.uid, "students");
        const [rosterSnap, sessionSlotsSnap] = await Promise.all([
          getDocs(rosterRef),
          getDocs(collection(db, "personalTrainers", user.uid, "sessionSlots")),
        ]);

        if (cancelled) return;

        const sessionSlotsList: SessionSlotAttendance[] = sessionSlotsSnap.docs.map((d) => {
          const data = d.data() as SessionSlotAttendance;
          return {
            ...data,
            id: d.id,
            date: String(data.date ?? ""),
            startTime: String(data.startTime ?? ""),
            students: Array.isArray(data.students) ? data.students : [],
          };
        });

        const now = new Date();
        const leaderboardData: LeaderboardRow[] = rosterSnap.docs.map((studentDoc) => {
          const studentData = studentDoc.data() as Record<string, unknown>;
          const studentId = studentDoc.id;
          const displayName =
            `${String(studentData.firstName || "")} ${String(studentData.lastName || "")}`.trim() ||
            String(studentData.name || "") ||
            String(studentData.email || "") ||
            "Unknown";
          const candidateIds = [studentId, studentData.userId]
            .map((x) => String(x || "").trim())
            .filter(Boolean);
          const { booked, present, absent } = countMonthlySessionAttendanceStats(
            sessionSlotsList,
            candidateIds,
            now
          );
          return {
            studentId,
            name: displayName,
            booked,
            present,
            absent,
            monthlyAllowance: monthlySessionAllowance(
              Number(studentData.sessionsPerWeek) || null,
              now
            ),
          };
        });

        setLeaderboard(
          leaderboardData.sort(
            (a, b) =>
              b.booked - a.booked ||
              b.absent - a.absent ||
              a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
          )
        );
      } catch (error) {
        console.error("Error loading presence leaderboard", error);
        if (!cancelled) {
          setPresenceLoadFailed(true);
          setLeaderboard([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadPresenceLeaderboard();
    return () => {
      cancelled = true;
    };
  }, [db, user, isUserLoading]);

  const rosterLoaded = rosterStudents != null;
  const rosterIdsKey = useMemo(
    () =>
      (rosterStudents ?? [])
        .map((s) => String((s as { id?: string }).id || ""))
        .filter(Boolean)
        .sort()
        .join(","),
    [rosterStudents]
  );
  const rosterStudentsDataRef = useRef(rosterStudents);
  rosterStudentsDataRef.current = rosterStudents;

  // Heavy Progress-tab metrics: load only when that tab is open, with bounded concurrency.
  useEffect(() => {
    if (!db || !user || isUserLoading) return;
    if (activeCoachTab !== "progress") return;
    if (metricsReady) return;
    if (!rosterLoaded) return;

    const fs = db;
    const rosterRows = (rosterStudentsDataRef.current || []) as Array<
      Record<string, unknown> & { id: string }
    >;
    const trainerUid = user.uid;
    let cancelled = false;

    async function loadProgressMetrics() {
      setMetricsLoading(true);
      setMetricsLoadFailed(false);
      try {
        type StudentMetric = {
          growth: number;
          topCandidate: {
            studentId: string;
            name: string;
            firstName?: string;
            lastName?: string;
            photoUrl?: string;
            dynamicStreak: number;
          } | null;
        };

        const perStudent = await mapPool(rosterRows, 5, async (student): Promise<StudentMetric> => {
          const studentId = student.id;
          const [plansSnap, sessionsSnap] = await Promise.all([
            getDocs(collection(fs, "personalTrainers", trainerUid, "students", studentId, "workoutPlans")),
            getDocs(
              collection(fs, "personalTrainers", trainerUid, "students", studentId, "workoutSessions")
            ),
          ]);

          const completedPlanIds = new Set<string>();
          let studentGrowth = 0;

          sessionsSnap.forEach((sessDoc) => {
            const data = sessDoc.data() as Record<string, unknown>;
            if (!data.completedAt) return;
            if (typeof data.workoutPlanId === "string") {
              completedPlanIds.add(data.workoutPlanId);
            }
            const exercises = Array.isArray(data.exercises) ? data.exercises : [];
            for (const exercise of exercises) {
              const sets = Array.isArray((exercise as { sets?: unknown }).sets)
                ? ((exercise as { sets: Array<{ weight?: unknown; reps?: unknown; completed?: boolean }> }).sets)
                : [];
              for (const set of sets) {
                if (set.completed === false) continue;
                const oneRm = computeEpleyOneRm(Number(set.weight) || 0, Number(set.reps) || 0);
                if (oneRm > 0) studentGrowth += oneRm / 30;
              }
            }
          });

          const displayName =
            `${String(student.firstName || "")} ${String(student.lastName || "")}`.trim() ||
            String(student.name || "") ||
            String(student.email || "") ||
            "Unknown";

          const sortedPlans = plansSnap.docs
            .map((d) => ({
              id: d.id,
              assignedAt: String(d.data().assignedAt || d.data().createdAt || ""),
            }))
            .sort((a, b) => (b.assignedAt || "").localeCompare(a.assignedAt || ""));
          let dynamicStreak = 0;
          for (const plan of sortedPlans) {
            if (completedPlanIds.has(plan.id)) dynamicStreak += 1;
            else break;
          }

          return {
            growth: studentGrowth,
            topCandidate: {
              studentId,
              name: displayName,
              firstName: typeof student.firstName === "string" ? student.firstName : undefined,
              lastName: typeof student.lastName === "string" ? student.lastName : undefined,
              photoUrl: typeof student.photoUrl === "string" ? student.photoUrl : undefined,
              dynamicStreak,
            },
          };
        });

        if (cancelled) return;

        let maxGrowth = 0;
        let topStudent: StudentMetric["topCandidate"] = null;
        for (const row of perStudent) {
          if (row.growth > maxGrowth) maxGrowth = row.growth;
          if (
            row.topCandidate &&
            (!topStudent || row.topCandidate.dynamicStreak > (topStudent.dynamicStreak || 0))
          ) {
            topStudent = row.topCandidate;
          }
        }

        setGrowthMetric(Number(maxGrowth.toFixed(1)));
        setTopPerformer(topStudent);
        setMetricsReady(true);
      } catch (error) {
        console.error("Error calculating progress metrics", error);
        if (!cancelled) setMetricsLoadFailed(true);
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    }

    void loadProgressMetrics();
    return () => {
      cancelled = true;
    };
    // rosterIdsKey avoids restarting when useCollection emits a new array for the same roster.
  }, [db, user, isUserLoading, activeCoachTab, rosterLoaded, rosterIdsKey, metricsReady]);

  /** Attendance show-up rate from calendar sessions; falls back to roster fill vs monthly limit. */
  const teamPresenceMetric = useMemo(() => {
    let present = 0;
    let absent = 0;
    let booked = 0;
    let allowance = 0;
    for (const row of leaderboard) {
      present += row.present;
      absent += row.absent;
      booked += row.booked;
      if (row.monthlyAllowance != null) allowance += row.monthlyAllowance;
    }
    const marked = present + absent;
    if (marked > 0) {
      return {
        kind: "attendance" as const,
        percent: Math.round((present / marked) * 100),
      };
    }
    if (allowance > 0) {
      return {
        kind: "fill" as const,
        percent: Math.min(100, Math.round((booked / allowance) * 100)),
      };
    }
    if (booked > 0) {
      return { kind: "booked" as const, booked };
    }
    return { kind: "empty" as const };
  }, [leaderboard]);

  const activeMilestones = useMemo(() => {
    if (!allMilestones) return [];
    return (allMilestones as any[])
      .filter((m) => m.status === "active" || m.status === "paused")
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 3);
  }, [allMilestones]);

  const milestoneGlobalDirectoryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of activeMilestones) {
      if (typeof m.studentId !== "string" || !m.studentId.trim()) continue;
      const sid = m.studentId.trim();
      ids.add(sid);
      const r = rosterMilestoneRouting.resolve(sid);
      if (r?.rosterPathId && r.rosterPathId !== sid) {
        ids.add(r.rosterPathId);
      }
    }
    return [...ids].sort();
  }, [activeMilestones, rosterMilestoneRouting]);

  useEffect(() => {
    if (!db || milestoneGlobalDirectoryIds.length === 0) return;
    let cancelled = false;

    async function enrichFromGlobalStudentDocs() {
      const next: Record<string, string> = {};
      await Promise.all(
        milestoneGlobalDirectoryIds.map(async (docId) => {
          try {
            const snap = await getDoc(doc(db, "students", docId));
            if (!snap.exists()) return;
            const d = snap.data() as Record<string, unknown>;
            const name =
              [d.firstName, d.lastName]
                .map((x) => (typeof x === "string" ? x.trim() : ""))
                .filter(Boolean)
                .join(" ")
                .trim() ||
              (typeof d.name === "string" ? d.name.trim() : "");
            if (name && !cancelled) {
              next[docId] = name;
            }
          } catch {
            /* ignored */
          }
        })
      );
      if (!cancelled && Object.keys(next).length > 0) {
        setDirectoryNamesByStudentDocId((prev) => ({ ...prev, ...next }));
      }
    }

    void enrichFromGlobalStudentDocs();
    return () => {
      cancelled = true;
    };
  }, [db, milestoneGlobalDirectoryIds]);

  const handleConfirmDeleteMilestone = async () => {
    if (!pendingDeleteMilestoneId || !db || !user) return;
    const id = pendingDeleteMilestoneId;
    setDeletingMilestoneId(id);
    try {
      await deleteDoc(doc(db, "milestones", id));
      toast({
        title: t("milestoneDeletedTitle"),
        description: t("milestoneDeletedDesc"),
      });
      setPendingDeleteMilestoneId(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({
        variant: "destructive",
        title: t("error"),
        description: message,
      });
    } finally {
      setDeletingMilestoneId(null);
    }
  };

  if (isUserLoading) {
    return (
      <Navigation>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Navigation>
    );
  }

  return (
    <Navigation>
      <div className="space-y-8">
        <Tabs
          value={activeCoachTab}
          onValueChange={(v) => {
            const next = parseCoachDashTab(v);
            router.replace(`/progress?tab=${next}`, { scroll: false });
          }}
          className="space-y-6"
        >
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1 sm:inline-flex sm:w-auto sm:max-w-full sm:flex-wrap sm:justify-start">
            <TabsTrigger
              value="students"
              className="whitespace-normal px-2 py-2 text-center text-[11px] leading-tight sm:px-3 sm:text-sm sm:leading-none"
            >
              {t("coachDashboardTabStudents")}
            </TabsTrigger>
            <TabsTrigger
              value="progress"
              className="whitespace-normal px-2 py-2 text-center text-[11px] leading-tight sm:px-3 sm:text-sm sm:leading-none"
            >
              {t("coachDashboardTabProgress")}
            </TabsTrigger>
            <TabsTrigger
              value="milestones"
              className="whitespace-normal px-2 py-2 text-center text-[11px] leading-tight sm:px-3 sm:text-sm sm:leading-none"
            >
              {t("coachDashboardTabMilestones")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="students" className="mt-0 focus-visible:outline-none">
            <Card>
              <CardHeader>
                <CardTitle>{t("completionLeaderboard")}</CardTitle>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
                  <span className="text-yellow-600 dark:text-yellow-400">
                    ● {t("coachRosterLegendBooked")}
                  </span>
                  <span className="text-destructive">● {t("coachRosterLegendAbsent")}</span>
                  <span className="text-neutral-900 dark:text-neutral-100">
                    ● {t("coachRosterLegendAllowance")}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : presenceLoadFailed ? (
                  <p className="text-sm text-destructive">{t("coachRosterMetricsLoadFailed")}</p>
                ) : leaderboard.length > 0 ? (
                  <RosterMonthlySessionChart rows={leaderboard} />
                ) : (rosterStudents?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noStudentsAssigned")}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("coachRosterMetricsLoadFailed")}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="progress" className="mt-0 focus-visible:outline-none">
            {metricsLoadFailed ? (
              <p className="text-sm text-destructive mb-4">{t("coachRosterMetricsLoadFailed")}</p>
            ) : null}
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="bg-primary text-primary-foreground overflow-hidden relative">
                <div className="absolute right-0 bottom-0 opacity-10">
                  <Award className="w-32 h-32" />
                </div>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    {teamPresenceMetric.kind === "fill"
                      ? t("teamFillRateTitle")
                      : teamPresenceMetric.kind === "booked"
                        ? t("teamSessionsBookedTitle")
                        : t("teamAttendanceTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Loader2 className="h-8 w-8 animate-spin mb-2" />
                  ) : teamPresenceMetric.kind === "attendance" ||
                    teamPresenceMetric.kind === "fill" ? (
                    <div className="text-4xl font-bold mb-2">{teamPresenceMetric.percent}%</div>
                  ) : teamPresenceMetric.kind === "booked" ? (
                    <div className="text-4xl font-bold mb-2">{teamPresenceMetric.booked}</div>
                  ) : (
                    <div className="text-4xl font-bold mb-2">—</div>
                  )}
                  <p className="text-sm opacity-90">
                    {teamPresenceMetric.kind === "fill"
                      ? t("teamFillRateDesc")
                      : teamPresenceMetric.kind === "booked"
                        ? t("teamSessionsBookedDesc")
                        : teamPresenceMetric.kind === "empty"
                          ? t("teamAttendanceEmptyDesc")
                          : t("teamAttendanceDesc")}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-accent text-accent-foreground">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    {t("growthMetric")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {metricsLoading || (!metricsReady && !metricsLoadFailed) ? (
                    <Loader2 className="h-8 w-8 animate-spin mb-2" />
                  ) : (
                    <div className="text-4xl font-bold mb-2">+{growthMetric}kg</div>
                  )}
                  <p className="text-sm opacity-90">{t("teamGrowthDesc")}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    {t("topPerformer")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-4">
                  {metricsLoading || (!metricsReady && !metricsLoadFailed) ? (
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  ) : topPerformer ? (
                    <>
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={topPerformer.photoUrl || `https://picsum.photos/seed/${topPerformer.studentId}/100/100`} />
                        <AvatarFallback>{topPerformer.firstName?.[0]}{topPerformer.lastName?.[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold">{topPerformer.name}</p>
                        <p className="text-xs text-muted-foreground">{(topPerformer.dynamicStreak || 0) + " " + t("sessionsStreak")}</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("noRosterStudentsYet")}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="milestones" className="mt-0 focus-visible:outline-none">
            <Card>
              <CardHeader>
                <CardTitle>{t("upcomingMilestones")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {activeMilestones.length > 0 ? (
                  activeMilestones.map((milestone: any) => {
                    const dueDate = new Date(milestone.dueDate);
                    const today = new Date();
                    const daysLeft = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    const dateText = daysLeft < 0 ? t("overdue") : daysLeft === 0 ? t("today") : t("inDays").replace("{n}", String(daysLeft));

                    const sid =
                      typeof milestone.studentId === "string" ? milestone.studentId.trim() : "";
                    const resolved = sid ? rosterMilestoneRouting.resolve(sid) : null;
                    const rosterPathId = resolved?.rosterPathId ?? sid;
                    const fromDirectory =
                      (sid ? directoryNamesByStudentDocId[sid] : undefined) ||
                      (rosterPathId && rosterPathId !== sid
                        ? directoryNamesByStudentDocId[rosterPathId]
                        : undefined);

                    const rawDocNameMaybe =
                      typeof milestone.studentName === "string" ? milestone.studentName.trim() : "";
                    const storedNameLooksLikeFirestoreId =
                      rawDocNameMaybe.length >= 22 && /^[a-zA-Z0-9_-]+$/.test(rawDocNameMaybe);

                    const studentPrimaryLine =
                      (rawDocNameMaybe && !storedNameLooksLikeFirestoreId ? rawDocNameMaybe : null) ??
                      resolved?.displayName ??
                      fromDirectory ??
                      t("student");

                    const studentHref =
                      milestone.studentId && typeof milestone.studentId === "string"
                        ? `/students/${rosterPathId}?tab=milestones`
                        : null;

                    const linkBody = (
                      <>
                        <div className="min-w-0 pr-3 text-left">
                          <p className="text-sm font-bold truncate">{studentPrimaryLine}</p>
                          <p className="text-xs text-muted-foreground truncate">{milestone.title}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className="flex shrink-0 items-center gap-1 pointer-events-none"
                        >
                          <Calendar className="h-3 w-3" /> {dateText}
                        </Badge>
                      </>
                    );

                    return (
                      <div
                        key={milestone.id}
                        className="flex rounded-lg border bg-card/50 overflow-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
                      >
                        {studentHref ? (
                          <Link
                            href={studentHref}
                            className="flex flex-1 min-w-0 items-center justify-between p-3 hover:bg-accent/50 transition-colors outline-none focus-visible:bg-accent/50"
                          >
                            {linkBody}
                          </Link>
                        ) : (
                          <div className="flex flex-1 items-center justify-between p-3 min-w-0">
                            {linkBody}
                          </div>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 rounded-none border-l px-4 h-auto self-stretch text-destructive hover:text-destructive hover:bg-destructive/10"
                          aria-label={t("delete")}
                          disabled={Boolean(deletingMilestoneId)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDeleteMilestoneId(String(milestone.id));
                          }}
                        >
                          {deletingMilestoneId === milestone.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">{t("noMilestonesYet")}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <AlertDialog
          open={!!pendingDeleteMilestoneId}
          onOpenChange={(open) => !open && setPendingDeleteMilestoneId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteMilestoneConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("deleteMilestoneConfirmDesc")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={!!deletingMilestoneId}>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(ev) => {
                  ev.preventDefault();
                  void handleConfirmDeleteMilestone();
                }}
                disabled={!!deletingMilestoneId}
              >
                {deletingMilestoneId ? <Loader2 className="h-4 w-4 animate-spin" /> : t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Navigation>
  );
}

function ProgressPageFallback() {
  return (
    <Navigation>
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </Navigation>
  );
}

export default function ProgressPage() {
  return (
    <Suspense fallback={<ProgressPageFallback />}>
      <ProgressPageContent />
    </Suspense>
  );
}
