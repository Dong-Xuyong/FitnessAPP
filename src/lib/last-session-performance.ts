export type LastSessionPerf = { weight: number; reps: number };

/** Draft values for the set logger inputs (PESO / REPETIÇÕES). */
export type SetLogDraft = { weight: string; reps: string };

export type PlanExerciseRef = { exerciseName?: string; name?: string };

export type CompletedSessionRef = {
  workoutPlanId?: string;
  completedAt?: unknown;
  exercises?: unknown;
  source?: unknown;
};

export function normalizeExerciseKey(name: string): string {
  return name
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function planExerciseName(ex: PlanExerciseRef, index = 0): string {
  const name = String(ex.exerciseName || ex.name || "").trim();
  return name || `Exercise ${index + 1}`;
}

function perfFromWeightReps(weight: unknown, reps: unknown): LastSessionPerf | null {
  const r = typeof reps === "string" ? Number(reps.trim().replace(",", ".")) : Number(reps);
  if (!Number.isFinite(r) || r <= 0) return null;
  const w = typeof weight === "string" ? Number(weight.trim().replace(",", ".")) : Number(weight);
  return { weight: Number.isFinite(w) && w > 0 ? w : 0, reps: r };
}

/**
 * First logged set per exercise name.
 * Blank leading sets (0 reps) are skipped so a placeholder does not hide a later logged set.
 * When `sets` is not an array, falls back to weight/reps stored on the exercise row.
 */
export function buildLastPerfByExercise(sessionData: {
  exercises?: unknown;
}): Record<string, LastSessionPerf> {
  const out: Record<string, LastSessionPerf> = {};
  const exercises = Array.isArray(sessionData.exercises) ? sessionData.exercises : [];
  for (const raw of exercises) {
    if (!raw || typeof raw !== "object") continue;
    const ex = raw as {
      exerciseName?: string;
      name?: string;
      weight?: unknown;
      reps?: unknown;
      sets?: unknown;
    };
    const key = normalizeExerciseKey(String(ex.exerciseName || ex.name || ""));
    if (!key) continue;
    let perf: LastSessionPerf | null = null;
    if (Array.isArray(ex.sets)) {
      for (const set of ex.sets) {
        if (!set || typeof set !== "object") continue;
        const row = set as { weight?: unknown; reps?: unknown };
        perf = perfFromWeightReps(row.weight, row.reps);
        if (perf) break;
      }
    } else {
      perf = perfFromWeightReps(ex.weight, ex.reps);
    }
    if (perf) out[key] = perf;
  }
  return out;
}

function completedAtMs(completedAt: unknown): number {
  if (completedAt == null) return 0;
  if (typeof completedAt === "number" && Number.isFinite(completedAt)) {
    const ms = completedAt < 1e12 ? completedAt * 1000 : completedAt;
    return Number.isFinite(ms) ? ms : 0;
  }
  if (typeof completedAt === "object" && completedAt !== null) {
    const withDate = completedAt as { toDate?: () => Date; seconds?: unknown };
    if (typeof withDate.toDate === "function") {
      const t = withDate.toDate().getTime();
      return Number.isFinite(t) ? t : 0;
    }
    const seconds = Number(withDate.seconds);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }
  if (typeof completedAt === "string" && completedAt.trim()) {
    const p = Date.parse(completedAt);
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

function isBodyMetricSession(session: CompletedSessionRef): boolean {
  return session.source === "coach_body_metric";
}

/** Newest logged set per exercise name across all completed sessions. */
export function buildLatestPerfByExerciseName(
  sessions: Array<CompletedSessionRef>
): Record<string, LastSessionPerf> {
  const sorted = [...sessions].sort(
    (a, b) => completedAtMs(b.completedAt) - completedAtMs(a.completedAt)
  );
  const out: Record<string, LastSessionPerf> = {};
  for (const session of sorted) {
    if (isBodyMetricSession(session)) continue;
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
  sessions: Array<CompletedSessionRef>
): Record<string, Record<string, LastSessionPerf>> {
  const byPlan: Record<string, Record<string, LastSessionPerf>> = {};
  for (const session of sessions) {
    if (isBodyMetricSession(session)) continue;
    const planId = String(session.workoutPlanId ?? "").trim();
    if (!planId || !session.completedAt || completedAtMs(session.completedAt) <= 0 || byPlan[planId]) continue;
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

/** Last logged weight/reps per exercise in plan order (plan session first, then any session). */
export function buildPlanExerciseLastPerformance(
  planExercises: Array<PlanExerciseRef>,
  planId: string,
  sessions: Array<CompletedSessionRef>
): Array<{ name: string; perf?: LastSessionPerf }> {
  const sorted = [...sessions].sort(
    (a, b) => completedAtMs(b.completedAt) - completedAtMs(a.completedAt)
  );
  const byPlan = buildLatestPerfByPlanId(sorted);
  const byName = buildLatestPerfByExerciseName(sorted);
  const planPerf = byPlan[planId] ?? {};

  return planExercises.map((ex, idx) => {
    const name = planExerciseName(ex, idx);
    const key = normalizeExerciseKey(name);
    const perf = planPerf[key] ?? byName[key];
    return { name, perf: perf && perf.reps > 0 ? perf : undefined };
  });
}

/** Same map the plan card uses for “Última vez”, keyed by normalized exercise name. */
export function lastPerfLookupForPlanExercises(
  planExercises: Array<PlanExerciseRef>,
  planId: string,
  sessions: Array<CompletedSessionRef>
): Record<string, LastSessionPerf> {
  const lookup: Record<string, LastSessionPerf> = {};
  for (const item of buildPlanExerciseLastPerformance(planExercises, planId, sessions)) {
    if (!item.perf) continue;
    const key = normalizeExerciseKey(item.name);
    if (key && !(key in lookup)) lookup[key] = item.perf;
  }
  return lookup;
}

/** Input values for REGISTA A TUA SÉRIE. Weight stays blank for bodyweight (0 kg). */
export function setLogDraftFromLastPerf(perf: LastSessionPerf | undefined): SetLogDraft | null {
  if (!perf || !(perf.reps > 0)) return null;
  return {
    weight: perf.weight > 0 ? String(perf.weight) : "",
    reps: String(perf.reps),
  };
}

/**
 * Prefills set inputs the athlete has not touched.
 * A key already present in `existing` is kept, including a cleared blank draft.
 * Exercises with no última vez are left absent so the inputs stay at their empty placeholder.
 */
export function prefillUntouchedSetLogs(
  existing: Record<number, SetLogDraft>,
  planExercises: Array<PlanExerciseRef>,
  planId: string,
  sessions: Array<CompletedSessionRef>
): Record<number, SetLogDraft> {
  const items = buildPlanExerciseLastPerformance(planExercises, planId, sessions);
  let next = existing;
  let changed = false;
  items.forEach((item, index) => {
    if (Object.prototype.hasOwnProperty.call(existing, index)) return;
    const draft = setLogDraftFromLastPerf(item.perf);
    if (!draft) return;
    if (!changed) {
      next = { ...existing };
      changed = true;
    }
    next[index] = draft;
  });
  return next;
}
