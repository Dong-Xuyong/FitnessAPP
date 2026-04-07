
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
  Timer as TimerIcon, 
  ChevronRight, 
  ChevronLeft, 
  CheckCircle2, 
  Play, 
  Pause, 
  RotateCcw,
  X,
  Save,
  Loader2
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useUser, useFirestore } from "@/firebase";
import { doc, getDoc, collection, addDoc } from "firebase/firestore";
import type { DayOfWeek } from "@/lib/types";

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
  setDetails?: Array<{
    setNumber: number;
    reps: string;
    targetWeightKg?: number;
    restTimeSeconds: number;
  }>;
  notes?: string;
}

interface WorkoutPlan {
  title: string;
  exercises: WorkoutExercise[];
  personalTrainerId: string;
  assignedAt?: string;
  createdAt?: string;
  scheduledDayOfWeek?: DayOfWeek;
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

function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isWorkoutAvailableToday(workout: WorkoutPlan): boolean {
  // Check if this workout is scheduled for today's day of week
  if (workout.scheduledDayOfWeek !== getTodayDayOfWeek()) return false;
  
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

export default function WorkoutSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const workoutId = unwrappedParams.id;
  const router = useRouter();
  const { user } = useUser();
  const db = useFirestore();
  const { t } = useI18n();
  
  const [workout, setWorkout] = useState<WorkoutPlan | null>(null);
  const [isLoadingWorkout, setIsLoadingWorkout] = useState(true);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [sessionLogs, setSessionLogs] = useState<Record<number, SetLog[]>>({});
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAllowedToday, setIsAllowedToday] = useState(false);
  const [effectiveStudentId, setEffectiveStudentId] = useState<string | null>(null);

  // Fetch real workout plan from Firestore
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
        // Use rosterDocId if set (handles path mismatch when roster doc ID ≠ Auth UID)
        const resolvedStudentId = (studentDoc.data()?.rosterDocId as string | undefined) || user!.uid;
        if (!cancelled) setEffectiveStudentId(resolvedStudentId);
        const planDoc = await getDoc(
          doc(db!, "personalTrainers", trainerId, "students", resolvedStudentId, "workoutPlans", workoutId)
        );
        if (planDoc.exists() && !cancelled) {
          const workoutData = { ...planDoc.data(), personalTrainerId: trainerId } as WorkoutPlan;
          setWorkout(workoutData);
          setIsAllowedToday(isWorkoutAvailableToday(workoutData));
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
  const currentExercise = exercises[currentExerciseIndex];
  const totalExercises = exercises.length;
  const progress = totalExercises > 0 ? ((currentExerciseIndex + 1) / totalExercises) * 100 : 0;

  // Initialize logs for current exercise
  useEffect(() => {
    if (!currentExercise || sessionLogs[currentExerciseIndex]) return;
    const templates = currentExercise.setDetails?.length
      ? currentExercise.setDetails
      : Array.from({ length: currentExercise.sets }, (_, index) => ({
          setNumber: index + 1,
          reps: currentExercise.reps,
          targetWeightKg: currentExercise.targetWeightKg,
          restTimeSeconds: currentExercise.restTimeSeconds,
        }));
    const initialSets = templates.map((set) => ({
      weight: set.targetWeightKg != null ? String(set.targetWeightKg) : "",
      reps: set.reps || "",
      completed: false,
    }));
    setSessionLogs(prev => ({ ...prev, [currentExerciseIndex]: initialSets }));
  }, [currentExerciseIndex, currentExercise, sessionLogs]);

  // Timer logic
  useEffect(() => {
    let interval: any;
    if (isTimerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds(s => s - 1);
      }, 1000);
    } else if (timerSeconds === 0) {
      setIsTimerRunning(false);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerSeconds]);

  const handleUpdateLog = (setIndex: number, field: keyof SetLog, value: any) => {
    const currentSets = [...(sessionLogs[currentExerciseIndex] || [])];
    currentSets[setIndex] = { ...currentSets[setIndex], [field]: value };
    setSessionLogs(prev => ({ ...prev, [currentExerciseIndex]: currentSets }));
    
    if (field === 'completed' && value === true && currentExercise) {
      const nextRest =
        currentExercise.setDetails?.[setIndex]?.restTimeSeconds ?? currentExercise.restTimeSeconds;
      setTimerSeconds(nextRest);
      setIsTimerRunning(true);
    }
  };

