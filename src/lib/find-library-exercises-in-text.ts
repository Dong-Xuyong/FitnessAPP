export type LibraryExerciseVideo = {
  name: string;
  videoUrl: string;
};

/**
 * Normalize free-form workout text for matching.
 *
 * - lowercases
 * - strips accents (Abdução → abducao)
 * - turns punctuation/symbols into spaces (@6/9kg → 6 9kg)
 * - collapses whitespace
 *
 * Example:
 *   "100 wall balls @6/9kg" → "100 wall balls 6 9kg"
 */
export function normalizeExerciseSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find library exercises mentioned inside free-form plan text
 * (Partner WODs, cardio blocks, coach notes, etc.).
 *
 * Matching rules:
 * 1. Case / accent insensitive ("Burpees" = "burpees")
 * 2. Whole tokens only ("row" matches "2000m row", not "rowing")
 * 3. Longer names win first ("wall balls" before "balls")
 * 4. Names shorter than 3 chars are ignored (too noisy)
 * 5. Only entries with a video URL are returned
 *
 * Example text:
 *   "Partner WOD … 100 burpees 2000m row 100 wall balls @6/9kg"
 * with library ["Burpees", "Row", "Wall Balls"] → all three matched.
 */
export function findLibraryExercisesInText(
  text: string,
  library: ReadonlyArray<LibraryExerciseVideo>
): LibraryExerciseVideo[] {
  const haystack = normalizeExerciseSearchText(text);
  if (!haystack) return [];

  // Pad with spaces so edges behave like token boundaries:
  // "burpees" in "100 burpees" → look for " burpees " inside " 100 burpees "
  let remaining = ` ${haystack} `;

  const candidates = library
    .map((entry) => {
      const name = entry.name.trim();
      const videoUrl = entry.videoUrl.trim();
      const needle = normalizeExerciseSearchText(name);
      return { name, videoUrl, needle };
    })
    .filter((entry) => entry.name && entry.videoUrl && entry.needle.length >= 3)
    .sort((a, b) => b.needle.length - a.needle.length || a.name.localeCompare(b.name));

  const matched: LibraryExerciseVideo[] = [];
  const seen = new Set<string>();

  for (const entry of candidates) {
    const pattern = new RegExp(` ${escapeRegExp(entry.needle)} `, "i");
    if (!pattern.test(remaining)) continue;

    const dedupeKey = entry.needle.replace(/\s+/g, "");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    matched.push({ name: entry.name, videoUrl: entry.videoUrl });
    // Consume this match so shorter overlapping names cannot also fire.
    remaining = remaining.replace(pattern, " ");
  }

  return matched;
}
