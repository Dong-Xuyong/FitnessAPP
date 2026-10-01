"use client";

import { useEffect, useMemo, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Dumbbell, Clock, ArrowRight, Loader2, Zap, Trash2, ListOrdered, Bookmark } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useUser, useFirestore, useCollection, useMemoFirebase, deleteDocumentNonBlocking } from "@/firebase";
import { doc } from "firebase/firestore";
import { AssignStudentSequenceForm } from "@/components/AssignStudentSequenceForm";
import {
  getDefaultStudentSequenceProgram,
  reconcileSequenceProgramIds,
  upsertDefaultStudentSequenceProgram,
} from "@/lib/firestore/default-student-sequence";
import {
  createSequenceTemplate,
  deleteSequenceTemplate,
  listSequenceTemplatesFromPrograms,
  type SequenceTemplateSummary,
} from "@/lib/firestore/sequence-templates";
import {
  trainingProgramsRef,
  totalExercisesInProgram,
  initializeDefaultPrograms,
} from "@/lib/firestore/training-programs";
import type { TrainingProgramDocument } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { CoachLibraryExcelActions } from "@/components/CoachLibraryExcelActions";

type TrainingProgramListItem = TrainingProgramDocument & {
  id: string;
};

export default function WorkoutsPage() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const { t } = useI18n();
  const [isInitializing, setIsInitializing] = useState(false);
  const [sequenceDraftOrderedIds, setSequenceDraftOrderedIds] = useState<string[]>([]);
  const [sequenceDraftProgramFallbackNames, setSequenceDraftProgramFallbackNames] = useState<
    string[]
  >([]);
  const [sequenceDraftRepeatCycles, setSequenceDraftRepeatCycles] = useState(1);
  const [isSavingDefaultSequence, setIsSavingDefaultSequence] = useState(false);
  const [isSavingSequenceTemplate, setIsSavingSequenceTemplate] = useState(false);
  const [sequenceTemplateName, setSequenceTemplateName] = useState("");
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

  const savedSequenceTemplates = useMemo(
    () => listSequenceTemplatesFromPrograms(programs || []),
    [programs]
  );

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
        const reconciledIds = reconcileSequenceProgramIds(
          def.sourceProgramIds,
          def.sourceProgramNames,
          basePrograms
        );
        setSequenceDraftOrderedIds(reconciledIds);
        setSequenceDraftProgramFallbackNames(def.sourceProgramNames);
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
  }, [db, user, defaultSequenceLoaded, isLoading, basePrograms]);

  const resolveSequenceProgramNames = (orderedIds: string[]) =>
    orderedIds
      .map((id) => basePrograms.find((p) => p.id === id)?.name)
      .filter(Boolean) as string[];

  const handleSaveSequenceTemplate = async (payload: { orderedIds: string[]; cycles: number }) => {
    if (!db || !user) return;
    const names = resolveSequenceProgramNames(payload.orderedIds);
    if (names.length !== payload.orderedIds.length) {
      toast({ variant: "destructive", title: t("sequenceTemplateSaveFailed") });
      return;
    }
    setIsSavingSequenceTemplate(true);
    try {
      await createSequenceTemplate(db, user.uid, {
        name: sequenceTemplateName,
        orderedIds: payload.orderedIds,
        cycles: payload.cycles,
        sourceProgramNames: names,
        defaultName: t("sequenceTemplateDefaultName"),
      });
      setSequenceTemplateName("");
      toast({
        title: t("sequenceTemplateSavedToast"),
        description: t("sequenceTemplateSavedDesc"),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("sequenceTemplateSaveFailed");
      toast({ variant: "destructive", title: t("sequenceTemplateSaveFailed"), description: msg });
    } finally {
      setIsSavingSequenceTemplate(false);
    }
  };

  const handleDeleteSequenceTemplate = async (template: SequenceTemplateSummary) => {
    if (!db || !user) return;
    if (!confirm(t("sequenceTemplateDeleteConfirm"))) return;
    try {
      await deleteSequenceTemplate(db, user.uid, template.id);
      toast({ title: t("sequenceTemplateDeletedToast") });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("sequenceTemplateSaveFailed");
      toast({ variant: "destructive", title: t("sequenceTemplateSaveFailed"), description: msg });
    }
  };

  const handleSaveDefaultSequence = async (payload: { orderedIds: string[]; cycles: number }) => {
    if (!db || !user) return;
    const names = resolveSequenceProgramNames(payload.orderedIds);
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
      setSequenceDraftProgramFallbackNames(names);
      toast({ title: t("defaultStudentSequenceSavedToast") });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("sequenceTemplateSaveFailed");
      toast({ variant: "destructive", title: t("sequenceTemplateSaveFailed"), description: msg });
    } finally {
      setIsSavingDefaultSequence(false);
    }
  };

  return (
    <Navigation>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h2 className="text-2xl font-bold font-headline">{t("trainingPrograms")}</h2>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <CoachLibraryExcelActions />
            <Button size="icon" asChild title={t("createProgram")}>
              <Link href="/workouts/builder" aria-label={t("createProgram")}>
                <Plus className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>

        {!isLoading && basePrograms.length > 0 && db && user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListOrdered className="h-5 w-5 text-primary" aria-hidden />
                {t("defaultStudentSequenceCardTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="sequence-template-name">{t("sequenceTemplateNameLabel")}</Label>
                <Input
                  id="sequence-template-name"
                  value={sequenceTemplateName}
                  onChange={(e) => setSequenceTemplateName(e.target.value)}
                  placeholder={t("sequenceTemplateDefaultName")}
                  disabled={isSavingSequenceTemplate || isSavingDefaultSequence}
                />
              </div>
              <AssignStudentSequenceForm
                db={db}
                trainerId={user.uid}
                studentStorageId="_default_configure_"
                assignablePrograms={basePrograms}
                variant="defaultConfigure"
                draftOrderedProgramIds={sequenceDraftOrderedIds}
                onDraftOrderedProgramIdsChange={setSequenceDraftOrderedIds}
                draftProgramFallbackNames={sequenceDraftProgramFallbackNames}
                draftRepeatCycles={sequenceDraftRepeatCycles}
                onDraftRepeatCyclesChange={setSequenceDraftRepeatCycles}
                onSaveTemplate={handleSaveSequenceTemplate}
                isSavingTemplate={isSavingSequenceTemplate}
                onSaveDefault={handleSaveDefaultSequence}
                isSavingDefault={isSavingDefaultSequence}
              />
              {savedSequenceTemplates.length > 0 ? (
                <div className="space-y-3 border-t pt-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Bookmark className="h-4 w-4 text-primary" />
                    {t("sequenceTemplatesSectionTitle")}
                  </h3>
                  <ul className="space-y-2">
                    {savedSequenceTemplates.map((template) => {
                      const labels =
                        template.sourceProgramNames.length > 0
                          ? template.sourceProgramNames
                          : template.sourceProgramIds.map((id, idx) =>
                              basePrograms.find((p) => p.id === id)?.name ??
                              template.sourceProgramNames[idx] ??
                              id
                            );
                      return (
                        <li
                          key={template.id}
                          className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border rounded-md p-3 bg-muted/30"
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">{template.name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {labels.join(" → ")} · {template.sequenceRepeatCycles}×{" "}
                              {t("sequenceTemplateCycles")}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => void handleDeleteSequenceTemplate(template)}
                            >
                              {t("sequenceTemplateDelete")}
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
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
              <Button asChild size="icon" title={t("createProgram")}>
                <Link href="/workouts/builder" aria-label={t("createProgram")}>
                  <Plus className="h-4 w-4" aria-hidden />
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
