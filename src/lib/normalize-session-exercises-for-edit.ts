/** Rows used by EditWorkoutSessionDialog (coach may edit per-set weight/reps only; name is read-only in UI). */
export type EditSessionExerciseRow = {
  name: string;
  sets: { weight: number; reps: number }[];
};

/** Maps Firestore `workoutSessions.exercises` into editable rows. */
export function normalizeSessionExercisesForEdit(exercises: unknown): EditSessionExerciseRow[] {
  const raw = Array.isArray(exercises) ? exercises : [];
  return raw.map((ex) => {
    const row = ex as Record<string, unknown>;
    const sets = row.sets;
    if (Array.isArray(sets) && sets.length > 0) {
      return {
        name: String(row.exerciseName || row.name || "").trim(),
        sets: sets.map((s) => {
          const sr = s as Record<string, unknown>;
          return {
            weight: Number(sr.weight) || 0,
            reps: Number(sr.reps) || 0,
          };
        }),
      };
    }
    const n = Math.max(1, Number(sets) || 1);
    return {
      name: String(row.exerciseName || row.name || "").trim(),
      sets: Array.from({ length: n }, () => ({
        weight: Number(row.weight) || 0,
        reps: Number(row.reps) || 0,
      })),
    };
  });
}
