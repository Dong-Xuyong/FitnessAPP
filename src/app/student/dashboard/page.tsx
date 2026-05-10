
"use client";

import { StudentNavigation } from "@/components/StudentNavigation";
import { StudentProgressPanel } from "@/components/StudentProgressPanel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MilestonesTab } from "@/components/MilestonesTab";
import { Dumbbell, Calendar, Play, TrendingUp, Loader2, Flame, Target, Percent, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { useI18n } from "@/lib/i18n";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Milestone } from "@/lib/types";
import type { SessionSlotAttendance } from "@/lib/session-attendance-streak";
import { maxAttendanceStreakForCandidates } from "@/lib/session-attendance-streak";
import { countMonthlyWorkoutPlanCompletions } from "@/lib/student-monthly-workout-completion";

type DashTab = "home" | "progress" | "milestones";

function notifyDashboardTabUrlChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  window.dispatchEvent(new CustomEvent("student-dashboard-tabchange"));
}

export default function StudentDashboardPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState<DashTab>("home");

  const [studentData, setStudentData] = useState<any>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [lastSessionDoneAt, setLastSessionDoneAt] = useState<string | null>(null);
  const [monthlyDoneCount, setMonthlyDoneCount] = useState(0);
  const [monthlyPlannedCount, setMonthlyPlannedCount] = useState(0);

  /** Same rule as profile fetch: roster doc wins when coach keyed data under a different id. */
  const milestoneStudentDocId = useMemo(() => {
    const roster = studentData?.rosterDocId;
    if (typeof roster === "string" && roster.trim().length > 0) return roster;
    return user?.uid ?? "";
  }, [studentData?.rosterDocId, user?.uid]);

  /** Coach may key milestones by roster doc id; Firebase auth uid stays the same student. */
  const milestoneStudentIds = useMemo(() => {
    const ids = new Set<string>();
    if (user?.uid) ids.add(user.uid);
    const roster = studentData?.rosterDocId;
    if (typeof roster === "string" && roster.length > 0) ids.add(roster);
    return Array.from(ids);
  }, [user?.uid, studentData?.rosterDocId]);

  const milestonesRef = useMemoFirebase(() => {
    if (!db || !studentData?.trainerId || milestoneStudentIds.length === 0) return null;
    return query(
      collection(db, "milestones"),
      where("trainerId", "==", studentData.trainerId),
      where("studentId", "in", milestoneStudentIds)
    );
  }, [db, studentData?.trainerId, milestoneStudentIds]);

  const { data: allMilestones, isLoading: isMilestonesLoading } = useCollection(milestonesRef);
  const studentMilestones: Milestone[] = useMemo(
    () =>
      ((allMilestones || []) as Milestone[]).sort((a, b) => {
        const statusOrder: Record<string, number> = { active: 0, paused: 1, missed: 2, completed: 3 };
        const aStatus = statusOrder[a.status] ?? 999;
        const bStatus = statusOrder[b.status] ?? 999;
        if (aStatus !== bStatus) return aStatus - bStatus;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }),
    [allMilestones]
  );

  const homeMilestonesPreview = useMemo(
    () =>
      studentMilestones.filter((m) => m.status === "active" || m.status === "paused").slice(0, 5),
    [studentMilestones]
  );

  useEffect(() => {
    if (!user?.uid) {
      setIsLoadingProfile(false);
      setStudentData(null);
      setCurrentStreak(0);
      setLastSessionDoneAt(null);
      setMonthlyDoneCount(0);
      setMonthlyPlannedCount(0);
      return;
    }
    if (!db) {
      setIsLoadingProfile(false);
      return;
    }

    async function findStudentProfile() {
      setIsLoadingProfile(true);
      try {
        const globalRef = doc(db, "students", user!.uid);
        const globalSnap = await getDoc(globalRef);

        if (globalSnap.exists()) {
          const profileData = globalSnap.data();
          setStudentData(profileData);

          if (profileData?.trainerId) {
            // Use rosterDocId if set (handles cases where data is stored under a different doc ID)
            const effectiveStudentId = (profileData.rosterDocId as string | undefined) || user!.uid;
            const trainerId = profileData.trainerId as string;
            const [sessionsSnap, plansSnap, trainerSnap, sessionSlotsSnap] = await Promise.all([
              getDocs(
                collection(db, "personalTrainers", trainerId, "students", effectiveStudentId, "workoutSessions")
              ),
              getDocs(collection(db, "personalTrainers", trainerId, "students", effectiveStudentId, "workoutPlans")),
              getDoc(doc(db, "personalTrainers", trainerId)),
              getDocs(collection(db, "personalTrainers", trainerId, "sessionSlots")),
            ]);

            const planRows = plansSnap.docs.map((planDoc) => ({
              id: planDoc.id,
              data: planDoc.data() as Record<string, unknown>,
            }));
            const sessionRows = sessionsSnap.docs.map((d) => ({
              data: d.data() as Record<string, unknown>,
            }));
            const { done: doneMonth, planned: plannedMonth } = countMonthlyWorkoutPlanCompletions(
              planRows,
              sessionRows,
              new Date()
            );
            setMonthlyDoneCount(doneMonth);
            setMonthlyPlannedCount(plannedMonth);

            const slotDm = Number(trainerSnap.data()?.slotDurationMin) || 30;
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
            const candidateIds = Array.from(new Set([effectiveStudentId, user!.uid].filter(Boolean)));
            setCurrentStreak(
              maxAttendanceStreakForCandidates(sessionSlotsList, candidateIds, Date.now(), slotDm)
            );

            const latestSessionTimestamp = sessionsSnap.docs.reduce((latest, sessionDoc) => {
              const data: any = sessionDoc.data();
              const timestamp = Date.parse(data?.completedAt || data?.date || data?.createdAt || "");
              if (!Number.isFinite(timestamp)) return latest;
              return timestamp > latest ? timestamp : latest;
            }, 0);
            setLastSessionDoneAt(latestSessionTimestamp > 0 ? new Date(latestSessionTimestamp).toISOString() : null);
          } else {
            setCurrentStreak(0);
            setLastSessionDoneAt(null);
            setMonthlyDoneCount(0);
            setMonthlyPlannedCount(0);
          }
        }
      } catch (e) {
        console.error("Error finding student profile", e);
      } finally {
        setIsLoadingProfile(false);
      }
    }

    findStudentProfile();
  }, [db, user?.uid]);

  useEffect(() => {
    const parseHash = () => {
      const h = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
      if (h === "progress") setActiveTab("progress");
      else if (h === "milestones") setActiveTab("milestones");
      else setActiveTab("home");
    };
    parseHash();
    window.addEventListener("hashchange", parseHash);
    window.addEventListener("student-dashboard-tabchange", parseHash);
    return () => {
      window.removeEventListener("hashchange", parseHash);
      window.removeEventListener("student-dashboard-tabchange", parseHash);
    };
  }, []);

  const onDashboardTabChange = useCallback((value: string) => {
    const v = value as DashTab;
    setActiveTab(v);
    if (typeof window === "undefined") return;
    if (v === "home") {
      window.history.replaceState(null, "", "/student/dashboard");
    } else {
      window.history.replaceState(null, "", `/student/dashboard#${v}`);
    }
    notifyDashboardTabUrlChange();
  }, []);

  if (isUserLoading || isLoadingProfile) {
    return (
      <StudentNavigation>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StudentNavigation>
    );
  }

  if (!studentData) {
    return (
      <StudentNavigation>
        <div className="max-w-lg mx-auto py-16 text-center space-y-4">
          <h2 className="text-2xl font-bold font-headline">{t("welcome")}</h2>
          <p className="text-muted-foreground">
            {t("noProfileYet")}
          </p>
          <Button asChild>
            <Link href="/student/profile">{t("goToProfile")}</Link>
          </Button>
        </div>
      </StudentNavigation>
    );
  }

  const firstName =
    studentData.name?.split(" ")[0] || studentData.firstName || "Student";

  const trainingStatusDescription =
    !studentData.trainerId
      ? t("noTrainerLinked")
      : studentData.currentProgramId
        ? t("activeProgramInProgress")
        : t("waitingForCoach");

  return (
    <StudentNavigation>
      <Tabs value={activeTab} onValueChange={onDashboardTabChange} className="space-y-6">
        <TabsList className="bg-card border h-auto w-full grid grid-cols-3">
          <TabsTrigger value="home">{t("myDashboard")}</TabsTrigger>
          <TabsTrigger value="progress">{t("progress")}</TabsTrigger>
          <TabsTrigger value="milestones">{t("milestones")}</TabsTrigger>
        </TabsList>

        <TabsContent value="home" className="space-y-6">
          <header>
            <h1 className="text-3xl font-bold font-headline">{t("welcomeBack2")}{firstName}!</h1>
            <p className="text-muted-foreground capitalize">
              {t("goalPrefix")}{studentData.goalType?.replace("_", " ") || "—"}
            </p>
          </header>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="md:col-span-2 bg-primary text-primary-foreground">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{t("trainingStatus")}</CardTitle>
                  <CardDescription className="text-primary-foreground/80">
                    {trainingStatusDescription}
                  </CardDescription>
                </div>
                <Dumbbell className="h-8 w-8 opacity-20" />
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{t("sessionAttendanceStreakTitle")}</span>
                    <span>
                      {currentStreak} {t("sessionsStreakCompact")}{" "}
                      <Flame className="inline h-4 w-4" />
                    </span>
                  </div>
                  <Progress
                    value={Math.min(currentStreak * 10, 100)}
                    className="h-2 bg-primary-foreground/20"
                  />
                  <p className="text-xs text-primary-foreground/70">{t("sessionAttendanceStreakHint")}</p>
                </div>
                {studentData.trainerId && (
                  <div className="space-y-2 pt-4 border-t border-primary-foreground/15">
                    <div className="flex justify-between text-sm gap-4">
                      <span className="flex items-center gap-2 shrink-0">
                        <ClipboardCheck className="h-4 w-4" aria-hidden />
                        {t("goalCompletion")}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {monthlyDoneCount} / {monthlyPlannedCount}
                      </span>
                    </div>
                    <p className="text-xs text-primary-foreground/70">{t("workoutsCompletedThisMonth")}</p>
                  </div>
                )}
                <div className="flex items-center justify-between pt-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm">
                      {t("lastSession")}{" "}
                      {lastSessionDoneAt
                        ? new Date(lastSessionDoneAt).toLocaleDateString()
                        : t("noHistory")}
                    </span>
                  </div>
                  {studentData.currentProgramId && (
                    <Button variant="secondary" asChild>
                      <Link href={`/student/workouts/${studentData.currentProgramId}/session`}>
                        <Play className="h-4 w-4 mr-2" /> {t("resume")}
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("physicalStats")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-bold">{studentData.weightKg} kg</p>
                    <p className="text-xs text-muted-foreground">
                      {t("weightGoalLabel").replace("{n}", String(studentData.goalWeightKg))}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Target className="h-5 w-5 text-accent" />
                  <div>
                    <p className="text-sm font-bold">{studentData.heightCm} cm</p>
                    <p className="text-xs text-muted-foreground">{t("height")}</p>
                  </div>
                </div>
                {(Number(studentData.bodyFatPercent) > 0 || Number(studentData.goalBodyFatPercent) > 0) && (
                  <div className="flex items-center gap-3 p-3 border rounded-lg">
                    <Percent className="h-5 w-5 text-orange-500" />
                    <div>
                      <p className="text-sm font-bold">
                        {studentData.bodyFatPercent != null && Number(studentData.bodyFatPercent) > 0
                          ? `${studentData.bodyFatPercent}%`
                          : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {Number(studentData.goalBodyFatPercent) > 0
                          ? t("bodyFatGoalLabel").replace("{n}", String(studentData.goalBodyFatPercent))
                          : t("bodyFat")}
                      </p>
                    </div>
                  </div>
                )}
                <div className="text-xs text-center py-2 bg-muted rounded">
                  {t("statusLabel")}{" "}
                  <span className="font-bold capitalize">
                    {studentData.subscriptionStatus || "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {studentData.trainerId ? (
            <Card>
              <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Target className="h-5 w-5 text-primary shrink-0" />
                    {t("milestones")}
                  </CardTitle>
                  <CardDescription>{t("nextGoalsToCelebrate")}</CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-stretch sm:self-auto"
                  onClick={() => onDashboardTabChange("milestones")}
                >
                  {t("milestonesViewAll")}
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {isMilestonesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : homeMilestonesPreview.length > 0 ? (
                  homeMilestonesPreview.map((milestone) => {
                    const dueDate = new Date(milestone.dueDate);
                    const today = new Date();
                    const daysLeft = Math.ceil(
                      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                    );
                    const dateText = Number.isNaN(dueDate.getTime())
                      ? "—"
                      : daysLeft < 0
                        ? t("overdue")
                        : daysLeft === 0
                          ? t("today")
                          : t("inDays").replace("{n}", String(daysLeft));
                    return (
                      <div
                        key={milestone.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{milestone.title}</p>
                          {typeof milestone.description === "string" && milestone.description.trim() ? (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {milestone.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          {milestone.status === "paused" ? (
                            <Badge variant="secondary" className="text-[10px] uppercase">
                              {t("paused")}
                            </Badge>
                          ) : null}
                          <Badge
                            variant="outline"
                            className="pointer-events-none flex items-center gap-1 normal-case"
                          >
                            <Calendar className="h-3 w-3" aria-hidden /> {dateText}
                          </Badge>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">{t("noMilestonesYet")}</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="progress" className="space-y-6">
          <StudentProgressPanel />
        </TabsContent>

        <TabsContent value="milestones" className="space-y-6">
          {studentData.trainerId ? (
            milestoneStudentDocId ? (
              <MilestonesTab
                db={db}
                user={{ uid: studentData.trainerId }}
                studentId={milestoneStudentDocId}
                milestones={studentMilestones}
                isLoading={isMilestonesLoading}
                studentView
                onMilestonesChange={() => {
                  // Firestore live query will refresh this automatically.
                }}
              />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>{t("milestones")}</CardTitle>
                  <CardDescription>{t("signInRequired")}</CardDescription>
                </CardHeader>
              </Card>
            )
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t("milestones")}</CardTitle>
                <CardDescription>{t("noTrainerLinked")}</CardDescription>
              </CardHeader>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </StudentNavigation>
  );
}