  const handleFinishWorkout = async () => {
    if (!db || !user || !workout) {
      setIsFinished(true);
      return;
    }
    setIsSaving(true);
    try {
      const trainerId = workout.personalTrainerId;
      const resolvedStudentId = effectiveStudentId || user.uid;
      const sessionRef = collection(
        db, "personalTrainers", trainerId, "students", resolvedStudentId, "workoutSessions"
      );
      const exerciseResults = exercises.map((ex, i) => {
        const sets = sessionLogs[i] || [];
        return {
          exerciseName: ex.exerciseName,
          sets: sets.map((s, setIdx) => ({
            setNumber: setIdx + 1,
            weight: Number(s.weight) || 0,
            reps: Number(s.reps) || 0,
            completed: s.completed,
          })),
        };
      });
      await addDoc(sessionRef, {
        workoutPlanId: workoutId,
        workoutTitle: workout.title,
        studentId: user.uid,
        personalTrainerId: trainerId,
        date: new Date().toISOString(),
        exercises: exerciseResults,
        completedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.error("Error saving session:", e);
    } finally {
      setIsSaving(false);
      setIsFinished(true);
    }
  };

  const handleNext = () => {
    if (currentExerciseIndex < totalExercises - 1) {
      setCurrentExerciseIndex(prev => prev + 1);
      setIsTimerRunning(false);
    } else {
      handleFinishWorkout();
    }
  };

  const handlePrevious = () => {
    if (currentExerciseIndex > 0) {
      setCurrentExerciseIndex(prev => prev - 1);
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

  if (!isAllowedToday) {
    return (
      <StudentNavigation>
        <div className="max-w-md mx-auto py-12 text-center space-y-6">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto">
            <Dumbbell className="h-10 w-10 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold font-headline">{t("workoutNotAvailableToday")}</h1>
            <p className="text-muted-foreground">{t("availableInDaysMsg").replace("{n}", String(daysUntilScheduledDay(workout?.scheduledDayOfWeek, workout?.assignedAt || workout?.createdAt)))}</p>
          </div>
          <Button className="w-full" asChild>
            <Link href="/student/workouts">{t("backToWorkouts")}</Link>
          </Button>
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
                  <p className="text-xs text-muted-foreground uppercase font-bold">{t("totalSets")}</p>
                  <p className="text-xl font-bold">{exercises.reduce((acc, curr) => acc + curr.sets, 0)}</p>
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
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <Link href="/student/workouts" className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1">
              <X className="h-3 w-3" /> {t("endSession")}
            </Link>
            <h1 className="text-2xl font-bold">{workout.title}</h1>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-muted-foreground uppercase">{t("progress")}</p>
            <p className="text-sm font-medium">{currentExerciseIndex + 1} of {totalExercises}</p>
          </div>
        </header>

        <Progress value={progress} className="h-2 bg-secondary" />

        {/* Timer UI */}
        <Card className={cn("border-2 transition-colors", isTimerRunning ? "border-primary shadow-lg" : "border-border")}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TimerIcon className={cn("h-6 w-6", isTimerRunning ? "text-primary animate-pulse" : "text-muted-foreground")} />
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase">{t("restTimer")}</p>
                <p className="text-2xl font-mono font-bold">
                  {Math.floor(timerSeconds / 60)}:{(timerSeconds % 60).toString().padStart(2, '0')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="icon" variant="outline" onClick={() => setIsTimerRunning(!isTimerRunning)}>
                {isTimerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="outline" onClick={() => { setTimerSeconds(currentExercise.restTimeSeconds); setIsTimerRunning(false); }}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Current Exercise */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-xl">{currentExercise.exerciseName}</CardTitle>
                <CardDescription>{currentExercise.notes}</CardDescription>
              </div>
              <Badge variant="secondary">{currentExercise.sets} {t("setsLabel")}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-4 text-xs font-bold text-muted-foreground uppercase px-2">
              <div className="col-span-1">{t("set")}</div>
              <div className="col-span-1">{t("weightKg")}</div>
              <div className="col-span-1">{t("reps")}</div>
              <div className="col-span-1 text-right">{t("done")}</div>
            </div>
            
            {(sessionLogs[currentExerciseIndex] || []).map((set, i) => (
              <div key={i} className={cn(
                "grid grid-cols-4 gap-4 items-center p-2 rounded-lg transition-colors",
                set.completed ? "bg-accent/5" : "bg-muted/30"
              )}>
                <div className="text-sm font-bold">#{i + 1}</div>
                <Input 
                  placeholder={
                    currentExercise.setDetails?.[i]?.targetWeightKg != null
                      ? String(currentExercise.setDetails[i].targetWeightKg)
                      : currentExercise.targetWeightKg != null
                        ? String(currentExercise.targetWeightKg)
                      : "0"
                  }
                  type="number"
                  value={set.weight} 
                  onChange={(e) => handleUpdateLog(i, 'weight', e.target.value)}
                  className="h-8"
                  disabled={set.completed}
                />
                <Input 
                  placeholder={currentExercise.reps} 
                  type="number"
                  value={set.reps} 
                  onChange={(e) => handleUpdateLog(i, 'reps', e.target.value)}
                  className="h-8"
                  disabled={set.completed}
                />
                <div className="flex justify-end">
                  <Button 
                    size="icon" 
                    variant={set.completed ? "default" : "outline"} 
                    className={cn("h-8 w-8 rounded-full", set.completed && "bg-accent hover:bg-accent/90")}
                    onClick={() => handleUpdateLog(i, 'completed', !set.completed)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
          <CardFooter className="flex justify-between border-t pt-6">
            <Button variant="ghost" onClick={handlePrevious} disabled={currentExerciseIndex === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" /> {t("previous")}
            </Button>
            <Button 
              className="gap-2 bg-primary text-primary-foreground" 
              onClick={handleNext}
              disabled={isSaving}
            >
              {currentExerciseIndex === totalExercises - 1 ? (
                <>{isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t("finishWorkout")}</>
              ) : (
                <>{t("nextExercise")} <ChevronRight className="h-4 w-4" /></>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </StudentNavigation>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
