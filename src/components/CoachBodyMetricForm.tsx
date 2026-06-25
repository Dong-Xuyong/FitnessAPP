"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { useFirestore } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import {
  parseOptionalBodyFatPercent,
  parseOptionalBodyWeightKg,
  prefilledBodyFatFromProfile,
  prefilledWeightFromProfile,
} from "@/lib/body-metric-input";
import { saveCoachBodyMetric } from "@/lib/coach-body-metrics";

type CoachBodyMetricFormProps = {
  trainerId: string;
  rosterStudentId: string;
  globalStudentId: string;
  canWriteSession: boolean;
  initialWeightKg?: unknown;
  initialBodyFatPercent?: unknown;
  existingWeightHistory?: unknown;
  compact?: boolean;
};

export function CoachBodyMetricForm({
  trainerId,
  rosterStudentId,
  globalStudentId,
  canWriteSession,
  initialWeightKg,
  initialBodyFatPercent,
  existingWeightHistory,
  compact = false,
}: CoachBodyMetricFormProps) {
  const db = useFirestore();
  const { toast } = useToast();
  const { t } = useI18n();
  const [weightKg, setWeightKg] = useState("");
  const [bodyFatPercent, setBodyFatPercent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setWeightKg(prefilledWeightFromProfile(initialWeightKg));
    setBodyFatPercent(prefilledBodyFatFromProfile(initialBodyFatPercent));
  }, [initialWeightKg, initialBodyFatPercent]);

  const handleSave = async () => {
    if (!db) return;
    const parsedWeight = parseOptionalBodyWeightKg(weightKg);
    const parsedBodyFat = parseOptionalBodyFatPercent(bodyFatPercent);
    if (parsedWeight == null && parsedBodyFat == null) {
      toast({
        variant: "destructive",
        title: t("coachBodyMetricSaveFailed"),
        description: t("coachBodyMetricRequired"),
      });
      return;
    }

    setIsSaving(true);
    try {
      await saveCoachBodyMetric({
        db,
        trainerId,
        rosterStudentId,
        globalStudentId,
        canWriteSession,
        weightKg: parsedWeight,
        bodyFatPercent: parsedBodyFat,
        existingWeightHistory,
      });
      toast({
        title: t("coachBodyMetricSaved"),
        description: t("coachBodyMetricSavedDesc"),
      });
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: t("coachBodyMetricSaveFailed"),
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className={
        compact
          ? "space-y-3 pt-2 border-t border-border/60"
          : "space-y-4 rounded-lg border-2 border-dashed border-border/80 bg-muted/20 p-4"
      }
    >
      {!compact && (
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium">{t("coachBodyMetricTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("coachBodyMetricDesc")}</p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="coach-body-weight">{t("currentWeightKg")}</Label>
          <Input
            id="coach-body-weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            placeholder="72.5"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="coach-body-fat">{t("bodyFatPercent")}</Label>
          <Input
            id="coach-body-fat"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={0}
            max={70}
            placeholder="18"
            value={bodyFatPercent}
            onChange={(e) => setBodyFatPercent(e.target.value)}
          />
        </div>
      </div>
      <Button type="button" className="w-full sm:w-auto" onClick={handleSave} disabled={isSaving}>
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        {t("coachBodyMetricSave")}
      </Button>
    </div>
  );
}
