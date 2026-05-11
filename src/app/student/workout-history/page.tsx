"use client";

import { useEffect, useState } from "react";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { StudentNavigation } from "@/components/StudentNavigation";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUser, useFirestore } from "@/firebase";
import { cn } from "@/lib/utils";
import { collection, deleteDoc, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Save,
  Trash2,
  X as XIcon,
} from "lucide-react";

const DIFFICULTY_FACES = ["😌", "🙂", "😐", "😰", "😵"] as const;
const MOOD_FACES = ["😢", "😕", "😐", "😊", "🤩"] as const;
const NOTE_MAX_LENGTH = 500;

function clampRating(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
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

interface WorkoutSession {
  id: string;
  workoutTitle?: string;
  date?: string;
  completedAt?: string;
  exercises?: Array<{ exerciseName?: string; sets?: Array<any> }>;
  sessionDifficultyRating?: number | null;
  sessionMoodRating?: number | null;
  difficultyNotes?: string;
  moodNotes?: string;
  bodyWeightKg?: number | null;
  sessionBodyFatPercent?: number | null;
}

function SessionFeedbackSummary({ session, t }: { session: WorkoutSession; t: (key: TranslationKey) => string }) {
  const dr = Number(session.sessionDifficultyRating);
  const mr = Number(session.sessionMoodRating);
  const showDifficultyFace = Number.isFinite(dr) && dr >= 1 && dr <= 5;
  const showMoodFace = Number.isFinite(mr) && mr >= 1 && mr <= 5;
  const hasRatingRow = showDifficultyFace || showMoodFace;
  const hasNotes = !!(session.difficultyNotes?.trim() || session.moodNotes?.trim());
  if (!hasRatingRow && !hasNotes) return null;

  return (
    <div className="mt-2 text-xs rounded-md bg-muted/50 border border-border/50 px-2.5 py-2 space-y-1.5">
      {hasRatingRow ? (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 items-center">
          {showDifficultyFace ? (
            <span className="text-muted-foreground">
              {t("sessionDifficultyCoach")}: <span aria-hidden>{DIFFICULTY_FACES[dr - 1]}</span> ({dr}/5)
            </span>
          ) : null}
          {showMoodFace ? (
            <span className="text-muted-foreground">
              {t("sessionMoodCoach")}: <span aria-hidden>{MOOD_FACES[mr - 1]}</span> ({mr}/5)
            </span>
          ) : null}
        </div>
      ) : null}
      {hasNotes ? (
        <div className="space-y-1 text-muted-foreground">
          {session.difficultyNotes?.trim() ? (
            <p>
              <span className="font-semibold text-foreground/80">{t("sessionDifficultyCoach")}: </span>
              {session.difficultyNotes.trim()}
            </p>
          ) : null}
          {session.moodNotes?.trim() ? (
            <p>
              <span className="font-semibold text-foreground/80">{t("sessionMoodCoach")}: </span>
              {session.moodNotes.trim()}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function StudentWorkoutHistoryPage() {
  const { t } = useI18n();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [trainerId, setTrainerId] = useState("");
  const [resolvedStudentId, setResolvedStudentId] = useState("");
  const [completedWorkouts, setCompletedWorkouts] = useState<WorkoutSession[]>([]);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionExercises, setEditSessionExercises] = useState<
    Array<{ exerciseName: string; sets: Array<{ setNumber: number; weight: number; reps: number; completed: boolean }> }>
  >([]);
  const [editDifficultyRating, setEditDifficultyRating] = useState<number | null>(null);
  const [editMoodRating, setEditMoodRating] = useState<number | null>(null);
  const [editDifficultyNotes, setEditDifficultyNotes] = useState("");
  const [editMoodNotes, setEditMoodNotes] = useState("");
  const [editBodyWeightKg, setEditBodyWeightKg] = useState("");
  const [editSessionBodyFatPercent, setEditSessionBodyFatPercent] = useState("");
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);

  useEffect(() => {
    if (!db || !user) {
      setIsLoading(false);
      return;
    }
    const uid = user.uid;

    let cancelled = false;
    async function fetchHistory() {
      setIsLoading(true);
      try {
        const studentSnap = await getDoc(doc(db, "students", uid));
        if (!studentSnap.exists()) return;

        const tid = studentSnap.data()?.trainerId as string | undefined;
        if (!tid) return;
        const rid = (studentSnap.data()?.rosterDocId as string | undefined) || uid;
        if (cancelled) return;

        setTrainerId(tid);
        setResolvedStudentId(rid);

        const sessionsSnap = await getDocs(
          collection(db, "personalTrainers", tid, "students", rid, "workoutSessions")
        );
        if (cancelled) return;

        const completedSessions = sessionsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as WorkoutSession))
          .filter((s) => !!s.completedAt)
          .sort((a, b) => Date.parse(b.completedAt || "") - Date.parse(a.completedAt || ""));

        setCompletedWorkouts(completedSessions);
      } catch (error) {
        console.error("Failed to load workout history", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [db, user?.uid]);

  const startEditSession = (session: WorkoutSession) => {
    const exercises = (session.exercises || []).map((ex) => ({
      exerciseName: ex.exerciseName || "",
      sets: (ex.sets || [{ setNumber: 1, weight: 0, reps: 0, completed: false }]).map((s: any) => ({
        setNumber: s.setNumber ?? 1,
        weight: typeof s.weight === "number" ? s.weight : Number(s.weight) || 0,
        reps: typeof s.reps === "number" ? s.reps : Number(s.reps) || 0,
        completed: s.completed ?? true,
      })),
    }));
    setEditSessionExercises(exercises);
    setEditDifficultyRating(clampRating(session.sessionDifficultyRating));
    setEditMoodRating(clampRating(session.sessionMoodRating));
    setEditDifficultyNotes((session.difficultyNotes ?? "").slice(0, NOTE_MAX_LENGTH));
    setEditMoodNotes((session.moodNotes ?? "").slice(0, NOTE_MAX_LENGTH));
    const bw = session.bodyWeightKg;
    setEditBodyWeightKg(
      bw != null && Number.isFinite(Number(bw)) && Number(bw) > 0 ? String(bw) : ""
    );
    const sbf = session.sessionBodyFatPercent;
    setEditSessionBodyFatPercent(
      sbf != null && Number.isFinite(Number(sbf)) && Number(sbf) > 0 ? String(sbf) : ""
    );
    setEditingSessionId(session.id);
    setExpandedSessionId(session.id);
  };

  const endEditing = () => {
    setEditingSessionId(null);
  };

  const handleSaveSession = async () => {
    if (!db || !user || !editingSessionId || !trainerId || !resolvedStudentId) return;
    setIsSavingSession(true);
    try {
      const difficultyNotes = editDifficultyNotes.trim().slice(0, NOTE_MAX_LENGTH);
      const moodNotes = editMoodNotes.trim().slice(0, NOTE_MAX_LENGTH);
      await updateDoc(
        doc(db, "personalTrainers", trainerId, "students", resolvedStudentId, "workoutSessions", editingSessionId),
        {
          exercises: editSessionExercises,
          sessionDifficultyRating: editDifficultyRating,
          sessionMoodRating: editMoodRating,
          difficultyNotes,
          moodNotes,
          bodyWeightKg: parseOptionalBodyWeightKg(editBodyWeightKg),
          sessionBodyFatPercent: parseOptionalBodyFatPercent(editSessionBodyFatPercent),
          updatedAt: new Date().toISOString(),
        }
      );
      setCompletedWorkouts((prev) =>
        prev.map((s) =>
          s.id === editingSessionId
            ? {
                ...s,
                exercises: editSessionExercises,
                sessionDifficultyRating: editDifficultyRating,
                sessionMoodRating: editMoodRating,
                difficultyNotes,
                moodNotes,
                bodyWeightKg: parseOptionalBodyWeightKg(editBodyWeightKg),
                sessionBodyFatPercent: parseOptionalBodyFatPercent(editSessionBodyFatPercent),
              }
            : s
        )
      );
      endEditing();
      toast({ title: t("sessionUpdated") });
    } catch (e: any) {
      toast({ title: "Erro ao guardar", description: e?.message, variant: "destructive" });
    } finally {
      setIsSavingSession(false);
    }
  };

  const handleConfirmDeleteSession = async () => {
    if (!db || !confirmDeleteSessionId || !trainerId || !resolvedStudentId) return;
    setIsDeletingSession(true);
    try {
      await deleteDoc(
        doc(db, "personalTrainers", trainerId, "students", resolvedStudentId, "workoutSessions", confirmDeleteSessionId)
      );
      setCompletedWorkouts((prev) => prev.filter((s) => s.id !== confirmDeleteSessionId));
      if (expandedSessionId === confirmDeleteSessionId) setExpandedSessionId(null);
      if (editingSessionId === confirmDeleteSessionId) endEditing();
      setConfirmDeleteSessionId(null);
      toast({ title: t("workoutSessionDeleted") });
    } catch (e: any) {
      toast({
        title: t("deleteSessionFailed"),
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setIsDeletingSession(false);
    }
  };

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
          <h1 className="text-3xl font-bold font-headline">{t("workoutHistory")}</h1>
          <p className="text-muted-foreground">{t("completedCount")}</p>
        </header>

        {completedWorkouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noWorkoutSessions")}</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t("workoutHistory")}</h2>
              <Badge variant="secondary">{completedWorkouts.length} {t("completedCount")}</Badge>
            </div>
            <div className="space-y-2">
              {completedWorkouts.map((session) => {
                const completedDate = session.completedAt || session.date;
                const isExpanded = expandedSessionId === session.id;
                const isEditing = editingSessionId === session.id;
                const exList = isEditing ? editSessionExercises : (session.exercises || []);

                const toggleExpanded = () => {
                  if (!isEditing) setExpandedSessionId(isExpanded ? null : session.id);
                };

                return (
                  <div key={session.id} className="rounded-lg border overflow-hidden bg-card">
                    {!isEditing ? (
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        )}
                        aria-expanded={isExpanded}
                        onClick={toggleExpanded}
                      >
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{session.workoutTitle || t("completedWorkout")}</p>
                          {completedDate && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3 shrink-0" aria-hidden />{" "}
                              {new Date(completedDate).toLocaleDateString()}
                            </p>
                          )}
                          <SessionFeedbackSummary session={session} t={t} />
                        </div>
                        <span className="shrink-0 self-center text-muted-foreground" aria-hidden>
                          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </span>
                      </button>
                    ) : (
                      <div className="flex items-start gap-3 px-3 py-2.5">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{session.workoutTitle || t("completedWorkout")}</p>
                          {completedDate && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3 shrink-0" aria-hidden />{" "}
                              {new Date(completedDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 self-center"
                          aria-label={t("cancel")}
                          onClick={() => endEditing()}
                        >
                          <XIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    )}

                    {(isExpanded || isEditing) && (
                      <div className="border-t divide-y">
                        {isExpanded && !isEditing && (
                          <div className="flex flex-wrap gap-2 border-b bg-muted/10 px-4 py-2.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs"
                              onClick={() => startEditSession(session)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              {t("editSession")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-1.5 border-destructive/40 text-xs text-destructive hover:bg-destructive/10"
                              onClick={() => setConfirmDeleteSessionId(session.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {t("deleteSession")}
                            </Button>
                          </div>
                        )}
                        {isEditing && (
                          <div className="px-4 py-4 space-y-4 bg-muted/10 border-b border-border">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              {t("sessionFeedbackTitle")}
                            </p>
                            <div className="space-y-2">
                              <p className="text-sm font-medium">{t("sessionDifficultyLabel")}</p>
                              <div className="flex flex-wrap gap-2">
                                {DIFFICULTY_FACES.map((_emoji, idx) => {
                                  const rating = idx + 1;
                                  const selected = editDifficultyRating === rating;
                                  return (
                                    <button
                                      key={rating}
                                      type="button"
                                      aria-pressed={selected}
                                      className={cn(
                                        "h-10 w-10 rounded-xl border-2 text-lg flex items-center justify-center transition-colors",
                                        selected
                                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                                          : "border-border hover:bg-muted/60"
                                      )}
                                      onClick={() =>
                                        setEditDifficultyRating((prev) => (prev === rating ? null : rating))
                                      }
                                    >
                                      {DIFFICULTY_FACES[idx]}
                                    </button>
                                  );
                                })}
                              </div>
                              <Textarea
                                value={editDifficultyNotes}
                                onChange={(e) => setEditDifficultyNotes(e.target.value.slice(0, NOTE_MAX_LENGTH))}
                                placeholder={t("sessionDifficultyPlaceholder")}
                                maxLength={NOTE_MAX_LENGTH}
                                rows={2}
                                className="resize-none text-sm"
                              />
                            </div>
                            <div className="space-y-2">
                              <p className="text-sm font-medium">{t("sessionMoodLabel")}</p>
                              <div className="flex flex-wrap gap-2">
                                {MOOD_FACES.map((_emoji, idx) => {
                                  const rating = idx + 1;
                                  const selected = editMoodRating === rating;
                                  return (
                                    <button
                                      key={rating}
                                      type="button"
                                      aria-pressed={selected}
                                      className={cn(
                                        "h-10 w-10 rounded-xl border-2 text-lg flex items-center justify-center transition-colors",
                                        selected
                                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                                          : "border-border hover:bg-muted/60"
                                      )}
                                      onClick={() => setEditMoodRating((prev) => (prev === rating ? null : rating))}
                                    >
                                      {MOOD_FACES[idx]}
                                    </button>
                                  );
                                })}
                              </div>
                              <Textarea
                                value={editMoodNotes}
                                onChange={(e) => setEditMoodNotes(e.target.value.slice(0, NOTE_MAX_LENGTH))}
                                placeholder={t("sessionMoodPlaceholder")}
                                maxLength={NOTE_MAX_LENGTH}
                                rows={2}
                                className="resize-none text-sm"
                              />
                            </div>
                            <div className="grid sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-sm font-medium" htmlFor={`edit-body-weight-${editingSessionId}`}>
                                  {t("currentWeightKg")}
                                </label>
                                <p className="text-xs text-muted-foreground">{t("sessionBodyWeightHint")}</p>
                                <Input
                                  id={`edit-body-weight-${editingSessionId}`}
                                  type="number"
                                  inputMode="decimal"
                                  min={20}
                                  max={450}
                                  step={0.1}
                                  placeholder="—"
                                  value={editBodyWeightKg}
                                  onChange={(e) => setEditBodyWeightKg(e.target.value)}
                                  className="h-10 font-bold"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium" htmlFor={`edit-body-fat-${editingSessionId}`}>
                                  {t("bodyFatPercent")}
                                </label>
                                <p className="text-xs text-muted-foreground">{t("sessionBodyFatHint")}</p>
                                <Input
                                  id={`edit-body-fat-${editingSessionId}`}
                                  type="number"
                                  inputMode="decimal"
                                  min={1}
                                  max={70}
                                  step={0.1}
                                  placeholder="—"
                                  value={editSessionBodyFatPercent}
                                  onChange={(e) => setEditSessionBodyFatPercent(e.target.value)}
                                  className="h-10 font-bold"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                        {exList.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">Sem exercícios registados.</p>
                        ) : exList.map((ex: any, exIdx: number) => {
                          const set = (ex.sets || [])[0] ?? { weight: 0, reps: 0 };
                          return (
                            <div key={exIdx} className="px-4 py-3">
                              <p className="text-sm font-semibold mb-2">{ex.exerciseName}</p>
                              {isEditing ? (
                                <div className="flex items-center gap-3">
                                  <div className="flex-1 space-y-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Peso (kg)</label>
                                    <Input
                                      type="number"
                                      value={editSessionExercises[exIdx]?.sets[0]?.weight ?? ""}
                                      onChange={(e) => {
                                        setEditSessionExercises((prev) => {
                                          const next = prev.map((ex2, i) => i !== exIdx ? ex2 : {
                                            ...ex2,
                                            sets: ex2.sets.map((s, si) => si === 0 ? { ...s, weight: Number(e.target.value) || 0 } : s),
                                          });
                                          return next;
                                        });
                                      }}
                                      className="h-10 text-center font-bold"
                                      placeholder="0"
                                    />
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    <label className="text-xs font-semibold text-muted-foreground uppercase">Reps</label>
                                    <Input
                                      type="number"
                                      value={editSessionExercises[exIdx]?.sets[0]?.reps ?? ""}
                                      onChange={(e) => {
                                        setEditSessionExercises((prev) => {
                                          const next = prev.map((ex2, i) => i !== exIdx ? ex2 : {
                                            ...ex2,
                                            sets: ex2.sets.map((s, si) => si === 0 ? { ...s, reps: Number(e.target.value) || 0 } : s),
                                          });
                                          return next;
                                        });
                                      }}
                                      className="h-10 text-center font-bold"
                                      placeholder="0"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-4">
                                  <span className="text-xs bg-muted rounded px-2 py-1 font-semibold tabular-nums">
                                    {set.weight ?? 0} kg
                                  </span>
                                  <span className="text-xs bg-muted rounded px-2 py-1 font-semibold tabular-nums">
                                    {set.reps ?? 0} reps
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {isEditing && (
                          <div className="px-4 py-3 flex gap-2 bg-muted/10">
                            <Button size="sm" className="gap-1.5 text-xs" onClick={handleSaveSession} disabled={isSavingSession}>
                              {isSavingSession ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                              Guardar
                            </Button>
                            <Button size="sm" variant="outline" className="text-xs" onClick={endEditing}>
                              Cancelar
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <AlertDialog
        open={confirmDeleteSessionId !== null}
        onOpenChange={(open) => {
          if (!open && !isDeletingSession) setConfirmDeleteSessionId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteWorkoutConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteWorkoutConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={isDeletingSession}>{t("cancel")}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              className="gap-1.5"
              disabled={isDeletingSession}
              onClick={() => void handleConfirmDeleteSession()}
            >
              {isDeletingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("deleteSession")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </StudentNavigation>
  );
}
