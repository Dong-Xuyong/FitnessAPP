import * as XLSX from "xlsx";
import type { Firestore } from "firebase/firestore";
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import type { TrainingProgramDocument, TrainingProgramSession } from "@/lib/types";
import { trainerTrainingProgramsCollection } from "@/lib/firestore/training-programs";
import {
  fetchCoachLibraryTemplateBuffer,
  fillCoachLibraryTemplate,
  PROGRAM_COACH_NOTES_HEADER,
} from "@/lib/coach-library-excel-template";

export const EXERCISES_SHEET = "Exercises";
export const PROGRAMS_SHEET = "Programs";

export const EXERCISE_VISIBLE_COLUMNS = ["name", "description"] as const;
export const EXERCISE_HIDDEN_COLUMNS = ["id"] as const;
export const PROGRAM_VISIBLE_COLUMNS = [
  "programName",
  "exerciseName",
  PROGRAM_COACH_NOTES_HEADER,
] as const;
export const PROGRAM_HIDDEN_COLUMNS = ["programId", "sessionOrder", "rowKey"] as const;

/** @deprecated Use EXERCISE_VISIBLE_COLUMNS + EXERCISE_HIDDEN_COLUMNS */
export const EXERCISE_COLUMNS = [...EXERCISE_VISIBLE_COLUMNS, ...EXERCISE_HIDDEN_COLUMNS] as const;

export type ExerciseExportRow = {
  id: string;
  name: string;
  description: string;
};

export type ProgramExportRow = {
  programId: string;
  programName: string;
  sessionOrder: number;
  rowKey: string;
  exerciseName: string;
  coachNotes: string;
};

export type ExerciseImportRow = {
  rowIndex: number;
  id: string;
  name: string;
  description: string;
};

export type ProgramImportRow = {
  rowIndex: number;
  programId: string;
  programName: string;
  sessionOrder: number;
  rowKey: string;
  exerciseName: string;
  coachNotes: string;
};

export type ParsedCoachLibraryWorkbook = {
  exerciseRows: ExerciseImportRow[];
  programRows: ProgramImportRow[];
  errors: string[];
};

export type ImportSummary = {
  exercisesUpdated: number;
  exercisesCreated: number;
  exercisesSkipped: number;
  programsUpdated: number;
  programsCreated: number;
  programNotesUpdated: number;
  programsSkipped: number;
  errors: string[];
};

export type CoachLibraryExportInput = {
  exercises: ExerciseExportRow[];
  programs: Array<TrainingProgramDocument & { id: string }>;
};

export type CoachLibraryWorkbookLabels = {
  exercisesInstruction: string;
  programsInstruction: string;
};

const EXERCISE_HEADER_MARKERS = new Set(["name", "nome", "id"]);
const PROGRAM_HEADER_MARKERS = new Set([
  "programname",
  "nomeprograma",
  "nomedoprograma",
  "programid",
  "exercisename",
]);

const EXERCISE_HEADER_ALIASES: Record<string, "id" | "name" | "description"> = {
  id: "id",
  name: "name",
  nome: "name",
  description: "description",
  descrição: "description",
  descricao: "description",
};

const PROGRAM_HEADER_ALIASES: Record<
  string,
  keyof ProgramImportRow | "programDescription" | "sessionName" | "sets" | "reps" | "restSeconds"
