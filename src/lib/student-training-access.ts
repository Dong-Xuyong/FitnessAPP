export type TrainingAccessMode = "scheduled" | "open";

export function normalizeTrainingAccessMode(raw: unknown): TrainingAccessMode {
  return raw === "open" ? "open" : "scheduled";
}

export function isOpenTrainingAccess(mode: unknown): boolean {
  return normalizeTrainingAccessMode(mode) === "open";
}
