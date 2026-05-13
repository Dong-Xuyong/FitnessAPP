/**
 * Placeholder avatar when no roster/slot photo URL (same pattern as coach calendar).
 */
export function slotStudentPlaceholderPhotoUrl(seedId: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seedId)}/100/100`;
}