> = {
  programid: "programId",
  programname: "programName",
  nomeprograma: "programName",
  nomedoprograma: "programName",
  programdescription: "programDescription",
  descriçãoprograma: "programDescription",
  descricaoprograma: "programDescription",
  sessionorder: "sessionOrder",
  ordemsessão: "sessionOrder",
  ordemsessao: "sessionOrder",
  sessionname: "sessionName",
  nomesessão: "sessionName",
  nomesessao: "sessionName",
  rowkey: "rowKey",
  exercisename: "exerciseName",
  nomeexercício: "exerciseName",
  nomeexercicio: "exerciseName",
  sets: "sets",
  séries: "sets",
  series: "sets",
  reps: "reps",
  repetições: "reps",
  repeticoes: "reps",
  restseconds: "restSeconds",
  descanso: "restSeconds",
  coachnotes: "coachNotes",
  notadotreinador: "coachNotes",
  notasdostreinador: "coachNotes",
  notasdotreinador: "coachNotes",
  notastreinador: "coachNotes",
  notadotreino: "coachNotes",
  notas: "coachNotes",
  notes: "coachNotes",
  observacoes: "coachNotes",
  dica: "coachNotes",
};

function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "");
}

function excelCellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return String(value).trim();
}

function pickCoachNotes(
  mapped: Partial<Record<keyof ProgramImportRow, unknown>>,
  raw: Record<string, unknown>
): string {
  const fromMapped = excelCellText(mapped.coachNotes);
  if (fromMapped) return fromMapped;

  for (const [key, value] of Object.entries(raw)) {
    const field = PROGRAM_HEADER_ALIASES[normalizeHeader(key)];
    if (field === "coachNotes") {
      const text = excelCellText(value);
      if (text) return text;
    }
  }

  const entries = Object.entries(raw);
  if (entries.length >= 3) {
    return excelCellText(entries[2][1]);
  }

  return "";
}

function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase();
}

function findExerciseIndex(
  exercises: TrainingProgramSession["exercises"],
  matchName: string,
  displayName: string
): number {
  const target = normalizeExerciseName(matchName);
  const display = normalizeExerciseName(displayName);
  let idx = exercises.findIndex((ex) => normalizeExerciseName(String(ex.exerciseName ?? "")) === target);
  if (idx === -1 && displayName) {
    idx = exercises.findIndex((ex) => normalizeExerciseName(String(ex.exerciseName ?? "")) === display);
  }
  return idx;
}

type ExerciseImportLocation = {
  session: TrainingProgramSession;
  exIdx: number;
};

function locateExerciseForImportRow(
  sessions: TrainingProgramSession[],
  row: ProgramImportRow,
  programName: string
): ExerciseImportLocation | "append" {
  const [, originalName] = row.rowKey.includes("::")
    ? row.rowKey.split("::", 2)
    : ["", ""];
  const matchName = (originalName || row.exerciseName).trim();
  const displayName = row.exerciseName.trim();

  const matches: ExerciseImportLocation[] = [];
  for (const session of sessions) {
    const exercises = session.exercises ?? [];
    const exIdx = findExerciseIndex(exercises, matchName, displayName);
    if (exIdx >= 0) matches.push({ session, exIdx });
  }

  if (matches.length === 1) return matches[0];

  const preferredSession = sessions.find((s) => (Number(s.order) || 0) === row.sessionOrder);
  if (preferredSession) {
    const exIdx = findExerciseIndex(preferredSession.exercises ?? [], matchName, displayName);
    if (exIdx >= 0) return { session: preferredSession, exIdx };
  }

  if (matches.length > 1) {
    const preferred = matches.find((m) => (Number(m.session.order) || 0) === row.sessionOrder);
    return preferred ?? matches[0];
  }

  const session = ensureSession(sessions, row.sessionOrder, programName);
  return "append";
}

