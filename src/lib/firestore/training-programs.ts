import type { CollectionReference, Firestore } from "firebase/firestore";
import { collection, getDocs } from "firebase/firestore";
import type { TrainingProgramSession } from "@/lib/types";
import { DEFAULT_TRAINING_PROGRAMS } from "@/lib/default-programs";
import { addDocumentNonBlocking } from "@/firebase";

/** Subcollection under each trainer: personalTrainers/{trainerId}/personalTrainingPrograms */
export const TRAINER_TRAINING_PROGRAMS_COLLECTION = "personalTrainingPrograms";

export function trainerTrainingProgramsCollection(
  db: Firestore,
  trainerId: string
): CollectionReference {
  return collection(db, "personalTrainers", trainerId, TRAINER_TRAINING_PROGRAMS_COLLECTION);
}

export function trainerTrainingProgramsQuery(
  db: Firestore,
  trainerId: string
): CollectionReference {
  return trainerTrainingProgramsCollection(db, trainerId);
}

/** Same as {@link trainerTrainingProgramsQuery}; kept for existing call sites. */
export function trainingProgramsRef(db: Firestore, trainerId: string): CollectionReference {
  return trainerTrainingProgramsQuery(db, trainerId);
}

export function buildTrainingProgramSessionsFromBuilder(
  sessionName: string,
  exercises: Array<{
    name: string;
    sets: number | string;
    reps: string;
    rest: number | string;
    weight?: number | string;
    setDetails?: Array<{
      reps: string;
      rest: number | string;
      weight?: number | string;
    }>;
    notes: string;
  }>
): TrainingProgramSession[] {
  return [
    {
      order: 0,
      name: sessionName || "Main session",
      exercises: exercises.map((ex) => {
        const targetWeightKg =
          ex.setDetails?.[0]?.weight === "" || ex.setDetails?.[0]?.weight == null
            ? (ex.weight === "" || ex.weight == null ? undefined : Number(ex.weight))
            : Number(ex.setDetails[0].weight);

        const setDetails = ex.setDetails?.map((set, index) => ({
          setNumber: index + 1,
          reps: String(set.reps),
          ...(set.weight === "" || set.weight == null ? {} : { targetWeightKg: Number(set.weight) }),
          restTimeSeconds: Number(set.rest),
        }));

        return {
          exerciseName: ex.name,
          sets: ex.setDetails?.length || Number(ex.sets),
          reps: String(ex.setDetails?.[0]?.reps ?? ex.reps),
          restTimeSeconds: Number(ex.setDetails?.[0]?.rest ?? ex.rest),
          ...(targetWeightKg == null ? {} : { targetWeightKg }),
          ...(setDetails?.length ? { setDetails } : {}),
          ...(ex.notes ? { notes: ex.notes } : {}),
        };
      }),
    },
  ];
}

export function totalExercisesInProgram(
  sessions: TrainingProgramSession[] | undefined
): number {
  if (!sessions?.length) return 0;
  return sessions.reduce((n, s) => n + (s.exercises?.length ?? 0), 0);
}

export async function initializeDefaultPrograms(
  db: Firestore,
  trainerId: string
): Promise<{ success: boolean; message: string; count?: number }> {
  try {
    const programsCol = trainerTrainingProgramsCollection(db, trainerId);
    const existing = await getDocs(programsCol);

    if (existing.size > 0) {
      return {
        success: true,
        message: `You already have ${existing.size} programs in your library.`,
        count: existing.size,
      };
    }

    const now = new Date().toISOString();
    let added = 0;

    for (const program of DEFAULT_TRAINING_PROGRAMS) {
      try {
        await addDocumentNonBlocking(programsCol, {
          trainerId,
          name: program.name,
          description: program.description,
          category: program.category,
          level: program.level,
          durationWeeks: program.durationWeeks,
          sessions: program.sessions,
          createdAt: now,
          updatedAt: now,
        });
        added++;
      } catch (error) {
        console.error(`Failed to add program: ${program.name}`, error);
      }
    }

    return {
      success: true,
      message: `Successfully added ${added} default training programs!`,
      count: added,
    };
  } catch (error) {
    console.error("Failed to initialize default programs:", error);
    return {
      success: false,
      message: "Failed to initialize programs. Please try again.",
    };
  }
}
