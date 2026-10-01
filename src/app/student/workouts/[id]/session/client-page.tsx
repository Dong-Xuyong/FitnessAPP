
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Dumbbell,
  CheckCircle2,
  Save,
  Loader2,
  X,
  StickyNote,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useUser, useFirestore } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { doc, getDoc, collection, query, orderBy, limit, getDocs } from "firebase/firestore";
import {
  commitFinishedWorkoutSession,
  exerciseHasLoggedSet,
} from "@/lib/workout-session-finish";
import {
  studentHasCoachPresentAccessForPlan,
  studentLocalCalendarDateKeyMs,
  type SessionSlotAttendance,
} from "@/lib/session-attendance-streak";
import { normalizeVacationPeriods } from "@/lib/trainer-availability";
import { cn } from "@/lib/utils";
import {
  isOpenTrainingAccess,
  normalizeTrainingAccessMode,
} from "@/lib/student-training-access";
import {
  buildLastPerfByExercise,
  formatLastSessionPerformanceLabel,
  normalizeExerciseKey,
  type LastSessionPerf,
} from "@/lib/last-session-performance";
import { getYouTubeEmbedUrl } from "@/lib/exercise-video";
import type { LibraryExerciseVideo } from "@/lib/find-library-exercises-in-text";
import {
  ExactExerciseDemoButton,
  MentionedExerciseDemoChips,
} from "@/components/ExerciseTextDemoButtons";

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
  studentUnlocked?: boolean;
  sequenceNextPlanId?: string | null;
  sequenceUnlockAfterPlanId?: string | null;
}

