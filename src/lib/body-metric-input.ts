import type { BodyMetricKey, BodyMetricsSnapshot } from "@/lib/body-metrics-types";
import { BODY_METRIC_FIELDS, computeLeanAndFatMass } from "@/lib/body-metrics-types";

export function parseOptionalBodyWeightKg(raw: string): number | null {
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 450) return null;
  return Math.round(n * 1000) / 1000;
}

export function parseOptionalBodyFatPercent(raw: string): number | null {
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 70) return null;
  return Math.round(n * 10) / 10;
}

export function parseOptionalMassPercent(raw: string): number | null {
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return Math.round(n * 10) / 10;
}

export function parseOptionalVisceralFatScore(raw: string): number | null {
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 60) return null;
  return Math.round(n * 10) / 10;
}

/** Manual BMI — not derived from height/weight. */
export function parseOptionalBmi(raw: string): number | null {
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 80) return null;
  return Math.round(n * 10) / 10;
}

export function parseOptionalCircumferenceCm(raw: string): number | null {
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 300) return null;
  return Math.round(n * 10) / 10;
}

const PARSERS: Partial<Record<BodyMetricKey, (raw: string) => number | null>> = {
  weightKg: parseOptionalBodyWeightKg,
  leanMassPercent: parseOptionalMassPercent,
  fatMassPercent: parseOptionalMassPercent,
  visceralFatScore: parseOptionalVisceralFatScore,
  bmi: parseOptionalBmi,
  armRightCm: parseOptionalCircumferenceCm,
  armLeftCm: parseOptionalCircumferenceCm,
  chestCm: parseOptionalCircumferenceCm,
  abdominalCm: parseOptionalCircumferenceCm,
  glutesCm: parseOptionalCircumferenceCm,
  thighRightCm: parseOptionalCircumferenceCm,
  thighLeftCm: parseOptionalCircumferenceCm,
  calfRightCm: parseOptionalCircumferenceCm,
  calfLeftCm: parseOptionalCircumferenceCm,
};

export function parseOptionalBodyMetricField(key: BodyMetricKey, raw: string): number | null {
  if (key === "leanMassKg" || key === "fatMassKg" || key === "bodyFatPercent") return null;
  const parser = PARSERS[key];
  return parser ? parser(raw) : null;
}

export function parseBodyMetricsForm(
  values: Partial<Record<BodyMetricKey, string>>
): BodyMetricsSnapshot {
  const snapshot: BodyMetricsSnapshot = {};
  for (const key of Object.keys(BODY_METRIC_FIELDS) as BodyMetricKey[]) {
    if (!BODY_METRIC_FIELDS[key].editable) continue;
    const raw = values[key];
    if (raw == null) continue;
    const parsed = parseOptionalBodyMetricField(key, raw);
    if (parsed != null) snapshot[key] = parsed;
  }
  // Keep legacy bodyFatPercent in sync with manual fat mass %
  if (snapshot.fatMassPercent != null) {
    snapshot.bodyFatPercent = snapshot.fatMassPercent;
  }
  const fatForCalc = snapshot.fatMassPercent ?? snapshot.bodyFatPercent;
  const { leanMassKg, fatMassKg } = computeLeanAndFatMass(snapshot.weightKg, fatForCalc);
  if (leanMassKg != null) snapshot.leanMassKg = leanMassKg;
  if (fatMassKg != null) snapshot.fatMassKg = fatMassKg;
  return snapshot;
}

export function prefilledWeightFromProfile(weightKg: unknown): string {
  const n = typeof weightKg === "number" ? weightKg : Number(weightKg);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n);
}

export function prefilledBodyFatFromProfile(bodyFatPercent: unknown): string {
  const n = typeof bodyFatPercent === "number" ? bodyFatPercent : Number(bodyFatPercent);
  if (!Number.isFinite(n) || n <= 0 || n > 70) return "";
  return String(n);
}

export function prefilledMetricFromProfile(value: unknown, max?: number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (max != null && n > max) return "";
  return String(n);
}

export function bodyMetricFormValuesFromProfile(
  profile: Record<string, unknown> | null | undefined
): Partial<Record<BodyMetricKey, string>> {
  const out: Partial<Record<BodyMetricKey, string>> = {};
  if (!profile) return out;
  for (const key of Object.keys(BODY_METRIC_FIELDS) as BodyMetricKey[]) {
    if (!BODY_METRIC_FIELDS[key].editable) continue;
    const v = profile[key];
    if (key === "weightKg") out[key] = prefilledWeightFromProfile(v);
    else if (key === "leanMassPercent") out[key] = prefilledMetricFromProfile(v, 100);
    else if (key === "fatMassPercent") {
      const fat = profile.fatMassPercent ?? profile.bodyFatPercent;
      out[key] = prefilledMetricFromProfile(fat, 100);
    } else if (key === "visceralFatScore") out[key] = prefilledMetricFromProfile(v, 60);
    else if (key === "bmi") out[key] = prefilledMetricFromProfile(v, 80);
    else out[key] = prefilledMetricFromProfile(v, 300);
  }
  return out;
}

export function computedLeanFatDisplay(
  weightRaw: string,
  bodyFatRaw: string
): { leanMassKg: string; fatMassKg: string } {
  const weight = parseOptionalBodyWeightKg(weightRaw);
  const bodyFat = parseOptionalBodyFatPercent(bodyFatRaw);
  const { leanMassKg, fatMassKg } = computeLeanAndFatMass(weight, bodyFat);
  return {
    leanMassKg: leanMassKg != null ? String(leanMassKg) : "",
    fatMassKg: fatMassKg != null ? String(fatMassKg) : "",
  };
}

/** ISO date `YYYY-MM-DD` → whole years of age, or null if invalid. */
export function ageFromBirthDate(isoDate: string): number | null {
  const trimmed = String(isoDate).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  const birth = new Date(y, m - 1, d);
  if (
    birth.getFullYear() !== y ||
    birth.getMonth() !== m - 1 ||
    birth.getDate() !== d
  ) {
    return null;
  }
  const today = new Date();
  let age = today.getFullYear() - y;
  const monthDiff = today.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age -= 1;
  if (age < 0 || age > 120) return null;
  return age;
}

export function normalizeBirthDateInput(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "";
  return trimmed;
}
