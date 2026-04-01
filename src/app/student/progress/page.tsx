"use client";

import { useEffect, useMemo, useState } from "react";
import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingUp, Award, Calendar, Target, Flame } from "lucide-react";
import { useUser, useFirestore } from "@/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";

const weightDataFallback = [
  { date: 'Apr 1', weight: 82.5 },
  { date: 'Apr 8', weight: 81.8 },
  { date: 'Apr 15', weight: 81.2 },
  { date: 'Apr 22', weight: 80.5 },
  { date: 'May 1', weight: 79.8 },
  { date: 'May 8', weight: 79.2 },
];

const strengthDataFallback = [
  { date: 'Jan', oneRm: 50 },
  { date: 'Feb', oneRm: 55 },
  { date: 'Mar', oneRm: 62.5 },
  { date: 'Apr', oneRm: 70 },
];

function computeExerciseVolume(exercise: any): number {
  if (Array.isArray(exercise?.sets)) {
    return exercise.sets.reduce((sum: number, set: any) => {
      if (set?.completed === false) return sum;
      const reps = Number(set?.reps) || 0;
      const weight = Number(set?.weight) || 0;
      return sum + reps * weight;
    }, 0);
  }

  const sets = Number(exercise?.sets) || 0;
  const reps = Number(exercise?.reps) || 0;
  const weight = Number(exercise?.weight) || 0;
  return sets * reps * weight;
}