/** Resolve library program id from Excel row (exact name, fuzzy prefix, or unique exercise match). */
export function resolveProgramIdForImportRow(
  row: ProgramImportRow,
  programsById: Map<string, TrainingProgramDocument & { id: string }>,
  programsByName: Map<string, string>
): string {
  if (row.programId && programsById.has(row.programId)) return row.programId;

  const importName = row.programName.trim().toLowerCase();
  if (importName) {
    const exact = programsByName.get(importName);
    if (exact) return exact;

    const fuzzyMatches: string[] = [];
    for (const [id, program] of programsById) {
      const existing = (program.name ?? "").trim().toLowerCase();
      if (!existing) continue;
      if (
        existing === importName ||
        existing.startsWith(`${importName} `) ||
        existing.startsWith(`${importName}-`) ||
        existing.startsWith(`${importName}—`) ||
        importName.startsWith(`${existing} `) ||
        importName.startsWith(`${existing}-`) ||
        importName.startsWith(existing)
      ) {
        fuzzyMatches.push(id);
      }
    }
    if (fuzzyMatches.length === 1) return fuzzyMatches[0];
  }

  const exerciseKey = normalizeExerciseName(row.exerciseName);
  const programsWithExercise: string[] = [];
  for (const [id, program] of programsById) {
    const hasExercise = (program.sessions ?? []).some((session) =>
      (session.exercises ?? []).some(
        (ex) => normalizeExerciseName(String(ex.exerciseName ?? "")) === exerciseKey
      )
    );
    if (hasExercise) programsWithExercise.push(id);
  }
  if (programsWithExercise.length === 1) return programsWithExercise[0];

  return "";
}

function ensureSession(
  sessions: TrainingProgramSession[],
  sessionOrder: number,
  programName: string
): TrainingProgramSession {
  let session = sessions.find((s) => (Number(s.order) || 0) === sessionOrder);
  if (!session) {
    session = {
      order: sessionOrder,
      name: programName || "Main session",
      exercises: [],
    };
    sessions.push(session);
    sessions.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  }
  if (!session.exercises) session.exercises = [];
  return session;
}

function mapRowHeaders<T extends string>(
  raw: Record<string, unknown>,
  aliases: Record<string, T>
): Partial<Record<T, unknown>> {
  const out: Partial<Record<T, unknown>> = {};
  for (const [key, value] of Object.entries(raw)) {
    const mapped = aliases[normalizeHeader(key)] as T | undefined;
    if (mapped) out[mapped] = value;
  }
  return out;
}

function findHeaderRowIndex(sheet: XLSX.WorkSheet, markers: Set<string>): number {
  const ref = sheet["!ref"];
  if (!ref) return 0;
  const range = XLSX.utils.decode_range(ref);
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 15); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      const v = normalizeHeader(cell?.v);
      if (markers.has(v)) return r;
    }
  }
  return 0;
}

function sheetToDataRows(sheet: XLSX.WorkSheet, headerMarkers: Set<string>): Record<string, unknown>[] {
  const headerRow = findHeaderRowIndex(sheet, headerMarkers);
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const dataRange = XLSX.utils.encode_range({
    s: { r: headerRow, c: range.s.c },
    e: { r: range.e.r, c: range.e.c },
  });
  return XLSX.utils.sheet_to_json(sheet, { defval: "", range: dataRange });
}

export function programRowKey(sessionOrder: number, exerciseName: string): string {
  return `${sessionOrder}::${exerciseName}`;
}

export function flattenProgramsForExport(
  programs: Array<TrainingProgramDocument & { id: string }>
): ProgramExportRow[] {
  const rows: ProgramExportRow[] = [];
  for (const program of programs) {
    const sessions = program.sessions ?? [];
    if (sessions.length === 0) continue;
    if (program.programType === "weekly" || program.programType === "sequence") continue;

    for (const session of sessions) {
      const order = Number(session.order) || 0;
      for (const ex of session.exercises ?? []) {
        const exerciseName = String(ex.exerciseName ?? "").trim();
        rows.push({
          programId: program.id,
          programName: program.name ?? "",
          sessionOrder: order,
          rowKey: programRowKey(order, exerciseName),
          exerciseName,
          coachNotes: ex.notes ?? "",
        });
      }
    }
  }
  return rows;
}

