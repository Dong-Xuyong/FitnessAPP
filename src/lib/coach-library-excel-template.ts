import ExcelJS from "exceljs";

export const COACH_LIBRARY_TEMPLATE_FILE = "coach-library-formatted.xlsx";

export const TEMPLATE_EXERCISES_SHEET = "Exercises";
export const TEMPLATE_PROGRAMS_SHEET = "Programs";

/** Programs sheet column header for coach notes in the formatted template. */
export const PROGRAM_COACH_NOTES_HEADER = "Notas do Treinador";

/** 1-based Excel row numbers matching the stored template. */
const INSTRUCTION_ROW = 1;
const DATA_START_ROW = 4;

/** Column C on Exercises — Firestore id (exported for import matching, hidden in Excel). */
const EXERCISE_ID_COLUMN = 3;

/** Taller data rows for readability (template default ~15.75pt). */
const DATA_ROW_HEIGHT = 24;

export type TemplateFillInput = {
  exercisesInstruction: string;
  programsInstruction: string;
  exerciseRows: Array<[string, string, string]>;
  programRows: Array<[string, string, string, string, number, string]>;
};

let cachedBrowserTemplate: ArrayBuffer | null = null;

export async function fetchCoachLibraryTemplateBuffer(): Promise<ArrayBuffer> {
  if (cachedBrowserTemplate) return cachedBrowserTemplate;
  const res = await fetch(`/templates/${COACH_LIBRARY_TEMPLATE_FILE}`);
  if (!res.ok) {
    throw new Error(`Failed to load Excel template (${res.status})`);
  }
  cachedBrowserTemplate = await res.arrayBuffer();
  return cachedBrowserTemplate;
}

type CellStyleSnapshot = {
  style?: Partial<ExcelJS.Style>;
  fill?: ExcelJS.Fill;
  font?: Partial<ExcelJS.Font>;
  border?: Partial<ExcelJS.Borders>;
  alignment?: Partial<ExcelJS.Alignment>;
  numFmt?: string;
};

function captureCellStyle(cell: ExcelJS.Cell): CellStyleSnapshot {
  return {
    style: cell.style ? { ...cell.style } : undefined,
    fill: cell.fill ? (JSON.parse(JSON.stringify(cell.fill)) as ExcelJS.Fill) : undefined,
    font: cell.font ? JSON.parse(JSON.stringify(cell.font)) : undefined,
    border: cell.border ? JSON.parse(JSON.stringify(cell.border)) : undefined,
    alignment: cell.alignment ? { ...cell.alignment } : undefined,
    numFmt: cell.numFmt,
  };
}

function applyCellStyle(cell: ExcelJS.Cell, snapshot: CellStyleSnapshot): void {
  if (snapshot.style) cell.style = { ...snapshot.style };
  if (snapshot.fill) cell.fill = snapshot.fill;
  if (snapshot.font) cell.font = snapshot.font;
  if (snapshot.border) cell.border = snapshot.border;
  if (snapshot.alignment) cell.alignment = snapshot.alignment;
  if (snapshot.numFmt) cell.numFmt = snapshot.numFmt;
}

function captureRowStyles(row: ExcelJS.Row, colCount: number): CellStyleSnapshot[] {
  const snapshots: CellStyleSnapshot[] = [];
  for (let c = 1; c <= colCount; c++) {
    snapshots.push(captureCellStyle(row.getCell(c)));
  }
  return snapshots;
}

function applyRowStyles(
  row: ExcelJS.Row,
  snapshots: CellStyleSnapshot[],
  colCount: number,
  rowHeight?: number
): void {
  for (let c = 1; c <= colCount; c++) {
    applyCellStyle(row.getCell(c), snapshots[c - 1] ?? {});
  }
  if (rowHeight != null) row.height = rowHeight;
}

function setCellValue(cell: ExcelJS.Cell, value: unknown): void {
  if (value === "" || value == null) {
    cell.value = null;
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    cell.value = value;
    return;
  }
  cell.value = String(value);
}

function fillWorksheet(
  sheet: ExcelJS.Worksheet,
  instruction: string,
  dataRows: unknown[][],
  colCount: number
): void {
  sheet.getCell(INSTRUCTION_ROW, 1).value = instruction;

  const styleTemplateRow = sheet.getRow(DATA_START_ROW);
  const rowStyles = captureRowStyles(styleTemplateRow, colCount);
  const templateRowHeight = styleTemplateRow.height;

  dataRows.forEach((values, index) => {
    const rowNumber = DATA_START_ROW + index;
    if (rowNumber > sheet.rowCount) {
      sheet.insertRow(rowNumber, []);
    }
    const row = sheet.getRow(rowNumber);
    if (rowNumber > DATA_START_ROW) {
      applyRowStyles(row, rowStyles, colCount, templateRowHeight);
    }
    values.forEach((value, colIndex) => {
      setCellValue(row.getCell(colIndex + 1), value);
    });
  });

  for (let rowNumber = DATA_START_ROW + dataRows.length; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    for (let c = 1; c <= colCount; c++) {
      row.getCell(c).value = null;
    }
  }

  for (let rowNumber = DATA_START_ROW; rowNumber < DATA_START_ROW + dataRows.length; rowNumber++) {
    sheet.getRow(rowNumber).height = DATA_ROW_HEIGHT;
  }
}

function hideExerciseIdColumn(sheet: ExcelJS.Worksheet): void {
  const column = sheet.getColumn(EXERCISE_ID_COLUMN);
  column.hidden = true;
  column.width = 1;
}

/** Fill the stored formatted workbook with export data (preserves template styles). */
export async function fillCoachLibraryTemplate(
  templateBuffer: ArrayBuffer,
  input: TemplateFillInput
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);

  const exSheet = workbook.getWorksheet(TEMPLATE_EXERCISES_SHEET);
  if (exSheet) {
    fillWorksheet(exSheet, input.exercisesInstruction, input.exerciseRows, 3);
    hideExerciseIdColumn(exSheet);
  }

  const prSheet = workbook.getWorksheet(TEMPLATE_PROGRAMS_SHEET);
  if (prSheet) {
    fillWorksheet(prSheet, input.programsInstruction, input.programRows, 6);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
