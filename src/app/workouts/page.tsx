"use client";

import { useMemo, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Dumbbell, Clock, ArrowRight, Loader2, Zap, Trash2, CalendarRange, Send, Copy } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking, addDocumentNonBlocking } from "@/firebase";
import { collection, doc, updateDoc } from "firebase/firestore";
import {
  trainingProgramsRef,
  totalExercisesInProgram,
  initializeDefaultPrograms,
} from "@/lib/firestore/training-programs";
import type { TrainingProgramDocument, WeeklyProgramItem } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";

type TrainingProgramListItem = TrainingProgramDocument & {
  id: string;
};

type RosterStudent = {
  id: string;
  userId?: string;
  email?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
};

/** Returns YYYY-MM-DD for the Monday of the week containing `dateStr`. */
function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
}

/** Returns YYYY-MM-DD for the Monday that is `offsetWeeks` weeks after `weekStartStr`. */
function weekStartOffset(weekStartStr: string, offsetWeeks: number): string {
  const d = new Date(weekStartStr + "T12:00:00");
  d.setDate(d.getDate() + offsetWeeks * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Extract exercises from a source program as a flat list (no weight/rep adjustments — instructions live in notes). */
function extractExercises(program: TrainingProgramListItem) {
  return (program.sessions || []).flatMap((session) =>
    (session.exercises || []).map((exercise) => ({
      exerciseName: exercise.exerciseName,
      sets: exercise.sets ?? 1,
      reps: exercise.reps ?? "",
      restTimeSeconds: exercise.restTimeSeconds ?? 0,
      notes: [
        session.name && program.sessions.length > 1 ? session.name : "",
        exercise.notes || "",
      ].filter(Boolean).join(" — ") || undefined,
    }))
  );
}

export default function WorkoutsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const { t } = useI18n();
  const [isInitializing, setIsInitializing] = useState(false);
  const [isSavingWeekly, setIsSavingWeekly] = useState(false);
  const [isAssigningWeekly, setIsAssigningWeekly] = useState(false);
  const [weeklyProgramName, setWeeklyProgramName] = useState("");
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [cycleWeeks, setCycleWeeks] = useState("4");
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedWeeklyProgram, setSelectedWeeklyProgram] = useState<TrainingProgramListItem | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [assignmentStartDate, setAssignmentStartDate] = useState("");

  const programsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return trainingProgramsRef(db, user.uid);
  }, [db, user]);

  const studentsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user]);

  const globalStudentsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return collection(db, "students");
  }, [db]);

  const { data: rawPrograms, isLoading } = useCollection<TrainingProgramListItem>(programsQuery);
  const { data: students } = useCollection<RosterStudent>(studentsQuery);
  const { data: globalStudents } = useCollection(globalStudentsQuery);

  const programs = useMemo(() => {
    if (!rawPrograms) return null;
    return [...rawPrograms].sort(
      (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")
    );
  }, [rawPrograms]);

  const basePrograms = useMemo(
    () => (programs || []).filter((program) => program.programType !== "weekly"),
    [programs]
  );

  const weeklyPrograms = useMemo(
    () => (programs || []).filter((program) => program.programType === "weekly"),
    [programs]
  );

  const selectedProgramsForWeekly = useMemo(
    () => selectedProgramIds
      .map((id) => basePrograms.find((program) => program.id === id))
      .filter((program): program is TrainingProgramListItem => Boolean(program)),
    [selectedProgramIds, basePrograms]
  );

  const desiredWeeks = Math.max(1, Number(cycleWeeks) || 1);

  // All selected programs are assigned to EVERY week (not one per week).
  // weeklyPreview is the list of programs that each week will contain.
  const weeklyPreview = selectedProgramsForWeekly;

  const toggleProgramInWeeklySelection = (programId: string, checked: boolean) => {
    setSelectedProgramIds((prev) =>
      checked
        ? prev.includes(programId) ? prev : [...prev, programId]
        : prev.filter((id) => id !== programId)
    );
  };

  const handleCreateWeeklyProgram = async () => {
    if (!db || !user) return;
    if (selectedProgramsForWeekly.length === 0) {
      toast({
        variant: "destructive",
        title: t("selectProgramsRequired"),
        description: t("selectAtLeast1Program"),
      });
      return;
    }

    const now = new Date().toISOString();
    const name = weeklyProgramName.trim() || `Weekly Cycle (${desiredWeeks} weeks)`;

    setIsSavingWeekly(true);
    try {
      await addDocumentNonBlocking(trainingProgramsRef(db, user.uid), {
        trainerId: user.uid,
        name,
        description: `${selectedProgramsForWeekly.map((p) => p.name).join(" + ")} — ${desiredWeeks} semana(s).`,
        category: "Weekly cycle",
        level: "all",
        durationWeeks: desiredWeeks,
        sessions: [],
        programType: "weekly",
        // All programs run together in the same week (not a rotation)
        sourceProgramIds: selectedProgramsForWeekly.map((p) => p.id),
        sourceProgramNames: selectedProgramsForWeekly.map((p) => p.name),
        createdAt: now,
        updatedAt: now,
      });

      toast({
        title: t("weeklyProgramCreated"),
        description: `${name} disponível nos Programas Semanais.`,
      });

      setWeeklyProgramName("");
      setSelectedProgramIds([]);
      setCycleWeeks("4");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("createFailed"),
        description: error?.message || t("couldNotCreateWeekly"),
      });
    } finally {
      setIsSavingWeekly(false);
    }
  };

  const handleDuplicateProgram = async (program: TrainingProgramListItem) => {
    if (!db || !user) return;
    try {
      const now = new Date().toISOString();
      await addDocumentNonBlocking(trainingProgramsRef(db, user.uid), {
        trainerId: user.uid,
        name: `Copy of ${program.name}`,
        description: program.description || "",
        category: program.category || "",
        level: program.level || "all",
        ...(program.durationWeeks != null ? { durationWeeks: program.durationWeeks } : {}),
        sessions: program.sessions || [],
        ...(program.programType != null ? { programType: program.programType } : {}),
        createdAt: now,
        updatedAt: now,
      });
      toast({
        title: t("programDuplicated"),
        description: t("programDuplicatedDesc"),
      });
    } catch {
      toast({
        variant: "destructive",
        title: t("error"),
        description: t("failedToDuplicate"),
      });
    }
  };

  const openAssignDialog = (program: TrainingProgramListItem) => {
    setSelectedWeeklyProgram(program);
    setSelectedStudentId("");
    setAssignmentStartDate("");
    setIsAssignDialogOpen(true);
  };

  const handleAssignWeeklyProgram = async () => {
    if (!db || !user || !selectedWeeklyProgram) return;
    if (!selectedStudentId || !assignmentStartDate) {
      toast({
        variant: "destructive",
        title: t("assignmentDetailsRequired"),
        description: t("selectStudentAndDate"),
      });
      return;
    }

    const selectedStudent = students?.find((student) => student.id === selectedStudentId);
    let studentAuthUid = selectedStudent?.userId || "";
    if (!studentAuthUid && selectedStudent?.email) {
      const globalMatch = globalStudents?.find((student: any) => student.email === selectedStudent.email);
      if (globalMatch) studentAuthUid = globalMatch.id;
    }
    if (!studentAuthUid) studentAuthUid = selectedStudentId;

    // Link the student's global profile so they can find their data even if the
    // roster doc ID differs from their Auth UID.
    try {
      const globalStudentRef = doc(db, "students", studentAuthUid);
      await updateDoc(globalStudentRef, {
        trainerId: user.uid,
        ...(studentAuthUid !== selectedStudentId ? { rosterDocId: selectedStudentId } : {}),
      });
    } catch {
      // Global doc may not exist yet (student hasn't signed up) — not a blocking error.
    }

    // Support both new format (sourceProgramIds) and old rotation format (weeklyPlan)
    const sourceProgramIds: string[] = selectedWeeklyProgram.sourceProgramIds || [];
    const cycleWeekCount: number = selectedWeeklyProgram.durationWeeks || 1;

    // Fall back to old weeklyPlan rotation if no sourceProgramIds stored
    const legacyPlan: WeeklyProgramItem[] = selectedWeeklyProgram.weeklyPlan || [];
    const useNewFormat = sourceProgramIds.length > 0;

    if (!useNewFormat && legacyPlan.length === 0) {
      toast({ variant: "destructive", title: t("nothingToAssign"), description: t("noCycleWeeks") });
      return;
    }

    setIsAssigningWeekly(true);
    try {
      const workoutPlansRef = collection(db, "personalTrainers", user.uid, "students", studentAuthUid, "workoutPlans");
      const startWeekStart = getWeekStart(assignmentStartDate);

      if (useNewFormat) {
        // New model: all programs go into the same week, repeated for cycleWeekCount weeks
        for (let w = 1; w <= cycleWeekCount; w++) {
          const weekStart = weekStartOffset(startWeekStart, w - 1);
          for (const progId of sourceProgramIds) {
            const sourceProgram = basePrograms.find((p) => p.id === progId);
            if (!sourceProgram) continue;
            await addDocumentNonBlocking(workoutPlansRef, {
              title: sourceProgram.name,
              studentId: studentAuthUid,
              personalTrainerId: user.uid,
              weekStart,
              weekNumber: w,
              totalWeeks: cycleWeekCount,
              weeklyProgramId: selectedWeeklyProgram.id,
              weeklyProgramName: selectedWeeklyProgram.name,
              sourceTrainingProgramId: sourceProgram.id,
              exercises: extractExercises(sourceProgram),
              createdAt: new Date().toISOString(),
            });
          }
        }
      } else {
        // Legacy rotation format
        for (const week of legacyPlan) {
          const sourceProgram = basePrograms.find((p) => p.id === week.trainingProgramId);
          if (!sourceProgram) continue;
          const weekStart = weekStartOffset(startWeekStart, week.week - 1);
          await addDocumentNonBlocking(workoutPlansRef, {
            title: `${sourceProgram.name} — Semana ${week.week}`,
            studentId: studentAuthUid,
            personalTrainerId: user.uid,
            weekStart,
            weekNumber: week.week,
            totalWeeks: cycleWeekCount,
            weeklyProgramId: selectedWeeklyProgram.id,
            weeklyProgramName: selectedWeeklyProgram.name,
            sourceTrainingProgramId: sourceProgram.id,
            exercises: extractExercises(sourceProgram),
            createdAt: new Date().toISOString(),
          });
        }
      }

      toast({
        title: t("weeklyProgramAssigned"),
        description: `${selectedWeeklyProgram.name} atribuído a partir de ${new Date(startWeekStart + "T12:00:00").toLocaleDateString()}.`,
      });

      setIsAssignDialogOpen(false);
      setSelectedWeeklyProgram(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("assignmentFailed"),
        description: error?.message || t("couldNotAssignWeekly"),
      });
    } finally {
      setIsAssigningWeekly(false);
    }
  };

  return (
    <Navigation>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold font-headline">{t("trainingPrograms")}</h2>
            <p className="text-muted-foreground">{t("manageAndAssign")}</p>
          </div>
          <Button className="gap-2" asChild>
            <Link href="/workouts/builder">
              <Plus className="h-4 w-4" />
              {t("createProgram")}
            </Link>
          </Button>
        </div>

        {!isLoading && basePrograms.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarRange className="h-5 w-5 text-primary" />
                {t("weeklyPrograms")}
              </CardTitle>
              <CardDescription>
                {t("weeklyProgramsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Name + cycle length */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("weeklyProgramName")}</Label>
                  <Input
                    value={weeklyProgramName}
                    onChange={(e) => setWeeklyProgramName(e.target.value)}
                    placeholder="Ex: Ciclo A/B/C · 6 semanas"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="leading-tight">
                    {t("numberOfWeeks")}
                    <span className="block text-xs text-muted-foreground font-normal">
                      (ajuste para repetir o ciclo)
                    </span>
                  </Label>
                  <Input
                    type="number" min="1" max="52"
                    value={cycleWeeks}
                    onChange={(e) => setCycleWeeks(e.target.value)}
                  />
                </div>
              </div>

              {/* Program selection */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Programas em rotação</p>
                <p className="text-xs text-muted-foreground">
                  Seleciona os programas na ordem desejada. Cada programa ocupa uma semana diferente.
                  O número de semanas ajusta-se automaticamente.
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {basePrograms.map((program) => (
                    <label
                      key={`weekly-source-${program.id}`}
                      className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                        selectedProgramIds.includes(program.id)
                          ? "border-primary/40 bg-primary/5"
                          : "hover:bg-muted/30"
                      }`}
                    >
                      <Checkbox
                        checked={selectedProgramIds.includes(program.id)}
                        onCheckedChange={(checked) => toggleProgramInWeeklySelection(program.id, checked === true)}
                      />
                      <span className="text-sm font-medium">{program.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Weekly schedule preview */}
              {weeklyPreview.length > 0 && (
                <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Conteúdo de cada semana
                  </p>
                  <div className="space-y-1.5">
                    {weeklyPreview.map((prog, idx) => (
                      <div key={prog.id}
                        className="flex items-center gap-2 text-sm rounded-md bg-background border px-3 py-2">
                        <span className="font-bold text-primary tabular-nums min-w-[24px]">
                          {idx + 1}.
                        </span>
                        <span className="truncate">{prog.name}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Estes {weeklyPreview.length} treino(s) repetem-se durante{" "}
                    <span className="font-semibold text-foreground">{desiredWeeks} semana(s)</span>.
                  </p>
                </div>
              )}

              <Button
                className="gap-2"
                onClick={handleCreateWeeklyProgram}
                disabled={isSavingWeekly || weeklyPreview.length === 0}
              >
                {isSavingWeekly ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarRange className="h-4 w-4" />}
                {t("createWeeklyProgram")}
              </Button>
            </CardContent>
          </Card>
        )}

        {isLoading && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="flex flex-col">
                <CardHeader>
                  <Skeleton className="h-5 w-24 mb-2" />
                  <Skeleton className="h-7 w-3/4" />
                  <Skeleton className="h-4 w-1/2 mt-2" />
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </CardContent>
                <CardFooter className="pt-0">
                  <Skeleton className="h-10 w-full" />
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && programs && programs.length === 0 && (
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle>{t("noProgramsYet")}</CardTitle>
              <CardDescription>
                {t("noProgramsYetDesc")}
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex flex-wrap gap-3">
              <Button asChild className="gap-2">
                <Link href="/workouts/builder">
                  <Plus className="h-4 w-4" />
                  {t("createProgram")}
                </Link>
              </Button>
              <Button
                variant="secondary"
                className="gap-2"
                disabled={isInitializing}
                onClick={async () => {
                  if (!db || !user) return;
                  setIsInitializing(true);
                  try {
                    const result = await initializeDefaultPrograms(db, user.uid);
                    toast({
                      title: result.success ? "Success" : "Error",
                      description: result.message,
                      variant: result.success ? "default" : "destructive",
                    });
                  } catch {
                    toast({ variant: "destructive", title: "Error", description: "Failed to load programs." });
                  } finally {
                    setIsInitializing(false);
                  }
                }}
              >
                {isInitializing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {t("loadDefaultPrograms")}
              </Button>
            </CardFooter>
          </Card>
        )}

        {!isLoading && weeklyPrograms.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">{t("savedWeeklyPrograms")}</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {weeklyPrograms.map((program) => {
                const weeks = program.durationWeeks || (program.weeklyPlan?.length) || 0;
                // New format: sourceProgramNames; legacy: derive from weeklyPlan
                const programNames: string[] = program.sourceProgramNames ||
                  [...new Map((program.weeklyPlan || []).map((i: any) => [i.trainingProgramId, i.trainingProgramName])).values()];

                return (
                  <Card key={program.id} className="flex flex-col border-primary/20">
                    <CardHeader>
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline" className="text-primary border-primary/40">
                          {t("weeklyCycle")}
                        </Badge>
                        <Badge>{weeks} sem.</Badge>
                      </div>
                      <CardTitle className="text-xl">{program.name}</CardTitle>
                      {program.description && (
                        <CardDescription className="mt-1 line-clamp-2">{program.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="flex-1 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Treinos por semana
                      </p>
                      {programNames.map((name: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <span className="font-bold text-primary tabular-nums min-w-[20px]">{idx + 1}.</span>
                          <span className="text-muted-foreground truncate">{name}</span>
                        </div>
                      ))}
                    </CardContent>
                    <CardFooter className="pt-0 flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => {
                          if (!db || !user) return;
                          if (!confirm(`Delete weekly program "${program.name}"?`)) return;
                          const ref = doc(db, "personalTrainers", user.uid, "personalTrainingPrograms", program.id);
                          deleteDocumentNonBlocking(ref);
                          toast({ title: t("deleted"), description: `"${program.name}" ${t("hasBeenRemoved")}` });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {!isLoading && basePrograms.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {basePrograms.map((program) => {
              const exerciseCount = totalExercisesInProgram(program.sessions);
              const category = program.category ?? "Program library";
              const levelLabel =
                program.level === "all" || !program.level ? t("allLevels") : program.level;

              return (
                <Card key={program.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="outline" className="text-primary border-primary/20">
                        {category}
                      </Badge>
                      <Badge className="capitalize">{levelLabel}</Badge>
                    </div>
                    <CardTitle className="text-xl">{program.name}</CardTitle>
                    {program.description && (
                      <CardDescription className="mt-1 line-clamp-2">{program.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Dumbbell className="h-4 w-4" /> {t("exercisesCount")}
                        </span>
                        <span className="font-medium">{exerciseCount}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Clock className="h-4 w-4" /> {t("sessionsCount")}
                        </span>
                        <span className="font-medium">{program.sessions?.length ?? 0}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-0 flex gap-2">
                    <Button className="flex-1 gap-2" variant="secondary" asChild>
                      <Link href={`/workouts/builder?edit=${program.id}`}>
                        {t("editInBuilder")} <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("duplicateProgram")}
                      className="shrink-0"
                      onClick={() => handleDuplicateProgram(program)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => {
                        if (!db || !user) return;
                        if (!confirm(`Delete "${program.name}"?`)) return;
                        const ref = doc(db, "personalTrainers", user.uid, "personalTrainingPrograms", program.id);
                        deleteDocumentNonBlocking(ref);
                        toast({ title: t("deleted"), description: `"${program.name}" ${t("hasBeenRemoved")}` });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("assignWeeklyProgram")}</DialogTitle>
              <DialogDescription>
                {t("assignWeeklyProgramDesc")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("student")}</Label>
                <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectAStudent")} />
                  </SelectTrigger>
                  <SelectContent>
                    {students?.filter((s: any) => !s.blocked).map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {[student.firstName, student.lastName].filter(Boolean).join(" ") || student.name || student.email || "Sem nome"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Semana de início</Label>
                <p className="text-xs text-muted-foreground">
                  Seleciona qualquer dia — o ciclo começa na segunda-feira dessa semana.
                </p>
                <Input
                  type="date"
                  value={assignmentStartDate}
                  onChange={(e) => setAssignmentStartDate(e.target.value)}
                />
              </div>

              {selectedWeeklyProgram && (() => {
                const totalWks = selectedWeeklyProgram.durationWeeks || 1;
                const progNames: string[] = selectedWeeklyProgram.sourceProgramNames ||
                  [...new Map((selectedWeeklyProgram.weeklyPlan || []).map((i: any) => [i.trainingProgramId, i.trainingProgramName])).values()];
                const startWS = assignmentStartDate ? getWeekStart(assignmentStartDate) : null;
                return (
                <div className="rounded-lg border bg-muted/20 p-3 space-y-2 max-h-64 overflow-y-auto">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <span>Pré-visualização</span>
                    <Badge variant="outline">{totalWks} semanas · {progNames.length} treino(s)/sem.</Badge>
                  </div>
                  {Array.from({ length: totalWks }, (_, i) => {
                    const ws = startWS ? weekStartOffset(startWS, i) : null;
                    const wsLabel = ws
                      ? new Date(ws + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })
                      : null;
                    return (
                      <div key={i} className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-primary tabular-nums text-sm shrink-0">Sem. {i + 1}</span>
                          {wsLabel && <span className="text-xs text-muted-foreground">{wsLabel}</span>}
                        </div>
                        <div className="ml-4 space-y-0.5">
                          {progNames.map((name: string, pi: number) => (
                            <p key={pi} className="text-xs text-muted-foreground truncate">↳ {name}</p>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                );
              })()}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)} disabled={isAssigningWeekly}>
                {t("cancel")}
              </Button>
              <Button onClick={handleAssignWeeklyProgram} disabled={isAssigningWeekly || !selectedStudentId || !assignmentStartDate}>
                {isAssigningWeekly ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {t("assignWeeklyProgram")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Navigation>
  );
}