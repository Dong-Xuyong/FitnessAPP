"use client";

import { useRef, useState } from "react";
import { Download, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useFirestore, useUser } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import {
  buildCoachLibraryWorkbookAsync,
  downloadCoachLibraryWorkbook,
  fetchCoachLibraryForExport,
  parseCoachLibraryWorkbook,
  runCoachLibraryImport,
  type ParsedCoachLibraryWorkbook,
} from "@/lib/coach-library-excel";

export function CoachLibraryExcelActions() {
  const { user } = useUser();
  const db = useFirestore();
  const { toast } = useToast();
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<ParsedCoachLibraryWorkbook | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleExport = async () => {
    if (!db || !user?.uid) return;
    setIsExporting(true);
    try {
      const data = await fetchCoachLibraryForExport(db, user.uid);
      const buffer = await buildCoachLibraryWorkbookAsync(data, {
        exercisesInstruction: t("excelExercisesInstruction"),
        programsInstruction: t("excelProgramsInstruction"),
      });
      downloadCoachLibraryWorkbook(buffer);
      toast({
        title: t("excelExportSuccess"),
        description: t("excelExportSuccessDesc")
          .replace("{exercises}", String(data.exercises.length))
          .replace("{programs}", String(data.programs.filter((p) => (p.sessions?.length ?? 0) > 0).length)),
      });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: t("error"), description: t("excelExportFailed") });
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !db || !user?.uid) return;

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseCoachLibraryWorkbook(buffer);
      if (parsed.errors.includes("invalid_workbook") || parsed.errors.includes("missing_sheets")) {
        toast({ variant: "destructive", title: t("excelInvalidFile") });
        return;
      }
      if (parsed.exerciseRows.length === 0 && parsed.programRows.length === 0) {
        toast({ variant: "destructive", title: t("excelInvalidFile"), description: t("excelNoRowsFound") });
        return;
      }
      setPendingImport(parsed);
      setConfirmOpen(true);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: t("excelInvalidFile") });
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImport || !db || !user?.uid) return;
    setIsImporting(true);
    setConfirmOpen(false);
    try {
      const summary = await runCoachLibraryImport(db, user.uid, pendingImport);
      toast({
        title: t("excelImportSuccess"),
        description: t("excelImportSummary")
          .replace("{exercisesUpdated}", String(summary.exercisesUpdated))
          .replace("{exercisesCreated}", String(summary.exercisesCreated))
          .replace("{exercisesSkipped}", String(summary.exercisesSkipped))
          .replace("{programsUpdated}", String(summary.programsUpdated))
          .replace("{programsCreated}", String(summary.programsCreated))
          .replace("{programsSkipped}", String(summary.programsSkipped))
          .replace("{programNotesUpdated}", String(summary.programNotesUpdated)),
      });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: t("error"), description: t("excelImportFailed") });
    } finally {
      setIsImporting(false);
      setPendingImport(null);
    }
  };

  const previewExercises = pendingImport?.exerciseRows.length ?? 0;
  const previewPrograms = pendingImport?.programRows.length ?? 0;
  const previewCoachNotes =
    pendingImport?.programRows
      .filter((row) => row.coachNotes.trim())
      .slice(0, 3)
      .map((row) => `${row.exerciseName}: ${row.coachNotes}`) ?? [];

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={!db || !user || isExporting}
        onClick={() => void handleExport()}
        aria-label={t("exportExcel")}
        title={t("exportExcel")}
      >
        {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={!db || !user || isImporting}
        onClick={() => fileInputRef.current?.click()}
        aria-label={t("importExcel")}
        title={t("importExcel")}
      >
        {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("excelImportConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block text-sm text-muted-foreground">
                {t("excelImportPreview")
                  .replace("{exercises}", String(previewExercises))
                  .replace("{programs}", String(previewPrograms))}
              </span>
              {previewCoachNotes.length > 0 && (
                <span className="block text-sm text-muted-foreground">
                  {t("excelImportNotesPreview")}: {previewCoachNotes.join(" · ")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isImporting}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={isImporting} onClick={() => void handleConfirmImport()}>
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("importExcel")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
