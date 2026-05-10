"use client";

import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
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
import { collection, deleteDoc, doc, getDoc, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";

function computeEpleyOneRm(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

export default function ProgressPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const [pendingDeleteMilestoneId, setPendingDeleteMilestoneId] = useState<string | null>(null);
  const [deletingMilestoneId, setDeletingMilestoneId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<Array<{ name: string; score: number }>>([]);
  const [growthMetric, setGrowthMetric] = useState(0);
  const [topPerformer, setTopPerformer] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  useEffect(() => {
    if (!db || !user || isUserLoading) return;

    let cancelled = false;

    async function calculateMetrics() {
      setIsLoading(true);
      try {
        const { getDocs, collection: collectionFunc } = await import("firebase/firestore");
        
        // Get all roster students
        const rosterRef = collectionFunc(db, "personalTrainers", user.uid, "students");
        const rosterSnap = await getDocs(rosterRef);
        
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        const leaderboardData: Array<{ name: string; score: number }> = [];
        let maxGrowth = 0;
        let topStudent: any = null;
        
        for (const studentDoc of rosterSnap.docs) {
          const studentData: any = studentDoc.data();
          const studentId = studentDoc.id;
          
          // Get workout plans and sessions this month
          const [plansSnap, sessionsSnap] = await Promise.all([
            getDocs(collectionFunc(db, "personalTrainers", user.uid, "students", studentId, "workoutPlans")),
            getDocs(collectionFunc(db, "personalTrainers", user.uid, "students", studentId, "workoutSessions")),
          ]);
          
          const completedPlanIds = new Set<string>();
          let studentGrowth = 0;
          
          sessionsSnap.forEach((sessDoc) => {
            const data: any = sessDoc.data();
            if (data.completedAt) {
              completedPlanIds.add(data.workoutPlanId);
              
              // Calculate strength growth per session
              (data.exercises || []).forEach((exercise: any) => {
                if (Array.isArray(exercise.sets)) {
                  exercise.sets.forEach((set: any) => {
                    if (set.completed !== false) {
                      const oneRm = computeEpleyOneRm(Number(set.weight) || 0, Number(set.reps) || 0);
                      if (oneRm > 0) studentGrowth += oneRm / 30; // Approximate growth contribution
                    }
                  });
                }
              });
            }
          });
          
          // Month completion rate
          const monthPlans = plansSnap.docs.filter((planDoc) => {
            const assignedDate = new Date(planDoc.data().assignedAt || planDoc.data().createdAt || "");
            return assignedDate >= monthStart && assignedDate <= monthEnd;
          });
          
          const monthCompleted = monthPlans.filter((p) => completedPlanIds.has(p.id)).length;
          const completionRate = monthPlans.length > 0 ? Math.round((monthCompleted / monthPlans.length) * 100) : 0;
          
          leaderboardData.push({
            name: `${studentData.firstName || ""} ${studentData.lastName || ""}`.trim() || studentData.name || studentData.email || "Unknown",
            score: completionRate,
          });
          
          // Track growth
          if (studentGrowth > maxGrowth) {
            maxGrowth = studentGrowth;
          }
          
          // Compute dynamic streak from consecutive completed workout plans (most recent first)
          const completedPlanIdsSet = completedPlanIds;
          const sortedPlans = plansSnap.docs
            .map((d) => ({ id: d.id, assignedAt: d.data().assignedAt || d.data().createdAt || "" }))
            .sort((a, b) => (b.assignedAt || "").localeCompare(a.assignedAt || ""));
          let dynamicStreak = 0;
          for (const plan of sortedPlans) {
            if (completedPlanIdsSet.has(plan.id)) {
              dynamicStreak += 1;
            } else {
              break;
            }
          }

          const displayName = `${studentData.firstName || ""} ${studentData.lastName || ""}`.trim() || studentData.name || studentData.email || "Unknown";

          // Track top performer by dynamic streak
          if (!topStudent || dynamicStreak > (topStudent.dynamicStreak || 0)) {
            topStudent = { ...studentData, studentId, name: displayName, dynamicStreak };
          }
        }
        
        if (!cancelled) {
          setLeaderboard(leaderboardData.sort((a, b) => b.score - a.score));
          setGrowthMetric(Number(maxGrowth.toFixed(1)));
          setTopPerformer(topStudent);
        }
      } catch (error) {
        console.error("Error calculating metrics", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    calculateMetrics();
    return () => { cancelled = true; };
  }, [db, user, isUserLoading]);

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
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="bg-primary text-primary-foreground overflow-hidden relative">
            <div className="absolute right-0 bottom-0 opacity-10">
              <Award className="w-32 h-32" />
            </div>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                {t("teamVelocity")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold mb-2">{leaderboard.length > 0 ? Math.round(leaderboard.reduce((sum, s) => sum + s.score, 0) / leaderboard.length) : 0}%</div>
              <p className="text-sm opacity-90">{t("avgCompletionRate")}</p>
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
              <div className="text-4xl font-bold mb-2">+{growthMetric}kg</div>
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
              {topPerformer ? (
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

        <div className="grid lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>{t("completionLeaderboard")}</CardTitle>
              <CardDescription>{t("completionLeaderboardDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {leaderboard.length > 0 ? (
                leaderboard.map((item, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between text-sm font-medium">
                      <span>{item.name}</span>
                      <span>{item.score}%</span>
                    </div>
                    <Progress value={item.score} className="h-2" />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{t("noStudentsAssigned")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("upcomingMilestones")}</CardTitle>
              <CardDescription>{t("nextGoalsToCelebrate")}</CardDescription>
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
        </div>

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
