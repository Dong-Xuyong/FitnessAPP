"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Info, Loader2, Save, SlidersHorizontal } from "lucide-react";
import { useFirestore } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { bodyMetricFormValuesFromProfile, parseBodyMetricsForm } from "@/lib/body-metric-input";
import { saveBodyMetrics } from "@/lib/coach-body-metrics";
import type { BodyMetricGroup, BodyMetricKey, BodyMetricSource } from "@/lib/body-metrics-types";
import { BODY_METRIC_FIELDS } from "@/lib/body-metrics-types";

type BodyMetricsFormProps = {
  trainerId: string;
  rosterStudentId: string;
  globalStudentId: string;
  canWriteSession: boolean;
  source: BodyMetricSource;
  initialProfile?: Record<string, unknown> | null;
  existingWeightHistory?: unknown;
  compact?: boolean;
  /** When set, only show fields for this group (matches chart tab). */
  activeGroup?: BodyMetricGroup;
  onSaved?: () => void;
};

const PRIMARY_COMPOSITION_KEYS: BodyMetricKey[] = ["weightKg", "fatMassPercent", "leanMassPercent"];
const ADVANCED_COMPOSITION_KEYS: BodyMetricKey[] = ["visceralFatScore", "bmi"];

const MEASUREMENT_PAIRS: [BodyMetricKey, BodyMetricKey][] = [
  ["armRightCm", "armLeftCm"],
  ["thighRightCm", "thighLeftCm"],
  ["calfRightCm", "calfLeftCm"],
];
const MEASUREMENT_SINGLES: BodyMetricKey[] = ["chestCm", "abdominalCm", "glutesCm"];

export function BodyMetricsForm({
  trainerId,
  rosterStudentId,
  globalStudentId,
  canWriteSession,
  source,
  initialProfile,
  existingWeightHistory,
  compact = false,
  activeGroup,
  onSaved,
}: BodyMetricsFormProps) {
  const db = useFirestore();
  const { toast } = useToast();
  const { t } = useI18n();
  const [values, setValues] = useState<Partial<Record<BodyMetricKey, string>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    setValues(bodyMetricFormValuesFromProfile(initialProfile));
  }, [initialProfile]);

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

  const renderField = (key: BodyMetricKey) => {
    const def = BODY_METRIC_FIELDS[key];
    const id = `body-metric-${key}`;

    return (
      <div key={key} className="space-y-2 min-w-0">
        <Label htmlFor={id}>{t(def.labelKey)}</Label>
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step="0.1"
          min={0}
          placeholder={def.unit === "cm" ? "—" : undefined}
          value={values[key] ?? ""}
          onChange={(e) => setField(key, e.target.value)}
        />
      </div>
    );
  };

  const showComposition = !activeGroup || activeGroup === "composition";
  const showMeasurements = !activeGroup || activeGroup === "measurements";

  return (
    <div
      className={
        compact
          ? "space-y-4 min-w-0"
          : "space-y-4 rounded-lg border-2 border-dashed border-border/80 bg-muted/20 p-3 sm:p-4 min-w-0"
      }
    >
      {showComposition && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PRIMARY_COMPOSITION_KEYS.map((k) => renderField(k))}
          </div>

          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <div className="flex items-center gap-1">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex flex-1 items-center justify-between gap-2 rounded-md px-1 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t("bodyMetricsMoreMetrics")}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {advancedOpen ? (
                    <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>
              </CollapsibleTrigger>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40"
                title={t("bodyMetricsManualCompositionHint")}
                aria-label={t("bodyMetricsManualCompositionHint")}
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <CollapsibleContent className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ADVANCED_COMPOSITION_KEYS.map((k) => renderField(k))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {showMeasurements && (
        <div className={`space-y-3 ${showComposition ? "pt-2 border-t border-border/40" : ""}`}>
          <div className="space-y-3">
            {MEASUREMENT_PAIRS.map(([right, left]) => (
              <div key={right} className="grid grid-cols-2 gap-3">
                {renderField(right)}
                {renderField(left)}
              </div>
            ))}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MEASUREMENT_SINGLES.map((k) => renderField(k))}
            </div>
          </div>
        </div>
      )}

      <Button
        type="button"
        size="icon"
        className="w-full sm:w-10"
        onClick={handleSave}
        disabled={isSaving}
        aria-label={t("coachBodyMetricSave")}
        title={t("coachBodyMetricSave")}
      >
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
      </Button>
    </div>
  );
}
