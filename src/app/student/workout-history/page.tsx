"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { StudentNavigation } from "@/components/StudentNavigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useUser, useFirestore } from "@/firebase";
import { collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Save,
  X as XIcon,
} from "lucide-react";

interface WorkoutSession {
  id: string;
  workoutTitle?: string;
  date?: string;
  completedAt?: string;
  exercises?: Array<{ exerciseName?: string; sets?: Array<any> }>;
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
  const [isSavingSession, setIsSavingSession] = useState(false);

  useEffect(() => {
    if (!db || !user?.uid) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    async function fetchHistory() {
      setIsLoading(true);
      try {
        const studentSnap = await getDoc(doc(db, "students", user.uid));
        if (!studentSnap.exists()) return;

        const tid = studentSnap.data()?.trainerId as string | undefined;
        if (!tid) return;
        const rid = (studentSnap.data()?.rosterDocId as string | undefined) || user.uid;
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
    setEditingSessionId(session.id);
    setExpandedSessionId(session.id);
  };

  const handleSaveSession = async () => {
    if (!db || !user || !editingSessionId || !trainerId || !resolvedStudentId) return;
    setIsSavingSession(true);
    try {
      await updateDoc(
        doc(db, "personalTrainers", trainerId, "students", resolvedStudentId, "workoutSessions", editingSessionId),
        { exercises: editSessionExercises, updatedAt: new Date().toISOString() }
      );
      setCompletedWorkouts((prev) =>
        prev.map((s) => (s.id === editingSessionId ? { ...s, exercises: editSessionExercises } : s))
      );
      setEditingSessionId(null);
      toast({ title: t("sessionUpdated") });
    } catch (e: any) {
      toast({ title: "Erro ao guardar", description: e?.message, variant: "destructive" });
    } finally {
      setIsSavingSession(false);
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

                return (
                  <div key={session.id} className="rounded-lg border overflow-hidden bg-card">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <CheckCircle2 className="h-4 w-4 text-accent shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{session.workoutTitle || t("completedWorkout")}</p>
                        {completedDate && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {new Date(completedDate).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        onClick={() => {
                          if (isEditing) {
                            setEditingSessionId(null);
                            return;
                          }
                          setExpandedSessionId(isExpanded ? null : session.id);
                        }}
                      >
                        {isEditing ? <XIcon className="h-4 w-4" /> : isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      {!isEditing && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-primary shrink-0"
                          onClick={() => startEditSession(session)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {(isExpanded || isEditing) && (
                      <div className="border-t divide-y">
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
                            <Button size="sm" variant="outline" className="text-xs" onClick={() => setEditingSessionId(null)}>
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
    </StudentNavigation>
  );
}
