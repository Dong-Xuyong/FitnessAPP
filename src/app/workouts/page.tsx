"use client";

import { useCallback, useMemo, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Dumbbell, Clock, ArrowRight, Loader2, Zap, Trash2, CalendarRange, ListOrdered, Copy } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking, addDocumentNonBlocking } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import {
  AssignStudentSequenceForm,
  linkStudentProfileForTrainerAssignments,
  resolveWorkoutPlansStorageStudentId,
} from "@/components/AssignStudentSequenceForm";
import {
  trainingProgramsRef,
  totalExercisesInProgram,
  initializeDefaultPrograms,
  ensureDefaultWeeklyStrengthCycle,
} from "@/lib/firestore/training-programs";
import {
  DEFAULT_WEEKLY_STRENGTH_CYCLES,
  DEFAULT_WEEKLY_STRENGTH_LEGACY_TITLE,
} from "@/lib/default-programs";
import type { TrainingProgramDocument } from "@/lib/types";
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

export default function WorkoutsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const { t } = useI18n();
  const [isInitializing, setIsInitializing] = useState(false);
  const [isAddingWeeklyDefault, setIsAddingWeeklyDefault] = useState(false);
  const [sequenceRosterStudentId, setSequenceRosterStudentId] = useState("");
  const [sequenceDraftOrderedIds, setSequenceDraftOrderedIds] = useState<string[]>([]);
  const [sequenceDraftRepeatCycles, setSequenceDraftRepeatCycles] = useState(1);
  const [sequenceTemplateName, setSequenceTemplateName] = useState("");
  const [isSavingSequenceTemplate, setIsSavingSequenceTemplate] = useState(false);

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
    () =>
      (programs || []).filter(
        (program) => program.programType !== "weekly" && program.programType !== "sequence"
      ),
    [programs]
  );

  const sequenceTemplates = useMemo(
    () => (programs || []).filter((p) => p.programType === "sequence"),
    [programs]
  );

  /** Legacy 6-source cycle or all three PU/Dip/Squat weekly metas — disables duplicate seed. */
  const hasCanonicalDefaultWeekly = useMemo(() => {
    const list = programs || [];
    if (list.some((p) => p.name === DEFAULT_WEEKLY_STRENGTH_LEGACY_TITLE)) return true;
    const titles = new Set(list.map((p) => p.name).filter(Boolean));
    return DEFAULT_WEEKLY_STRENGTH_CYCLES.every((c) => titles.has(c.title));
  }, [programs]);

  const sequenceStorageStudentId = useMemo(
    () => resolveWorkoutPlansStorageStudentId(sequenceRosterStudentId, students, globalStudents),
    [sequenceRosterStudentId, students, globalStudents]
  );

  const handleSaveSequenceTemplate = async (payload: { orderedIds: string[]; cycles: number }) => {
    if (!db || !user) return;
    if (payload.orderedIds.length < 2) return;
    const names = payload.orderedIds
      .map((id) => basePrograms.find((p) => p.id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length !== payload.orderedIds.length) {
      toast({ variant: "destructive", title: t("sequenceTemplateSaveFailed") });
      return;
    }
    const now = new Date().toISOString();
    const title =
      sequenceTemplateName.trim() ||
      `${t("sequenceTemplateDefaultName")} (${names.slice(0, 3).join(" → ")}${names.length > 3 ? "…" : ""})`;
    setIsSavingSequenceTemplate(true);
    try {
      await addDocumentNonBlocking(trainingProgramsRef(db, user.uid), {
        trainerId: user.uid,
        name: title,
        description: t("sequenceTemplateSavedDesc"),
        category: "Sequence",
        level: "all",
        sessions: [],
        programType: "sequence",
        sourceProgramIds: payload.orderedIds,
        sourceProgramNames: names,
        sequenceRepeatCycles: payload.cycles,
        createdAt: now,
        updatedAt: now,
      });
      toast({ title: t("sequenceTemplateSavedToast") });
      setSequenceTemplateName("");
      setSequenceDraftOrderedIds([]);
      setSequenceDraftRepeatCycles(1);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("sequenceTemplateSaveFailed");
      toast({ variant: "destructive", title: t("sequenceTemplateSaveFailed"), description: msg });
    } finally {
      setIsSavingSequenceTemplate(false);
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
        ...(program.sourceProgramIds?.length ? { sourceProgramIds: program.sourceProgramIds } : {}),
        ...(program.sourceProgramNames?.length ? { sourceProgramNames: program.sourceProgramNames } : {}),
        ...(program.sequenceRepeatCycles != null ? { sequenceRepeatCycles: program.sequenceRepeatCycles } : {}),
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

  const handleEnsureDefaultWeeklyStrengthCycle = useCallback(async () => {
    if (!db || !user) return;
    setIsAddingWeeklyDefault(true);
    try {
      const result = await ensureDefaultWeeklyStrengthCycle(db, user.uid);
      if (result.success) {
        if (result.createdCount > 0) {
          toast({
            title: t("weeklyStrengthCycleAdded"),
            description:
              result.addedTitles.length > 0
                ? `${t("weeklyStrengthCycleAddedPrefix")} ${result.addedTitles.join(", ")}.`
                : t("weeklyStrengthCycleAddedDesc"),
          });
        } else {
          toast({
            title: t("weeklyStrengthCycleAlreadyExists"),
            description: t("weeklyStrengthCycleAlreadyExistsDesc"),
          });
        }
      } else if ("missingNames" in result) {
        toast({
          variant: "destructive",
          title: t("selectProgramsRequired"),
          description: `${t("weeklyCycleMissingIntro")} ${result.missingNames.join(", ")}`,
        });
      } else {
        toast({
          variant: "destructive",
          title: t("weeklyStrengthCycleFailed"),
          description: result.message,
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: t("weeklyStrengthCycleFailed"),
        description: t("couldNotCreateWeekly"),
      });
    } finally {
      setIsAddingWeeklyDefault(false);
    }
  }, [db, user, toast, t]);

  return (
    <Navigation>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h2 className="text-2xl font-bold font-headline">{t("trainingPrograms")}</h2>
            <p className="text-muted-foreground">{t("manageAndAssign")}</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={
                isLoading ||
                isAddingWeeklyDefault ||
                hasCanonicalDefaultWeekly ||
                !db ||
                !user
              }
              title={
                hasCanonicalDefaultWeekly ? t("weeklyStrengthCycleAlreadyExistsDesc") : undefined
              }
              onClick={handleEnsureDefaultWeeklyStrengthCycle}
            >
              {isAddingWeeklyDefault ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CalendarRange className="h-4 w-4" />
              )}
              {t("addDefaultWeeklyStrengthCycle")}
            </Button>
            <Button className="gap-2" asChild>
              <Link href="/workouts/builder">
                <Plus className="h-4 w-4" />
                {t("createProgram")}
              </Link>
            </Button>
          </div>
        </div>

        {!isLoading && basePrograms.length > 0 && db && user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListOrdered className="h-5 w-5 text-primary" />
                {t("sequenceProgramsCardTitle")}
              </CardTitle>
              <CardDescription>{t("sequenceProgramsCardDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sequence-template-name">{t("sequenceTemplateNameLabel")}</Label>
                <Input
                  id="sequence-template-name"
                  value={sequenceTemplateName}
                  onChange={(e) => setSequenceTemplateName(e.target.value)}
                  placeholder={t("sequenceTemplateDefaultName")}
                  disabled={isSavingSequenceTemplate}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("sequenceAssignStudentPlaceholder")}</Label>
                <Select
                  value={sequenceRosterStudentId || "_none_"}
                  onValueChange={(v) => setSequenceRosterStudentId(v === "_none_" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectAStudent")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none_">—</SelectItem>
                    {students?.filter((s: any) => !s.blocked).map((student) => (
                      <SelectItem key={student.id} value={student.id}>
                        {[student.firstName, student.lastName].filter(Boolean).join(" ") ||
                          student.name ||
                          student.email ||
                          "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">{t("sequenceSelectStudentHint")}</p>
              </div>
              <AssignStudentSequenceForm
                db={db}
                trainerId={user.uid}
                studentStorageId={sequenceStorageStudentId}
                assignablePrograms={basePrograms}
                variant="embedded"
                draftOrderedProgramIds={sequenceDraftOrderedIds}
                onDraftOrderedProgramIdsChange={setSequenceDraftOrderedIds}
                draftRepeatCycles={sequenceDraftRepeatCycles}
                onDraftRepeatCyclesChange={setSequenceDraftRepeatCycles}
                onSaveTemplate={handleSaveSequenceTemplate}
                isSavingTemplate={isSavingSequenceTemplate}
                onBeforeWrite={() =>
                  linkStudentProfileForTrainerAssignments(
                    db,
                    user.uid,
                    sequenceRosterStudentId,
                    students,
                    globalStudents
                  )
                }
              />
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

        {!isLoading && sequenceTemplates.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold font-headline">{t("sequenceTemplatesSectionTitle")}</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sequenceTemplates.map((program) => (
                <Card key={program.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start gap-2">
                      <Badge variant="outline" className="text-primary border-primary/20 shrink-0">
                        {t("sequenceProgramsCardTitle")}
                      </Badge>
                      <Badge variant="secondary" className="tabular-nums shrink-0">
                        {program.sequenceRepeatCycles ?? 1}× {t("sequenceTemplateCycles")}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg leading-snug">{program.name}</CardTitle>
                    {program.sourceProgramNames && program.sourceProgramNames.length > 0 ? (
                      <CardDescription className="line-clamp-3">
                        {program.sourceProgramNames.join(" → ")}
                      </CardDescription>
                    ) : null}
                  </CardHeader>
                  <CardFooter className="pt-0 flex gap-2 mt-auto">
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
                      className="text-destructive hover:bg-destructive/10 shrink-0 ml-auto"
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
              ))}
            </div>
          </div>
        )}

      </div>
    </Navigation>
  );
}