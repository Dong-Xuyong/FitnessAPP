"use client";

import { useEffect, useMemo, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { doc, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import type { TrainingProgramDocument } from "@/lib/types";
import { writeStudentSequencePlans, sequenceStepLabel } from "@/lib/workout-plan-sequence";
import { ChevronDown, ChevronUp, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_SEQUENCE_REPEAT_CYCLES = 5;

export type AssignableProgramRow = TrainingProgramDocument & { id: string };

type Props = {
  db: Firestore;
  trainerId: string;
  /** Firestore path id under `personalTrainers/{tid}/students/{id}/workoutPlans` */
  studentStorageId: string;
  assignablePrograms: AssignableProgramRow[];
  disabled?: boolean;
  /** Called before Firestore write (e.g. link global `students/{auth}` to roster) */
  onBeforeWrite?: () => Promise<void>;
  variant?: "embedded" | "dialog" | "defaultConfigure";
  /** When set, shows Cancel and calls it on click */
  onCancel?: () => void;
  onSuccess?: () => void;
  /** `defaultConfigure` only: save the trainer's single default sequence template */
  onSaveDefault?: (payload: { orderedIds: string[]; cycles: number }) => void | Promise<void>;
  isSavingDefault?: boolean;
  /** Controlled draft: when set with change handlers, order/cycles sync with parent (e.g. save template + assign). */
  draftOrderedProgramIds?: string[];
  onDraftOrderedProgramIdsChange?: (ids: string[]) => void;
  draftRepeatCycles?: number;
  onDraftRepeatCyclesChange?: (n: number) => void;
  /** Save as `personalTrainingPrograms` sequence template (no student). Embedded mode shows extra button. */
  onSaveTemplate?: (payload: { orderedIds: string[]; cycles: number }) => void | Promise<void>;
  isSavingTemplate?: boolean;
};

export function AssignStudentSequenceForm({
  db,
  trainerId,
  studentStorageId,
  assignablePrograms,
  disabled = false,
  onBeforeWrite,
  variant = "embedded",
  onCancel,
  onSuccess,
  draftOrderedProgramIds,
  onDraftOrderedProgramIdsChange,
  draftRepeatCycles,
  onDraftRepeatCyclesChange,
  onSaveTemplate,
  isSavingTemplate = false,
  onSaveDefault,
  isSavingDefault = false,
}: Props) {
  const isDefaultConfigure = variant === "defaultConfigure";
  const { toast } = useToast();
  const { t } = useI18n();
  const [internalOrderedIds, setInternalOrderedIds] = useState<string[]>([]);
  const [internalRepeatCycles, setInternalRepeatCycles] = useState(1);
  const [addPick, setAddPick] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  const isDraftControlled =
    Array.isArray(draftOrderedProgramIds) && typeof onDraftOrderedProgramIdsChange === "function";
  const isCyclesControlled =
    typeof draftRepeatCycles === "number" && typeof onDraftRepeatCyclesChange === "function";

  const orderedProgramIds = isDraftControlled ? draftOrderedProgramIds! : internalOrderedIds;
  const setOrderedProgramIds = (next: string[]) => {
    if (isDraftControlled) onDraftOrderedProgramIdsChange!(next);
    else setInternalOrderedIds(next);
  };

  const repeatCycles = isCyclesControlled ? draftRepeatCycles! : internalRepeatCycles;
  const setRepeatCycles = (n: number) => {
    if (isCyclesControlled) onDraftRepeatCyclesChange!(n);
    else setInternalRepeatCycles(n);
  };

  const repeatCyclesClamped = Math.min(
    MAX_SEQUENCE_REPEAT_CYCLES,
    Math.max(1, Math.floor(Number(repeatCycles)) || 1)
  );

  useEffect(() => {
    if (repeatCycles > MAX_SEQUENCE_REPEAT_CYCLES) {
      setRepeatCycles(MAX_SEQUENCE_REPEAT_CYCLES);
    }
  }, [repeatCycles]);

  const repeatCycleOptions = useMemo(
    () => Array.from({ length: MAX_SEQUENCE_REPEAT_CYCLES }, (_, i) => i + 1),
    []
  );

  const addProgram = () => {
    if (!addPick) return;
    setOrderedProgramIds([...orderedProgramIds, addPick]);
    setAddPick("");
  };

  const moveProgram = (index: number, delta: -1 | 1) => {
    const prev = orderedProgramIds;
    const next = [...prev];
    const j = index + delta;
    if (j < 0 || j >= next.length) return;
    const tmp = next[index]!;
    next[index] = next[j]!;
    next[j] = tmp;
    setOrderedProgramIds(next);
  };

  const removeProgram = (index: number) => {
    setOrderedProgramIds(orderedProgramIds.filter((_, i) => i !== index));
  };

  const resetForm = () => {
    setOrderedProgramIds([]);
    setAddPick("");
    setRepeatCycles(1);
  };

  const handleSaveTemplateClick = async () => {
    if (!onSaveTemplate) return;
    if (orderedProgramIds.length < 2) {
      toast({ variant: "destructive", title: t("sequenceAssignNeedTwo") });
      return;
    }
    const cycles = Math.min(MAX_SEQUENCE_REPEAT_CYCLES, Math.max(1, Math.floor(Number(repeatCycles)) || 1));
    try {
      await onSaveTemplate({ orderedIds: orderedProgramIds, cycles });
    } catch {
      /* toast from parent */
    }
  };

  const handleSaveDefaultClick = async () => {
    if (!onSaveDefault) return;
    if (orderedProgramIds.length < 2) {
      toast({ variant: "destructive", title: t("sequenceAssignNeedTwo") });
      return;
    }
    const cycles = Math.min(MAX_SEQUENCE_REPEAT_CYCLES, Math.max(1, Math.floor(Number(repeatCycles)) || 1));
    try {
      await onSaveDefault({ orderedIds: orderedProgramIds, cycles });
    } catch {
      /* toast from parent */
    }
  };

  const handleSubmit = async () => {
    if (!studentStorageId.trim()) {
      toast({ variant: "destructive", title: t("selectAStudent") });
      return;
    }
    if (orderedProgramIds.length < 2) {
      toast({ variant: "destructive", title: t("sequenceAssignNeedTwo") });
      return;
    }
    const cycles = Math.min(MAX_SEQUENCE_REPEAT_CYCLES, Math.max(1, Math.floor(Number(repeatCycles)) || 1));
    const programsInOrder = orderedProgramIds
      .map((pid) => assignablePrograms.find((p) => p.id === pid))
      .filter(Boolean) as TrainingProgramDocument[];
    if (programsInOrder.length !== orderedProgramIds.length) {
      toast({
        variant: "destructive",
        title: t("sequenceAssignFailed"),
        description: t("sequenceAssignFailed"),
      });
      return;
    }
    setIsAssigning(true);
    try {
      if (onBeforeWrite) await onBeforeWrite();
      const { appended } = await writeStudentSequencePlans(
        db,
        trainerId,
        studentStorageId.trim(),
        programsInOrder,
        cycles
      );
      toast({
        title: appended ? t("sequenceAssignedAppendedToast") : t("sequenceAssignedToast"),
      });
      resetForm();
      onSuccess?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("sequenceAssignFailed");
      toast({ variant: "destructive", title: t("sequenceAssignFailed"), description: msg });
    } finally {
      setIsAssigning(false);
    }
  };

  const controlsDisabled =
    disabled ||
    isAssigning ||
    isSavingDefault ||
    (!isDefaultConfigure && !studentStorageId.trim());

  const body = (
    <div
      className={cn(
        "space-y-4",
        variant === "embedded" || variant === "defaultConfigure" ? "py-1" : "py-2"
      )}
    >
      <div className="space-y-2">
        <Label htmlFor="assign-seq-repeat">{t("sequenceRepeatCycles")}</Label>
        <Select
          value={String(repeatCyclesClamped)}
          onValueChange={(v) => {
            const n = parseInt(v, 10);
            setRepeatCycles(Number.isFinite(n) ? Math.min(MAX_SEQUENCE_REPEAT_CYCLES, Math.max(1, n)) : 1);
          }}
          disabled={disabled || isAssigning || isSavingTemplate || isSavingDefault}
        >
          <SelectTrigger id="assign-seq-repeat" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {repeatCycleOptions.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{t("sequenceProgramsInOrder")}</Label>
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {orderedProgramIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("sequenceAddProgram")}</p>
          ) : null}
          {orderedProgramIds.map((pid, idx) => {
            const p = assignablePrograms.find((x) => x.id === pid);
            return (
              <div
                key={`${pid}-${idx}`}
                className="flex items-center gap-2 border rounded-md p-2 bg-background"
              >
                <span className="text-xs font-semibold tabular-nums w-6 shrink-0">
                  {sequenceStepLabel(idx)}
                </span>
                <span className="text-sm truncate flex-1 min-w-0">{p?.name || pid}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => moveProgram(idx, -1)}
                  disabled={idx === 0 || disabled || isAssigning || isSavingTemplate || isSavingDefault}
                  aria-label="Move up"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => moveProgram(idx, 1)}
                  disabled={
                    idx === orderedProgramIds.length - 1 ||
                    disabled ||
                    isAssigning ||
                    isSavingTemplate ||
                    isSavingDefault
                  }
                  aria-label="Move down"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive"
                  onClick={() => removeProgram(idx)}
                  disabled={disabled || isAssigning || isSavingTemplate || isSavingDefault}
                  aria-label="Remove"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 flex-wrap">
          {assignablePrograms.length === 0 ? (
            <p className="text-sm text-muted-foreground w-full">{t("sequenceNoLibraryPrograms")}</p>
          ) : (
            <>
              <Select
                value={addPick || undefined}
                onValueChange={setAddPick}
                disabled={disabled || isAssigning || isSavingTemplate || isSavingDefault}
              >
                <SelectTrigger className="flex-1 min-w-[12rem]">
                  <SelectValue placeholder={t("sequenceAddProgram")} />
                </SelectTrigger>
                <SelectContent>
                  {assignablePrograms.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="secondary"
                onClick={addProgram}
                disabled={!addPick || disabled || isAssigning || isSavingTemplate || isSavingDefault}
                className="gap-1"
              >
                <Plus className="h-4 w-4" />
                {t("sequenceAddProgram")}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  const saveTemplateDisabled =
    !onSaveTemplate ||
    isSavingTemplate ||
    disabled ||
    orderedProgramIds.length < 2;

  const saveDefaultDisabled =
    !onSaveDefault ||
    isSavingDefault ||
    disabled ||
    orderedProgramIds.length < 2;

  const footer = isDefaultConfigure ? (
    <div className="flex justify-end pt-2">
      <Button
        type="button"
        onClick={() => void handleSaveDefaultClick()}
        disabled={saveDefaultDisabled}
        className="gap-2"
      >
        {isSavingDefault ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {t("saveDefaultStudentSequence")}
      </Button>
    </div>
  ) : (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end",
        variant === "dialog" ? "" : "pt-2"
      )}
    >
      {onSaveTemplate ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => void handleSaveTemplateClick()}
          disabled={saveTemplateDisabled}
          className="gap-2"
        >
          {isSavingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t("sequenceSaveTemplate")}
        </Button>
      ) : null}
      {onCancel ? (
        <Button type="button" variant="outline" onClick={onCancel} disabled={isAssigning}>
          {t("cancel")}
        </Button>
      ) : null}
      <Button
        type="button"
        onClick={handleSubmit}
        disabled={controlsDisabled || orderedProgramIds.length < 2}
        className="gap-2"
      >
        {isAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {t("sequenceAssignSubmit")}
      </Button>
    </div>
  );

  if (variant === "dialog") {
    return (
      <>
        {body}
        <DialogFooter className="gap-2 sm:gap-0">{footer}</DialogFooter>
      </>
    );
  }

  return (
    <>
      {body}
      {footer}
    </>
  );
}

/** Resolve roster row to workoutPlans subcollection path id (matches weekly assign logic). */
export function resolveWorkoutPlansStorageStudentId(
  rosterStudentId: string,
  students: Array<{ id: string; userId?: string; email?: string }> | null | undefined,
  globalStudents: Array<{ id: string; email?: string }> | null | undefined
): string {
  if (!rosterStudentId) return "";
  const selectedStudent = students?.find((s) => s.id === rosterStudentId);
  let authUid = selectedStudent?.userId || "";
  if (!authUid && selectedStudent?.email) {
    const globalMatch = globalStudents?.find((g) => g.email === selectedStudent.email);
    if (globalMatch) authUid = globalMatch.id;
  }
  if (!authUid) authUid = rosterStudentId;
  return authUid;
}

/** Link global student to trainer / roster (same as weekly assign). */
export async function linkStudentProfileForTrainerAssignments(
  db: Firestore,
  trainerId: string,
  rosterStudentId: string,
  students: Array<{ id: string; userId?: string; email?: string }> | null | undefined,
  globalStudents: Array<{ id: string; email?: string }> | null | undefined
): Promise<void> {
  const selectedStudent = students?.find((s) => s.id === rosterStudentId);
  let studentAuthUid = selectedStudent?.userId || "";
  if (!studentAuthUid && selectedStudent?.email) {
    const globalMatch = globalStudents?.find((g) => g.email === selectedStudent.email);
    if (globalMatch) studentAuthUid = globalMatch.id;
  }
  if (!studentAuthUid) studentAuthUid = rosterStudentId;
  try {
    const globalStudentRef = doc(db, "students", studentAuthUid);
    await updateDoc(globalStudentRef, {
      trainerId,
      ...(studentAuthUid !== rosterStudentId ? { rosterDocId: rosterStudentId } : {}),
    });
  } catch {
    // Global doc may not exist yet
  }
}
