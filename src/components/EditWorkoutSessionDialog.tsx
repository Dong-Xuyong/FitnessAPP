"use client";

import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { deleteDoc, doc, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { TranslationKey } from "@/lib/i18n";
import type { EditSessionExerciseRow } from "@/lib/normalize-session-exercises-for-edit";
import { normalizeSessionExercisesForEdit } from "@/lib/normalize-session-exercises-for-edit";
import type { useToast } from "@/hooks/use-toast";
import { X, AlertTriangle, Trash2 } from "lucide-react";

/** Minimal session fields for the edit dialog (Firestore workout session doc). */
export type EditWorkoutSessionDialogSession = {
  id: string;
  workoutTitle?: string;
  exercises?: unknown;
};

type ToastFn = ReturnType<typeof useToast>["toast"];

type EditWorkoutSessionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  db: Firestore | null;
  trainerUid: string | undefined;
  storageStudentId: string;
  session: EditWorkoutSessionDialogSession | null;
  t: (key: TranslationKey) => string;
  toast: ToastFn;
  /** Called after successful save or delete so parents can refetch caches. */
  onMutated?: () => void;
};

export function EditWorkoutSessionDialog({
  open,
  onOpenChange,
  db,
  trainerUid,
  storageStudentId,
  session,
  t,
  toast,
  onMutated,
}: EditWorkoutSessionDialogProps) {
  const [rows, setRows] = useState<EditSessionExerciseRow[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !session) return;
    setRows(normalizeSessionExercisesForEdit(session.exercises));
  }, [open, session]);

  const handleSave = async () => {
    if (!db || !trainerUid || !session?.id) return;
    setIsSaving(true);
    try {
      const ref = doc(db, "personalTrainers", trainerUid, "students", storageStudentId, "workoutSessions", session.id);
      await updateDoc(ref, {
        exercises: rows.map((ex) => ({
          exerciseName: ex.name,
          sets: ex.sets,
        })),
      });
      toast({ title: t("sessionUpdated") });
      onOpenChange(false);
      onMutated?.();
    } catch {
      toast({ title: t("calendarRosterPlanDetailError"), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!db || !trainerUid || !session?.id) return;
    setIsSaving(true);
    try {
      await deleteDoc(
        doc(db, "personalTrainers", trainerUid, "students", storageStudentId, "workoutSessions", session.id)
      );
      toast({ title: t("sessionDeleted") });
      setConfirmDelete(false);
      onOpenChange(false);
      onMutated?.();
    } catch {
      toast({ title: t("calendarRosterPlanDetailError"), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (!session) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("editSession")} — {session.workoutTitle?.trim() || t("calendarRosterUntitledSession")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {rows.map((ex, ei) => (
              <div key={ei} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <Input
                    className="font-medium text-sm h-8"
                    value={ex.name}
                    onChange={(e) => {
                      const copy = [...rows];
                      copy[ei] = { ...copy[ei], name: e.target.value };
                      setRows(copy);
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 ml-2 text-destructive shrink-0"
                    type="button"
                    onClick={() => setRows(rows.filter((_, i) => i !== ei))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="space-y-1">
                  {ex.sets.map((s, si) => (
                    <div key={si} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-12 shrink-0">Set {si + 1}</span>
                      <Input
                        type="number"
                        className="h-7 text-xs"
                        placeholder="kg"
                        value={s.weight}
                        onChange={(e) => {
                          const copy = [...rows];
                          const sets = [...copy[ei].sets];
                          sets[si] = { ...sets[si], weight: Number(e.target.value) || 0 };
                          copy[ei] = { ...copy[ei], sets };
                          setRows(copy);
                        }}
                      />
                      <span className="text-xs">kg ×</span>
                      <Input
                        type="number"
                        className="h-7 text-xs"
                        placeholder="reps"
                        value={s.reps}
                        onChange={(e) => {
                          const copy = [...rows];
                          const sets = [...copy[ei].sets];
                          sets[si] = { ...sets[si], reps: Number(e.target.value) || 0 };
                          copy[ei] = { ...copy[ei], sets };
                          setRows(copy);
                        }}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive"
                        type="button"
                        onClick={() => {
                          const copy = [...rows];
                          copy[ei] = {
                            ...copy[ei],
                            sets: copy[ei].sets.filter((_, i) => i !== si),
                          };
                          setRows(copy);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs mt-1"
                    type="button"
                    onClick={() => {
                      const copy = [...rows];
                      copy[ei] = { ...copy[ei], sets: [...copy[ei].sets, { weight: 0, reps: 0 }] };
                      setRows(copy);
                    }}
                  >
                    + Add Set
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={isSaving}>
                {t("saveChanges")}
              </Button>
              <Button variant="destructive" type="button" onClick={() => setConfirmDelete(true)} disabled={isSaving}>
                {t("deleteSession")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> {t("deleteSession")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteSession")}. {t("deleteStudentConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" /> {t("deleteSession")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
