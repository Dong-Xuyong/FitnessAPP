import type { Firestore } from "firebase/firestore";
import { doc, getDocs, setDoc } from "firebase/firestore";
import type { TrainingProgramDocument } from "@/lib/types";
import { writeStudentSequencePlans } from "@/lib/workout-plan-sequence";
import {
  trainerTrainingProgramsCollection,
  trainingProgramsRef,
} from "@/lib/firestore/training-programs";

export type DefaultStudentSequenceProgram = {
  id: string;
  sourceProgramIds: string[];
  sourceProgramNames: string[];
  sequenceRepeatCycles: number;
};

export class DefaultStudentSequenceNotConfiguredError extends Error {
  constructor() {
    super("DEFAULT_STUDENT_SEQUENCE_NOT_CONFIGURED");
    this.name = "DefaultStudentSequenceNotConfiguredError";
  }
}

function isDefaultStudentSequenceDoc(data: Record<string, unknown>): boolean {
  return data.programType === "sequence" && data.isDefaultStudentSequence === true;
}

/** Loads the trainer's single default student sequence template, if configured. */
export async function getDefaultStudentSequenceProgram(
  db: Firestore,
  trainerId: string
): Promise<DefaultStudentSequenceProgram | null> {
  const snap = await getDocs(trainerTrainingProgramsCollection(db, trainerId));
  const match = snap.docs.find((d) => isDefaultStudentSequenceDoc(d.data() as Record<string, unknown>));
  if (!match) return null;

  const data = match.data();
  const sourceProgramIds = Array.isArray(data.sourceProgramIds)
    ? (data.sourceProgramIds as string[]).filter(Boolean)
    : [];
  if (sourceProgramIds.length < 2) return null;

  const sourceProgramNames = Array.isArray(data.sourceProgramNames)
    ? (data.sourceProgramNames as string[])
    : [];

  return {
    id: match.id,
    sourceProgramIds,
    sourceProgramNames,
    sequenceRepeatCycles: Math.max(1, Number(data.sequenceRepeatCycles) || 1),
  };
}

/** Creates or updates the one default sequence template for this trainer. */
export async function upsertDefaultStudentSequenceProgram(
  db: Firestore,
  trainerId: string,
  payload: { orderedIds: string[]; cycles: number; sourceProgramNames: string[] }
): Promise<void> {
  if (payload.orderedIds.length < 2) {
    throw new Error("DEFAULT_STUDENT_SEQUENCE_NEED_TWO");
  }

  const existing = await getDefaultStudentSequenceProgram(db, trainerId);
  const now = new Date().toISOString();
  const cycles = Math.max(1, Math.floor(payload.cycles) || 1);

  const docData: Record<string, unknown> = {
    trainerId,
    name: "Default student sequence",
    description: "Predefined program order applied to students from Programs or the student profile.",
    category: "Sequence",
    level: "all",
    sessions: [],
    programType: "sequence",
    isDefaultStudentSequence: true,
    sourceProgramIds: payload.orderedIds,
    sourceProgramNames: payload.sourceProgramNames,
    sequenceRepeatCycles: cycles,
    updatedAt: now,
  };

  if (existing) {
    await setDoc(doc(trainingProgramsRef(db, trainerId), existing.id), docData, { merge: true });
    return;
  }

  await setDoc(doc(trainingProgramsRef(db, trainerId)), {
    ...docData,
    createdAt: now,
  });
}

/** Applies the default sequence template to a student's workoutPlans (appends if chain exists). */
export async function applyDefaultStudentSequenceToStudent(
  db: Firestore,
  trainerId: string,
  studentStorageId: string,
  assignablePrograms: Array<TrainingProgramDocument & { id: string }>
): Promise<{ appended: boolean }> {
  const def = await getDefaultStudentSequenceProgram(db, trainerId);
  if (!def) throw new DefaultStudentSequenceNotConfiguredError();

  const programsInOrder = def.sourceProgramIds
    .map((pid) => assignablePrograms.find((p) => p.id === pid))
    .filter(Boolean) as Array<TrainingProgramDocument & { id: string }>;

  if (programsInOrder.length !== def.sourceProgramIds.length) {
    throw new Error("DEFAULT_STUDENT_SEQUENCE_PROGRAMS_MISSING");
  }

  return writeStudentSequencePlans(
    db,
    trainerId,
    studentStorageId,
    programsInOrder,
    def.sequenceRepeatCycles
  );
}
