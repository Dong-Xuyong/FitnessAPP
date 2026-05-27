/** Same rules as student workout history: session counts when `completedAt` is set. */
export function parseSessionCompletedAtMs(completedAt: unknown): number | null {
  if (completedAt == null) return null;
  if (
    typeof completedAt === "object" &&
    completedAt !== null &&
    "toDate" in completedAt &&
    typeof (completedAt as { toDate?: () => Date }).toDate === "function"
  ) {
    const t = (completedAt as { toDate: () => Date }).toDate().getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof completedAt === "string" && completedAt.trim()) {
    const v = Date.parse(completedAt);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

/** Completed workout sessions whose `completedAt` falls in the calendar month of `referenceDate`. */
export function countCompletedWorkoutSessionsInMonth(
  sessionDocs: Array<{ data: Record<string, unknown> }>,
  referenceDate: Date = new Date()
): number {
  const month = referenceDate.getMonth();
  const year = referenceDate.getFullYear();
  return sessionDocs.filter((s) => {
    const ms = parseSessionCompletedAtMs(s.data.completedAt);
    if (ms == null) return false;
    const d = new Date(ms);
    return d.getMonth() === month && d.getFullYear() === year;
  }).length;
}

/**
 * Count assigned workout plans in the calendar month of `referenceDate` that have
 * a matching completed session (by workoutPlanId on session docs).
 */
export function countMonthlyWorkoutPlanCompletions(
  planDocs: Array<{ id: string; data: Record<string, unknown> }>,
  sessionDocs: Array<{ data: Record<string, unknown> }>,
  referenceDate: Date = new Date()
): { done: number; planned: number } {
  const completedPlanIds = new Set(
    sessionDocs
      .map((s) => s.data.workoutPlanId)
      .filter((planId): planId is string => typeof planId === "string" && planId.length > 0)
  );

  const currentMonth = referenceDate.getMonth();
  const currentYear = referenceDate.getFullYear();

  const monthPlannedWorkouts = planDocs.filter((plan) => {
    const d = plan.data;
    const scheduledRaw = String(d.weekStart || d.assignedAt || d.createdAt || "") || "";
    const scheduledDate = new Date(scheduledRaw);
    if (Number.isNaN(scheduledDate.getTime())) return false;
    return scheduledDate.getMonth() === currentMonth && scheduledDate.getFullYear() === currentYear;
  });

  const done = monthPlannedWorkouts.filter((plan) => completedPlanIds.has(plan.id)).length;
  return { done, planned: monthPlannedWorkouts.length };
}
