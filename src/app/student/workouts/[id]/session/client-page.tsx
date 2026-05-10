
"use client";

import { useState, useEffect, use, useRef } from "react";
import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  doc,
  getDoc,
  collection,
  writeBatch,
  query,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { cn } from "@/lib/utils";

const SESSION_QUERY_LIMIT = 40;
const NOTE_MAX_LENGTH = 500;

/** Effort faces: light → very hard */
const DIFFICULTY_FACES = ["😌", "🙂", "😐", "😰", "😵"] as const;
/** Mood faces: low → great */
const MOOD_FACES = ["😢", "😕", "😐", "😊", "🤩"] as const;

interface SetLog {
  weight: string;
  reps: string;
}

type LastPerf = { weight: number; reps: number };

/** True when reps (>0) are set; empty weight OK for bodyweight. */
function exerciseHasLoggedSet(log: SetLog | undefined): boolean {
  if (!log) return false;
  const reps = Number(String(log.reps).trim());
  if (!Number.isFinite(reps) || reps <= 0) return false;
  const wStr = String(log.weight).trim();
  if (wStr === "") return true;
  const w = Number(wStr);
  return Number.isFinite(w) && w >= 0;
}

function normalizeExerciseKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Optional body-weight log (kg). Empty invalid or out-of-range → null */
function parseOptionalBodyWeightKg(raw: string): number | null {
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 450) return null;
  return Math.round(n * 1000) / 1000;
}

/** Optional body-fat % on session / profile merge. Empty or out-of-range → null */
function parseOptionalBodyFatPercent(raw: string): number | null {
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 70) return null;
  return Math.round(n * 10) / 10;
}

function prefilledWeightFromProfile(weightKg: unknown): string {
  const n = typeof weightKg === "number" ? weightKg : Number(weightKg);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n);
}

function prefilledBodyFatFromProfile(bodyFatPercent: unknown): string {
  const n = typeof bodyFatPercent === "number" ? bodyFatPercent : Number(bodyFatPercent);
  if (!Number.isFinite(n) || n <= 0 || n > 70) return "";
  return String(n);
}

