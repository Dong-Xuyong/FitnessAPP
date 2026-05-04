
"use client";

import { useState, useEffect, use } from "react";
import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dumbbell,
  CheckCircle2,
  Save,
  Loader2,
  X,
  StickyNote,
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useUser, useFirestore } from "@/firebase";
import { doc, getDoc, collection, addDoc } from "firebase/firestore";

interface SetLog {
  weight: string;
  reps: string;
  completed: boolean;
}

interface WorkoutExercise {
  exerciseName: string;
  sets: number;
  reps: string;
  restTimeSeconds: number;
  targetWeightKg?: number;
  notes?: string;
}

interface WorkoutPlan {
  title: string;
  exercises: WorkoutExercise[];
  personalTrainerId: string;
  assignedAt?: string;
  createdAt?: string;
}

export default function WorkoutSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const workoutId = unwrappedParams.id;
  const { user } = useUser();
  const db = useFirestore();
  const { t } = useI18n();

  const [workout, setWorkout] = useState<WorkoutPlan | null>(null);
  const [isLoadingWorkout, setIsLoadingWorkout] = useState(true);
  // One SetLog per exercise (not per set)
  const [logs, setLogs] = useState<Record<number, SetLog>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [effectiveStudentId, setEffectiveStudentId] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !user?.uid || !workoutId) return;
    let cancelled = false;
    async function fetchWorkout() {
      setIsLoadingWorkout(true);
      try {
        const studentDoc = await getDoc(doc(db!, "students", user!.uid));
        if (!studentDoc.exists()) return;
        const trainerId = studentDoc.data()?.trainerId;
        if (!trainerId) return;
        const resolvedStudentId =
          (studentDoc.data()?.rosterDocId as string | undefined) || user!.uid;
        if (!cancelled) setEffectiveStudentId(resolvedStudentId);
        const planDoc = await getDoc(
          doc(db!, "personalTrainers", trainerId, "students", resolvedStudentId, "workoutPlans", workoutId)
        );
        if (planDoc.exists() && !cancelled) {
          const workoutData = { ...planDoc.data(), personalTrainerId: trainerId } as WorkoutPlan;
          setWorkout(workoutData);
        }
      } catch (e) {
        console.error("Error fetching workout:", e);
      } finally {
        if (!cancelled) setIsLoadingWorkout(false);
      }
    }
    fetchWorkout();
    return () => { cancelled = true; };
  }, [db, user?.uid, workoutId]);

  const exercises = workout?.exercises || [];
  const totalExercises = exercises.length;
  const completedExercises = exercises.reduce((count, _, i) => count + (logs[i]?.completed ? 1 : 0), 0);
  const progress = totalExercises > 0 ? (completedExercises / totalExercises) * 100 : 0;

  const updateLog = (exerciseIndex: number, field: keyof SetLog, value: string | boolean) =>
    setLogs((prev) => ({
      ...prev,
      [exerciseIndex]: { ...(prev[exerciseIndex] ?? { weight: "", reps: "", completed: false }), [field]: value },
    }));

  const handleFinishWorkout = async () => {
    if (!db || !user || !workout) { setIsFinished(true); return; }
    setIsSaving(true);
    try {
      const trainerId = workout.personalTrainerId;
      const resolvedStudentId = effectiveStudentId || user.uid;
      await addDoc(
        collection(db, "personalTrainers", trainerId, "students", resolvedStudentId, "workoutSessions"),
        {
          workoutPlanId: workoutId,
          workoutTitle: workout.title,
          studentId: user.uid,
          personalTrainerId: trainerId,
          date: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          exercises: exercises.map((ex, i) => {
            const log = logs[i] ?? { weight: "", reps: "", completed: false };
            return {
              exerciseName: ex.exerciseName,
              sets: [
                {
                  setNumber: 1,
                  weight: Number(log.weight) || 0,
                  reps: Number(log.reps) || 0,
                  completed: log.completed,
                },
              ],
            };
          }),
        }
      );
    } catch (e) {
      console.error("Error saving session:", e);
    } finally {
      setIsSaving(false);
      setIsFinished(true);
    }
  };

  if (isLoadingWorkout) {
    return (
      <StudentNavigation>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </StudentNavigation>
    );
  }

  if (!workout || exercises.length === 0) {
    return (
      <StudentNavigation>
        <div className="text-center py-20 space-y-4">
          <Dumbbell className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-2xl font-bold">{t("workoutNotFound")}</h2>
          <Button asChild><Link href="/student/workouts">{t("backToWorkouts")}</Link></Button>
        </div>
      </StudentNavigation>
    );
  }

  if (isFinished) {
    return (
      <StudentNavigation>
        <div className="max-w-md mx-auto py-12 text-center space-y-6">
          <div className="w-20 h-20 bg-accent/20 text-accent rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-12 w-12" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold font-headline">{t("workoutComplete")}</h1>
            <p className="text-muted-foreground">{t("greatJobToday")}</p>
          </div>
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 rounded-lg bg-secondary/30">
                  <p className="text-xs text-muted-foreground uppercase font-bold">{t("exercises")}</p>
                  <p className="text-xl font-bold">{totalExercises}</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-secondary/30">
                  <p className="text-xs text-muted-foreground uppercase font-bold">{t("setsLabel")}</p>
                  <p className="text-xl font-bold">{totalExercises}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" asChild>
            <Link href="/student/workouts">{t("backToWorkouts")}</Link>
          </Button>
        </div>
      </StudentNavigation>
    );
  }

  return (
    <StudentNavigation>
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <Link
              href="/student/workouts"
              className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              <X className="h-3 w-3" /> {t("endSession")}
            </Link>
            <h1 className="text-2xl font-bold">{workout.title}</h1>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-muted-foreground uppercase">{t("progress")}</p>
            <p className="text-sm font-medium">
              {completedExercises} / {totalExercises}
            </p>
          </div>
        </header>

        <Progress value={progress} className="h-2 bg-secondary" />

        {/* All exercises on one page */}
        <div className="space-y-4">
          {exercises.map((exercise, index) => {
            const log = logs[index] ?? { weight: "", reps: "", completed: false };
            return (
              <Card key={index}>
                <CardHeader>
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <Badge variant="outline" className="text-xs mb-1">
                        {t("exercises")} {index + 1}/{totalExercises}
                      </Badge>
                      <CardTitle className="text-2xl">{exercise.exerciseName}</CardTitle>
                    </div>
                  </div>

                  {exercise.notes && (
                    <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-muted/40 border border-muted text-sm text-muted-foreground">
                      <StickyNote className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
                      <p className="leading-relaxed">{exercise.notes}</p>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t("registerYourSet") || "Regista a tua série"}
                  </p>

                  <div
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-colors ${
                      log.completed ? "border-accent bg-accent/5" : "border-border bg-muted/20"
                    }`}
                  >
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">
                        {t("weightKg")}
                      </label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={log.weight}
                        onChange={(e) => updateLog(index, "weight", e.target.value)}
                        disabled={log.completed}
                        className="text-lg font-bold h-12 text-center"
                      />
                    </div>

                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">
                        {t("reps")}
                      </label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={log.reps}
                        onChange={(e) => updateLog(index, "reps", e.target.value)}
                        disabled={log.completed}
                        className="text-lg font-bold h-12 text-center"
                      />
                    </div>

                    <div className="space-y-1 flex flex-col items-center">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">
                        {t("done")}
                      </label>
                      <Button
                        size="icon"
                        variant={log.completed ? "default" : "outline"}
                        className={`h-12 w-12 rounded-full transition-all ${
                          log.completed ? "bg-accent hover:bg-accent/90 scale-110" : ""
                        }`}
                        onClick={() => updateLog(index, "completed", !log.completed)}
                      >
                        <CheckCircle2 className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <CardFooter className="justify-end border-t pt-6 px-0">
          <Button
            className="gap-2 bg-primary text-primary-foreground"
            onClick={handleFinishWorkout}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("finishWorkout")}
          </Button>
        </CardFooter>
      </div>
    </StudentNavigation>
  );
}
