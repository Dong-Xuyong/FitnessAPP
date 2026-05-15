"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Dumbbell, Clock, ArrowRight, Loader2, Zap, Trash2, CalendarRange, ListOrdered } from "lucide-react";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking } from "@/firebase";
import { doc } from "firebase/firestore";
import { AssignStudentSequenceForm } from "@/components/AssignStudentSequenceForm";
import {
  getDefaultStudentSequenceProgram,
  upsertDefaultStudentSequenceProgram,
} from "@/lib/firestore/default-student-sequence";
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

export default function WorkoutsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const { t } = useI18n();
  const [isInitializing, setIsInitializing] = useState(false);
  const [isAddingWeeklyDefault, setIsAddingWeeklyDefault] = useState(false);
  const [sequenceDraftOrderedIds, setSequenceDraftOrderedIds] = useState<string[]>([]);
  const [sequenceDraftRepeatCycles, setSequenceDraftRepeatCycles] = useState(1);
  const [isSavingDefaultSequence, setIsSavingDefaultSequence] = useState(false);
  const [defaultSequenceLoaded, setDefaultSequenceLoaded] = useState(false);

  const programsQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return trainingProgramsRef(db, user.uid);
  }, [db, user]);

  const { data: rawPrograms, isLoading } = useCollection<TrainingProgramListItem>(programsQuery);

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

  /** Legacy 6-source cycle or all three PU/Dip/Squat weekly metas — disables duplicate seed. */
  const hasCanonicalDefaultWeekly = useMemo(() => {
    const list = programs || [];
    if (list.some((p) => p.name === DEFAULT_WEEKLY_STRENGTH_LEGACY_TITLE)) return true;
    const titles = new Set(list.map((p) => p.name).filter(Boolean));
    return DEFAULT_WEEKLY_STRENGTH_CYCLES.every((c) => titles.has(c.title));
  }, [programs]);

  useEffect(() => {
    if (!db || !user || defaultSequenceLoaded || isLoading) return;
    let cancelled = false;
    void (async () => {
      try {
        const def = await getDefaultStudentSequenceProgram(db, user.uid);
        if (cancelled || !def) {
          setDefaultSequenceLoaded(true);
          return;
        }
        setSequenceDraftOrderedIds(def.sourceProgramIds);
        setSequenceDraftRepeatCycles(def.sequenceRepeatCycles);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setDefaultSequenceLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, user, defaultSequenceLoaded, isLoading]);

  const handleSaveDefaultSequence = async (payload: { orderedIds: string[]; cycles: number }) => {
    if (!db || !user) return;
    const names = payload.orderedIds
      .map((id) => basePrograms.find((p) => p.id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length !== payload.orderedIds.length) {
      toast({ variant: "destructive", title: t("sequenceTemplateSaveFailed") });
      return;
    }
    setIsSavingDefaultSequence(true);
    try {
      await upsertDefaultStudentSequenceProgram(db, user.uid, {
        orderedIds: payload.orderedIds,
        cycles: payload.cycles,
        sourceProgramNames: names,
      });
      toast({ title: t("defaultStudentSequenceSavedToast") });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("sequenceTemplateSaveFailed");
      toast({ variant: "destructive", title: t("sequenceTemplateSaveFailed"), description: msg });
    } finally {
      setIsSavingDefaultSequence(false);
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
                {t("defaultStudentSequenceCardTitle")}
              </CardTitle>
              <CardDescription>{t("defaultStudentSequenceCardDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <AssignStudentSequenceForm
                db={db}
                trainerId={user.uid}
                studentStorageId="_default_configure_"
                assignablePrograms={basePrograms}
                variant="defaultConfigure"
                draftOrderedProgramIds={sequenceDraftOrderedIds}
                onDraftOrderedProgramIdsChange={setSequenceDraftOrderedIds}
                draftRepeatCycles={sequenceDraftRepeatCycles}
                onDraftRepeatCyclesChange={setSequenceDraftRepeatCycles}
                onSaveDefault={handleSaveDefaultSequence}
                isSavingDefault={isSavingDefaultSequence}
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
              <CardDescription>{t("noProgramsYetDesc")}</CardDescription>
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
      </div>
    </Navigation>
  );
}
