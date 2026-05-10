import type { TrainingProgramSession } from "@/lib/types";

type ProgramWithSessions = {
  sessions?: TrainingProgramSession[] | null;
  durationWeeks?: number;
};

/**
 * When a program encodes one session per week (sessions.length === durationWeeks),
 * return only the session for the given calendar week. Otherwise return all sessions
 * (e.g. Treino A: one session, durationWeeks 8 — full list each week).
 */
export function pickSessionsForAssignmentWeek(
  program: ProgramWithSessions,
  weekNumber: number
): TrainingProgramSession[] {
  const all = program.sessions || [];
  const dw = program.durationWeeks ?? all.length;
  const useWeekProgression =
    all.length >= 2 && dw >= 2 && all.length === dw;
  if (!useWeekProgression || weekNumber < 1) {
    return all;
  }
  const idx = (weekNumber - 1) % all.length;
  const s = all[idx];
  return s ? [s] : all;
}

export type WorkoutPlanExerciseRow = {
  exerciseName: string;
  sets: number;
  reps: string;
  restTimeSeconds: number;
  notes?: string;
};

/**
 * Flattens selected sessions to workout plan exercise rows (same note-join rules as
 * the former inline extractExercises in workouts/page).
 */
export function buildWorkoutPlanExercises(
  program: ProgramWithSessions,
  weekNumber: number
): WorkoutPlanExerciseRow[] {
  const allSessions = program.sessions || [];
  const sessionsToUse = pickSessionsForAssignmentWeek(program, weekNumber);
  return sessionsToUse.flatMap((session) =>
    (session.exercises || []).map((exercise) => ({
      exerciseName: exercise.exerciseName,
      sets: exercise.sets ?? 1,
      reps: exercise.reps ?? "",
      restTimeSeconds: exercise.restTimeSeconds ?? 0,
      notes:
        [
          session.name && allSessions.length > 1 ? session.name : "",
          exercise.notes || "",
        ]
          .filter(Boolean)
          .join(" — ") || undefined,
    }))
  );
}