function buildPerformanceMap(sessionData: { exercises?: any[] }): Record<string, LastPerf> {
  const out: Record<string, LastPerf> = {};
  const exercises = sessionData.exercises || [];
  for (const ex of exercises) {
    const key = normalizeExerciseKey(String(ex.exerciseName || ex.name || ""));
    if (!key) continue;
    const sets = Array.isArray(ex.sets) ? ex.sets : [];
    const s0 = sets[0];
    if (!s0) continue;
    const w = Number(s0.weight);
    const r = Number(s0.reps);
    if (!Number.isFinite(r) || r <= 0) continue;
    const weight = Number.isFinite(w) ? w : 0;
    out[key] = { weight, reps: r };
  }
  return out;
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
  const [logs, setLogs] = useState<Record<number, SetLog>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [effectiveStudentId, setEffectiveStudentId] = useState<string | null>(null);
  const [lastPerfLookup, setLastPerfLookup] = useState<Record<string, LastPerf>>({});
  const [difficultyNotes, setDifficultyNotes] = useState("");
  const [moodNotes, setMoodNotes] = useState("");
  const [sessionDifficultyRating, setSessionDifficultyRating] = useState<number | null>(null);
  const [sessionMoodRating, setSessionMoodRating] = useState<number | null>(null);
  const [sessionBodyWeightKg, setSessionBodyWeightKg] = useState("");
  const [sessionBodyFatPercent, setSessionBodyFatPercent] = useState("");
  const prefilledSignatureRef = useRef<string | null>(null);
  const metricsPrefilledRef = useRef(false);

  useEffect(() => {
    prefilledSignatureRef.current = null;
    metricsPrefilledRef.current = false;
    setSessionBodyWeightKg("");
    setSessionBodyFatPercent("");
  }, [workoutId]);

  useEffect(() => {
    if (!db || !user?.uid || !workoutId) return;
    let cancelled = false;
    async function fetchWorkout() {
      setIsLoadingWorkout(true);
      try {
        const studentDoc = await getDoc(doc(db!, "students", user!.uid));
        if (!studentDoc.exists()) return;
        const sd = studentDoc.data() ?? {};
        const trainerId = sd.trainerId;
        if (!trainerId) return;
        const resolvedStudentId =
          (sd.rosterDocId as string | undefined) || user!.uid;
        if (!cancelled) setEffectiveStudentId(resolvedStudentId);
        if (!cancelled && !metricsPrefilledRef.current) {
          metricsPrefilledRef.current = true;
          const wPref = prefilledWeightFromProfile(sd.weightKg);
          const bfPref = prefilledBodyFatFromProfile(sd.bodyFatPercent);
          setSessionBodyWeightKg(wPref);
          setSessionBodyFatPercent(bfPref);
        }
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
    return () => {
      cancelled = true;
    };
  }, [db, user?.uid, workoutId]);

  useEffect(() => {
    const rosterStudentId = effectiveStudentId ?? "";
    const trainerPid = workout?.personalTrainerId ?? "";
    if (!db || !rosterStudentId || !trainerPid || !workoutId || !workout) return;
    let cancelled = false;
    async function fetchPreviousSession() {
      try {
        const sessionsCol = collection(
          db!,
          "personalTrainers",
          trainerPid,
          "students",
          rosterStudentId,
          "workoutSessions"
        );
        const q = query(sessionsCol, orderBy("completedAt", "desc"), limit(SESSION_QUERY_LIMIT));
        const snap = await getDocs(q);
        if (cancelled) return;
        let perf: Record<string, LastPerf> = {};
        for (const docSnap of snap.docs) {
          const data = docSnap.data() as {
            workoutPlanId?: string;
            completedAt?: string;
            exercises?: WorkoutExercise[];
          };
          if (data.workoutPlanId !== workoutId || !data.completedAt) continue;
          perf = buildPerformanceMap(data);
          break;
        }
        setLastPerfLookup(perf);
      } catch (e) {
        console.error("Error loading previous session:", e);
        setLastPerfLookup({});
      }
    }
    fetchPreviousSession();
    return () => {
      cancelled = true;
    };
  }, [db, effectiveStudentId, workout?.personalTrainerId, workoutId, workout]);

  const exercises = workout?.exercises || [];
  const totalExercises = exercises.length;

  useEffect(() => {
    if (!workout || exercises.length === 0) return;
    const lookupKey = Object.keys(lastPerfLookup)
      .sort()
      .map((k) => `${k}:${lastPerfLookup[k].weight}:${lastPerfLookup[k].reps}`)
      .join("|");
    const sig = `${workoutId}:${lookupKey}`;
    if (prefilledSignatureRef.current === sig) return;
    prefilledSignatureRef.current = sig;

    setLogs((prev) => {
      const next = { ...prev };
      let changed = false;
      exercises.forEach((ex, i) => {
        const nk = normalizeExerciseKey(ex.exerciseName);
        const p = lastPerfLookup[nk];
        if (!p) return;
        const existing = prev[i];
        const empty =
          !existing ||
          (String(existing.weight).trim() === "" && String(existing.reps).trim() === "");
        if (!empty) return;
        next[i] = {
          weight: p.weight > 0 ? String(p.weight) : "",
          reps: p.reps > 0 ? String(p.reps) : "",
        };
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [workout, exercises.length, workoutId, lastPerfLookup]);

  const updateLog = (exerciseIndex: number, field: keyof Pick<SetLog, "weight" | "reps">, value: string) =>
    setLogs((prev) => ({
      ...prev,
      [exerciseIndex]: { ...(prev[exerciseIndex] ?? { weight: "", reps: "" }), [field]: value },
    }));

  const handleFinishWorkout = async () => {
    if (!db || !user || !workout) {
      setIsFinished(true);
      return;
    }
    setIsSaving(true);
    try {
      const trainerId = workout.personalTrainerId;
      const resolvedStudentId = effectiveStudentId || user.uid;
      const parsedBw = parseOptionalBodyWeightKg(sessionBodyWeightKg);
      const parsedBf = parseOptionalBodyFatPercent(sessionBodyFatPercent);
      const batch = writeBatch(db);
      const sessionsCol = collection(
        db,
        "personalTrainers",
        trainerId,
        "students",
        resolvedStudentId,
        "workoutSessions"
      );
      const sessionRef = doc(sessionsCol);
      batch.set(sessionRef, {
        workoutPlanId: workoutId,
        workoutTitle: workout.title,
        studentId: user.uid,
        personalTrainerId: trainerId,
        date: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        bodyWeightKg: parsedBw,
        sessionBodyFatPercent: parsedBf,
        difficultyNotes: difficultyNotes.trim().slice(0, NOTE_MAX_LENGTH),
        moodNotes: moodNotes.trim().slice(0, NOTE_MAX_LENGTH),
        sessionDifficultyRating: sessionDifficultyRating ?? null,
        sessionMoodRating: sessionMoodRating ?? null,
        exercises: exercises.map((ex, i) => {
          const log = logs[i] ?? { weight: "", reps: "" };
          return {
            exerciseName: ex.exerciseName,
            sets: [
              {
                setNumber: 1,
                weight: Number(log.weight) || 0,
                reps: Number(log.reps) || 0,
                completed: exerciseHasLoggedSet(log),
              },
            ],
          };
        }),
      });
      const planRef = doc(
        db,
        "personalTrainers",
        trainerId,
        "students",
        resolvedStudentId,
        "workoutPlans",
        workoutId
      );
      const finishedAt = new Date().toISOString();
      batch.update(planRef, {
        completedAt: finishedAt,
        status: "completed",
      });
      if (parsedBw != null || parsedBf != null) {
        const profilePatch: Record<string, number> = {};
        if (parsedBw != null) profilePatch.weightKg = parsedBw;
        if (parsedBf != null) profilePatch.bodyFatPercent = parsedBf;
        batch.set(doc(db, "students", user.uid), profilePatch, { merge: true });
        batch.set(
          doc(db, "personalTrainers", trainerId, "students", resolvedStudentId),
          profilePatch,
          { merge: true }
        );
      }
      await batch.commit();
      setIsFinished(true);
    } catch (e) {
      console.error("Error saving session:", e);
    } finally {
      setIsSaving(false);
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
          <Button asChild>
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
        <header className="space-y-1">
          <Link
            href="/student/workouts"
            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <X className="h-3 w-3" /> {t("endSession")}
          </Link>
          <h1 className="text-2xl font-bold">{workout.title}</h1>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{t("sessionFeedbackTitle")}</CardTitle>
            <p className="text-xs text-muted-foreground">{t("sessionFeedbackHint")}</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("sessionDifficultyLabel")}</p>
              <div className="flex flex-wrap gap-2">
                {DIFFICULTY_FACES.map((emoji, idx) => {
                  const rating = idx + 1;
                  const selected = sessionDifficultyRating === rating;
                  return (
                    <button
                      key={rating}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${rating}/5`}
                      className={cn(
                        "h-11 w-11 rounded-xl border-2 text-xl flex items-center justify-center transition-colors",
                        selected ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border hover:bg-muted/60"
                      )}
                      onClick={() =>
                        setSessionDifficultyRating((prev) => (prev === rating ? null : rating))
                      }
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
              <Textarea
                value={difficultyNotes}
                onChange={(e) => setDifficultyNotes(e.target.value.slice(0, NOTE_MAX_LENGTH))}
                placeholder={t("sessionDifficultyPlaceholder")}
                maxLength={NOTE_MAX_LENGTH}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("sessionMoodLabel")}</p>
              <div className="flex flex-wrap gap-2">
                {MOOD_FACES.map((emoji, idx) => {
                  const rating = idx + 1;
                  const selected = sessionMoodRating === rating;
                  return (
                    <button
                      key={rating}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${rating}/5`}
                      className={cn(
                        "h-11 w-11 rounded-xl border-2 text-xl flex items-center justify-center transition-colors",
                        selected ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "border-border hover:bg-muted/60"
                      )}
                      onClick={() => setSessionMoodRating((prev) => (prev === rating ? null : rating))}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
              <Textarea
                value={moodNotes}
                onChange={(e) => setMoodNotes(e.target.value.slice(0, NOTE_MAX_LENGTH))}
                placeholder={t("sessionMoodPlaceholder")}
                maxLength={NOTE_MAX_LENGTH}
                rows={2}
                className="resize-none text-sm"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="session-body-weight-kg">
                  {t("currentWeightKg")}
                </label>
                <p id="session-body-weight-hint" className="text-xs text-muted-foreground">
                  {t("sessionBodyWeightHint")}
                </p>
                <Input
                  id="session-body-weight-kg"
                  type="number"
                  inputMode="decimal"
                  min={20}
                  max={450}
                  step={0.1}
                  placeholder="—"
                  value={sessionBodyWeightKg}
                  onChange={(e) => setSessionBodyWeightKg(e.target.value)}
                  className="text-lg font-bold h-12"
                  aria-describedby="session-body-weight-hint"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="session-body-fat-percent">
                  {t("bodyFatPercent")}
                </label>
                <p id="session-body-fat-hint" className="text-xs text-muted-foreground">
                  {t("sessionBodyFatHint")}
                </p>
                <Input
                  id="session-body-fat-percent"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={70}
                  step={0.1}
                  placeholder="—"
                  value={sessionBodyFatPercent}
                  onChange={(e) => setSessionBodyFatPercent(e.target.value)}
                  className="text-lg font-bold h-12"
                  aria-describedby="session-body-fat-hint"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {exercises.map((exercise, index) => {
            const log = logs[index] ?? { weight: "", reps: "" };
            const logged = exerciseHasLoggedSet(log);
            const prevPerf = lastPerfLookup[normalizeExerciseKey(exercise.exerciseName)];
            const lastHint =
              prevPerf && prevPerf.reps > 0
                ? prevPerf.weight > 0
                  ? t("lastSessionPerformance")
                      .replace("{weight}", String(prevPerf.weight))
                      .replace("{reps}", String(prevPerf.reps))
                  : t("lastSessionPerformanceBodyweight").replace("{reps}", String(prevPerf.reps))
                : null;

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
                    {t("registerYourSet")}
                  </p>

                  {lastHint ? (
                    <p className="text-xs font-medium text-primary/90">{lastHint}</p>
                  ) : null}

                  <div
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border-2 transition-colors",
                      logged ? "border-accent bg-accent/5" : "border-border bg-muted/20"
                    )}
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
                        className="text-lg font-bold h-12 text-center"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <CardFooter className="justify-end border-t pt-6 px-0">
          <Button className="gap-2 bg-primary text-primary-foreground" onClick={handleFinishWorkout} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("finishWorkout")}
          </Button>
        </CardFooter>
      </div>
    </StudentNavigation>
  );
}
