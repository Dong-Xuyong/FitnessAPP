import type { Firestore } from "firebase/firestore";
import { addDoc, deleteDoc, doc } from "firebase/firestore";
import type { TrainingProgramDocument } from "@/lib/types";
import { writeStudentSequencePlans } from "@/lib/workout-plan-sequence";
import {
  reconcileSequenceProgramIds,
} from "@/lib/firestore/default-student-sequence";
import { trainerTrainingProgramsCollection } from "@/lib/firestore/training-programs";

export type SequenceTemplateSummary = {
  id: string;
  name: string;
  sourceProgramIds: string[];
  sourceProgramNames: string[];
  sequenceRepeatCycles: number;
};

export function isSavedSequenceTemplateDoc(data: Record<string, unknown>): boolean {
  return data.programType === "sequence" && data.isDefaultStudentSequence !== true;
}

export function parseSequenceTemplateFromDoc(
  id: string,
  data: Record<string, unknown>
): SequenceTemplateSummary | null {
  if (!isSavedSequenceTemplateDoc(data)) return null;

  const sourceProgramIds = Array.isArray(data.sourceProgramIds)
    ? (data.sourceProgramIds as string[]).filter(Boolean)
    : [];
  if (sourceProgramIds.length < 2) return null;

  const sourceProgramNames = Array.isArray(data.sourceProgramNames)
    ? (data.sourceProgramNames as string[])
    : [];

  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : id;

  return {
    id,
    name,
    sourceProgramIds,
    sourceProgramNames,
    sequenceRepeatCycles: Math.max(1, Number(data.sequenceRepeatCycles) || 1),
  };
}

export function listSequenceTemplatesFromPrograms(
  programs: Array<Record<string, unknown> & { id: string }>
): SequenceTemplateSummary[] {
  return programs
    .map((p) => parseSequenceTemplateFromDoc(p.id, p))
    .filter((t): t is SequenceTemplateSummary => t !== null)
    .sort((a, b) => b.name.localeCompare(a.name));
}

/** Saves a reusable sequence template (not the single default student sequence). */
export async function createSequenceTemplate(
  db: Firestore,
  trainerId: string,
  payload: {
    name?: string;
    orderedIds: string[];
    cycles: number;
    sourceProgramNames: string[];
    defaultName: string;
  }
): Promise<string> {
  if (payload.orderedIds.length < 2) {
    throw new Error("SEQUENCE_TEMPLATE_NEED_TWO");
  }

  const now = new Date().toISOString();
  const cycles = Math.max(1, Math.floor(payload.cycles) || 1);
  const title = payload.name?.trim() || payload.defaultName;

  const ref = await addDoc(trainerTrainingProgramsCollection(db, trainerId), {
    trainerId,
    name: title,
    description: "Reusable program order and cycle count.",
    category: "Sequence",
    level: "all",
    sessions: [],
    programType: "sequence",
    sourceProgramIds: payload.orderedIds,
    sourceProgramNames: payload.sourceProgramNames,
    sequenceRepeatCycles: cycles,
    createdAt: now,
    updatedAt: now,
  });

  return ref.id;
}

export async function deleteSequenceTemplate(
  db: Firestore,
  trainerId: string,
  templateId: string
): Promise<void> {
  await deleteDoc(doc(trainerTrainingProgramsCollection(db, trainerId), templateId));
}

/** Assigns a saved library template to a student's workout plan chain. */
export async function applySequenceTemplateToStudent(
  db: Firestore,
  trainerId: string,
  template: SequenceTemplateSummary,
  studentStorageId: string,
  assignablePrograms: Array<TrainingProgramDocument & { id: string }>
): Promise<{ appended: boolean }> {
  const orderedIds = reconcileSequenceProgramIds(
    template.sourceProgramIds,
    template.sourceProgramNames,
    assignablePrograms
  );

  const programsInOrder = orderedIds
    .map((pid) => assignablePrograms.find((p) => p.id === pid))
    .filter(Boolean) as Array<TrainingProgramDocument & { id: string }>;

  if (programsInOrder.length !== orderedIds.length) {
    throw new Error("SEQUENCE_TEMPLATE_PROGRAMS_MISSING");
  }

  return writeStudentSequencePlans(
    db,
    trainerId,
    studentStorageId,
    programsInOrder,
    template.sequenceRepeatCycles
  );
}
