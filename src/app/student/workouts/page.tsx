
"use client";

import { useState, useEffect, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Dumbbell, Clock, Play, CheckCircle2, Loader2, AlertTriangle, CalendarDays } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore } from "@/firebase";
import { doc, getDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import type { DayOfWeek } from "@/lib/types";

interface WorkoutSession {
  id: string;
  workoutPlanId?: string;
  workoutTitle?: string;
  date?: string;
  exercises?: Array<{
    exerciseName?: string;
    sets?: Array<{ setNumber?: number; weight?: number; reps?: number; completed?: boolean }>;
  }>;
  completedAt?: string;
}

interface WorkoutPlan {
  id: string;
  title: string;
  exercises: Array<{
    exerciseName: string;
    sets: number;
    reps: string;
    restTimeSeconds: number;
    targetWeightKg?: number;
    notes?: string;
  }>;
  createdAt?: string;
  assignedAt?: string;
  completedAt?: string;
  status?: string;
  weekNumber?: number;
  totalWeeks?: number;
  scheduledDayOfWeek?: DayOfWeek;
  weightIncreaseKg?: number;
}

function daysUntilDate(raw: string | undefined): number {
  if (!raw) return 0;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 0;
  const today = new Date();
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const planMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((planMs - todayMs) / 86_400_000);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function StudentWorkoutsPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { t } = useI18n();
  const [workouts, setWorkouts] = useState<WorkoutPlan[]>([]);
  const [completedWorkouts, setCompletedWorkouts] = useState<WorkoutSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expiredCount, setExpiredCount] = useState(0);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  useEffect(() => {
    if (!db || !user?.uid) { setIsLoading(false); return; }
    let cancelled = false;

    async function fetchWorkouts() {
      setIsLoading(true);
      try {
        const studentDoc = await getDoc(doc(db, "students", user!.uid));
        if (!studentDoc.exists()) { setIsLoading(false); return; }
        const trainerId = studentDoc.data()?.trainerId;
        if (!trainerId) { setIsLoading(false); return; }
        const rosterDocId = (studentDoc.data()?.rosterDocId as string | undefined) || user!.uid;

        const [plansSnap, sessionsSnap] = await Promise.all([
          getDocs(collection(db, "personalTrainers", trainerId, "students", rosterDocId, "workoutPlans")),
          getDocs(collection(db, "personalTrainers", trainerId, "students", rosterDocId, "workoutSessions")),
        ]);
        if (cancelled) return;

        const plans: WorkoutPlan[] = plansSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as WorkoutPlan[];
        const sessions: WorkoutSession[] = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as WorkoutSession[];

        const completedPlanIds = new Set(
          sessions.filter((s) => s.completedAt && s.workoutPlanId).map((s) => s.workoutPlanId as string)
        );
        const completedSessions = [...sessions]
          .filter((s) => s.completedAt)
          .sort((a, b) => Date.parse(b.completedAt || "") - Date.parse(a.completedAt || ""));

        const expiredPlans = plans.filter((p) => {
          if (p.completedAt || p.status === "completed" || p.status === "expired") return false;
          if (completedPlanIds.has(p.id)) return false;
          const raw = p.assignedAt || p.createdAt;
          return raw ? daysUntilDate(raw) < 0 : false;
        });

        for (const p of expiredPlans) {
          try {
            await updateDoc(
              doc(db, "personalTrainers", trainerId, "students", rosterDocId, "workoutPlans", p.id),
              { status: "expired", expiredAt: new Date().toISOString() }
            );
          } catch {}
        }

        if (!cancelled && expiredPlans.length > 0) setExpiredCount(expiredPlans.length);

        const activePlans = plans.filter((p) => {
          if (p.completedAt || p.status === "completed" || p.status === "expired") return false;
          if (completedPlanIds.has(p.id)) return false;
          if (expiredPlans.some((e) => e.id === p.id)) return false;
          const raw = p.assignedAt || p.createdAt;
          return raw ? daysUntilDate(raw) >= 0 : true;
        });

        activePlans.sort((a, b) => {
          const at = Date.parse(a.assignedAt || a.createdAt || "");
          const bt = Date.parse(b.assignedAt || b.createdAt || "");
          return (isNaN(at) ? 0 : at) - (isNaN(bt) ? 0 : bt);
        });

        setWorkouts(activePlans);
        setCompletedWorkouts(completedSessions);
      } catch (e) {
        console.error("Error fetching workouts", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchWorkouts();
    return () => { cancelled = true; };
  }, [db, user?.uid]);

  // Dates that have at least one workout
  const workoutDates = useMemo(
    () => workouts.map((w) => new Date(w.assignedAt || w.createdAt || "")).filter((d) => !isNaN(d.getTime())),
    [workouts]
  );

  // Workouts scheduled for the currently selected date
  const selectedDayWorkouts = useMemo(
    () => workouts.filter((w) => {
      const raw = w.assignedAt || w.createdAt;
      if (!raw) return false;
      return isSameDay(new Date(raw), selectedDate);
    }),
    [workouts, selectedDate]
  );

  // Next upcoming workout (soonest date)
  const nextWorkout = useMemo(
    () => workouts.find((w) => {
      const raw = w.assignedAt || w.createdAt;
      return raw && daysUntilDate(raw) >= 0;
    }),
    [workouts]
  );

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
          <p className="text-muted-foreground">{t("followAssigned")}</p>
        </header>

        {expiredCount > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-orange-400/40 bg-orange-50 dark:bg-orange-950/20 px-4 py-3 text-sm text-orange-800 dark:text-orange-200">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-orange-500" />
            <span>
              {expiredCount} {expiredCount === 1 ? t("workoutExpiredSingular") : t("workoutExpiredPlural")}{" "}
              {t("workoutExpiredCoachNotified")}
            </span>
          </div>
        )}

        {workouts.length === 0 ? (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Dumbbell className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold">{t("noActiveWorkouts")}</h3>
              <p className="text-muted-foreground max-w-md mx-auto">{t("noActiveWorkoutsDesc")}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-5 gap-6">
            {/* Calendar panel */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  {t("myWorkouts")}
                </CardTitle>
                <CardDescription>{t("followAssigned")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { if (d) setSelectedDate(d); }}
                  modifiers={{ workout: workoutDates }}
                  modifiersClassNames={{ workout: "bg-primary/15 text-primary font-semibold rounded-full" }}
                  className="w-full rounded-md border"
                />

                {/* Selected day label */}
                <p className="text-xs text-muted-foreground font-medium">
                  {selectedDate.toLocaleDateString(undefined, {
                    weekday: "long", day: "numeric", month: "long", year: "numeric",
                  })}
                </p>

                {/* Workouts for selected day */}
                {selectedDayWorkouts.length > 0 ? (
                  <div className="space-y-2">
                    {selectedDayWorkouts.map((w) => {
                      const canStart = daysUntilDate(w.assignedAt || w.createdAt) === 0;
                      return (
                        <div key={w.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors">
                          <Dumbbell className="h-4 w-4 text-primary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{w.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {w.exercises?.length || 0} {t("exercisesLabel")}
                              {w.weekNumber ? ` · Week ${w.weekNumber}${w.totalWeeks ? `/${w.totalWeeks}` : ""}` : ""}
                              {typeof w.weightIncreaseKg === "number" ? ` · +${w.weightIncreaseKg} kg` : ""}
                            </p>
                          </div>
                          {canStart ? (
                            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90 gap-1.5 shrink-0" asChild>
                              <Link href={`/student/workouts/${w.id}/session`}>
                                <Play className="h-3.5 w-3.5" /> {t("startSession")}
                              </Link>
                            </Button>
                          ) : (
                            <Badge variant="outline" className="shrink-0 text-xs">
                              {daysUntilDate(w.assignedAt || w.createdAt) > 0
                                ? t("availableInDays").replace("{n}", String(daysUntilDate(w.assignedAt || w.createdAt)))
                                : t("today") || "Hoje"}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("noAssignmentsOnDate") || "Nenhum treino neste dia."}</p>
                )}
              </CardContent>
            </Card>

            {/* Upcoming workouts panel */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">{t("upcomingAssignments") || "Próximos Treinos"}</CardTitle>
                <CardDescription>{t("nextScheduledWorkouts") || "Próximos treinos agendados"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {workouts.map((w) => {
                  const raw = w.assignedAt || w.createdAt;
                  if (!raw) return null;
                  const d = new Date(raw);
                  if (isNaN(d.getTime())) return null;
                  const days = daysUntilDate(raw);
                  const isToday = days === 0;
                  const isSelected = isSameDay(d, selectedDate);

                  return (
                    <button
                      key={w.id}
                      onClick={() => setSelectedDate(d)}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "bg-card hover:bg-accent/5"
                      }`}
                    >
                      <div className={`flex flex-col items-center justify-center min-w-[44px] rounded-md px-2 py-1 shrink-0 ${
                        isToday ? "bg-accent/20" : "bg-primary/10"
                      }`}>
                        <span className={`text-[10px] font-bold uppercase ${isToday ? "text-accent" : "text-primary"}`}>
                          {d.toLocaleDateString(undefined, { month: "short" })}
                        </span>
                        <span className="text-lg font-bold leading-none">{d.getDate()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{w.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {w.exercises?.length || 0} {t("exercisesLabel")}
                          {w.weekNumber ? ` · Week ${w.weekNumber}${w.totalWeeks ? `/${w.totalWeeks}` : ""}` : ""}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {isToday && (
                            <Badge className="text-[10px] h-4 px-1.5 bg-green-100 text-green-800">{t("today")}</Badge>
                          )}
                          {!isToday && days > 0 && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                              {t("availableInDays").replace("{n}", String(days))}
                            </Badge>
                          )}
                          {w.scheduledDayOfWeek && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 capitalize">
                              {w.scheduledDayOfWeek}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
                {nextWorkout === undefined && (
                  <p className="text-sm text-muted-foreground">{t("noUpcomingAssignments")}</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Workout history */}
        {completedWorkouts.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("workoutHistory")}</h2>
              <Badge variant="secondary">{completedWorkouts.length} {t("completedCount")}</Badge>
            </div>
            <div className="grid gap-4">
              {completedWorkouts.map((session) => {
                const completedDate = session.completedAt || session.date;
                const totalSets = (session.exercises || []).reduce(
                  (sum, ex) => sum + (ex.sets?.length || 0), 0
                );
                return (
                  <Card key={session.id} className="bg-muted/10 border-muted">
                    <CardContent className="p-5">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-accent" />
                            <h3 className="text-lg font-semibold">{session.workoutTitle || t("completedWorkout")}</h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Dumbbell className="h-4 w-4" /> {(session.exercises || []).length} {t("exercisesLabel")}
                            </span>
                            <span>{totalSets} {t("setsLabel")}</span>
                            {completedDate && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4" /> {t("completed")} {new Date(completedDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className="w-fit">{t("completed")}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </StudentNavigation>
  );
}
