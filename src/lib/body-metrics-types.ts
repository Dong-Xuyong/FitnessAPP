import type { TranslationKey } from "@/lib/i18n";

export type BodyMetricGroup = "composition" | "measurements";
export type BodyMetricUnit = "kg" | "%" | "score" | "cm" | "index";
export type BodyMetricSource = "coach" | "student";

export type BodyMetricKey =
  | "weightKg"
  | "leanMassPercent"
  | "fatMassPercent"
  | "bodyFatPercent"
  | "leanMassKg"
  | "fatMassKg"
  | "visceralFatScore"
  | "bmi"
  | "armRightCm"
  | "armLeftCm"
  | "chestCm"
  | "abdominalCm"
  | "glutesCm"
  | "thighRightCm"
  | "thighLeftCm"
  | "calfRightCm"
  | "calfLeftCm";

export type BodyMetricFieldDef = {
  group: BodyMetricGroup;
  unit: BodyMetricUnit;
  editable: boolean;
  chartable: boolean;
  /** i18n key for label */
  labelKey: TranslationKey;
};

export const BODY_METRIC_FIELDS: Record<BodyMetricKey, BodyMetricFieldDef> = {
  weightKg: { group: "composition", unit: "kg", editable: true, chartable: true, labelKey: "metricWeightKg" },
  leanMassPercent: { group: "composition", unit: "%", editable: true, chartable: true, labelKey: "metricLeanMassPercent" },
  fatMassPercent: { group: "composition", unit: "%", editable: true, chartable: true, labelKey: "metricFatMassPercent" },
  /** Legacy alias of fatMassPercent — kept for history/session compatibility */
  bodyFatPercent: { group: "composition", unit: "%", editable: false, chartable: true, labelKey: "metricBodyFatPercent" },
  leanMassKg: { group: "composition", unit: "kg", editable: false, chartable: true, labelKey: "metricLeanMassKg" },
  fatMassKg: { group: "composition", unit: "kg", editable: false, chartable: true, labelKey: "metricFatMassKg" },
  visceralFatScore: { group: "composition", unit: "score", editable: true, chartable: true, labelKey: "metricVisceralFatScore" },
  bmi: { group: "composition", unit: "index", editable: true, chartable: true, labelKey: "metricBmi" },
  armRightCm: { group: "measurements", unit: "cm", editable: true, chartable: true, labelKey: "metricArmRightCm" },
  armLeftCm: { group: "measurements", unit: "cm", editable: true, chartable: true, labelKey: "metricArmLeftCm" },
  chestCm: { group: "measurements", unit: "cm", editable: true, chartable: true, labelKey: "metricChestCm" },
  abdominalCm: { group: "measurements", unit: "cm", editable: true, chartable: true, labelKey: "metricAbdominalCm" },
  glutesCm: { group: "measurements", unit: "cm", editable: true, chartable: true, labelKey: "metricGlutesCm" },
  thighRightCm: { group: "measurements", unit: "cm", editable: true, chartable: true, labelKey: "metricThighRightCm" },
  thighLeftCm: { group: "measurements", unit: "cm", editable: true, chartable: true, labelKey: "metricThighLeftCm" },
  calfRightCm: { group: "measurements", unit: "cm", editable: true, chartable: true, labelKey: "metricCalfRightCm" },
  calfLeftCm: { group: "measurements", unit: "cm", editable: true, chartable: true, labelKey: "metricCalfLeftCm" },
};

export const COMPOSITION_METRIC_KEYS = (Object.keys(BODY_METRIC_FIELDS) as BodyMetricKey[]).filter(
  (k) => BODY_METRIC_FIELDS[k].group === "composition"
);

export const MEASUREMENT_METRIC_KEYS = (Object.keys(BODY_METRIC_FIELDS) as BodyMetricKey[]).filter(
  (k) => BODY_METRIC_FIELDS[k].group === "measurements"
);

export type BodyMetricsSnapshot = Partial<Record<BodyMetricKey, number | null>>;

export type BodyMetricHistoryEntry = BodyMetricsSnapshot & {
  date?: string;
  checkedAt?: string;
  source?: BodyMetricSource | string;
  /** Legacy aliases */
  weight?: number | null;
};

export type BodyMetricChartPoint = {
  timestamp: number;
  date: string;
} & Partial<Record<BodyMetricKey, number | null>>;

/** Session docs use legacy names for weight/body fat */
export const SESSION_FIELD_TO_METRIC: Partial<Record<string, BodyMetricKey>> = {
  bodyWeightKg: "weightKg",
  sessionBodyFatPercent: "fatMassPercent",
};

export const METRIC_TO_SESSION_FIELD: Partial<Record<BodyMetricKey, string>> = {
  weightKg: "bodyWeightKg",
  fatMassPercent: "sessionBodyFatPercent",
  bodyFatPercent: "sessionBodyFatPercent",
};

export function chartableKeysForGroup(group: BodyMetricGroup): BodyMetricKey[] {
  return (Object.keys(BODY_METRIC_FIELDS) as BodyMetricKey[]).filter(
    (k) => BODY_METRIC_FIELDS[k].group === group && BODY_METRIC_FIELDS[k].chartable
  );
}

export function computeLeanAndFatMass(
  weightKg: number | null | undefined,
  bodyFatPercent: number | null | undefined
): { leanMassKg: number | null; fatMassKg: number | null } {
  if (weightKg == null || bodyFatPercent == null || weightKg <= 0 || bodyFatPercent <= 0) {
    return { leanMassKg: null, fatMassKg: null };
  }
  const fatMassKg = Math.round(weightKg * (bodyFatPercent / 100) * 1000) / 1000;
  const leanMassKg = Math.round((weightKg - fatMassKg) * 1000) / 1000;
  return { leanMassKg, fatMassKg };
}

export function hasAnyBodyMetricValue(snapshot: BodyMetricsSnapshot): boolean {
  return (Object.keys(BODY_METRIC_FIELDS) as BodyMetricKey[]).some((key) => {
    const v = snapshot[key];
    return v != null && Number.isFinite(v) && v > 0;
  });
}

export function bodyMetricsFromProfile(data: Record<string, unknown> | null | undefined): BodyMetricsSnapshot {
  if (!data) return {};
  const out: BodyMetricsSnapshot = {};
  for (const key of Object.keys(BODY_METRIC_FIELDS) as BodyMetricKey[]) {
    const v = Number(data[key]);
    if (Number.isFinite(v) && v > 0) out[key] = v;
  }
  // Legacy profiles may only have bodyFatPercent
  if (out.fatMassPercent == null && out.bodyFatPercent != null) {
    out.fatMassPercent = out.bodyFatPercent;
  }
  if (out.bodyFatPercent == null && out.fatMassPercent != null) {
    out.bodyFatPercent = out.fatMassPercent;
  }
  return out;
}
