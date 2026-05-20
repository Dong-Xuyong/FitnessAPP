export type LastSessionPerf = { weight: number; reps: number };

export function normalizeExerciseKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Best set (first logged set) per exercise name from a completed session document. */
export function buildLastPerfByExercise(sessionData: {
  exercises?: Array<{ exerciseName?: string; name?: string; sets?: Array<{ weight?: unknown; reps?: unknown }> }>;
}): Record<string, LastSessionPerf> {
  const out: Record<string, LastSessionPerf> = {};
  const exercises = sessionData.exercises || [];
  for (const ex of exercises) {
    const key = normalizeExerciseKey(String(ex.exerciseName || ex.name || ""));
    if (!key) continue;
    const sets = Array.isArray(ex.sets) ? ex.sets : [];
    const s0 = sets[0];
    if (!s0) continue;
    const w = Number(s0.weight);
    const r = Number(s0.reps);
    if (!Number.isFinite(r) || r <= 0) continue;
    const weight = Number.isFinite(w) ? w : 0;
    out[key] = { weight, reps: r };
  }
  return out;
}

function completedAtMs(completedAt: unknown): number {
  if (completedAt == null) return 0;
  if (
    typeof completedAt === "object" &&
    completedAt !== null &&
    "toDate" in (completedAt as object) &&
    typeof (completedAt as { toDate?: () => Date }).toDate === "function"
  ) {
    return (completedAt as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof completedAt === "string" && completedAt.trim()) {
    const p = Date.parse(completedAt);
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

/** Newest logged set per exercise name across all completed sessions. */
export function buildLatestPerfByExerciseName(
  sessions: Array<{ completedAt?: unknown; exercises?: unknown[] }>
): Record<string, LastSessionPerf> {
  const sorted = [...sessions].sort(
    (a, b) => completedAtMs(b.completedAt) - completedAtMs(a.completedAt)
  );
  const out: Record<string, LastSessionPerf> = {};
  for (const session of sorted) {
    if (!session.completedAt || completedAtMs(session.completedAt) <= 0) continue;
    const perEx = buildLastPerfByExercise(
      session as Parameters<typeof buildLastPerfByExercise>[0]
    );
    for (const [key, perf] of Object.entries(perEx)) {
      if (!(key in out)) out[key] = perf;
    }
  }
  return out;
}

/** Latest completed session per plan id from a list of session docs (newest first if pre-sorted). */
export function buildLatestPerfByPlanId(
  sessions: Array<{ workoutPlanId?: string; completedAt?: unknown; exercises?: unknown[] }>
): Record<string, Record<string, LastSessionPerf>> {
  const byPlan: Record<string, Record<string, LastSessionPerf>> = {};
  for (const session of sessions) {
    const planId = String(session.workoutPlanId ?? "").trim();
    if (!planId || !session.completedAt || byPlan[planId]) continue;
    byPlan[planId] = buildLastPerfByExercise(
      session as Parameters<typeof buildLastPerfByExercise>[0]
    );
  }
  return byPlan;
}

export function formatLastSessionPerformanceLabel(
  perf: LastSessionPerf | undefined,
  messages: {
    weighted: (weight: number, reps: number) => string;
    bodyweight: (reps: number) => string;
  }
): string | null {
  if (!perf || perf.reps <= 0) return null;
  if (perf.weight > 0) return messages.weighted(perf.weight, perf.reps);
  return messages.bodyweight(perf.reps);
}