export default function WorkoutSessionPage({ workoutId }: { workoutId: string }) {
  const { user } = useUser();
  const db = useFirestore();
  const { t } = useI18n();
  const { toast } = useToast();

  const [workout, setWorkout] = useState<WorkoutPlan | null>(null);
  const [isLoadingWorkout, setIsLoadingWorkout] = useState(true);
  const [logs, setLogs] = useState<Record<number, SetLog>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [effectiveStudentId, setEffectiveStudentId] = useState<string | null>(null);
  const [lastPerfLookup, setLastPerfLookup] = useState<Record<string, LastSessionPerf>>({});
  const [exerciseLibraryVideos, setExerciseLibraryVideos] = useState<LibraryExerciseVideo[]>([]);
  const [selectedExerciseVideo, setSelectedExerciseVideo] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const [difficultyNotes, setDifficultyNotes] = useState("");
  const [moodNotes, setMoodNotes] = useState("");
  const [sessionDifficultyRating, setSessionDifficultyRating] = useState<number | null>(null);
  const [sessionMoodRating, setSessionMoodRating] = useState<number | null>(null);
  const [sessionBodyWeightKg, setSessionBodyWeightKg] = useState("");
  const [sessionBodyFatPercent, setSessionBodyFatPercent] = useState("");
  const [presenceCheckLoading, setPresenceCheckLoading] = useState(true);
  const [presenceAllowed, setPresenceAllowed] = useState(false);
  const [sessionFeedbackOpen, setSessionFeedbackOpen] = useState(false);
  /** Prior step doc is completed but `studentUnlocked` may still be false if unlock write failed. */
  const [priorStepCompletedOverride, setPriorStepCompletedOverride] = useState(false);
  const prefilledSignatureRef = useRef<string | null>(null);
  const metricsPrefilledRef = useRef(false);
  const embeddedExerciseVideoUrl = selectedExerciseVideo
    ? getYouTubeEmbedUrl(selectedExerciseVideo.url)
    : null;

  useEffect(() => {
    prefilledSignatureRef.current = null;
    metricsPrefilledRef.current = false;
    setSessionBodyWeightKg("");
    setSessionBodyFatPercent("");
    setPresenceCheckLoading(true);
    setPresenceAllowed(false);
    setPriorStepCompletedOverride(false);
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
        const [planDoc, exercisesSnap] = await Promise.all([
          getDoc(
            doc(db!, "personalTrainers", trainerId, "students", resolvedStudentId, "workoutPlans", workoutId)
          ),
          getDocs(collection(db!, "exercises")),
        ]);
        if (planDoc.exists() && !cancelled) {
          const workoutData = { ...planDoc.data(), personalTrainerId: trainerId } as WorkoutPlan;
          setWorkout(workoutData);
        }
        if (!cancelled) {
          const videos: LibraryExerciseVideo[] = [];
          for (const exerciseDoc of exercisesSnap.docs) {
            const exercise = exerciseDoc.data();
            const name = String(exercise.name || "").trim();
            const videoUrl = String(exercise.videoUrl || "").trim();
            if (name && videoUrl) videos.push({ name, videoUrl });
          }
          setExerciseLibraryVideos(videos);
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
    setPriorStepCompletedOverride(false);
    if (!db || !user?.uid || !workout || workout.studentUnlocked !== false) return;
    const prior =
      typeof workout.sequenceUnlockAfterPlanId === "string"
        ? workout.sequenceUnlockAfterPlanId.trim()
        : "";
    const tid = workout.personalTrainerId;
    const rid = effectiveStudentId || user.uid;
    if (!prior || !tid || !rid) return;
    let cancelled = false;
    void getDoc(doc(db, "personalTrainers", tid, "students", rid, "workoutPlans", prior)).then((snap) => {
      if (cancelled || !snap.exists()) return;
      const d = snap.data() as { status?: string; completedAt?: unknown };
      const done =
        d?.status === "completed" ||
        (d?.completedAt != null && String(d.completedAt as string).trim() !== "");
      if (done) setPriorStepCompletedOverride(true);
    });
    return () => {
      cancelled = true;
    };
  }, [db, user?.uid, workout, effectiveStudentId]);

  const runPresenceCheck = useCallback(async () => {
    if (!db || !user?.uid || !workoutId) return false;
    const studentDoc = await getDoc(doc(db, "students", user.uid));
    if (!studentDoc.exists()) return false;
    const sd = studentDoc.data() ?? {};
    const trainerId = sd.trainerId as string | undefined;
    if (!trainerId) return false;
    const resolvedStudentId = (sd.rosterDocId as string | undefined) || user.uid;
    const rosterSnap = await getDoc(doc(db, "personalTrainers", trainerId, "students", resolvedStudentId));
    let trainingMode = normalizeTrainingAccessMode(sd.trainingAccessMode);
    if (rosterSnap.exists()) {
      const rd = rosterSnap.data() as { trainingAccessMode?: unknown };
      if (rd.trainingAccessMode != null) {
        trainingMode = normalizeTrainingAccessMode(rd.trainingAccessMode);
      }
    }
    if (isOpenTrainingAccess(trainingMode)) return true;

    const fallbackDur =
      rosterSnap.exists() && typeof (rosterSnap.data() as { sessionDurationMin?: number }).sessionDurationMin === "number"
        ? Number((rosterSnap.data() as { sessionDurationMin: number }).sessionDurationMin)
        : 60;
    const [slotsSnap, sessionsSnap, trainerSnap] = await Promise.all([
      getDocs(collection(db, "personalTrainers", trainerId, "sessionSlots")),
      getDocs(collection(db, "personalTrainers", trainerId, "students", resolvedStudentId, "workoutSessions")),
      getDoc(doc(db, "personalTrainers", trainerId)),
    ]);
    const slots = slotsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as SessionSlotAttendance[];
    const vacationPeriods = normalizeVacationPeriods(trainerSnap.data()?.vacationPeriods);
    const todayK = studentLocalCalendarDateKeyMs(Date.now());
    let completedSessionToday = false;
    for (const docSn of sessionsSnap.docs) {
      const data = docSn.data() as { completedAt?: unknown };
      const ca = data.completedAt;
      if (ca == null) continue;
      let ms: number | null = null;
      if (typeof ca === "object" && ca !== null && "toDate" in (ca as object) && typeof (ca as { toDate?: () => Date }).toDate === "function") {
        ms = (ca as { toDate: () => Date }).toDate().getTime();
      } else if (typeof ca === "string" && ca.trim()) {
        ms = Date.parse(ca);
      }
      if (ms == null || !Number.isFinite(ms)) continue;
      if (studentLocalCalendarDateKeyMs(ms) === todayK) {
        completedSessionToday = true;
        break;
      }
    }
    const present = studentHasCoachPresentAccessForPlan(
      slots,
      resolvedStudentId,
      workoutId,
      Date.now(),
      fallbackDur,
      vacationPeriods
    );
    return present && !completedSessionToday;
  }, [db, user?.uid, workoutId]);

  useEffect(() => {
    if (!db || !user?.uid || !workoutId) return;
    if (!workout) {
      if (!isLoadingWorkout) {
        setPresenceCheckLoading(false);
        setPresenceAllowed(false);
      }
      return;
    }
    let cancelled = false;
    (async () => {
      setPresenceCheckLoading(true);
      try {
        const ok = await runPresenceCheck();
        if (!cancelled) setPresenceAllowed(ok);
      } catch (e) {
        console.error("Presence check failed:", e);
        if (!cancelled) setPresenceAllowed(false);
      } finally {
        if (!cancelled) setPresenceCheckLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, user?.uid, workoutId, workout, isLoadingWorkout, runPresenceCheck]);

  useEffect(() => {
    if (!db || !user?.uid || presenceAllowed || !workout) return;
    const id = window.setInterval(async () => {
      try {
        const ok = await runPresenceCheck();
        if (ok) setPresenceAllowed(true);
      } catch {
        /* ignore */
      }
    }, 15_000);
    return () => window.clearInterval(id);
  }, [db, user?.uid, presenceAllowed, workout, runPresenceCheck]);

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
        const perf: Record<string, LastSessionPerf> = {};
        for (const docSnap of snap.docs) {
          const data = docSnap.data() as {
            completedAt?: string;
            exercises?: WorkoutExercise[];
          };
          if (!data.completedAt) continue;
          const perEx = buildLastPerfByExercise(data);
          for (const [key, p] of Object.entries(perEx)) {
            if (!(key in perf)) perf[key] = p;
          }
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
    if (workout.studentUnlocked === false && !priorStepCompletedOverride) return;
    if (!presenceAllowed) return;
    setIsSaving(true);
    try {
      const trainerId = workout.personalTrainerId;
      const resolvedStudentId = effectiveStudentId || user.uid;
      const parsedBw = parseOptionalBodyWeightKg(sessionBodyWeightKg);
      const parsedBf = parseOptionalBodyFatPercent(sessionBodyFatPercent);
      await commitFinishedWorkoutSession({
        db,
        trainerId,
        storageStudentId: resolvedStudentId,
        sessionStudentAuthUid: user.uid,
        workoutPlanId: workoutId,
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
      console.error("Error saving session:", e);
      toast({
        variant: "destructive",
        title: t("sessionSaveFailed"),
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingWorkout || (workout && presenceCheckLoading)) {
    return (
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    );
  }

  if (!workout) {
    return (
        <div className="text-center py-20 space-y-4">
          <Dumbbell className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-2xl font-bold">{t("workoutNotFound")}</h2>
          <Button asChild>
            <Link href="/student/workouts">{t("backToWorkouts")}</Link>
          </Button>
        </div>
    );
  }

  if (workout.studentUnlocked === false && !priorStepCompletedOverride) {
    return (
        <div className="text-center py-20 space-y-4 max-w-md mx-auto">
          <Dumbbell className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-2xl font-bold">{t("workoutPlanLockedTitle")}</h2>
          <p className="text-muted-foreground">{t("workoutPlanLockedDescription")}</p>
          <Button asChild>
            <Link href="/student/workouts">{t("backToWorkouts")}</Link>
          </Button>
        </div>
    );
  }

  if (!presenceAllowed) {
    return (
        <div className="text-center py-20 space-y-4 max-w-md mx-auto">
          <Dumbbell className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-2xl font-bold">{t("studentTrainingRequiresPresentTitle")}</h2>
          <p className="text-muted-foreground">{t("studentTrainingRequiresPresentDescription")}</p>
          <Button asChild>
            <Link href="/student/workouts">{t("backToWorkouts")}</Link>
          </Button>
        </div>
    );
  }

  if (exercises.length === 0) {
    return (
        <div className="text-center py-20 space-y-4">
          <Dumbbell className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-2xl font-bold">{t("workoutNotFound")}</h2>
          <Button asChild>
            <Link href="/student/workouts">{t("backToWorkouts")}</Link>
          </Button>
        </div>
    );
  }

  if (isFinished) {
    return (
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
          <div className="flex flex-col gap-2 w-full">
            <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90" asChild>
              <Link href="/student/workout-history">{t("workoutHistory")}</Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/student/workouts">{t("backToWorkouts")}</Link>
            </Button>
          </div>
        </div>
    );
  }

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <Link
            href="/student/workouts"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-muted/40"
            aria-label={t("endSession")}
            title={t("endSession")}
          >
            <X className="h-4 w-4" aria-hidden />
          </Link>
          <h1 className="text-2xl font-bold">{workout.title}</h1>
        </header>

        <Card>
          <Collapsible open={sessionFeedbackOpen} onOpenChange={setSessionFeedbackOpen}>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
              <div className="min-w-0 flex items-center gap-2">
                <CardTitle className="text-lg">{t("sessionFeedbackTitle")}</CardTitle>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40"
                  title={t("sessionFeedbackHint")}
                  aria-label={t("sessionFeedbackHint")}
                >
                  <Info className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  aria-expanded={sessionFeedbackOpen}
                  aria-label={
                    sessionFeedbackOpen ? t("sessionFeedbackCollapse") : t("sessionFeedbackExpand")
                  }
                >
                  {sessionFeedbackOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
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
                <label className="text-sm font-medium inline-flex items-center gap-1.5" htmlFor="session-body-weight-kg">
                  {t("currentWeightKg")}
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40"
                    title={t("sessionBodyWeightHint")}
                    aria-label={t("sessionBodyWeightHint")}
                  >
                    <Info className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </label>
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
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium inline-flex items-center gap-1.5" htmlFor="session-body-fat-percent">
                  {t("bodyFatPercent")}
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40"
                    title={t("sessionBodyFatHint")}
                    aria-label={t("sessionBodyFatHint")}
                  >
                    <Info className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </label>
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
            </CollapsibleContent>
          </Collapsible>
        </Card>

        <div className="space-y-4">
          {exercises.map((exercise, index) => {
            const log = logs[index] ?? { weight: "", reps: "" };
            const logged = exerciseHasLoggedSet(log);
            const exerciseKey = normalizeExerciseKey(exercise.exerciseName);
            const notes = String(exercise.notes || "").trim();
            const prevPerf = lastPerfLookup[exerciseKey];
            const lastHint = formatLastSessionPerformanceLabel(prevPerf, {
              weighted: (weight, reps) =>
                t("lastSessionPerformance")
                  .replace("{weight}", String(weight))
                  .replace("{reps}", String(reps)),
              bodyweight: (reps) =>
                t("lastSessionPerformanceBodyweight").replace("{reps}", String(reps)),
            });

            return (
              <Card key={index}>
                <CardHeader>
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <Badge variant="outline" className="text-xs mb-1">
                        {t("exercises")} {index + 1}/{totalExercises}
                      </Badge>
                      <div className="flex items-start gap-2">
                        <CardTitle className="text-2xl flex-1 whitespace-pre-wrap break-words">
                          {exercise.exerciseName}
                        </CardTitle>
                        <ExactExerciseDemoButton
                          title={exercise.exerciseName}
                          libraryVideos={exerciseLibraryVideos}
                          onSelect={setSelectedExerciseVideo}
                          watchDemoLabel={t("watchDemo")}
                          className="h-8 w-8 -mt-1 shrink-0 text-primary hover:text-primary"
                          iconClassName="h-5 w-5"
                        />
                      </div>
                    </div>
                  </div>

                  {notes ? (
                    <div className="flex items-start gap-2 mt-3 p-3 rounded-lg bg-muted/40 border border-muted text-sm text-muted-foreground">
                      <StickyNote className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
                      <p className="leading-relaxed whitespace-pre-wrap">{notes}</p>
                    </div>
                  ) : null}
                  <MentionedExerciseDemoChips
                    title={exercise.exerciseName}
                    extraText={notes}
                    libraryVideos={exerciseLibraryVideos}
                    onSelect={setSelectedExerciseVideo}
                    watchDemoLabel={t("watchDemo")}
                    matchedDemosLabel={t("matchedExerciseDemos")}
                  />
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
      <Dialog
        open={!!selectedExerciseVideo}
        onOpenChange={(open) => !open && setSelectedExerciseVideo(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t("watchDemo")} — {selectedExerciseVideo?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedExerciseVideo ? (
            embeddedExerciseVideoUrl ? (
              <div className="aspect-video overflow-hidden rounded-md bg-muted">
                <iframe
                  className="h-full w-full"
                  src={embeddedExerciseVideoUrl}
                  title={`${t("watchDemo")}: ${selectedExerciseVideo.title}`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            ) : (
              <a
                href={selectedExerciseVideo.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-1 text-sm text-primary hover:underline"
              >
                {t("watchDemo")}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
