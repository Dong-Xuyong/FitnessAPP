"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Loader2, ExternalLink, TrendingUp } from "lucide-react";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const categories = ["All", "Chest", "Back", "Legs", "Shoulders", "Arms", "Core", "Full Body", "Cardio", "Other"];

function computeEpleyOneRm(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0;
  return weight * (1 + reps / 30);
}

function estimateRepetitionMax(oneRm: number, reps: number): number {
  if (!Number.isFinite(oneRm) || oneRm <= 0 || reps <= 0) return 0;
  return oneRm / (1 + reps / 30);
}

function normalizeExerciseName(name: string): string {
  return (name || "").trim().toLowerCase();
}

export default function StudentExercisesPage() {
  const { t } = useI18n();
  const { user } = useUser();
  const db = useFirestore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedExerciseName, setSelectedExerciseName] = useState("");
  const [exerciseHistory, setExerciseHistory] = useState<Array<{ date: string; oneRm: number }>>([]);
  const [exerciseAttempts, setExerciseAttempts] = useState<
    Array<{ timestamp: number; oneRm: number; weight: number; reps: number }>
  >([]);
  const [isLoadingStrength, setIsLoadingStrength] = useState(false);

  const exercisesQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "exercises");
  }, [db, user]);

  const { data: exercises, isLoading } = useCollection(exercisesQuery);

  useEffect(() => {
    if (!db || !user?.uid || !selectedExerciseName) {
      setExerciseHistory([]);
      setExerciseAttempts([]);
      return;
    }
    const uid = user.uid;

    let cancelled = false;
    async function fetchExerciseHistory() {
      setIsLoadingStrength(true);
      try {
        const studentSnap = await getDoc(doc(db, "students", uid));
        if (!studentSnap.exists()) return;
        const trainerId = studentSnap.data()?.trainerId;
        const resolvedStudentId = (studentSnap.data()?.rosterDocId as string | undefined) || uid;
        if (!trainerId) return;

        const sessionsSnap = await getDocs(
          collection(db, "personalTrainers", trainerId, "students", resolvedStudentId, "workoutSessions")
        );
        if (cancelled) return;

        const selectedName = normalizeExerciseName(selectedExerciseName);
        const points: Array<{ timestamp: number; oneRm: number }> = [];
        const attempts: Array<{ timestamp: number; oneRm: number; weight: number; reps: number }> = [];

        sessionsSnap.docs.forEach((sessionDoc) => {
          const sessionData: any = sessionDoc.data();
          const timestamp = Date.parse(sessionData.completedAt || sessionData.date || "");
          if (!Number.isFinite(timestamp)) return;

          (sessionData.exercises || []).forEach((exercise: any) => {
            const exerciseName = normalizeExerciseName(exercise.exerciseName || exercise.name || "");
            if (!exerciseName || exerciseName !== selectedName) return;

            let bestOneRm = 0;
            let bestWeight = 0;
            let bestReps = 0;
            if (Array.isArray(exercise.sets)) {
              exercise.sets.forEach((set: any) => {
                if (set?.completed === false) return;
                const weight = Number(set?.weight) || 0;
                const reps = Number(set?.reps) || 0;
                const oneRm = computeEpleyOneRm(weight, reps);
                if (oneRm > bestOneRm) {
                  bestOneRm = oneRm;
                  bestWeight = weight;
                  bestReps = reps;
                }
              });
            } else {
              const weight = Number(exercise?.weight) || 0;
              const reps = Number(exercise?.reps) || 0;
              const oneRm = computeEpleyOneRm(weight, reps);
              if (oneRm > bestOneRm) {
                bestOneRm = oneRm;
                bestWeight = weight;
                bestReps = reps;
              }
            }

            if (bestOneRm > 0) {
              points.push({ timestamp, oneRm: bestOneRm });
              attempts.push({ timestamp, oneRm: bestOneRm, weight: bestWeight, reps: bestReps });
            }
          });
        });

        const trend = points
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((point) => ({
            date: new Date(point.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
            oneRm: Number(point.oneRm.toFixed(1)),
          }));

        setExerciseHistory(trend);
        setExerciseAttempts(attempts.sort((a, b) => a.timestamp - b.timestamp));
      } catch (error) {
        console.error("Failed to load exercise strength history", error);
      } finally {
        if (!cancelled) setIsLoadingStrength(false);
      }
    }

    fetchExerciseHistory();
    return () => {
      cancelled = true;
    };
  }, [db, user?.uid, selectedExerciseName]);

  const filteredExercises = useMemo(() => {
    return (exercises || []).filter((exercise: any) => {
      const matchesSearch = (exercise.name || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "All" || exercise.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [exercises, searchQuery, selectedCategory]);

  const selectedExerciseOneRm = useMemo(() => {
    if (exerciseHistory.length === 0) return 0;
    return exerciseHistory.reduce((max, point) => (point.oneRm > max ? point.oneRm : max), 0);
  }, [exerciseHistory]);

  const repMaxes = useMemo(() => {
    const oneRm = selectedExerciseOneRm;
    return Array.from({ length: 10 }, (_, index) => {
      const reps = index + 1;
      return {
        reps,
        max: Number(estimateRepetitionMax(oneRm, reps).toFixed(1)),
      };
    });
  }, [selectedExerciseOneRm]);

  const personalBest = useMemo(() => {
    if (exerciseAttempts.length === 0) return null;
    return exerciseAttempts.reduce((best, attempt) => (attempt.oneRm > best.oneRm ? attempt : best), exerciseAttempts[0]);
  }, [exerciseAttempts]);

  const latestAttempt = useMemo(() => {
    if (exerciseAttempts.length === 0) return null;
    return exerciseAttempts[exerciseAttempts.length - 1];
  }, [exerciseAttempts]);

  return (
    <StudentNavigation>
      <div className="space-y-4">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold font-headline">{t("exercises")}</h1>
          <p className="text-sm text-muted-foreground">{t("exerciseLibraryShared")}</p>
        </header>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("searchExercises")}
            className="pl-10"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-1 bg-card border p-1">
            {categories.map((category) => (
              <TabsTrigger key={category} value={category} className="px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                {category}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {selectedExerciseName && (
          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                {selectedExerciseName}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingStrength ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : exerciseHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No strength data yet for this exercise. Complete sessions with logged weight and reps first.
                </p>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-semibold mb-2">Progress Tracking</p>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {repMaxes.map((rm) => (
                      <div key={rm.reps} className="rounded-lg border bg-muted/20 p-2 text-center">
                        <p className="text-xs text-muted-foreground">{rm.reps}RM</p>
                        <p className="text-sm font-semibold">{rm.max} kg</p>
                      </div>
                    ))}
                  </div>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={exerciseHistory}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
                        />
                        <Line type="monotone" dataKey="oneRm" stroke="hsl(var(--chart-1))" strokeWidth={3} name="1RM" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Personal Bests</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Best Estimated 1RM</p>
                        <p className="text-lg font-semibold">
                          {personalBest ? `${personalBest.oneRm.toFixed(1)} kg` : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Best Set</p>
                        <p className="text-lg font-semibold">
                          {personalBest ? `${personalBest.weight} kg x ${personalBest.reps}` : "—"}
                        </p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">Latest</p>
                        <p className="text-lg font-semibold">
                          {latestAttempt ? `${latestAttempt.weight} kg x ${latestAttempt.reps}` : "—"}
                        </p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredExercises.map((exercise: any) => (
              <Card
                key={exercise.id}
                className={`group hover:border-primary transition-colors cursor-pointer ${
                  selectedExerciseName === (exercise.name || "") ? "border-primary" : ""
                }`}
                onClick={() => setSelectedExerciseName(exercise.name || "")}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base lg:text-lg leading-tight line-clamp-2">{exercise.name || t("unnamedExercise")}</CardTitle>
                    <Badge variant="secondary" className="shrink-0 w-fit">{exercise.category || "Other"}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {exercise.description || t("noDescriptionAvailable")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {exercise.difficulty && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {exercise.difficulty}
                      </Badge>
                    )}
                    {exercise.equipment && (
                      <span className="text-xs text-muted-foreground">{exercise.equipment}</span>
                    )}
                  </div>
                  {exercise.videoUrl ? (
                    <a
                      href={exercise.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      {t("watchDemo")}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && filteredExercises.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg">
            <p className="font-medium">{t("noExercisesFound")}</p>
            <p className="text-sm mt-1">{t("tryDifferentSearch")}</p>
          </div>
        ) : null}
      </div>
    </StudentNavigation>
  );
}
