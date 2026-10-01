import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import type { TrainingProgramDocument } from "@/lib/types";
import ExcelJS from "exceljs";
import { fillCoachLibraryTemplate } from "./coach-library-excel-template";
import { loadCoachLibraryTemplateBuffer } from "./coach-library-excel-template.node";
import {
  EXERCISES_SHEET,
  PROGRAMS_SHEET,
  buildSessionsFromImportRows,
  buildTemplateFillInput,
  flattenProgramsForExport,
  mergeProgramImportRows,
  parseCoachLibraryWorkbook,
  partitionExerciseImportRows,
  partitionProgramImportRows,
  programRowKey,
  resolveProgramIdForImportRow,
  type CoachLibraryExportInput,
  type CoachLibraryWorkbookLabels,
} from "./coach-library-excel";

async function buildCoachLibraryWorkbook(
  input: CoachLibraryExportInput,
  labels: CoachLibraryWorkbookLabels
): Promise<ArrayBuffer> {
  return fillCoachLibraryTemplate(
    loadCoachLibraryTemplateBuffer(),
    buildTemplateFillInput(input, labels)
  );
}

const LABELS = {
  exercisesInstruction: "Add exercise rows below.",
  programsInstruction: "Add program rows below.",
};

describe("coach-library-excel", () => {
  it("builds export from formatted template with name, description, video URL, and id", async () => {
    const buffer = await buildCoachLibraryWorkbook(
      {
        exercises: [
          {
            id: "ex1",
            name: "Bench Press",
            description: "Flat bench",
            videoUrl: "https://www.youtube.com/shorts/example123",
          },
        ],
        programs: [],
      },
      LABELS
    );
    const wb = XLSX.read(buffer, { type: "array" });
    const exSheet = wb.Sheets[EXERCISES_SHEET]!;
    assert.ok(String(exSheet.A1?.v).includes("Add exercise"));
    assert.equal(exSheet.A3?.v, "name");
    assert.equal(exSheet.B3?.v, "description");
    assert.equal(exSheet.C3?.v, "videoUrl");
    assert.equal(exSheet.D3?.v, "id");
    assert.equal(exSheet.A4?.v, "Bench Press");
    assert.equal(exSheet.C4?.v, "https://www.youtube.com/shorts/example123");
    assert.equal(exSheet.D4?.v, "ex1");
    assert.ok(String(exSheet.A1?.v).includes("Add exercise"));

    const wbStyled = new ExcelJS.Workbook();
    await wbStyled.xlsx.load(buffer);
    const exStyled = wbStyled.getWorksheet(EXERCISES_SHEET)!;
    assert.equal(exStyled.getColumn(4).hidden, true);
    assert.equal(exStyled.getRow(4).height, 24);
  });

  it("parses exercise rows after instruction and header rows", async () => {
    const buffer = await buildCoachLibraryWorkbook(
      {
        exercises: [
          {
            id: "ex1",
            name: "Bench Press",
            description: "Flat bench",
            videoUrl: "https://www.youtube.com/shorts/example123",
          },
        ],
        programs: [],
      },
      LABELS
    );
    const parsed = parseCoachLibraryWorkbook(buffer);
    assert.equal(parsed.exerciseRows.length, 1);
    assert.equal(parsed.exerciseRows[0].name, "Bench Press");
    assert.equal(parsed.exerciseRows[0].description, "Flat bench");
    assert.equal(parsed.exerciseRows[0].videoUrl, "https://www.youtube.com/shorts/example123");
  });

  it("flattens program sessions with rowKey only", () => {
    const program: TrainingProgramDocument & { id: string } = {
      id: "p1",
      trainerId: "t1",
      name: "Push Day",
      description: "Chest focus",
      sessions: [
        {
          order: 0,
          name: "Main",
          exercises: [
            {
              exerciseName: "Push-up",
              sets: 3,
              reps: "10",
              restTimeSeconds: 60,
              notes: "Full ROM",
            },
          ],
        },
      ],
      createdAt: "",
      updatedAt: "",
    };
    const rows = flattenProgramsForExport([program]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].rowKey, programRowKey(0, "Push-up"));
    assert.equal(rows[0].coachNotes, "Full ROM");
    assert.equal(rows[0].programId, "p1");
  });

  it("exports programs with Notas do Treinador column and metadata", async () => {
    const program: TrainingProgramDocument & { id: string } = {
      id: "p1",
      trainerId: "t1",
      name: "Push Day",
      sessions: [
        {
          order: 0,
          name: "Main",
          exercises: [
            { exerciseName: "Push-up", sets: 3, reps: "10", restTimeSeconds: 60, notes: "Note" },
          ],
        },
      ],
      createdAt: "",
      updatedAt: "",
    };
    const buffer = await buildCoachLibraryWorkbook({ exercises: [], programs: [program] }, LABELS);
    const wb = XLSX.read(buffer, { type: "array" });
    const prSheet = wb.Sheets[PROGRAMS_SHEET]!;
    assert.equal(prSheet.A3?.v, "programName");
    assert.equal(prSheet.C3?.v, "Notas do Treinador");
    assert.equal(prSheet.D3?.v, "programId");
    assert.equal(prSheet.A4?.v, "Push Day");
    assert.equal(prSheet.D4?.v, "p1");
    const parsed = parseCoachLibraryWorkbook(buffer);
    assert.equal(parsed.programRows.length, 1);
    assert.equal(parsed.programRows[0].programId, "p1");
    assert.equal(parsed.programRows[0].coachNotes, "Note");
  });

  it("mergeProgramImportRows updates notes only, not program title", () => {
    const program: TrainingProgramDocument & { id: string } = {
      id: "p1",
      trainerId: "t1",
      name: "Old Name",
      description: "Old desc",
      sessions: [
        {
          order: 0,
          name: "Main",
          exercises: [
            {
              exerciseName: "Squat",
              sets: 5,
              reps: "5",
              restTimeSeconds: 120,
              notes: "Old note",
            },
          ],
        },
      ],
      createdAt: "",
      updatedAt: "",
    };

    const merged = mergeProgramImportRows(program, [
      {
        rowIndex: 4,
        programId: "p1",
        programName: "New Name",
        sessionOrder: 0,
        rowKey: programRowKey(0, "Squat"),
        exerciseName: "Back Squat",
        coachNotes: "Brace core",
      },
    ]);

    assert.ok(merged);
    assert.equal(program.name, "Old Name");
    assert.equal(merged!.sessions[0].exercises[0].exerciseName, "Back Squat");
    assert.equal(merged!.sessions[0].exercises[0].notes, "Brace core");
    assert.equal(merged!.sessions[0].exercises[0].sets, 5);
    assert.equal(merged!.sessions[0].exercises[0].reps, "5");
  });

  it("partitions new exercise names for create", () => {
    const existingById = new Map([
      [
        "ex1",
        { id: "ex1", name: "Bench Press", createdBy: "trainer-1" },
      ],
    ]);
    const { updateRows, createRows } = partitionExerciseImportRows(
      [
        { rowIndex: 4, id: "", name: "Test", description: "New move", videoUrl: "" },
        { rowIndex: 5, id: "", name: "Bench Press", description: "Updated", videoUrl: "" },
      ],
      existingById,
      "trainer-1"
    );
    assert.equal(createRows.length, 1);
    assert.equal(createRows[0].name, "Test");
    assert.equal(updateRows.length, 1);
    assert.equal(updateRows[0].id, "ex1");
  });

  it("partitions unknown program names for create", () => {
    const programsById = new Map<string, TrainingProgramDocument & { id: string }>([
      [
        "p1",
        {
          id: "p1",
          trainerId: "t1",
          name: "Existing",
          sessions: [],
          createdAt: "",
          updatedAt: "",
        },
      ],
    ]);
    const programsByName = new Map([["existing", "p1"]]);
    const { updateRows, createRows } = partitionProgramImportRows(
      [
        {
          rowIndex: 2,
          programId: "",
          programName: "Volume Dip",
          sessionOrder: 0,
          rowKey: "0::Dip",
          exerciseName: "Dip",
          coachNotes: "3x6",
        },
        {
          rowIndex: 3,
          programId: "p1",
          programName: "Existing",
          sessionOrder: 0,
          rowKey: programRowKey(0, "Squat"),
          exerciseName: "Squat",
          coachNotes: "5x5",
        },
      ],
      programsById,
      programsByName
    );
    assert.equal(createRows.length, 1);
    assert.equal(createRows[0].programName, "Volume Dip");
    assert.equal(updateRows.length, 1);
    const sessions = buildSessionsFromImportRows("Volume Dip", createRows);
    assert.equal(sessions[0].exercises[0].exerciseName, "Dip");
    assert.equal(sessions[0].exercises[0].notes, "3x6");
  });

  it("resolves fuzzy program names and unique exercise match", () => {
    const programsById = new Map<string, TrainingProgramDocument & { id: string }>([
      [
        "p1",
        {
          id: "p1",
          trainerId: "t1",
          name: "Treino A - Back & Arms",
          sessions: [
            {
              order: 0,
              name: "Treino A",
              exercises: [
                {
                  exerciseName: "Remada T",
                  sets: 3,
                  reps: "10",
                  restTimeSeconds: 90,
                },
              ],
            },
          ],
          createdAt: "",
          updatedAt: "",
        },
      ],
    ]);
    const programsByName = new Map([["treino a - back & arms", "p1"]]);
    const row = {
      rowIndex: 4,
      programId: "",
      programName: "Treino A",
      sessionOrder: 0,
      rowKey: programRowKey(0, "Remada T"),
      exerciseName: "Remada T",
      coachNotes: "4 séries x 10 reps | Descanso: 90 seg",
    };
    assert.equal(resolveProgramIdForImportRow(row, programsById, programsByName), "p1");
    const merged = mergeProgramImportRows(programsById.get("p1")!, [row]);
    assert.equal(merged?.sessions[0].exercises[0].notes, "4 séries x 10 reps | Descanso: 90 seg");
  });

  it("parses program rows with only name, exercise, and coachNotes columns", () => {
    const wb = XLSX.utils.book_new();
    const aoa = [
      ["Instructions", "", ""],
      ["", "", ""],
      ["programName", "exerciseName", "coachNotes"],
      ["Volume Dip", "Dip", "3x6 slow eccentric"],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, sheet, PROGRAMS_SHEET);
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const parsed = parseCoachLibraryWorkbook(buffer);
    assert.equal(parsed.programRows.length, 1);
    assert.equal(parsed.programRows[0].programName, "Volume Dip");
    assert.equal(parsed.programRows[0].coachNotes, "3x6 slow eccentric");
    assert.equal(parsed.programRows[0].rowKey, programRowKey(0, "Dip"));
    assert.equal(parsed.errors.length, 0);
  });

  it("imports coach notes into program exercise notes for the builder", () => {
    const program: TrainingProgramDocument & { id: string } = {
      id: "p1",
      trainerId: "t1",
      name: "Volume Dip",
      sessions: [
        {
          order: 0,
          name: "Main",
          exercises: [
            {
              exerciseName: "Dip",
              sets: 3,
              reps: "6",
              restTimeSeconds: 90,
            },
          ],
        },
      ],
      createdAt: "",
      updatedAt: "",
    };
    const parsed = parseCoachLibraryWorkbook(
      XLSX.write(
        (() => {
          const wb = XLSX.utils.book_new();
          const aoa = [
            ["x", "", ""],
            ["", "", ""],
            ["programName", "exerciseName", "coachNotes"],
            ["Volume Dip", "Dip", "Manter core contraído"],
          ];
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), PROGRAMS_SHEET);
          return wb;
        })(),
        { bookType: "xlsx", type: "array" }
      ) as ArrayBuffer
    );
    const merged = mergeProgramImportRows(program, parsed.programRows);
    assert.equal(merged?.sessions[0].exercises[0].notes, "Manter core contraído");
  });

  it("parses coach notes from Portuguese column header", () => {
    const wb = XLSX.utils.book_new();
    const aoa = [
      ["Instruções", "", ""],
      ["", "", ""],
      ["programName", "exerciseName", "Notas do Treinador", "programId", "sessionOrder", "rowKey"],
      ["Push Day", "Dip", "Manter core firme", "p1", 0, "0::Dip"],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, sheet, PROGRAMS_SHEET);
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    const parsed = parseCoachLibraryWorkbook(buffer);
    assert.equal(parsed.programRows.length, 1);
    assert.equal(parsed.programRows[0].coachNotes, "Manter core firme");
  });

  it("skips weekly meta programs without sessions on export flatten", () => {
    const rows = flattenProgramsForExport([
      {
        id: "w1",
        trainerId: "t1",
        name: "Weekly",
        programType: "weekly",
        sessions: [],
        createdAt: "",
        updatedAt: "",
      },
    ]);
    assert.equal(rows.length, 0);
  });
});
