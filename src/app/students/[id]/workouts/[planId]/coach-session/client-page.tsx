"use client";

import { use, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dumbbell, CheckCircle2, Save, Loader2, X, StickyNote, ChevronDown, ChevronUp } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useUser, useFirestore } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { commitFinishedWorkoutSession, exerciseHasLoggedSet } from "@/lib/workout-session-finish";
import { cn } from "@/lib/utils";
import { getStudentDisplayName } from "@/lib/student-display";

const NOTE_MAX_LENGTH = 500;

/** Effort faces: light → very hard */
const DIFFICULTY_FACES = ["😌", "🙂", "😐", "😰", "😵"] as const;
/** Mood faces: low → great */
const MOOD_FACES = ["😢", "😕", "😐", "😊", "🤩"] as const;

interface SetLog {
  weight: string;
  reps: string;
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
  studentUnlocked?: boolean;
  sequenceNextPlanId?: string | null;
}

function parseOptionalBodyWeightKg(raw: string): number | null {
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 450) return null;
  return Math.round(n * 1000) / 1000;
}

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

export default function CoachWorkoutSessionPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { id: storageStudentId, planId } = use(params);
  const { user } = useUser();
  const db = useFirestore();
  const { t } = useI18n();

  const [rosterRow, setRosterRow] = useState<Record<string, unknown> & { id: string } | null>(null);
  const [sessionStudentAuthUid, setSessionStudentAuthUid] = useState<string | null>(null);
  const [workout, setWorkout] = useState<WorkoutPlan | null>(null);
  const [isLoadingWorkout, setIsLoadingWorkout] = useState(true);
  const [logs, setLogs] = useState<Record<number, SetLog>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [difficultyNotes, setDifficultyNotes] = useState("");
  const [moodNotes, setMoodNotes] = useState("");
  const [sessionDifficultyRating, setSessionDifficultyRating] = useState<number | null>(null);
  const [sessionMoodRating, setSessionMoodRating] = useState<number | null>(null);
  const [sessionBodyWeightKg, setSessionBodyWeightKg] = useState("");
  const [sessionBodyFatPercent, setSessionBodyFatPercent] = useState("");
  const [sessionFeedbackOpen, setSessionFeedbackOpen] = useState(false);
  const metricsPrefilledRef = useRef(false);

  useEffect(() => {
    metricsPrefilledRef.current = false;
    setSessionBodyWeightKg("");
    setSessionBodyFatPercent("");
  }, [planId, storageStudentId]);

  useEffect(() => {
    if (!db || !user?.uid || !storageStudentId || !planId) return;
    let cancelled = false;
    async function load() {
      setIsLoadingWorkout(true);
      try {
        const rosterSnap = await getDoc(
          doc(db!, "personalTrainers", user!.uid, "students", storageStudentId)
        );
        if (!rosterSnap.exists()) {
          if (!cancelled) {
            setRosterRow(null);
            setSessionStudentAuthUid(null);
            setWorkout(null);
          }
          return;
        }
        const rosterData = { id: rosterSnap.id, ...rosterSnap.data() } as Record<string, unknown> & { id: string };
        const uidForSession =
          String((rosterData as { userId?: string }).userId || "").trim() || storageStudentId;
        if (!cancelled) {
          setRosterRow(rosterData);
          setSessionStudentAuthUid(uidForSession);
        }

        const trainerId = user!.uid;
        const planSnap = await getDoc(
          doc(db!, "personalTrainers", trainerId, "students", storageStudentId, "workoutPlans", planId)
        );
        if (!planSnap.exists()) {
          if (!cancelled) setWorkout(null);
          return;
        }
        const planData = { ...planSnap.data(), personalTrainerId: trainerId } as WorkoutPlan;
        if (!cancelled) setWorkout(planData);

        if (!cancelled && !metricsPrefilledRef.current && uidForSession) {
          metricsPrefilledRef.current = true;
          const globalSnap = await getDoc(doc(db!, "students", uidForSession));
          if (globalSnap.exists() && !cancelled) {
            const g = globalSnap.data() ?? {};
            setSessionBodyWeightKg(prefilledWeightFromProfile(g.weightKg));
            setSessionBodyFatPercent(prefilledBodyFatFromProfile(g.bodyFatPercent));
          }
        }
      } catch (e) {
        console.error("Coach session load error:", e);
        if (!cancelled) setWorkout(null);
      } finally {
        if (!cancelled) setIsLoadingWorkout(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [db, user?.uid, storageStudentId, planId]);

  const exercises = workout?.exercises || [];
  const totalExercises = exercises.length;

  const updateLog = (exerciseIndex: number, field: keyof Pick<SetLog, "weight" | "reps">, value: string) =>
    setLogs((prev) => ({
      ...prev,
      [exerciseIndex]: { ...(prev[exerciseIndex] ?? { weight: "", reps: "" }), [field]: value },
    }));

  const handleFinishWorkout = async () => {
    if (!db || !user || !workout || !sessionStudentAuthUid) {
      setIsFinished(true);
      return;
    }
    if (workout.studentUnlocked === false) return;
    setIsSaving(true);
    try {
      const parsedBw = parseOptionalBodyWeightKg(sessionBodyWeightKg);
      const parsedBf = parseOptionalBodyFatPercent(sessionBodyFatPercent);
      await commitFinishedWorkoutSession({
        db,
        trainerId: user.uid,
        storageStudentId,
        sessionStudentAuthUid,
        workoutPlanId: planId,
        workoutTitle: workout.title,
        sequenceNextPlanId: workout.sequenceNextPlanId,
        exercises,
        logs,
        bodyWeightKg: parsedBw,
        bodyFatPercent: parsedBf,
        difficultyNotes,
        moodNotes,
        sessionDifficultyRating,
        sessionMoodRating,
        noteMaxLength: NOTE_MAX_LENGTH,
      });
      setIsFinished(true);
    } catch (e) {
      console.error("Error saving coach session:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const studentLabel = rosterRow ? getStudentDisplayName(rosterRow, storageStudentId) : storageStudentId;

  if (isLoadingWorkout) {
    return (
      <Navigation>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Navigation>
    );
  }

  if (!workout) {
    return (
      <Navigation>
        <div className="text-center py-20 space-y-4 max-w-md mx-auto px-4">
          <Dumbbell className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-2xl font-bold">{t("workoutNotFound")}</h2>
          <Button asChild>
            <Link href={`/students/${storageStudentId}`}>{t("coachWorkoutSessionBack")}</Link>
          </Button>
        </div>
      </Navigation>
    );
  }

  if (workout.studentUnlocked === false) {
    return (
      <Navigation>
        <div className="text-center py-20 space-y-4 max-w-md mx-auto px-4">
          <Dumbbell className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-2xl font-bold">{t("workoutPlanLockedTitle")}</h2>
          <p className="text-muted-foreground">{t("workoutPlanLockedDescription")}</p>
          <Button asChild>
            <Link href={`/students/${storageStudentId}?tab=management`}>{t("coachWorkoutSessionBack")}</Link>
          </Button>
        </div>
      </Navigation>
    );
  }

  if (exercises.length === 0) {
    return (
      <Navigation>
        <div className="text-center py-20 space-y-4 max-w-md mx-auto px-4">
          <Dumbbell className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-2xl font-bold">{t("workoutNotFound")}</h2>
          <Button asChild>
            <Link href={`/students/${storageStudentId}`}>{t("coachWorkoutSessionBack")}</Link>
          </Button>
        </div>
      </Navigation>
    );
  }

  if (isFinished) {
    return (
      <Navigation>
        <div className="max-w-md mx-auto py-12 text-center space-y-6 px-4">
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
            <Link href={`/students/${storageStudentId}?tab=workoutHistory`}>{t("coachWorkoutSessionBack")}</Link>
          </Button>
        </div>
      </Navigation>
    );
  }

  return (
    <Navigation>
      <div className="max-w-2xl mx-auto space-y-6 px-4 pb-10">
        <header className="space-y-1">
          <Link
            href={`/students/${storageStudentId}?tab=management`}
            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <X className="h-3 w-3" /> {t("coachWorkoutSessionBack")}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {t("coachWorkoutSessionTitle")}
            </Badge>
          </div>
          <h1 className="text-3xl font-bold font-headline tracking-tight">{workout.title}</h1>
          <p className="text-muted-foreground text-sm">
            {studentLabel} — {t("coachWorkoutSessionSubtitle")}
          </p>
        </header>

        <Card>
          <Collapsible open={sessionFeedbackOpen} onOpenChange={setSessionFeedbackOpen}>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-lg">{t("sessionFeedbackTitle")}</CardTitle>
                <p className="text-xs text-muted-foreground">{t("sessionFeedbackHint")}</p>
              </div>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  aria-expanded={sessionFeedbackOpen}
                  aria-label={
                    sessionFeedbackOpen ? t("coachSessionFeedbackCollapse") : t("coachSessionFeedbackExpand")
                  }
                >
                  {sessionFeedbackOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">
                    {sessionFeedbackOpen ? t("coachSessionFeedbackCollapse") : t("coachSessionFeedbackExpand")}
                  </span>
                </Button>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-5 border-t pt-4">
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
                <label className="text-sm font-medium" htmlFor="coach-session-body-weight-kg">
                  {t("currentWeightKg")}
                </label>
                <p id="coach-session-body-weight-hint" className="text-xs text-muted-foreground">
                  {t("sessionBodyWeightHint")}
                </p>
                <Input
                  id="coach-session-body-weight-kg"
                  type="number"
                  inputMode="decimal"
                  min={20}
                  max={450}
                  step={0.1}
                  placeholder="—"
                  value={sessionBodyWeightKg}
                  onChange={(e) => setSessionBodyWeightKg(e.target.value)}
                  className="text-lg font-bold h-12"
                  aria-describedby="coach-session-body-weight-hint"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="coach-session-body-fat-percent">
                  {t("bodyFatPercent")}
                </label>
                <p id="coach-session-body-fat-hint" className="text-xs text-muted-foreground">
                  {t("sessionBodyFatHint")}
                </p>
                <Input
                  id="coach-session-body-fat-percent"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={70}
                  step={0.1}
                  placeholder="—"
                  value={sessionBodyFatPercent}
                  onChange={(e) => setSessionBodyFatPercent(e.target.value)}
                  className="text-lg font-bold h-12"
                  aria-describedby="coach-session-body-fat-hint"
                />
              </div>
            </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        <div className="space-y-4">
          {exercises.map((exercise, index) => {
            const log = logs[index] ?? { weight: "", reps: "" };
            const logged = exerciseHasLoggedSet(log);

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

                  {exercise.notes ? (
                    <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-muted/40 border border-muted text-sm text-muted-foreground">
                      <StickyNote className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
                      <p className="leading-relaxed">{exercise.notes}</p>
                    </div>
                  ) : null}
                </CardHeader>

                <CardContent className="space-y-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t("registerYourSet")}
                  </p>

                  <div
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-xl border-2 transition-colors",
                      logged ? "border-accent bg-accent/5" : "border-border bg-muted/20"
                    )}
                  >
                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">{t("weightKg")}</label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={log.weight}
                        onChange={(e) => updateLog(index, "weight", e.target.value)}
                        className="text-lg font-bold h-12 text-center"
                      />
                    </div>

                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-semibold text-muted-foreground uppercase">{t("reps")}</label>
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

        <div className="flex justify-end border-t pt-6">
          <Button className="gap-2 bg-primary text-primary-foreground" onClick={handleFinishWorkout} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("finishWorkout")}
          </Button>
        </div>
      </div>
    </Navigation>
  );
}
