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
