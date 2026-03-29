import type { CollectionReference, Firestore } from "firebase/firestore";
import { collection } from "firebase/firestore";
import type { TrainingProgramSession } from "@/lib/types";

export const TRAINING_PROGRAMS_SUBCOLLECTION = "trainingPrograms";

export function trainingProgramsRef(
  db: Firestore,
  trainerId: string
): CollectionReference {
  return collection(
    db,
    "personalTrainers",
    trainerId,
    TRAINING_PROGRAMS_SUBCOLLECTION
  );
}

export function buildTrainingProgramSessionsFromBuilder(
  sessionName: string,
  exercises: Array<{
    name: string;
    sets: number | string;
    reps: string;
    rest: number | string;
    notes: string;
  }>
): TrainingProgramSession[] {
  return [
    {
      order: 0,
      name: sessionName || "Main session",
      exercises: exercises.map((ex) => ({
        exerciseName: ex.name,
        sets: Number(ex.sets),
        reps: String(ex.reps),
        restTimeSeconds: Number(ex.rest),
        notes: ex.notes || undefined,
      })),
    },
  ];
}

export function totalExercisesInProgram(
  sessions: TrainingProgramSession[] | undefined
): number {
  if (!sessions?.length) return 0;
  return sessions.reduce((n, s) => n + (s.exercises?.length ?? 0), 0);
}
