
"use client";

import { useState, useEffect, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dumbbell, Clock, Play, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore } from "@/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import type { DayOfWeek } from "@/lib/types";

interface WorkoutSession {
  id: string;
  workoutPlanId?: string;
  workoutTitle?: string;
  date?: string;
  exercises?: Array<{
    exerciseName?: string;
    sets?: Array<{
      setNumber?: number;
      weight?: number;
      reps?: number;
      completed?: boolean;
    }>;
  }>;
  completedAt?: string;
}

function formatDayOfWeek(day: DayOfWeek | undefined): string {
  if (!day) return "Unscheduled";
  return day.charAt(0).toUpperCase() + day.slice(1);
}

function getWorkoutAssignedTimestamp(workout: WorkoutPlan): number {
  const rawDate = workout.assignedAt || workout.createdAt;
  if (!rawDate) return 0;
  const timestamp = Date.parse(rawDate);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getTodayDayOfWeek(): DayOfWeek {
  const days: DayOfWeek[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return days[new Date().getDay()];
}

function getWorkoutScheduledTimestamp(workout: WorkoutPlan): number {
  return getWorkoutAssignedTimestamp(workout);
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isWorkoutAvailableToday(workout: WorkoutPlan, todayDayOfWeek: DayOfWeek): boolean {
  // Check if this workout is scheduled for today's day of week
  if (workout.scheduledDayOfWeek !== todayDayOfWeek) return false;
  
  // Also verify the assigned date is today, not a future occurrence of the same day
  const assignedRaw = workout.assignedAt || workout.createdAt;
  if (!assignedRaw) return false;
  
  const assignedDate = new Date(assignedRaw);
  if (Number.isNaN(assignedDate.getTime())) return false;
  
  return isSameLocalDate(assignedDate, new Date());
}

function daysUntilScheduledDay(scheduledDayOfWeek: DayOfWeek | undefined, assignedRaw: string | undefined): number {
  if (!scheduledDayOfWeek || !assignedRaw) return -1;
  
  const assignedDate = new Date(assignedRaw);
  if (Number.isNaN(assignedDate.getTime())) return -1;
  
  const today = new Date();
  const diffMs = assignedDate.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  // Return the difference, but minimum of 1 day for future dates
  return diffDays > 0 ? diffDays : (diffDays === 0 ? 0 : -1);
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
    setDetails?: Array<{
      setNumber: number;
      reps: string;
      targetWeightKg?: number;
      restTimeSeconds: number;
    }>;
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

export default function StudentWorkoutsPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { t } = useI18n();
  const [workouts, setWorkouts] = useState<WorkoutPlan[]>([]);
  const [completedWorkouts, setCompletedWorkouts] = useState<WorkoutSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const todayDayOfWeek = getTodayDayOfWeek();

  const { currentWeekWorkouts, otherWorkouts } = useMemo(() => {
    const weekNumbers = workouts
      .map((workout) => workout.weekNumber)
      .filter((week): week is number => typeof week === "number" && Number.isFinite(week));

    const sortByAssignedDateAsc = (a: WorkoutPlan, b: WorkoutPlan) =>
      getWorkoutScheduledTimestamp(a) - getWorkoutScheduledTimestamp(b);

    if (weekNumbers.length === 0) {
      return {
        currentWeekWorkouts: [...workouts].sort(sortByAssignedDateAsc),
        otherWorkouts: [] as WorkoutPlan[],
      };
    }

    const workoutsByWeek = new Map<number, WorkoutPlan[]>();
    workouts.forEach((workout) => {
      if (typeof workout.weekNumber !== "number") return;
      const existing = workoutsByWeek.get(workout.weekNumber) || [];
      existing.push(workout);
      workoutsByWeek.set(workout.weekNumber, existing);
    });

    const orderedWeeks = Array.from(workoutsByWeek.entries())
      .map(([weekNumber, weekWorkouts]) => ({
        weekNumber,
        workouts: [...weekWorkouts].sort(sortByAssignedDateAsc),
        startTimestamp: Math.min(...weekWorkouts.map((workout) => getWorkoutScheduledTimestamp(workout))),
        endTimestamp: Math.max(...weekWorkouts.map((workout) => getWorkoutScheduledTimestamp(workout))),
      }))
      .sort((a, b) => a.startTimestamp - b.startTimestamp);

    const now = new Date();
    const todayTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const activeWeek = orderedWeeks.find(
      (week) => week.startTimestamp <= todayTimestamp && week.endTimestamp >= todayTimestamp
    );
    const upcomingWeek = orderedWeeks.find((week) => week.startTimestamp >= todayTimestamp);
    const selectedWeek = activeWeek || upcomingWeek || orderedWeeks[orderedWeeks.length - 1];

    return {
      currentWeekWorkouts: selectedWeek.workouts,
      otherWorkouts: orderedWeeks
        .filter((week) => week.weekNumber !== selectedWeek.weekNumber)
        .flatMap((week) => week.workouts),
    };
  }, [workouts]);

  useEffect(() => {
    if (!db || !user?.uid) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchWorkouts() {
      setIsLoading(true);
      try {
        // Get trainerId from the student's global profile
        const studentDoc = await getDoc(doc(db, "students", user!.uid));
        if (!studentDoc.exists()) {
          setIsLoading(false);
          return;
        }
        const trainerId = studentDoc.data()?.trainerId;
        if (!trainerId) {
          setIsLoading(false);
          return;
        }
        // Use rosterDocId if set (handles cases where workouts were stored under
        // a different roster doc ID than the student's Auth UID).
        const rosterDocId = (studentDoc.data()?.rosterDocId as string | undefined) || user!.uid;

        // Fetch workout plans assigned by the trainer
        const plansCol = collection(
          db,
          "personalTrainers",
          trainerId,
          "students",
          rosterDocId,
          "workoutPlans"
        );
        const sessionsCol = collection(
          db,
          "personalTrainers",
          trainerId,
          "students",
          rosterDocId,
          "workoutSessions"
        );
        const [plansSnap, sessionsSnap] = await Promise.all([getDocs(plansCol), getDocs(sessionsCol)]);

        if (cancelled) return;

        const plans: WorkoutPlan[] = plansSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as WorkoutPlan[];
        const sessions: WorkoutSession[] = sessionsSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as WorkoutSession[];

        const completedPlanIds = new Set(
          sessions
            .filter((session) => session.completedAt && session.workoutPlanId)
            .map((session) => session.workoutPlanId as string)
        );
        const completedSessions = [...sessions]
          .filter((session) => session.completedAt)
          .sort((a, b) => {
            const aTime = Date.parse(a.completedAt || a.date || "");
            const bTime = Date.parse(b.completedAt || b.date || "");
            return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
          });

        const activePlans = plans.filter(
          (plan) =>
            !plan.completedAt &&
            plan.status !== "completed" &&
            !completedPlanIds.has(plan.id)
        );

        // Sort newest assigned date first
        activePlans.sort((a, b) => getWorkoutAssignedTimestamp(b) - getWorkoutAssignedTimestamp(a));
        setWorkouts(activePlans);
        setCompletedWorkouts(completedSessions);
      } catch (e) {
        console.error("Error fetching workouts", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchWorkouts();
    return () => {
      cancelled = true;
    };
  }, [db, user?.uid]);

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

        {workouts.length === 0 ? (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <Dumbbell className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-bold">{t("noActiveWorkouts")}</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {t("noActiveWorkoutsDesc")}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{t("currentWeek")}</h2>
                <Badge variant="outline">{t("currentSchedule")}</Badge>
              </div>

              {currentWeekWorkouts.map((workout) => {
                const canStartToday = isWorkoutAvailableToday(workout, todayDayOfWeek);
                return (
                  <Card key={workout.id} className="group hover:border-accent transition-colors">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-1 flex-1">
                          <h2 className="text-2xl font-bold">{workout.title}</h2>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-2">
                            <span className="flex items-center gap-1">
                              <Dumbbell className="h-4 w-4" /> {workout.exercises?.length || 0} {t("exercisesLabel")}
                            </span>
                            {(workout.assignedAt || workout.createdAt) && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4" /> {t("assigned")} {new Date(workout.assignedAt || workout.createdAt || "").toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {(workout.weekNumber || workout.scheduledDayOfWeek || typeof workout.weightIncreaseKg === "number") && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {workout.weekNumber ? (
                                <Badge variant="outline" className="text-xs">
                                  Week {workout.weekNumber}{workout.totalWeeks ? ` of ${workout.totalWeeks}` : ""}
                                </Badge>
                              ) : null}
                              {workout.scheduledDayOfWeek ? (
                                <Badge variant="outline" className="text-xs">
                                  {formatDayOfWeek(workout.scheduledDayOfWeek)}
                                </Badge>
                              ) : null}
                              {typeof workout.weightIncreaseKg === "number" ? (
                                <Badge variant="outline" className="text-xs">
                                  +{workout.weightIncreaseKg} kg
                                </Badge>
                              ) : null}
                            </div>
                          )}
                          {workout.exercises && workout.exercises.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {workout.exercises.map((ex, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {ex.exerciseName}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          {canStartToday ? (
                            <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 flex-1 sm:flex-none" asChild>
                              <Link href={`/student/workouts/${workout.id}/session`}>
                                <Play className="h-4 w-4" /> {t("startSession")}
                              </Link>
                            </Button>
                          ) : (
                            <Button className="gap-2 flex-1 sm:flex-none" variant="outline" disabled>
                              <Play className="h-4 w-4" />
                              {t("availableInDays").replace("{n}", String(daysUntilScheduledDay(workout.scheduledDayOfWeek, workout.assignedAt || workout.createdAt)))}
                            </Button>
                          )}
                          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform hidden sm:block" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {otherWorkouts.length > 0 ? (
              <Card className="border-dashed bg-muted/20">
                <CardHeader>
                  <CardTitle className="text-base">{t("otherAssignedWorkouts")}</CardTitle>
                  <CardDescription>{t("otherAssignedWorkoutsDesc")}</CardDescription>
                </CardHeader>
              </Card>
            ) : null}

            {otherWorkouts.map((workout) => {
              const canStartToday = isWorkoutAvailableToday(workout, todayDayOfWeek);
              return (
                <Card key={workout.id} className="group hover:border-accent transition-colors">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="space-y-1 flex-1">
                        <h2 className="text-2xl font-bold">{workout.title}</h2>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-2">
                          <span className="flex items-center gap-1">
                            <Dumbbell className="h-4 w-4" /> {workout.exercises?.length || 0} {t("exercisesLabel")}
                          </span>
                          {(workout.assignedAt || workout.createdAt) && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" /> {t("assigned")} {new Date(workout.assignedAt || workout.createdAt || "").toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {(workout.weekNumber || workout.scheduledDayOfWeek || typeof workout.weightIncreaseKg === "number") && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {workout.weekNumber ? (
                              <Badge variant="outline" className="text-xs">
                                Week {workout.weekNumber}{workout.totalWeeks ? ` of ${workout.totalWeeks}` : ""}
                              </Badge>
                            ) : null}
                            {workout.scheduledDayOfWeek ? (
                              <Badge variant="outline" className="text-xs">
                                {formatDayOfWeek(workout.scheduledDayOfWeek)}
                              </Badge>
                            ) : null}
                            {typeof workout.weightIncreaseKg === "number" ? (
                              <Badge variant="outline" className="text-xs">
                                +{workout.weightIncreaseKg} kg
                              </Badge>
                            ) : null}
                          </div>
                        )}
                        {workout.exercises && workout.exercises.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {workout.exercises.map((ex, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {ex.exerciseName}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        {canStartToday ? (
                          <Button className="bg-accent text-accent-foreground hover:bg-accent/90 gap-2 flex-1 sm:flex-none" asChild>
                            <Link href={`/student/workouts/${workout.id}/session`}>
                              <Play className="h-4 w-4" /> {t("startSession")}
                            </Link>
                          </Button>
                        ) : (
                          <Button className="gap-2 flex-1 sm:flex-none" variant="outline" disabled>
                            <Play className="h-4 w-4" />
                            {t("availableInDays").replace("{n}", String(daysUntilScheduledDay(workout.scheduledDayOfWeek, workout.assignedAt || workout.createdAt)))}
                          </Button>
                        )}
                        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform hidden sm:block" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {completedWorkouts.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("workoutHistory")}</h2>
              <Badge variant="secondary">{completedWorkouts.length} {t("completedCount")}</Badge>
            </div>

            <div className="grid gap-4">
              {completedWorkouts.map((session) => {
                const completedDate = session.completedAt || session.date;
                const totalSets = (session.exercises || []).reduce(
                  (sum, exercise) => sum + (exercise.sets?.length || 0),
                  0
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
                            {completedDate ? (
                              <span className="flex items-center gap-1">
                                <Clock className="h-4 w-4" /> {t("completed")} {new Date(completedDate).toLocaleDateString()}
                              </span>
                            ) : null}
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
        ) : null}
      </div>
    </StudentNavigation>
  );
}
