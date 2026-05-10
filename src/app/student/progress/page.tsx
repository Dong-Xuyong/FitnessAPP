"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Award, Calendar, Target, Flame } from "lucide-react";
import { useUser, useFirestore } from "@/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import type { SessionSlotAttendance } from "@/lib/session-attendance-streak";
import { maxAttendanceStreakForCandidates } from "@/lib/session-attendance-streak";

function computeEpleyOneRm(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

export default function StudentProgressPage() {
  const { t } = useI18n();
  const { user } = useUser();
  const db = useFirestore();
  const [currentStreak, setCurrentStreak] = useState(0);
  const [goalCompletionPercent, setGoalCompletionPercent] = useState(0);
  const [monthlyPlannedCount, setMonthlyPlannedCount] = useState(0);
  const [monthlyDoneCount, setMonthlyDoneCount] = useState(0);
  const [selectedStrengthExercises, setSelectedStrengthExercises] = useState<string[]>([]);
  const [strengthExerciseOptions, setStrengthExerciseOptions] = useState<string[]>([]);
  const [strengthSeriesByExercise, setStrengthSeriesByExercise] = useState<
    Record<string, Array<{ timestamp: number; oneRm: number }>>
  >({});
  const [personalBests, setPersonalBests] = useState<
    Array<{ exerciseName: string; oneRm: number; weight: number; reps: number; date: string }>
  >([]);

  useEffect(() => {
    if (!db || !user?.uid) return;
    const uid = user.uid;

    let cancelled = false;

    async function fetchProgressMetrics() {
      try {
        const studentSnap = await getDoc(doc(db, "students", uid));
        if (!studentSnap.exists()) return;

        const trainerId = studentSnap.data()?.trainerId;
        const resolvedStudentId = (studentSnap.data()?.rosterDocId as string | undefined) || uid;
        if (!trainerId) return;

        const [sessionsSnap, workoutPlansSnap, trainerSnap, sessionSlotsSnap] = await Promise.all([
          getDocs(collection(db, "personalTrainers", trainerId, "students", resolvedStudentId, "workoutSessions")),
          getDocs(collection(db, "personalTrainers", trainerId, "students", resolvedStudentId, "workoutPlans")),
          getDoc(doc(db, "personalTrainers", trainerId)),
          getDocs(collection(db, "personalTrainers", trainerId, "sessionSlots")),
        ]);

        if (cancelled) return;

        const completedPlanIds = new Set(
          sessionsSnap.docs
            .map((sessionDoc) => sessionDoc.data()?.workoutPlanId)
            .filter((planId): planId is string => typeof planId === "string" && planId.length > 0)
        );

        const nowDate = new Date();
        const currentMonth = nowDate.getMonth();
        const currentYear = nowDate.getFullYear();

        const monthPlannedWorkouts = workoutPlansSnap.docs
          .map((planDoc) => ({
            id: planDoc.id,
            data: planDoc.data() as any,
          }))
          .filter((plan) => {
            const scheduledRaw = plan.data.weekStart || plan.data.assignedAt || plan.data.createdAt || "";
            const scheduledDate = new Date(scheduledRaw);
            if (Number.isNaN(scheduledDate.getTime())) return false;
            return (
              scheduledDate.getMonth() === currentMonth &&
              scheduledDate.getFullYear() === currentYear
            );
          });

        const doneThisMonth = monthPlannedWorkouts.filter((plan) => completedPlanIds.has(plan.id)).length;
        const plannedThisMonth = monthPlannedWorkouts.length;
        const completion = plannedThisMonth > 0 ? Math.round((doneThisMonth / plannedThisMonth) * 100) : 0;

        setMonthlyDoneCount(doneThisMonth);
        setMonthlyPlannedCount(plannedThisMonth);
        setGoalCompletionPercent(completion);

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
        const candidateIds = Array.from(new Set([resolvedStudentId, uid].filter(Boolean)));
        setCurrentStreak(
          maxAttendanceStreakForCandidates(sessionSlotsList, candidateIds, Date.now(), slotDm)
        );

        const oneRmByExercise = new Map<string, Array<{ timestamp: number; oneRm: number }>>();
        const bestByExercise = new Map<string, { oneRm: number; timestamp: number; weight: number; reps: number }>();
        sessionsSnap.docs.forEach((sessionDoc) => {
          const sessionData: any = sessionDoc.data();
          const timestamp = Date.parse(sessionData.completedAt || sessionData.date || "");
          if (!Number.isFinite(timestamp)) return;

          (sessionData.exercises || []).forEach((exercise: any, exerciseIndex: number) => {
            const exerciseName = (exercise.exerciseName || exercise.name || `Exercise ${exerciseIndex + 1}`).trim();
            if (!exerciseName) return;

            let bestOneRm = 0;
            let bestWeight = 0;
            let bestReps = 0;
            if (Array.isArray(exercise.sets)) {
              exercise.sets.forEach((set: any) => {
                const setWeight = Number(set?.weight) || 0;
                const setReps = Number(set?.reps) || 0;
                const oneRm = computeEpleyOneRm(setWeight, setReps);
                if (oneRm > bestOneRm) {
                  bestOneRm = oneRm;
                  bestWeight = setWeight;
                  bestReps = setReps;
                }
              });
            } else {
              const setWeight = Number(exercise?.weight) || 0;
              const setReps = Number(exercise?.reps) || 0;
              const oneRm = computeEpleyOneRm(setWeight, setReps);
              if (oneRm > bestOneRm) {
                bestOneRm = oneRm;
                bestWeight = setWeight;
                bestReps = setReps;
              }
            }

            if (bestOneRm <= 0) return;

            const bucket = oneRmByExercise.get(exerciseName) || [];
            bucket.push({ timestamp, oneRm: bestOneRm });
            oneRmByExercise.set(exerciseName, bucket);

            const currentBest = bestByExercise.get(exerciseName);
            if (!currentBest || bestOneRm > currentBest.oneRm) {
              bestByExercise.set(exerciseName, {
                oneRm: bestOneRm,
                timestamp,
                weight: bestWeight,
                reps: bestReps,
              });
            }
          });
        });

        const computedPersonalBests = Array.from(bestByExercise.entries())
          .map(([exerciseName, best]) => ({
            exerciseName,
            oneRm: Number(best.oneRm.toFixed(1)),
            weight: Number(best.weight.toFixed(1)),
            reps: best.reps,
            date: new Date(best.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          }))
          .sort((a, b) => b.oneRm - a.oneRm);
        setPersonalBests(computedPersonalBests);

        const options = Array.from(oneRmByExercise.keys()).sort((a, b) => a.localeCompare(b));
        setStrengthExerciseOptions(options);
        const seriesObj: Record<string, Array<{ timestamp: number; oneRm: number }>> = {};
        oneRmByExercise.forEach((points, exerciseName) => {
          seriesObj[exerciseName] = [...points].sort((a, b) => a.timestamp - b.timestamp);
        });
        setStrengthSeriesByExercise(seriesObj);
        setSelectedStrengthExercises((prev) => prev.filter((name) => options.includes(name)).slice(0, 3));
      } catch (error) {
        console.error("Failed to calculate total volume", error);
      }
    }

    fetchProgressMetrics();

    return () => {
      cancelled = true;
    };
  }, [db, user?.uid]);

  const toggleStrengthExercise = (exerciseName: string) => {
    setSelectedStrengthExercises((prev) => {
      if (prev.includes(exerciseName)) return prev.filter((name) => name !== exerciseName);
      if (prev.length >= 3) return prev;
      return [...prev, exerciseName];
    });
  };

  const strengthChartData = useMemo(() => {
    if (selectedStrengthExercises.length === 0) return [];
    const byTimestamp = new Map<number, Record<string, string | number>>();

    selectedStrengthExercises.forEach((exerciseName) => {
      const series = strengthSeriesByExercise[exerciseName] || [];
      series.forEach((point) => {
        const row = byTimestamp.get(point.timestamp) || {
          timestamp: point.timestamp,
          date: new Date(point.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        };
        row[exerciseName] = Number(point.oneRm.toFixed(1));
        byTimestamp.set(point.timestamp, row);
      });
    });

    return Array.from(byTimestamp.values()).sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  }, [selectedStrengthExercises, strengthSeriesByExercise]);

  return (
    <StudentNavigation>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">{t("myProgress")}</h1>
          <p className="text-muted-foreground">{t("visualizeJourney")}</p>
        </header>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-primary text-primary-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Flame className="h-4 w-4" />
                {t("sessionAttendanceStreakTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {currentStreak} {t("sessionsStreakCompact")}
              </div>
              <p className="text-xs opacity-80 mt-1">{t("sessionAttendanceStreakHint")}</p>
            </CardContent>
          </Card>

          <Card className="bg-accent text-accent-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4" />
                {t("goalCompletion")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{goalCompletionPercent}%</div>
              <Progress value={goalCompletionPercent} className="h-2 mt-2 bg-accent-foreground/20" />
              <p className="text-xs opacity-80 mt-1">
                {monthlyDoneCount} / {monthlyPlannedCount} {t("workoutsCompletedThisMonth")}
              </p>
            </CardContent>
          </Card>

        </div>

        <div className="grid lg:grid-cols-1 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("strengthProgressionTitle")}</CardTitle>
              <CardDescription>
                {t("strengthProgressionChartDesc")}
              </CardDescription>
              <div className="pt-2 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Seleciona ate 3 exercicios para comparar.
                </p>
                <div className="flex flex-wrap gap-2">
                  {strengthExerciseOptions.map((exercise) => {
                    const active = selectedStrengthExercises.includes(exercise);
                    const disabled = !active && selectedStrengthExercises.length >= 3;
                    return (
                      <button
                        key={exercise}
                        type="button"
                        className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-foreground"
                        } ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-primary/60"}`}
                        onClick={() => toggleStrengthExercise(exercise)}
                        disabled={disabled}
                      >
                        {exercise}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardHeader>
            <CardContent className="h-[300px] pt-4">
              {selectedStrengthExercises.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                  Seleciona 1 a 3 exercicios para ver a progressao.
                </div>
              ) : strengthChartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                  Sem dados de forca para os exercicios selecionados.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={strengthChartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    />
                    {selectedStrengthExercises.map((exercise, index) => {
                      const colors = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))"];
                      return (
                        <Line
                          key={exercise}
                          type="monotone"
                          dataKey={exercise}
                          stroke={colors[index % colors.length]}
                          strokeWidth={3}
                          name={`${exercise} 1RM`}
                          connectNulls
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("personalBests")}</CardTitle>
            <CardDescription>{t("personalBestsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {personalBests.length > 0 ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {personalBests.map((pb) => (
                  <div key={pb.exerciseName} className="flex items-center gap-4 p-4 border rounded-xl bg-accent/5">
                    <div className="p-2 bg-accent/20 rounded-full text-accent-foreground">
                      <Award className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">{pb.exerciseName}</p>
                      <p className="text-lg font-bold">{pb.weight} kg x {pb.reps}</p>
                      <p className="text-[10px] text-muted-foreground">{t("estimated1RM")} {pb.oneRm} kg</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {pb.date}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noPersonalBests")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </StudentNavigation>
  );
}
