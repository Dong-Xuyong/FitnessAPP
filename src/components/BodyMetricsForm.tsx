"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { useFirestore } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import {
  bodyMetricFormValuesFromProfile,
  computedLeanFatDisplay,
  parseBodyMetricsForm,
} from "@/lib/body-metric-input";
import { saveBodyMetrics } from "@/lib/coach-body-metrics";
import type { BodyMetricKey, BodyMetricSource } from "@/lib/body-metrics-types";
import {
  BODY_METRIC_FIELDS,
  COMPOSITION_METRIC_KEYS,
  MEASUREMENT_METRIC_KEYS,
} from "@/lib/body-metrics-types";

type BodyMetricsFormProps = {
  trainerId: string;
  rosterStudentId: string;
  globalStudentId: string;
  canWriteSession: boolean;
  source: BodyMetricSource;
  initialProfile?: Record<string, unknown> | null;
  existingWeightHistory?: unknown;
  compact?: boolean;
  onSaved?: () => void;
};

export function BodyMetricsForm({
  trainerId,
  rosterStudentId,
  globalStudentId,
  canWriteSession,
  source,
  initialProfile,
  existingWeightHistory,
  compact = false,
  onSaved,
}: BodyMetricsFormProps) {
  const db = useFirestore();
  const { toast } = useToast();
  const { t } = useI18n();
  const [values, setValues] = useState<Partial<Record<BodyMetricKey, string>>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setValues(bodyMetricFormValuesFromProfile(initialProfile));
  }, [initialProfile]);

  const computed = useMemo(
    () => computedLeanFatDisplay(values.weightKg ?? "", values.bodyFatPercent ?? ""),
    [values.weightKg, values.bodyFatPercent]
  );

  const setField = (key: BodyMetricKey, raw: string) => {
    setValues((prev) => ({ ...prev, [key]: raw }));
  };

  const handleSave = async () => {
    if (!db) return;
    const metrics = parseBodyMetricsForm(values);
    const hasValue = Object.keys(BODY_METRIC_FIELDS).some((k) => {
      const key = k as BodyMetricKey;
      const v = metrics[key];
      return v != null && v > 0;
    });
    if (!hasValue) {
      toast({
        variant: "destructive",
        title: t("coachBodyMetricSaveFailed"),
        description: t("coachBodyMetricRequired"),
      });
      return;
    }

    setIsSaving(true);
    try {
      await saveBodyMetrics({
        db,
        trainerId,
        rosterStudentId,
        globalStudentId,
        canWriteSession,
        source,
        metrics,
        existingWeightHistory,
      });
      toast({
        title: t("coachBodyMetricSaved"),
        description: t("coachBodyMetricSavedDesc"),
      });
      onSaved?.();
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

  const renderField = (key: BodyMetricKey, readOnly = false) => {
    const def = BODY_METRIC_FIELDS[key];
    const id = `body-metric-${key}`;
    const displayValue = readOnly
      ? key === "leanMassKg"
        ? computed.leanMassKg
        : key === "fatMassKg"
          ? computed.fatMassKg
          : ""
      : (values[key] ?? "");

    return (
      <div key={key} className="space-y-2">
        <Label htmlFor={id}>{t(def.labelKey)}</Label>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step="0.1"
          min={0}
          readOnly={readOnly}
          disabled={readOnly}
          className={readOnly ? "bg-muted/50 text-muted-foreground" : undefined}
          placeholder={def.unit === "cm" ? "—" : undefined}
          value={displayValue}
          onChange={readOnly ? undefined : (e) => setField(key, e.target.value)}
        />
      </div>
    );
  };

  return (
    <div
      className={
        compact
          ? "space-y-4 pt-2 border-t border-border/60"
          : "space-y-4 rounded-lg border-2 border-dashed border-border/80 bg-muted/20 p-4"
      }
    >
      {!compact && (
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium">{t("coachBodyMetricTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("coachBodyMetricDesc")}</p>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("bodyMetricsTabComposition")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {COMPOSITION_METRIC_KEYS.filter((k) => BODY_METRIC_FIELDS[k].editable).map((k) =>
            renderField(k)
          )}
          {renderField("leanMassKg", true)}
          {renderField("fatMassKg", true)}
        </div>
        <p className="text-xs text-muted-foreground">{t("bodyMetricsAutoCalcHint")}</p>
      </div>

      <div className="space-y-3 pt-2 border-t border-border/40">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("bodyMetricsTabMeasurements")}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MEASUREMENT_METRIC_KEYS.map((k) => renderField(k))}
        </div>
      </div>

      <Button type="button" className="w-full sm:w-auto" onClick={handleSave} disabled={isSaving}>
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        {t("coachBodyMetricSave")}
      </Button>
    </div>
  );
}