export function buildTemplateFillInput(
  input: CoachLibraryExportInput,
  labels: CoachLibraryWorkbookLabels
) {
  return {
    exercisesInstruction: labels.exercisesInstruction,
    programsInstruction: labels.programsInstruction,
    exerciseRows: input.exercises.map(
      (ex) => [ex.name, ex.description, ex.id] as [string, string, string]
    ),
    programRows: flattenProgramsForExport(input.programs).map((r) => [
      r.programName,
      r.exerciseName,
      r.coachNotes,
      r.programId,
      r.sessionOrder,
      r.rowKey,
    ] as [string, string, string, string, number, string]),
  };
}

/** Build export workbook using the stored formatted template (browser). */
export async function buildCoachLibraryWorkbookAsync(
  input: CoachLibraryExportInput,
  labels: CoachLibraryWorkbookLabels
): Promise<ArrayBuffer> {
  const template = await fetchCoachLibraryTemplateBuffer();
  return await fillCoachLibraryTemplate(template, buildTemplateFillInput(input, labels));
}

export function workbookToBlob(buffer: ArrayBuffer): Blob {
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function parseCoachLibraryWorkbook(buffer: ArrayBuffer): ParsedCoachLibraryWorkbook {
  const errors: string[] = [];
  const exerciseRows: ExerciseImportRow[] = [];
  const programRows: ProgramImportRow[] = [];

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array" });
  } catch {
    return { exerciseRows: [], programRows: [], errors: ["invalid_workbook"] };
  }

  const exSheet = wb.Sheets[EXERCISES_SHEET];
  if (exSheet) {
    const headerRow = findHeaderRowIndex(exSheet, EXERCISE_HEADER_MARKERS);
    const rawRows = sheetToDataRows(exSheet, EXERCISE_HEADER_MARKERS);
    rawRows.forEach((raw, i) => {
      const mapped = mapRowHeaders(raw, EXERCISE_HEADER_ALIASES);
      const id = String(mapped.id ?? "").trim();
      const name = String(mapped.name ?? "").trim();
      const description = String(mapped.description ?? "").trim();
      if (!id && !name) return;
      if (EXERCISE_HEADER_MARKERS.has(normalizeHeader(name))) return;
      exerciseRows.push({
        rowIndex: headerRow + i + 2,
        id,
        name,
        description,
      });
    });
  }

  const prSheet =
    wb.Sheets[PROGRAMS_SHEET] ?? wb.Sheets.Programas ?? wb.Sheets.programas;
  if (prSheet) {
    const headerRow = findHeaderRowIndex(prSheet, PROGRAM_HEADER_MARKERS);
    const rawRows = sheetToDataRows(prSheet, PROGRAM_HEADER_MARKERS);
    rawRows.forEach((raw, i) => {
      const mapped = mapRowHeaders(raw, PROGRAM_HEADER_ALIASES);
      const programId = String(mapped.programId ?? "").trim();
      const programName = String(mapped.programName ?? "").trim();
      const exerciseName = String(mapped.exerciseName ?? "").trim();
      if (!programId && !programName) return;
      if (!exerciseName) return;
      if (PROGRAM_HEADER_MARKERS.has(normalizeHeader(programName))) return;

      const sessionOrderNum = Number(mapped.sessionOrder);
      const sessionOrder = Number.isFinite(sessionOrderNum) ? sessionOrderNum : 0;
      const rowKeyRaw = String(mapped.rowKey ?? "").trim();
      const rowKey = rowKeyRaw || programRowKey(sessionOrder, exerciseName);

      programRows.push({
        rowIndex: headerRow + i + 2,
        programId,
        programName,
        sessionOrder,
        rowKey,
        exerciseName,
        coachNotes: pickCoachNotes(mapped, raw),
      });
    });
  }

  if (!exSheet && !prSheet) {
    errors.push("missing_sheets");
  }

  return { exerciseRows, programRows, errors };
}

