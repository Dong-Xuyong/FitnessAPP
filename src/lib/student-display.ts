/** Shared helpers for merging portal + roster rows in UI lists */

export function getStudentDisplayName(s: Record<string, unknown>, fallback: string): string {
  const single = typeof s.name === "string" ? s.name.trim() : "";
  if (single) return single;
  const fn = typeof s.firstName === "string" ? s.firstName.trim() : "";
  const ln = typeof s.lastName === "string" ? s.lastName.trim() : "";
  const combined = [fn, ln].filter(Boolean).join(" ").trim();
  if (combined) return combined;
  return fallback;
}

export function getStudentEmail(s: Record<string, unknown>): string {
  const e = s.email;
  return typeof e === "string" ? e.trim() : "";
}
