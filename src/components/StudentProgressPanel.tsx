"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Award, Calendar, Target, Flame, Info } from "lucide-react";
import { BodyMetricsPanel } from "@/components/BodyMetricsPanel";
import { countCompletedWorkoutSessionsInMonth } from "@/lib/student-monthly-workout-completion";
import { useUser, useFirestore } from "@/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import type { SessionSlotAttendance } from "@/lib/session-attendance-streak";
import { maxAttendanceStreakForCandidates } from "@/lib/session-attendance-streak";
import { normalizeVacationPeriods } from "@/lib/trainer-availability";

function computeEpleyOneRm(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

export function StudentProgressPanel() {
  const { t } = useI18n();
  const { user } = useUser();
  const db = useFirestore();
  const [currentStreak, setCurrentStreak] = useState(0);
  const [monthlyDoneCount, setMonthlyDoneCount] = useState(0);
  const [selectedStrengthExercises, setSelectedStrengthExercises] = useState<string[]>([]);
  const [strengthExerciseOptions, setStrengthExerciseOptions] = useState<string[]>([]);
  const [strengthSeriesByExercise, setStrengthSeriesByExercise] = useState<
    Record<string, Array<{ timestamp: number; oneRm: number }>>
  >({});
  const [personalBests, setPersonalBests] = useState<
    Array<{ exerciseName: string; oneRm: number; weight: number; reps: number; date: string }>
  >([]);
  const [metricsContext, setMetricsContext] = useState<{
    trainerId: string;
    rosterStudentId: string;
    profile: Record<string, unknown>;
    weightHistory: unknown;
  } | null>(null);

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

        const [sessionsSnap, trainerSnap, sessionSlotsSnap] = await Promise.all([
          getDocs(collection(db, "personalTrainers", trainerId, "students", resolvedStudentId, "workoutSessions")),
          getDoc(doc(db, "personalTrainers", trainerId)),
          getDocs(collection(db, "personalTrainers", trainerId, "sessionSlots")),
        ]);

        if (cancelled) return;

        const studentData = studentSnap.data() as Record<string, unknown>;
        setMetricsContext({
          trainerId: String(trainerId),
          rosterStudentId: resolvedStudentId,
          profile: studentData,
          weightHistory: studentData.weightHistory,
        });

        const sessionRows = sessionsSnap.docs.map((d) => ({
          data: d.data() as Record<string, unknown>,
        }));

        setMonthlyDoneCount(countCompletedWorkoutSessionsInMonth(sessionRows, new Date()));

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
          maxAttendanceStreakForCandidates(
            sessionSlotsList,
            candidateIds,
            Date.now(),
            slotDm,
            normalizeVacationPeriods(trainerSnap.data()?.vacationPeriods)
          )
        );

        const oneRmByExercise = new Map<string, Array<{ timestamp: number; oneRm: number }>>();
        const bestByExercise = new Map<
          string,
          { oneRm: number; timestamp: number; weight: number; reps: number }
        >();
        sessionsSnap.docs.forEach((sessionDoc) => {
          const sessionData = sessionDoc.data() as Record<string, unknown>;
          const timestamp = Date.parse(
            String(sessionData.completedAt || sessionData.date || "")
          );
          if (!Number.isFinite(timestamp)) return;

          const exercises = (sessionData.exercises || []) as Array<Record<string, unknown>>;
          exercises.forEach((exercise: Record<string, unknown>, exerciseIndex: number) => {
            const exerciseName = (
              exercise.exerciseName ||
              exercise.name ||
              `Exercise ${exerciseIndex + 1}`
            )
              .toString()
              .trim();
            if (!exerciseName) return;

            let bestOneRm = 0;
            let bestWeight = 0;
            let bestReps = 0;
            if (Array.isArray(exercise.sets)) {
              exercise.sets.forEach((set: Record<string, unknown>) => {
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
            date: new Date(best.timestamp).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            }),
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
        setSelectedStrengthExercises((prev) =>
          prev.filter((name) => options.includes(name)).slice(0, 3)
        );
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
          date: new Date(point.timestamp).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          }),
        };
        row[exerciseName] = Number(point.oneRm.toFixed(1));
        byTimestamp.set(point.timestamp, row);
      });
    });

    return Array.from(byTimestamp.values()).sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  }, [selectedStrengthExercises, strengthSeriesByExercise]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold font-headline">{t("myProgress")}</h1>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Flame className="h-4 w-4" aria-hidden />
              {t("sessionAttendanceStreakTitle")}
              <button
                type="button"
                className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md opacity-80 hover:opacity-100"
                title={t("sessionAttendanceStreakHint")}
                aria-label={t("sessionAttendanceStreakHint")}
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
              </button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-3xl font-bold"
              aria-label={`${currentStreak} ${t("sessionsStreakCompact")}`}
            >
              {currentStreak} {t("sessionsStreakCompact")}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-accent text-accent-foreground">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" aria-hidden />
              {t("goalCompletion")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="text-3xl font-bold"
              title={t("workoutsCompletedThisMonth")}
              aria-label={`${monthlyDoneCount} ${t("workoutsCompletedThisMonth")}`}
            >
              {monthlyDoneCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {metricsContext && user?.uid && (
        <div className="min-w-0">
          <BodyMetricsPanel
            trainerId={metricsContext.trainerId}
            rosterStudentId={metricsContext.rosterStudentId}
            globalStudentId={user.uid}
            canWriteSession
            source="student"
            initialProfile={metricsContext.profile}
            existingWeightHistory={metricsContext.weightHistory}
          />
        </div>
      )}

      <div className="grid lg:grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("strengthProgressionTitle")}
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40"
                title={t("strengthProgressionChartDesc")}
                aria-label={t("strengthProgressionChartDesc")}
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
              </button>
            </CardTitle>
            <div className="pt-2 space-y-2">
              <div className="flex flex-wrap gap-2">
                {strengthExerciseOptions.map((exercise) => {
                  const active = selectedStrengthExercises.includes(exercise);
                  const disabled = !active && selectedStrengthExercises.length >= 3;
                  return (
                    <Button
                      key={exercise}
                      type="button"
                      variant={active ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm h-auto",
                        !active && !disabled && "hover:border-primary/60",
                        disabled && "opacity-50"
                      )}
                      onClick={() => toggleStrengthExercise(exercise)}
                      disabled={disabled}
                      aria-pressed={active}
                      aria-label={exercise}
                    >
                      {exercise}
                    </Button>
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
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                    }}
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
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary shrink-0" aria-hidden />
            {t("personalBests")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {personalBests.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {personalBests.map((pb) => (
                <div
                  key={pb.exerciseName}
                  className="flex items-center gap-4 p-4 border rounded-xl bg-accent/5"
                >
                  <div className="p-2 bg-accent/20 rounded-full text-accent-foreground">
                    <Award className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
                      {pb.exerciseName}
                    </p>
                    <p className="text-lg font-bold">
                      {pb.weight} kg x {pb.reps}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {t("estimated1RM")} {pb.oneRm} kg
                    </p>
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
  );
}