export function mergeProgramImportRows(
  program: TrainingProgramDocument,
  rows: ProgramImportRow[]
): { sessions: TrainingProgramSession[]; notesUpdated: number; rowsMatched: number } | null {
  if (!rows.length) return null;
  const sessions = JSON.parse(JSON.stringify(program.sessions ?? [])) as TrainingProgramSession[];
  let notesUpdated = 0;
  let rowsMatched = 0;

  for (const row of rows) {
    const located = locateExerciseForImportRow(sessions, row, program.name ?? "");
    if (located === "append") {
      const session = ensureSession(sessions, row.sessionOrder, program.name ?? "");
      session.exercises.push({
        exerciseName: row.exerciseName.trim(),
        sets: 1,
        reps: "",
        restTimeSeconds: 0,
        notes: row.coachNotes,
      });
      rowsMatched++;
      notesUpdated++;
      continue;
    }

    rowsMatched++;
    const ex = located.session.exercises[located.exIdx];
    const [, originalName] = row.rowKey.includes("::")
      ? row.rowKey.split("::", 2)
      : ["", ""];
    const matchName = (originalName || row.exerciseName).trim();
    if (row.exerciseName && row.exerciseName.trim() !== matchName) {
      ex.exerciseName = row.exerciseName.trim();
    }
    ex.notes = row.coachNotes;
    notesUpdated++;
  }

  return { sessions, notesUpdated, rowsMatched };
}

function buildProgramsByNameMap(
  programsById: Map<string, TrainingProgramDocument & { id: string }>
): Map<string, string> {
  const byName = new Map<string, string>();
  for (const [id, p] of programsById) {
    const key = (p.name ?? "").trim().toLowerCase();
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, id);
  }
  return byName;
}

export function partitionProgramImportRows(
  rows: ProgramImportRow[],
  programsById: Map<string, TrainingProgramDocument & { id: string }>,
  programsByName: Map<string, string>
): { updateRows: ProgramImportRow[]; createRows: ProgramImportRow[]; skipped: number } {
  const updateRows: ProgramImportRow[] = [];
  const createRows: ProgramImportRow[] = [];
  let skipped = 0;

  for (const row of rows) {
    if (!row.programName.trim() || !row.exerciseName.trim()) {
      skipped++;
      continue;
    }
    const programId = resolveProgramIdForImportRow(row, programsById, programsByName);
    if (programId && programsById.has(programId)) {
      updateRows.push({ ...row, programId });
    } else {
      createRows.push(row);
    }
  }

  return { updateRows, createRows, skipped };
}

/** @deprecated Use partitionProgramImportRows */
export function resolveProgramImportRows(
  rows: ProgramImportRow[],
  programsById: Map<string, TrainingProgramDocument & { id: string }>,
  programsByName: Map<string, string>
): { rows: ProgramImportRow[]; skipped: number } {
  const { updateRows, createRows, skipped } = partitionProgramImportRows(rows, programsById, programsByName);
  return { rows: [...updateRows, ...createRows], skipped };
}

export function buildSessionsFromImportRows(
  programName: string,
  rows: ProgramImportRow[]
): TrainingProgramSession[] {
  const title = programName.trim() || "Main session";
  return [
    {
      order: 0,
      name: title,
      exercises: rows.map((row) => ({
        exerciseName: row.exerciseName.trim(),
        sets: 1,
        reps: "",
        restTimeSeconds: 0,
        notes: row.coachNotes,
      })),
    },
  ];
}

export async function applyProgramImportCreates(
  db: Firestore,
  trainerId: string,
  rows: ProgramImportRow[]
): Promise<{ programsCreated: number; exercisesAdded: number; skipped: number }> {
  const byProgramName = new Map<string, ProgramImportRow[]>();
  let skipped = 0;

  for (const row of rows) {
    if (!row.programName.trim() || !row.exerciseName.trim()) {
      skipped++;
      continue;
    }
    const key = row.programName.trim().toLowerCase();
    const list = byProgramName.get(key) ?? [];
    list.push(row);
    byProgramName.set(key, list);
  }

  let programsCreated = 0;
  let exercisesAdded = 0;
  const now = new Date().toISOString();
  const col = trainerTrainingProgramsCollection(db, trainerId);

  for (const groupRows of byProgramName.values()) {
    const name = groupRows[0].programName.trim();
    await addDoc(col, {
      trainerId,
      name,
      sessions: buildSessionsFromImportRows(name, groupRows),
      createdAt: now,
      updatedAt: now,
    });
    programsCreated++;
    exercisesAdded += groupRows.length;
  }

  return { programsCreated, exercisesAdded, skipped };
}

