
"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Send, Loader2, Library, ExternalLink, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase";
import { collection, doc, addDoc, updateDoc } from "firebase/firestore";
import { trainerTrainingProgramsCollection } from "@/lib/firestore/training-programs";
import type { TrainingProgramDocument } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

type BuilderExercise = {
  name: string;
  notes: string;
};

function makeExercise(): BuilderExercise {
  return { name: "", notes: "" };
}

function buildSessions(title: string, exercises: BuilderExercise[]) {
  return [
    {
      order: 0,
      name: title || "Main session",
      exercises: exercises.map((ex) => ({
        exerciseName: ex.name,
        sets: 1,
        reps: "",
        restTimeSeconds: 0,
        notes: ex.notes,
      })),
    },
  ];
}

function WorkoutBuilderContent() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const editProgramId = searchParams.get("edit");

  const [isSavingLibrary, setIsSavingLibrary] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [loadedProgramStamp, setLoadedProgramStamp] = useState<string | null>(null);

  useEffect(() => {
    setLoadedProgramStamp(null);
  }, [editProgramId]);

  const [programTitle, setProgramTitle] = useState(t("newWorkoutPlan"));
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [exercises, setExercises] = useState<BuilderExercise[]>([makeExercise()]);

  // Load existing program when editing
  const editProgramRef = useMemoFirebase(() => {
    if (!db || !user || !editProgramId) return null;
    return doc(db, "personalTrainers", user.uid, "personalTrainingPrograms", editProgramId);
  }, [db, user, editProgramId]);

  const { data: editProgram } = useDoc<TrainingProgramDocument>(editProgramRef);

  useEffect(() => {
    if (!editProgram || !editProgramId) return;
    const exercisesSig = (editProgram.sessions ?? [])
      .flatMap((session) =>
        (session.exercises ?? []).map(
          (ex) => `${ex.exerciseName ?? ""}\0${ex.notes ?? ""}`
        )
      )
      .join("\n");
    const stamp = `${editProgramId}:${editProgram.updatedAt ?? ""}:${exercisesSig}`;
    if (loadedProgramStamp === stamp) return;
    setProgramTitle(editProgram.name || "Untitled program");
    const allExercises = (editProgram.sessions || []).flatMap((session) =>
      (session.exercises || []).map((ex) => ({
        name: ex.exerciseName,
        notes: ex.notes ?? "",
      }))
    );
    if (allExercises.length > 0) setExercises(allExercises);
    setLoadedProgramStamp(stamp);
  }, [editProgram, editProgramId, loadedProgramStamp]);

  const studentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user]);
  const { data: students } = useCollection(studentsQuery);

  const globalStudentsQuery = useMemoFirebase(() => (db ? collection(db, "students") : null), [db]);
  const { data: globalStudents } = useCollection(globalStudentsQuery);

  const exercisesQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "exercises");
  }, [db, user]);
  const { data: libraryExercises } = useCollection(exercisesQuery);
  const exerciseNames = (libraryExercises || []).map((ex: any) => ex.name as string).sort();

  const handleAddExercise = () => setExercises([...exercises, makeExercise()]);
  const handleRemoveExercise = (index: number) => setExercises(exercises.filter((_, i) => i !== index));
  const handleUpdateExercise = (index: number, field: keyof BuilderExercise, value: string) =>
    setExercises((prev) => prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex)));

  const validate = (): boolean => {
    if (exercises.some((ex) => !ex.name)) {
      toast({ variant: "destructive", title: t("incompleteProgram"), description: t("ensureAllExercisesNamed") });
      return false;
    }
    return true;
  };

  const handleSaveToLibrary = async () => {
    if (!db || !user || !validate()) return;
    setIsSavingLibrary(true);
    const now = new Date().toISOString();
    const title = programTitle.trim() || "Untitled program";
    try {
      if (editProgramId && editProgramRef) {
        await updateDocumentNonBlocking(editProgramRef, {
          name: title,
          sessions: buildSessions(title, exercises),
          updatedAt: now,
        });
        toast({ title: t("programUpdated"), description: `"${title}" has been saved.` });
      } else {
        await addDocumentNonBlocking(trainerTrainingProgramsCollection(db, user.uid), {
          trainerId: user.uid,
          name: title,
          sessions: buildSessions(title, exercises),
          createdAt: now,
          updatedAt: now,
        });
        toast({ title: t("savedToLibrary"), description: `"${title}" is available under Training Programs.` });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: t("saveFailed"), description: error?.message || "Could not save." });
    } finally {
      setIsSavingLibrary(false);
    }
  };

  const handleAssignToStudent = async () => {
    if (!db || !user || !selectedStudentId) {
      toast({ variant: "destructive", title: t("selectionRequired"), description: t("selectStudentToAssign") });
      return;
    }
    if (!validate()) return;

    setIsAssigning(true);
    const selectedStudent = students?.find((s) => s.id === selectedStudentId);
    let studentAuthUid = (selectedStudent?.userId as string) || "";
    if (!studentAuthUid && selectedStudent?.email) {
      const globalMatch = globalStudents?.find((g: any) => g.email === selectedStudent.email);
      if (globalMatch) studentAuthUid = globalMatch.id;
    }
    if (!studentAuthUid) studentAuthUid = selectedStudentId;

    try {
      await updateDoc(doc(db, "students", studentAuthUid), {
        trainerId: user.uid,
        ...(studentAuthUid !== selectedStudentId ? { rosterDocId: selectedStudentId } : {}),
      });
    } catch {}

    const assignedAt = scheduledDate
      ? new Date(`${scheduledDate}T${scheduledTime || "00:00"}`).toISOString()
      : new Date().toISOString();

    const payload = {
      title: programTitle,
      studentId: studentAuthUid,
      personalTrainerId: user.uid,
      createdAt: new Date().toISOString(),
      assignedAt,
      scheduledTime: scheduledTime || "",
      exercises: exercises.map((ex) => ({
        exerciseName: ex.name,
        sets: 1,
        reps: "",
        restTimeSeconds: 0,
        notes: ex.notes,
      })),
    };

    try {
      await addDoc(
        collection(db, "personalTrainers", user.uid, "students", studentAuthUid, "workoutPlans"),
        payload
      );
      toast({ title: t("programAssigned"), description: `Successfully assigned "${programTitle}".` });
    } catch (e: any) {
      toast({ variant: "destructive", title: t("assignmentFailedTitle"), description: e?.message || "Could not assign." });
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Navigation>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1 flex-1">
            <Input
              value={programTitle}
              onChange={(e) => setProgramTitle(e.target.value)}
              className="text-3xl font-bold font-headline border-none p-0 h-auto focus-visible:ring-0 bg-transparent"
            />
            <p className="text-muted-foreground">
              {editProgramId ? t("editingExistingProgram") : t("draftingForAssignment")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleSaveToLibrary}
              disabled={isSavingLibrary || exercises.length === 0}
            >
              {isSavingLibrary ? <Loader2 className="h-4 w-4 animate-spin" /> : <Library className="h-4 w-4" />}
              {editProgramId ? t("saveChangesBtn") : t("saveToLibrary")}
            </Button>
          </div>
        </header>

        <div className="grid gap-6">
          {/* Exercises panel */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{t("routineSteps")}</CardTitle>
                  <CardDescription>{exercises.length} {t("exercisesTotal")}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" asChild title={t("browseLibrary")}>
                    <Link href="/exercises" target="_blank" aria-label={t("browseLibrary")}>
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleAddExercise}
                    aria-label={t("addRow")}
                    title={t("addRow")}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {exercises.map((ex, i) => (
                  <div key={i} className="p-4 border rounded-lg relative group bg-card/50 space-y-3">
                    {/* Remove button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemoveExercise(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>

                    {/* Exercise number + name */}
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground min-w-[24px]">
                        <GripVertical className="h-4 w-4 opacity-40" />
                        {i + 1}.
                      </span>
                      <div className="flex-1">
                        <Select
                          value={exerciseNames.includes(ex.name) ? ex.name : ex.name ? "__custom__" : ""}
                          onValueChange={(val) => {
                            if (val !== "__custom__") handleUpdateExercise(i, "name", val);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("selectExercise")}>
                              {ex.name || t("selectExercise")}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {ex.name && !exerciseNames.includes(ex.name) && (
                              <SelectItem value="__custom__">{ex.name}</SelectItem>
                            )}
                            {exerciseNames.map((name) => (
                              <SelectItem key={name} value={name}>{name}</SelectItem>
                            ))}
                            {exerciseNames.length === 0 && (
                              <SelectItem value="none" disabled>{t("noExercisesAddSome")}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Coach notes */}
                    <div className="space-y-1.5 pl-9">
                      <Label className="text-xs text-muted-foreground">{t("coachNotes")}</Label>
                      <Textarea
                        value={ex.notes}
                        placeholder={t("coachNotesPlaceholder")}
                        className="h-20 resize-none text-sm"
                        onChange={(e) => handleUpdateExercise(i, "notes", e.target.value)}
                      />
                    </div>
                  </div>
                ))}

                {exercises.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <p>{t("noExercisesAddSome") || "Adiciona exercícios ao programa."}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Navigation>
  );
}

export default function WorkoutBuilderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <WorkoutBuilderContent />
    </Suspense>
  );
}
