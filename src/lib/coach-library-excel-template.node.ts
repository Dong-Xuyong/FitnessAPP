import * as fs from "fs";
import * as path from "path";
import { COACH_LIBRARY_TEMPLATE_FILE } from "@/lib/coach-library-excel-template";

function templatePath(): string {
  return path.join(__dirname, "templates", COACH_LIBRARY_TEMPLATE_FILE);
}

/** Load formatted export template from disk (Node / tests only). */
export function loadCoachLibraryTemplateBuffer(): ArrayBuffer {
  const file = fs.readFileSync(templatePath());
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}