export async function fetchCoachLibraryForExport(
  db: Firestore,
  trainerId: string
): Promise<CoachLibraryExportInput> {
  const [exSnap, prSnap] = await Promise.all([
    getDocs(query(collection(db, "exercises"), where("createdBy", "==", trainerId))),
    getDocs(trainerTrainingProgramsCollection(db, trainerId)),
  ]);

  const exercises: ExerciseExportRow[] = exSnap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: String(data.name ?? ""),
        description: String(data.description ?? ""),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const programs = prSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as TrainingProgramDocument) }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return { exercises, programs };
}

function buildExerciseNameIndex(
  existingById: Map<string, { id: string; name: string; createdBy?: string }>,
  trainerId: string
): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  for (const [id, ex] of existingById) {
    if (ex.createdBy !== trainerId) continue;
    const key = ex.name.trim().toLowerCase();
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push(id);
    byName.set(key, list);
  }
  return byName;
}

export function partitionExerciseImportRows(
  rows: ExerciseImportRow[],
  existingById: Map<string, { id: string; name: string; createdBy?: string }>,
  trainerId: string
): { updateRows: ExerciseImportRow[]; createRows: ExerciseImportRow[]; skipped: number } {
  const byName = buildExerciseNameIndex(existingById, trainerId);
  const updateRows: ExerciseImportRow[] = [];
  const createRows: ExerciseImportRow[] = [];
  let skipped = 0;

  for (const row of rows) {
    if (!row.name.trim()) {
      skipped++;
      continue;
    }
    let targetId: string | undefined;
    if (row.id && existingById.has(row.id)) {
      const ex = existingById.get(row.id)!;
      if (ex.createdBy === trainerId) targetId = row.id;
    }
    if (!targetId) {
      const matches = byName.get(row.name.trim().toLowerCase()) ?? [];
      if (matches.length === 1) targetId = matches[0];
      else if (matches.length > 1) {
        skipped++;
        continue;
      }
    }
    if (targetId) {
      updateRows.push({ ...row, id: targetId });
    } else {
      createRows.push(row);
    }
  }

  return { updateRows, createRows, skipped };
}

export async function applyExerciseImportCreates(
  db: Firestore,
  trainerId: string,
  rows: ExerciseImportRow[]
): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  const col = collection(db, "exercises");

  for (const row of rows) {
    if (!row.name.trim()) {
      skipped++;
      continue;
    }
    await addDoc(col, {
      name: row.name.trim(),
      description: row.description ?? "",
      category: "Other",
      difficulty: "intermediate",
      equipment: "",
      videoUrl: "",
      createdBy: trainerId,
      createdAt: now,
      updatedAt: now,
    });
    created++;
  }

  return { created, skipped };
}

export async function applyExerciseImportUpdates(
  db: Firestore,
  trainerId: string,
  rows: ExerciseImportRow[],
  existingById: Map<string, { id: string; name: string; createdBy?: string }>
): Promise<{ updated: number; skipped: number }> {
  let updated = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const row of rows) {
    const targetId = row.id;
    if (!targetId || !existingById.has(targetId)) {
      skipped++;
      continue;
    }
    const ex = existingById.get(targetId)!;
    if (ex.createdBy !== trainerId) {
      skipped++;
      continue;
    }

    const patch: Record<string, string> = { updatedAt: now };
    if (row.name) patch.name = row.name.trim();
    patch.description = row.description ?? "";

    await updateDoc(doc(db, "exercises", targetId), patch);
    updated++;
  }

  return { updated, skipped };
}