function computeEpleyOneRm(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

export default function StudentProgressPage() {
  const { user } = useUser();
  const db = useFirestore();
  const [totalVolumeKg, setTotalVolumeKg] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [goalCompletionPercent, setGoalCompletionPercent] = useState(0);
  const [monthlyPlannedCount, setMonthlyPlannedCount] = useState(0);
  const [monthlyDoneCount, setMonthlyDoneCount] = useState(0);
  const [weightTrend, setWeightTrend] = useState<Array<{ date: string; weight: number }>>(weightDataFallback);
  const [selectedStrengthExercise, setSelectedStrengthExercise] = useState("");
  const [strengthExerciseOptions, setStrengthExerciseOptions] = useState<string[]>([]);
  const [strengthTrend, setStrengthTrend] = useState<Array<{ date: string; oneRm: number }>>(strengthDataFallback);
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
        if (!trainerId) return;

        const [sessionsSnap, workoutPlansSnap] = await Promise.all([
          getDocs(collection(db, "personalTrainers", trainerId, "students", uid, "workoutSessions")),
          getDocs(collection(db, "personalTrainers", trainerId, "students", uid, "workoutPlans")),
        ]);

        if (cancelled) return;

        const volume = sessionsSnap.docs.reduce((sessionSum, sessionDoc) => {
          const sessionData: any = sessionDoc.data();
          const sessionVolume = (sessionData.exercises || []).reduce(
            (exerciseSum: number, exercise: any) => exerciseSum + computeExerciseVolume(exercise),
            0
          );
          return sessionSum + sessionVolume;
        }, 0);

        setTotalVolumeKg(volume);

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
            const scheduledRaw = plan.data.assignedAt || plan.data.createdAt || "";
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

        const now = Date.now();
        const plannedWorkouts = workoutPlansSnap.docs
          .map((planDoc) => ({
            id: planDoc.id,
            data: planDoc.data() as any,
          }))
          .map((plan) => {
            const scheduledRaw = plan.data.assignedAt || plan.data.createdAt || "";
            const timestamp = Date.parse(scheduledRaw);
            return {
              id: plan.id,
              timestamp: Number.isFinite(timestamp) ? timestamp : 0,
            };
          })
          .filter((plan) => plan.timestamp > 0 && plan.timestamp <= now)
          .sort((a, b) => b.timestamp - a.timestamp);

        let streak = 0;
        for (const plan of plannedWorkouts) {
          if (completedPlanIds.has(plan.id)) {
            streak += 1;
            continue;
          }
          break;
        }

        setCurrentStreak(streak);

        const studentData: any = studentSnap.data();
        const history = Array.isArray(studentData?.weightHistory) ? studentData.weightHistory : [];
        const normalizedTrend = history
          .map((entry: any) => {
            const dateValue = entry?.date || entry?.checkedAt || "";
            const weightValue = Number(entry?.weightKg ?? entry?.weight);
            return {
              timestamp: Date.parse(dateValue),
              weight: Number.isFinite(weightValue) ? weightValue : NaN,
            };
          })
          .filter((entry: any) => Number.isFinite(entry.timestamp) && Number.isFinite(entry.weight))
          .sort((a: any, b: any) => a.timestamp - b.timestamp)
          .map((entry: any) => ({
            date: new Date(entry.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
            weight: Number(entry.weight.toFixed(1)),
          }));

        if (normalizedTrend.length > 0) {
          setWeightTrend(normalizedTrend);
        } else if (Number.isFinite(Number(studentData?.weightKg))) {
          setWeightTrend([
            {
              date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" }),
              weight: Number(studentData.weightKg),
            },
          ]);
        } else {
          setWeightTrend(weightDataFallback);
        }

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
                if (set?.completed === false) return;
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

        if (options.length > 0) {
          const initialSelection = options.includes(selectedStrengthExercise) ? selectedStrengthExercise : options[0];
          const selectedPoints = (oneRmByExercise.get(initialSelection) || [])
            .sort((a, b) => a.timestamp - b.timestamp)
            .map((point) => ({
              date: new Date(point.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
              oneRm: Number(point.oneRm.toFixed(1)),
            }));

          setSelectedStrengthExercise(initialSelection);
          setStrengthTrend(selectedPoints.length > 0 ? selectedPoints : strengthDataFallback);
        } else {
          setSelectedStrengthExercise("");
          setStrengthTrend(strengthDataFallback);
        }
      } catch (error) {
        console.error("Failed to calculate total volume", error);
      }
    }

    fetchProgressMetrics();

    return () => {
      cancelled = true;
    };
  }, [db, user?.uid]);

  const formattedTotalVolume = useMemo(() => `${Math.round(totalVolumeKg).toLocaleString()}kg`, [totalVolumeKg]);

  const handleStrengthExerciseChange = async (exerciseName: string) => {
    if (!db || !user?.uid) return;
    const uid = user.uid;
    setSelectedStrengthExercise(exerciseName);

    try {
      const studentSnap = await getDoc(doc(db, "students", uid));
      if (!studentSnap.exists()) return;
      const trainerId = studentSnap.data()?.trainerId;
      if (!trainerId) return;

      const sessionsSnap = await getDocs(
        collection(db, "personalTrainers", trainerId, "students", uid, "workoutSessions")
      );

      const points: Array<{ timestamp: number; oneRm: number }> = [];
      sessionsSnap.docs.forEach((sessionDoc) => {
        const sessionData: any = sessionDoc.data();
        const timestamp = Date.parse(sessionData.completedAt || sessionData.date || "");
        if (!Number.isFinite(timestamp)) return;

        (sessionData.exercises || []).forEach((exercise: any) => {
          const name = (exercise.exerciseName || exercise.name || "").trim();
          if (name !== exerciseName) return;

          let bestOneRm = 0;
          if (Array.isArray(exercise.sets)) {
            exercise.sets.forEach((set: any) => {
              if (set?.completed === false) return;
              const oneRm = computeEpleyOneRm(Number(set?.weight), Number(set?.reps));
              if (oneRm > bestOneRm) bestOneRm = oneRm;
            });
          } else {
            const oneRm = computeEpleyOneRm(Number(exercise?.weight), Number(exercise?.reps));
            if (oneRm > bestOneRm) bestOneRm = oneRm;
          }

          if (bestOneRm > 0) {
            points.push({ timestamp, oneRm: bestOneRm });
          }
        });
      });

      const trend = points
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((point) => ({
          date: new Date(point.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          oneRm: Number(point.oneRm.toFixed(1)),
        }));

      setStrengthTrend(trend.length > 0 ? trend : strengthDataFallback);
    } catch (error) {
      console.error("Failed to update strength trend", error);
    }
  };

  return (
    <StudentNavigation>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-headline">My Progress</h1>
          <p className="text-muted-foreground">Visualize your journey and celebrate your wins.</p>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="bg-primary text-primary-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Flame className="h-4 w-4" />
                Current Streak
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{currentStreak} Workouts</div>
              <p className="text-xs opacity-80 mt-1">Consecutive planned workouts completed without missing one.</p>
            </CardContent>
          </Card>

          <Card className="bg-accent text-accent-foreground">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4" />
                Goal Completion
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{goalCompletionPercent}%</div>
              <Progress value={goalCompletionPercent} className="h-2 mt-2 bg-accent-foreground/20" />
              <p className="text-xs opacity-80 mt-1">
                {monthlyDoneCount} / {monthlyPlannedCount} workouts completed this month.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Total Volume
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formattedTotalVolume}</div>
              <p className="text-xs text-muted-foreground mt-1">Calculated from workout history (sets x reps x weight).</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Weight Tracking</CardTitle>
              <CardDescription>Progress towards your 75kg goal</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weightTrend}>
                  <defs>
                    <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                    itemStyle={{ color: 'hsl(var(--primary))' }}
                  />
                  <Area type="monotone" dataKey="weight" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorWeight)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Strength Progression</CardTitle>
              <CardDescription>
                1RM estimated gains (kg) using Epley: 1RM = W x (1 + R/30)
              </CardDescription>
              {strengthExerciseOptions.length > 0 ? (
                <div className="pt-2">
                  <Select value={selectedStrengthExercise} onValueChange={handleStrengthExerciseChange}>
                    <SelectTrigger className="w-full sm:w-[260px]">
                      <SelectValue placeholder="Select exercise" />
                    </SelectTrigger>
                    <SelectContent>
                      {strengthExerciseOptions.map((exercise) => (
                        <SelectItem key={exercise} value={exercise}>{exercise}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="h-[300px] pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={strengthTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="oneRm"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={3}
                    name={selectedStrengthExercise ? `${selectedStrengthExercise} 1RM` : "1RM"}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Personal Bests</CardTitle>
            <CardDescription>Best estimated 1RM per exercise (Epley)</CardDescription>
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
                      <p className="text-[10px] text-muted-foreground">Estimated 1RM: {pb.oneRm} kg</p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {pb.date}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No personal bests yet. Complete workouts with logged weight and reps to populate this section.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </StudentNavigation>
  );
}
