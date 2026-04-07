
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
import { Plus, Trash2, Send, Loader2, Library, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore, useCollection, useDoc, useMemoFirebase, addDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase";
import { collection, doc, addDoc, updateDoc } from "firebase/firestore";
import {
  buildTrainingProgramSessionsFromBuilder,
  trainerTrainingProgramsCollection,
} from "@/lib/firestore/training-programs";
import type { TrainingProgramDocument } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

type BuilderSetDetail = {
  reps: string;
  weight: string;
  rest: string;
};

type BuilderExercise = {
  name: string;
  sets: number;
  reps: string;
  rest: number;
  weight: string;
  notes: string;
  setDetails: BuilderSetDetail[];
};

function makeSetDetail(template?: Partial<BuilderSetDetail>): BuilderSetDetail {
  return {
    reps: template?.reps ?? "10-12",
    weight: template?.weight ?? "",
    rest: template?.rest ?? "60",
  };
}

function makeExercise(): BuilderExercise {
  return {
    name: "",
    sets: 3,
    reps: "10-12",
    rest: 60,
    weight: "",
    notes: "",
    setDetails: [makeSetDetail(), makeSetDetail(), makeSetDetail()],
  };
}

function resizeSetDetails(
  source: BuilderSetDetail[] | undefined,
  count: number,
  fallback: BuilderSetDetail
): BuilderSetDetail[] {
  const safeCount = Math.max(1, count);
  const current = source?.length ? [...source] : [];
  if (current.length >= safeCount) return current.slice(0, safeCount);
  const missing = Array.from({ length: safeCount - current.length }, () => makeSetDetail(fallback));
  return [...current, ...missing];
}

function WorkoutBuilderContent() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const editProgramId = searchParams.get("edit");
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isSavingLibrary, setIsSavingLibrary] = useState(false);
  const [loaded, setLoaded] = useState(false);
  
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

  const { data: editProgram, isLoading: isLoadingProgram } = useDoc<TrainingProgramDocument>(editProgramRef);

  useEffect(() => {
    if (editProgram && !loaded) {
      setProgramTitle(editProgram.name || "Untitled program");
      const allExercises = (editProgram.sessions || []).flatMap(session =>
        (session.exercises || []).map(ex => ({
          name: ex.exerciseName,
          sets: ex.sets,
          reps: ex.reps,
          rest: ex.restTimeSeconds,
          weight: ex.targetWeightKg != null ? String(ex.targetWeightKg) : "",
          notes: ex.notes || "",
          setDetails: ex.setDetails?.length
            ? ex.setDetails.map((set) => ({
                reps: String(set.reps || ex.reps || "10-12"),
                weight: set.targetWeightKg != null ? String(set.targetWeightKg) : "",
                rest: String(set.restTimeSeconds ?? ex.restTimeSeconds ?? 60),
              }))
            : resizeSetDetails(
                [],
                Number(ex.sets) || 1,
                makeSetDetail({
                  reps: String(ex.reps || "10-12"),
                  weight: ex.targetWeightKg != null ? String(ex.targetWeightKg) : "",
                  rest: String(ex.restTimeSeconds ?? 60),
                })
              ),
        }))
      );
      if (allExercises.length > 0) {
        setExercises(allExercises);
      }
      setLoaded(true);
    }
  }, [editProgram, loaded]);

  const [aiContext, setAiContext] = useState({
    goals: "Build muscle",
    age: 25,
    weight: 75,
    level: "intermediate"
  });

  const studentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user]);

  const { data: students } = useCollection(studentsQuery);

  // Also fetch global students to resolve Auth UIDs
  const globalStudentsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, "students");
  }, [db]);
  const { data: globalStudents } = useCollection(globalStudentsQuery);

  // Fetch exercises from the library
  const exercisesQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "exercises");
  }, [db, user]);

  const { data: libraryExercises } = useCollection(exercisesQuery);

  const exerciseNames = (libraryExercises || []).map((ex: any) => ex.name as string).sort();

  const handleAddExercise = () => {
    setExercises([...exercises, makeExercise()]);
  };

  const handleRemoveExercise = (index: number) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const handleUpdateExercise = (index: number, field: string, value: any) => {
    setExercises((prev) =>
      prev.map((exercise, i) => {
        if (i !== index) return exercise;

        if (field === "sets") {
          const nextSetCount = Math.max(1, Number(value) || 1);
          const fallback = makeSetDetail({
            reps: exercise.setDetails[0]?.reps || exercise.reps || "10-12",
            weight: exercise.setDetails[0]?.weight ?? exercise.weight,
            rest: exercise.setDetails[0]?.rest || String(exercise.rest || 60),
          });
          const nextSetDetails = resizeSetDetails(exercise.setDetails, nextSetCount, fallback);
          return {
            ...exercise,
            sets: nextSetCount,
            reps: nextSetDetails[0]?.reps || exercise.reps,
            rest: Number(nextSetDetails[0]?.rest || exercise.rest),
            weight: nextSetDetails[0]?.weight ?? exercise.weight,
            setDetails: nextSetDetails,
          };
        }

        return { ...exercise, [field]: value };
      })
    );
  };

  const handleUpdateSetDetail = (
    exerciseIndex: number,
    setIndex: number,
    field: keyof BuilderSetDetail,
    value: string
  ) => {
    setExercises((prev) =>
      prev.map((exercise, i) => {
        if (i !== exerciseIndex) return exercise;
        const nextSetDetails = [...exercise.setDetails];
        const current = nextSetDetails[setIndex] || makeSetDetail();
        nextSetDetails[setIndex] = { ...current, [field]: value };

        const firstSet = nextSetDetails[0] || makeSetDetail();
        return {
          ...exercise,
          reps: firstSet.reps,
          rest: Number(firstSet.rest || exercise.rest),
          weight: firstSet.weight,
          setDetails: nextSetDetails,
        };
      })
    );
  };

  const validateExercisesForSave = (): boolean => {
    if (exercises.some((ex) => !ex.name)) {
      toast({
        variant: "destructive",
        title: t("incompleteProgram"),
        description: t("ensureAllExercisesNamed"),
      });
      return false;
    }
    return true;
  };

  const handleSaveToLibrary = async () => {
    if (!db || !user) return;
    if (!validateExercisesForSave()) return;

    setIsSavingLibrary(true);
    const now = new Date().toISOString();

    try {
      if (editProgramId && editProgramRef) {
        // Update existing program
        await updateDocumentNonBlocking(editProgramRef, {
          name: programTitle.trim() || "Untitled program",
          sessions: buildTrainingProgramSessionsFromBuilder(programTitle, exercises),
          updatedAt: now,
        });
        toast({
          title: t("programUpdated"),
          description: `"${programTitle.trim() || "Untitled program"}" has been saved.`,
        });
      } else {
        // Create new program
        const programsCol = trainerTrainingProgramsCollection(db, user.uid);
        await addDocumentNonBlocking(programsCol, {
          trainerId: user.uid,
          name: programTitle.trim() || "Untitled program",
          sessions: buildTrainingProgramSessionsFromBuilder(programTitle, exercises),
          createdAt: now,
          updatedAt: now,
        });
        toast({
          title: t("savedToLibrary"),
          description: `"${programTitle.trim() || "Untitled program"}" is available under Training Programs.`,
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("saveFailed"),
        description: error?.message || "Could not save the program.",
      });
    } finally {
      setIsSavingLibrary(false);
    }
  };

  const handleAssignToStudent = async () => {
    if (!db || !user || !selectedStudentId) {
      toast({
        variant: "destructive",
        title: t("selectionRequired"),
        description: t("selectStudentToAssign"),
      });
      return;
    }

    if (!validateExercisesForSave()) return;

    setIsAssigning(true);
    // Resolve the student's Auth UID. Try: roster doc's userId field, then match by email in global students, then fall back to roster doc ID
    const selectedStudent = students?.find(s => s.id === selectedStudentId);
    let studentAuthUid = selectedStudent?.userId as string || "";
    if (!studentAuthUid && selectedStudent?.email) {
      const globalMatch = globalStudents?.find((g: any) => g.email === selectedStudent.email);
      if (globalMatch) studentAuthUid = globalMatch.id;
    }
    if (!studentAuthUid) studentAuthUid = selectedStudentId;

    // Link the student's global profile so they can find their data even if the
    // roster doc ID differs from their Auth UID.
    try {
      await updateDoc(doc(db, "students", studentAuthUid), {
        trainerId: user.uid,
        ...(studentAuthUid !== selectedStudentId ? { rosterDocId: selectedStudentId } : {}),
      });
    } catch {
      // Global doc may not exist yet (student hasn't signed up) — not a blocking error.
    }

    const workoutRef = collection(db, "personalTrainers", user.uid, "students", studentAuthUid, "workoutPlans");
    console.log("Assigning to path:", workoutRef.path, "studentAuthUid:", studentAuthUid, "rosterDocId:", selectedStudentId);
    
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
      exercises: exercises.map(ex => ({
        exerciseName: ex.name,
        sets: ex.setDetails.length,
        reps: ex.setDetails[0]?.reps || ex.reps,
        restTimeSeconds: Number(ex.setDetails[0]?.rest || ex.rest),
        targetWeightKg:
          ex.setDetails[0]?.weight === "" || ex.setDetails[0]?.weight == null
            ? undefined
            : Number(ex.setDetails[0].weight),
        setDetails: ex.setDetails.map((set, index) => ({
          setNumber: index + 1,
          reps: set.reps,
          targetWeightKg: set.weight === "" ? undefined : Number(set.weight),
          restTimeSeconds: Number(set.rest),
        })),
        notes: ex.notes
      }))
    };

    try {
      const docRef = await addDoc(workoutRef, payload);
      toast({
        title: t("programAssigned"),
        description: `Successfully assigned "${programTitle}" to the selected student.`,
      });
    } catch (e: any) {
      console.error("Assignment error:", e);
      toast({
        variant: "destructive",
        title: t("assignmentFailedTitle"),
        description: e?.message || "Could not save the program. Please check your permissions.",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Navigation>
      <div className="max-w-4xl mx-auto space-y-8">
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
              {isSavingLibrary ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Library className="h-4 w-4" />
              )}
              {editProgramId ? t("saveChangesBtn") : t("saveToLibrary")}
            </Button>
            <Button 
              className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleAssignToStudent}
              disabled={isAssigning || !selectedStudentId}
            >
              {isAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t("assignProgram")}
            </Button>
          </div>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>{t("assignment")}</CardTitle>
              <CardDescription>{t("whoIsThisFor")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("selectStudent")}</Label>
                <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectFromRoster")} />
                  </SelectTrigger>
                  <SelectContent>
                    {students?.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}</SelectItem>
                    ))}
                    {(!students || students.length === 0) && (
                      <SelectItem value="none" disabled>{t("noStudentsFound")}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("workoutDate")}</Label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("workoutTime")}</Label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <div className="md:col-span-2 space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{t("routineSteps")}</CardTitle>
                  <CardDescription>{exercises.length} {t("exercisesTotal")}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" asChild className="gap-2">
                    <Link href="/exercises" target="_blank">
                      <ExternalLink className="h-4 w-4" />
                      {t("browseLibrary")}
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleAddExercise} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {t("addRow")}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {exercises.map((ex, i) => (
                  <div key={i} className="p-4 border rounded-lg relative group bg-card/50">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="absolute top-2 right-2 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => handleRemoveExercise(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="grid gap-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>{t("exerciseName")}</Label>
                          <Select
                            value={exerciseNames.includes(ex.name) ? ex.name : "__custom__"}
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
                        <div className="space-y-2">
                          <Label>{t("sets")}</Label>
                          <Input
                            type="number"
                            min="1"
                            value={ex.sets}
                            onChange={(e) => handleUpdateExercise(i, "sets", e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-muted-foreground uppercase px-1">
                          <span>{t("set")}</span>
                          <span>{t("reps")}</span>
                          <span>{t("kg")}</span>
                          <span>{t("seconds")}</span>
                        </div>
                        <div className="space-y-2">
                          {ex.setDetails.map((set, setIndex) => (
                            <div key={`${i}-set-${setIndex}`} className="grid grid-cols-4 gap-2 items-center">
                              <p className="text-sm font-medium px-1">#{setIndex + 1}</p>
                              <Input
                                value={set.reps}
                                onChange={(e) => handleUpdateSetDetail(i, setIndex, "reps", e.target.value)}
                              />
                              <Input
                                type="number"
                                value={set.weight}
                                placeholder={t("optional")}
                                onChange={(e) => handleUpdateSetDetail(i, setIndex, "weight", e.target.value)}
                              />
                              <Input
                                type="number"
                                value={set.rest}
                                onChange={(e) => handleUpdateSetDetail(i, setIndex, "rest", e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>{t("coachNotes")}</Label>
                        <Textarea 
                          value={ex.notes} 
                          placeholder={t("coachNotesPlaceholder")} 
                          className="h-16"
                          onChange={(e) => handleUpdateExercise(i, "notes", e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
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
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <WorkoutBuilderContent />
    </Suspense>
  );
}