export async function applyProgramImportUpdates(
  db: Firestore,
  trainerId: string,
  rows: ProgramImportRow[],
  programsById: Map<string, TrainingProgramDocument & { id: string }>
): Promise<{ programsUpdated: number; notesUpdated: number; skipped: number }> {
  const byProgram = new Map<string, ProgramImportRow[]>();
  for (const row of rows) {
    const list = byProgram.get(row.programId) ?? [];
    list.push(row);
    byProgram.set(row.programId, list);
  }

  let programsUpdated = 0;
  let notesUpdated = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const [programId, groupRows] of byProgram) {
    const program = programsById.get(programId);
    if (!program) {
      skipped += groupRows.length;
      continue;
    }

    const merged = mergeProgramImportRows(program, groupRows);
    if (!merged || merged.rowsMatched === 0) {
      skipped += groupRows.length;
      continue;
    }

    skipped += groupRows.length - merged.rowsMatched;

    await updateDoc(doc(db, "personalTrainers", trainerId, "personalTrainingPrograms", programId), {
      sessions: merged.sessions,
      updatedAt: now,
    });
    programsUpdated++;
    notesUpdated += merged.notesUpdated;
  }

  return { programsUpdated, notesUpdated, skipped };
}

export async function runCoachLibraryImport(
  db: Firestore,
  trainerId: string,
  parsed: ParsedCoachLibraryWorkbook
): Promise<ImportSummary> {
  const [exSnap, prSnap] = await Promise.all([
    getDocs(query(collection(db, "exercises"), where("createdBy", "==", trainerId))),
    getDocs(trainerTrainingProgramsCollection(db, trainerId)),
  ]);

  const existingById = new Map<string, { id: string; name: string; createdBy?: string }>();
  for (const d of exSnap.docs) {
    const data = d.data();
    existingById.set(d.id, {
      id: d.id,
      name: String(data.name ?? ""),
      createdBy: data.createdBy as string | undefined,
    });
  }

  const programsById = new Map<string, TrainingProgramDocument & { id: string }>();
  for (const d of prSnap.docs) {
    programsById.set(d.id, { id: d.id, ...(d.data() as TrainingProgramDocument) });
  }

  const programsByName = buildProgramsByNameMap(programsById);
  const { updateRows, createRows, skipped: partitionSkipped } = partitionProgramImportRows(
    parsed.programRows,
    programsById,
    programsByName
  );

  const { updateRows: exerciseUpdateRows, createRows: exerciseCreateRows, skipped: exercisePartitionSkipped } =
    partitionExerciseImportRows(parsed.exerciseRows, existingById, trainerId);

  const exUpdateResult = await applyExerciseImportUpdates(
    db,
    trainerId,
    exerciseUpdateRows,
    existingById
  );
  const exCreateResult = await applyExerciseImportCreates(db, trainerId, exerciseCreateRows);
  const prUpdateResult = await applyProgramImportUpdates(
    db,
    trainerId,
    updateRows,
    programsById
  );
  const prCreateResult = await applyProgramImportCreates(db, trainerId, createRows);

  return {
    exercisesUpdated: exUpdateResult.updated,
    exercisesCreated: exCreateResult.created,
    exercisesSkipped: exUpdateResult.skipped + exercisePartitionSkipped + exCreateResult.skipped,
    programsUpdated: prUpdateResult.programsUpdated,
    programsCreated: prCreateResult.programsCreated,
    programNotesUpdated: prUpdateResult.notesUpdated,
    programsSkipped: prUpdateResult.skipped + partitionSkipped + prCreateResult.skipped,
    errors: parsed.errors,
  };
}

export function downloadCoachLibraryWorkbook(buffer: ArrayBuffer, filename?: string): void {
  const name = filename ?? `coach-library-${new Date().toISOString().slice(0, 10)}.xlsx`;
  const blob = workbookToBlob(buffer);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
