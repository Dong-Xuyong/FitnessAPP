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
import { Plus, Dumbbell, Clock, ArrowRight, Loader2, Zap, Trash2, CalendarRange, Send } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking, addDocumentNonBlocking } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import {
  trainingProgramsRef,
  totalExercisesInProgram,
  initializeDefaultPrograms,
} from "@/lib/firestore/training-programs";
import type { DayOfWeek, TrainingProgramDocument, WeeklyProgramItem } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

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

type ProgramCycleSetting = {
  dayOfWeek: DayOfWeek;
  weightIncreaseKg: string;
  repIncrease: string;
};

const DAYS_OF_WEEK: DayOfWeek[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

function formatDayOfWeek(day: DayOfWeek): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

function startOfMondayWeek(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const day = normalized.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  normalized.setDate(normalized.getDate() + diff);
  return normalized;
}

function getScheduledDate(startDate: string, weekNumber: number, dayOfWeek: DayOfWeek): string {
  const weekStart = startOfMondayWeek(new Date(startDate));
  const target = new Date(weekStart);
  const dayIndex = DAYS_OF_WEEK.indexOf(dayOfWeek);
  target.setDate(weekStart.getDate() + (weekNumber - 1) * 7 + dayIndex);
  return target.toISOString();
}

function increaseReps(reps: string, repIncrease: number): string {
  if (!repIncrease) return reps;
  const trimmed = reps.trim();
  const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    const low = Number(rangeMatch[1]) + repIncrease;
    const high = Number(rangeMatch[2]) + repIncrease;
    return `${low}-${high}`;
  }

  const singleMatch = trimmed.match(/^\d+$/);
  if (singleMatch) {
    return String(Number(trimmed) + repIncrease);
  }

  return reps;
}

function flattenProgramExercises(program: TrainingProgramListItem, weightIncreaseKg: number, repIncrease: number) {
  return (program.sessions || []).flatMap((session) =>
    (session.exercises || []).map((exercise) => ({
      exerciseName: exercise.exerciseName,
      sets: exercise.setDetails?.length || exercise.sets,
      reps: increaseReps(exercise.setDetails?.[0]?.reps || exercise.reps, repIncrease),
      restTimeSeconds: exercise.setDetails?.[0]?.restTimeSeconds ?? exercise.restTimeSeconds,
      ...(exercise.setDetails?.[0]?.targetWeightKg != null || exercise.targetWeightKg != null
        ? {
            targetWeightKg:
              (exercise.setDetails?.[0]?.targetWeightKg ?? exercise.targetWeightKg ?? 0) + weightIncreaseKg,
          }
        : {}),
      ...(exercise.setDetails?.length
        ? {
            setDetails: exercise.setDetails.map((set) => ({
              ...set,
              reps: increaseReps(set.reps, repIncrease),
              ...(set.targetWeightKg != null
                ? { targetWeightKg: set.targetWeightKg + weightIncreaseKg }
                : {}),
            })),
          }
        : {}),
      ...(session.name && program.sessions.length > 1
        ? { notes: `${session.name}: ${exercise.notes || ""}`.trim() }
        : exercise.notes
          ? { notes: exercise.notes }
          : {}),
    }))
  );
}

