export type BodyCompositionChartPoint = {
  timestamp: number;
  /** X-axis label (disambiguated if same calendar minute repeats) */
  date: string;
  weightKg: number | null;
  bodyFat: number | null;
};

function axisLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Build sorted points from logged workout sessions (same fields student finish flow writes). */
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
  const rows: BodyCompositionChartPoint[] = [];

  sessions.forEach((sessionData) => {
    const timestamp = Date.parse(
      String(sessionData.completedAt || sessionData.startedAt || sessionData.date || "")
    );
    if (!Number.isFinite(timestamp)) return;
    const w = Number(sessionData.bodyWeightKg);
    const bf = Number(sessionData.sessionBodyFatPercent);
    const hasW = Number.isFinite(w) && w > 0;
    const hasBf = Number.isFinite(bf) && bf > 0;
    if (!hasW && !hasBf) return;
    rows.push({
      timestamp,
      date: "",
      weightKg: hasW ? Number(w.toFixed(2)) : null,
      bodyFat: hasBf ? Number(bf.toFixed(1)) : null,
    });
  });

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
