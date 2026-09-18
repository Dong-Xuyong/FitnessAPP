import type { BodyMetricChartPoint, BodyMetricHistoryEntry, BodyMetricKey } from "@/lib/body-metrics-types";
import { BODY_METRIC_FIELDS, SESSION_FIELD_TO_METRIC } from "@/lib/body-metrics-types";

export type BodyCompositionChartPoint = BodyMetricChartPoint;

function axisLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function readMetricFromSession(sessionData: Record<string, unknown>, key: BodyMetricKey): number | null {
  const direct = Number(sessionData[key]);
  if (Number.isFinite(direct) && direct > 0) return Number(direct.toFixed(key.includes("Percent") ? 1 : 2));

  for (const [sessionField, metricKey] of Object.entries(SESSION_FIELD_TO_METRIC)) {
    if (metricKey !== key) continue;
    const v = Number(sessionData[sessionField]);
    if (Number.isFinite(v) && v > 0) {
      return Number(v.toFixed(key === "bodyFatPercent" || key === "fatMassPercent" ? 1 : 2));
    }
  }
  // Legacy sessions store fat % as sessionBodyFatPercent / bodyFatPercent
  if (key === "fatMassPercent") {
    const legacy = Number(sessionData.sessionBodyFatPercent ?? sessionData.bodyFatPercent);
    if (Number.isFinite(legacy) && legacy > 0) return Number(legacy.toFixed(1));
  }
  return null;
}

function readMetricFromHistory(entry: BodyMetricHistoryEntry, key: BodyMetricKey): number | null {
  const direct = Number(entry[key]);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (key === "weightKg") {
    const legacy = Number(entry.weightKg ?? entry.weight);
    if (Number.isFinite(legacy) && legacy > 0) return legacy;
  }
  if (key === "fatMassPercent") {
    const legacy = Number(entry.bodyFatPercent);
    if (Number.isFinite(legacy) && legacy > 0) return legacy;
  }
  if (key === "bodyFatPercent") {
    const legacy = Number(entry.fatMassPercent);
    if (Number.isFinite(legacy) && legacy > 0) return legacy;
  }
  return null;
}

function hasAnyMetricInRow(row: Partial<Record<BodyMetricKey, number | null>>): boolean {
  return (Object.keys(BODY_METRIC_FIELDS) as BodyMetricKey[]).some((k) => {
    const v = row[k];
    return v != null && Number.isFinite(v) && v > 0;
  });
}

function extractMetricsFromSession(sessionData: Record<string, unknown>): Partial<Record<BodyMetricKey, number | null>> {
  const row: Partial<Record<BodyMetricKey, number | null>> = {};
  for (const key of Object.keys(BODY_METRIC_FIELDS) as BodyMetricKey[]) {
    row[key] = readMetricFromSession(sessionData, key);
  }
  return row;
}

function extractMetricsFromHistory(entry: BodyMetricHistoryEntry): Partial<Record<BodyMetricKey, number | null>> {
  const row: Partial<Record<BodyMetricKey, number | null>> = {};
  for (const key of Object.keys(BODY_METRIC_FIELDS) as BodyMetricKey[]) {
    row[key] = readMetricFromHistory(entry, key);
  }
  return row;
}

function pushRow(
  rows: BodyMetricChartPoint[],
  timestamp: number,
  metrics: Partial<Record<BodyMetricKey, number | null>>
) {
  if (!hasAnyMetricInRow(metrics)) return;
  rows.push({
    timestamp,
    date: "",
    ...metrics,
  });
}

/** Build sorted chart points from workout sessions and weightHistory entries. */
export function bodyMetricChartPoints(
  sessions: ReadonlyArray<
    Record<string, unknown> & {
      completedAt?: unknown;
      startedAt?: unknown;
      date?: unknown;
    }
  >,
  weightHistory?: unknown
): BodyMetricChartPoint[] {
  const rows: BodyMetricChartPoint[] = [];

  sessions.forEach((sessionData) => {
    const timestamp = Date.parse(
      String(sessionData.completedAt || sessionData.startedAt || sessionData.date || "")
    );
    if (!Number.isFinite(timestamp)) return;
    pushRow(rows, timestamp, extractMetricsFromSession(sessionData));
  });

  if (Array.isArray(weightHistory)) {
    (weightHistory as BodyMetricHistoryEntry[]).forEach((entry) => {
      const timestamp = Date.parse(String(entry.date || entry.checkedAt || ""));
      if (!Number.isFinite(timestamp)) return;
      pushRow(rows, timestamp, extractMetricsFromHistory(entry));
    });
  }

  rows.sort((a, b) => a.timestamp - b.timestamp);

  const seenBase = new Map<string, number>();
  for (const row of rows) {
    const base = axisLabel(row.timestamp);
    const i = seenBase.get(base) ?? 0;
    seenBase.set(base, i + 1);
    row.date = i === 0 ? base : `${base} (${i + 1})`;
  }

  return rows;
}

/** @deprecated Use bodyMetricChartPoints */
export function bodyCompositionPointsFromSessions(
  sessions: ReadonlyArray<
    Record<string, unknown> & {
      completedAt?: unknown;
      startedAt?: unknown;
      date?: unknown;
      bodyWeightKg?: unknown;
      sessionBodyFatPercent?: unknown;
    }
  >
): BodyCompositionChartPoint[] {
  return bodyMetricChartPoints(sessions);
}

export function chartHasMetricData(data: BodyMetricChartPoint[], key: BodyMetricKey): boolean {
  return data.some((row) => {
    const v = row[key];
    return v != null && Number.isFinite(v) && v > 0;
  });
}

export function filterChartPointsForMetrics(
  data: BodyMetricChartPoint[],
  keys: BodyMetricKey[]
): BodyMetricChartPoint[] {
  return data.filter((row) =>
    keys.some((key) => {
      const v = row[key];
      return v != null && Number.isFinite(v) && v > 0;
    })
  );
}