export default function WorkoutsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const [isInitializing, setIsInitializing] = useState(false);
  const [isSavingWeekly, setIsSavingWeekly] = useState(false);
  const [isAssigningWeekly, setIsAssigningWeekly] = useState(false);
  const [weeklyProgramName, setWeeklyProgramName] = useState("");
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [cycleWeeks, setCycleWeeks] = useState("4");
  const [programCycleSettings, setProgramCycleSettings] = useState<Record<string, ProgramCycleSetting>>({});
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

  const getProgramCycleSetting = (programId: string): ProgramCycleSetting => {
    return programCycleSettings[programId] || {
      dayOfWeek: "monday",
      weightIncreaseKg: "0",
      repIncrease: "0",
    };
  };

  const weeklyPreview = useMemo<WeeklyProgramItem[]>(() => {
    if (selectedProgramsForWeekly.length === 0) return [];

    return Array.from({ length: desiredWeeks }, (_, weekIndex) =>
      selectedProgramsForWeekly.map((sourceProgram) => {
        const cycleSetting = getProgramCycleSetting(sourceProgram.id);
        const baseWeightIncrease = Number(cycleSetting.weightIncreaseKg);
        const baseRepIncrease = Number(cycleSetting.repIncrease);
        return {
          week: weekIndex + 1,
          trainingProgramId: sourceProgram.id,
          trainingProgramName: sourceProgram.name,
          dayOfWeek: cycleSetting.dayOfWeek,
          weightIncreaseKg: Number.isFinite(baseWeightIncrease)
            ? baseWeightIncrease * (weekIndex + 1)
            : 0,
          repIncrease: Number.isFinite(baseRepIncrease)
            ? Math.max(0, Math.round(baseRepIncrease * (weekIndex + 1)))
            : 0,
        };
      })
    ).flat();
  }, [desiredWeeks, selectedProgramsForWeekly, programCycleSettings]);

  const toggleProgramInWeeklySelection = (programId: string, checked: boolean) => {
    setSelectedProgramIds((prev) => {
      if (checked) {
        if (prev.includes(programId)) return prev;
        setProgramCycleSettings((current) => ({
          ...current,
          [programId]: current[programId] || {
            dayOfWeek: "monday",
            weightIncreaseKg: "0",
            repIncrease: "0",
          },
        }));
        return [...prev, programId];
      }
      setProgramCycleSettings((current) => {
        const next = { ...current };
        delete next[programId];
        return next;
      });
      return prev.filter((id) => id !== programId);
    });
  };

  const handleCreateWeeklyProgram = async () => {
    if (!db || !user) return;
    if (selectedProgramsForWeekly.length === 0) {
      toast({
        variant: "destructive",
        title: "Select programs",
        description: "Select at least 1 training program to build a weekly cycle.",
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
        description: `Program-based day, kg, and rep settings across ${desiredWeeks} weeks.`,
        category: "Weekly cycle",
        level: "all",
        durationWeeks: desiredWeeks,
        sessions: [],
        programType: "weekly",
        sourceProgramIds: selectedProgramsForWeekly.map((program) => program.id),
        weeklyPlan: weeklyPreview,
        createdAt: now,
        updatedAt: now,
      });

      toast({
        title: "Weekly program created",
        description: `${name} is now available in Weekly Programs.`,
      });

      setWeeklyProgramName("");
      setSelectedProgramIds([]);
      setCycleWeeks("4");
      setProgramCycleSettings({});
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Create failed",
        description: error?.message || "Could not create the weekly program.",
      });
    } finally {
      setIsSavingWeekly(false);
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
        title: "Assignment details required",
        description: "Select a student and when the weekly cycle should start.",
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

    const weeklyPlan = selectedWeeklyProgram.weeklyPlan || [];
    const cycleWeekCount = selectedWeeklyProgram.durationWeeks || (weeklyPlan.length ? Math.max(...weeklyPlan.map((w) => w.week)) : 0);
    if (weeklyPlan.length === 0) {
      toast({
        variant: "destructive",
        title: "Nothing to assign",
        description: "This weekly program has no cycle weeks.",
      });
      return;
    }

    setIsAssigningWeekly(true);
    try {
      const workoutPlansRef = collection(db, "personalTrainers", user.uid, "students", studentAuthUid, "workoutPlans");

      for (const week of weeklyPlan) {
        const sourceProgram = basePrograms.find((program) => program.id === week.trainingProgramId);
        if (!sourceProgram) {
          throw new Error(`Source program for week ${week.week} was not found.`);
        }

        await addDocumentNonBlocking(workoutPlansRef, {
          title: `${selectedWeeklyProgram.name} - ${sourceProgram.name}`,
          studentId: studentAuthUid,
          personalTrainerId: user.uid,
          createdAt: new Date().toISOString(),
          assignedAt: getScheduledDate(assignmentStartDate, week.week, week.dayOfWeek),
          scheduledDayOfWeek: week.dayOfWeek,
          scheduledStartDate: assignmentStartDate,
          weekNumber: week.week,
          totalWeeks: cycleWeekCount,
          weeklyProgramId: selectedWeeklyProgram.id,
          weeklyProgramName: selectedWeeklyProgram.name,
          sourceTrainingProgramId: sourceProgram.id,
          sourceTrainingProgramName: sourceProgram.name,
          weightIncreaseKg: week.weightIncreaseKg,
            repIncrease: week.repIncrease,
            exercises: flattenProgramExercises(sourceProgram, week.weightIncreaseKg, week.repIncrease),
        });
      }

      toast({
        title: "Weekly program assigned",
        description: `${selectedWeeklyProgram.name} has been scheduled starting ${new Date(assignmentStartDate).toLocaleDateString()}.`,
      });

      setIsAssignDialogOpen(false);
      setSelectedWeeklyProgram(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Assignment failed",
        description: error?.message || "Could not assign the weekly program.",
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
            <h2 className="text-2xl font-bold font-headline">Training Programs</h2>
            <p className="text-muted-foreground">Manage and assign workouts to your students.</p>
          </div>
          <Button className="gap-2" asChild>
            <Link href="/workouts/builder">
              <Plus className="h-4 w-4" />
              Create Program
            </Link>
          </Button>
        </div>

        {!isLoading && basePrograms.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarRange className="h-5 w-5 text-primary" />
                Weekly Programs
              </CardTitle>
              <CardDescription>
                Build a weekly cycle with per-program workout day, kg increase, rep increase, defined cycle length, and student assignment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Weekly program name</Label>
                  <Input
                    value={weeklyProgramName}
                    onChange={(event) => setWeeklyProgramName(event.target.value)}
                    placeholder="Example: 6-Week Strength Cycle"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Number of weeks</Label>
                  <Input
                    type="number"
                    min="1"
                    value={cycleWeeks}
                    onChange={(event) => setCycleWeeks(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Program rotation</Label>
                  <p className="text-sm text-muted-foreground pt-2">
                    Selected programs repeat in order until all chosen weeks are filled. Each selected program keeps its own day and kg increase.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Select programs to rotate through the cycle</p>
                <div className="grid md:grid-cols-2 gap-3">
                  {basePrograms.map((program) => (
                    <label
                      key={`weekly-source-${program.id}`}
                      className="flex items-center gap-3 rounded-md border p-3 cursor-pointer"
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

              {selectedProgramsForWeekly.length > 0 && (
                <div className="space-y-3 rounded-lg border p-4 bg-background">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Program settings</p>
                    <Badge variant="outline">Shared across repeated weeks</Badge>
                  </div>
                  <div className="space-y-3">
                    {selectedProgramsForWeekly.map((program) => {
                      const setting = getProgramCycleSetting(program.id);
                      return (
                        <div key={`program-setting-${program.id}`} className="grid md:grid-cols-[1fr_180px_140px_120px] gap-3 items-end rounded-md border p-3">
                          <div>
                            <p className="text-sm font-medium">{program.name}</p>
                            <p className="text-xs text-muted-foreground">These values apply every time this program appears in the cycle.</p>
                          </div>
                          <div className="space-y-2">
                            <Label>Day of workout</Label>
                            <Select
                              value={setting.dayOfWeek}
                              onValueChange={(value) =>
                                setProgramCycleSettings((current) => ({
                                  ...current,
                                  [program.id]: {
                                    ...getProgramCycleSetting(program.id),
                                    dayOfWeek: value as DayOfWeek,
                                  },
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Choose day" />
                              </SelectTrigger>
                              <SelectContent>
                                {DAYS_OF_WEEK.map((day) => (
                                  <SelectItem key={`${program.id}-${day}`} value={day}>
                                    {formatDayOfWeek(day)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>kg increase</Label>
                            <Input
                              type="number"
                              step="0.5"
                              value={setting.weightIncreaseKg}
                              onChange={(event) =>
                                setProgramCycleSettings((current) => ({
                                  ...current,
                                  [program.id]: {
                                    ...getProgramCycleSetting(program.id),
                                    weightIncreaseKg: event.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>rep increase</Label>
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              value={setting.repIncrease}
                              onChange={(event) =>
                                setProgramCycleSettings((current) => ({
                                  ...current,
                                  [program.id]: {
                                    ...getProgramCycleSetting(program.id),
                                    repIncrease: event.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="text-sm text-muted-foreground">
                {selectedProgramIds.length} selected
              </div>

              <Button
                className="gap-2"
                onClick={handleCreateWeeklyProgram}
                disabled={isSavingWeekly || weeklyPreview.length === 0}
              >
                {isSavingWeekly ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarRange className="h-4 w-4" />}
                Create Weekly Program
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
              <CardTitle>No programs yet</CardTitle>
              <CardDescription>
                Build a routine in the program builder, or load default programs to get started.
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex flex-wrap gap-3">
              <Button asChild className="gap-2">
                <Link href="/workouts/builder">
                  <Plus className="h-4 w-4" />
                  Create Program
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
                Load Default Programs
              </Button>
            </CardFooter>
          </Card>
        )}

        {!isLoading && weeklyPrograms.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Saved Weekly Programs</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {weeklyPrograms.map((program) => {
                const plan = program.weeklyPlan || [];
                const weeks = plan.length || program.durationWeeks || 0;

                return (
                  <Card key={program.id} className="flex flex-col border-primary/20">
                    <CardHeader>
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline" className="text-primary border-primary/40">
                          Weekly cycle
                        </Badge>
                        <Badge>{weeks} weeks</Badge>
                      </div>
                      <CardTitle className="text-xl">{program.name}</CardTitle>
                      {program.description && (
                        <CardDescription className="mt-1 line-clamp-2">{program.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="flex-1 space-y-2">
                      {Array.from(
                        new Map(plan.map((week) => [week.trainingProgramId, week])).values()
                      ).slice(0, 4).map((programWeek) => (
                        <div key={`${program.id}-program-${programWeek.trainingProgramId}`} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{programWeek.trainingProgramName}</span>
                          <span className="font-medium text-primary">
                            {formatDayOfWeek(programWeek.dayOfWeek)} • +{programWeek.weightIncreaseKg} kg • +{programWeek.repIncrease} reps
                          </span>
                        </div>
                      ))}
                      {Array.from(new Set(plan.map((week) => week.trainingProgramId))).size > 4 && (
                        <p className="text-xs text-muted-foreground">
                          +{Array.from(new Set(plan.map((week) => week.trainingProgramId))).size - 4} more programs
                        </p>
                      )}
                    </CardContent>
                    <CardFooter className="pt-0 flex gap-2 justify-end">
                      <Button className="gap-2" variant="secondary" onClick={() => openAssignDialog(program)}>
                        <Send className="h-4 w-4" /> Assign to student
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => {
                          if (!db || !user) return;
                          if (!confirm(`Delete weekly program "${program.name}"?`)) return;
                          const ref = doc(db, "personalTrainers", user.uid, "personalTrainingPrograms", program.id);
                          deleteDocumentNonBlocking(ref);
                          toast({ title: "Deleted", description: `"${program.name}" has been removed.` });
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
                program.level === "all" || !program.level ? "All levels" : program.level;

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
                          <Dumbbell className="h-4 w-4" /> Exercises
                        </span>
                        <span className="font-medium">{exerciseCount}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Clock className="h-4 w-4" /> Sessions
                        </span>
                        <span className="font-medium">{program.sessions?.length ?? 0}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-0 flex gap-2">
                    <Button className="flex-1 gap-2" variant="secondary" asChild>
                      <Link href={`/workouts/builder?edit=${program.id}`}>
                        Edit in builder <ArrowRight className="h-4 w-4" />
                      </Link>
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
                        toast({ title: "Deleted", description: `"${program.name}" has been removed.` });
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
              <DialogTitle>Assign Weekly Program</DialogTitle>
              <DialogDescription>
                Select a student and when this weekly cycle should start.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Student</Label>
                <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a student" />
                  </SelectTrigger>
                  <SelectContent>
                    {students?.filter((s: any) => !s.blocked).map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {[student.firstName, student.lastName].filter(Boolean).join(" ") || student.name || student.email || "Unnamed"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={assignmentStartDate}
                  onChange={(event) => setAssignmentStartDate(event.target.value)}
                />
              </div>

              {selectedWeeklyProgram?.weeklyPlan?.length ? (
                <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Cycle length</span>
                    <Badge variant="outline">{selectedWeeklyProgram.weeklyPlan.length} weeks</Badge>
                  </div>
                  {Array.from(
                    new Map(
                      selectedWeeklyProgram.weeklyPlan.map((week) => [week.trainingProgramId, week])
                    ).values()
                  ).map((programWeek) => (
                    <div key={`assign-preview-program-${programWeek.trainingProgramId}`} className="flex items-center justify-between text-sm">
                      <span>{programWeek.trainingProgramName}</span>
                      <span className="text-muted-foreground">
                        +{programWeek.weightIncreaseKg} kg • +{programWeek.repIncrease} reps
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)} disabled={isAssigningWeekly}>
                Cancel
              </Button>
              <Button onClick={handleAssignWeeklyProgram} disabled={isAssigningWeekly || !selectedStudentId || !assignmentStartDate}>
                {isAssigningWeekly ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Assign Weekly Program
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Navigation>
  );
}