---
name: Attendance slot UI colors
overview: >-
  In assignment calendar, show attendance with explicit green (present), red (absent),
  and a distinct neutral/pending style on manage-slot controls; add colored avatar rings
  on the coach day slot overview so each student’s status is visible at a glance.
todos:
  - id: avatar-rings-overview
    content: >-
      General coach time-slot row (`timeSlots.map` ~3190): per-student Avatar ring/border
      from `normalizeAttendance(st.sessionAttendance)` — present green, absent red,
      pending muted/amber; keep dumbbell plan badge readable.
    status: completed
  - id: dialog-badge-buttons
    content: >-
      Manage slot dialog student rows (~2632–2705): Badge + Presente/Falta/Pendente
      buttons use matching semantic Tailwind (green / destructive / amber-muted), not
      only shadcn default primary for “present”.
    status: completed
  - id: filter-student-slot-badge
    content: >-
      Student-filter slot list (~3140): align attendance Badge styling with same green/red/pending.
    status: completed
isProject: true
---

# Attendance colors (calendar slots)

## Scope

File: [`src/app/assignment-calendar/page.tsx`](c:\Users\Dong\Desktop\FitnessAPP\src\app\assignment-calendar\page.tsx). Reuse existing `normalizeAttendance()` return values `"present" | "absent" | "pending"`.

## 1. Coach overview — avatars in slot button

Location: general coach overview `timeSlots.map` (~3188), inner `slot!.students.map` (~3224).

- For each `st`, compute `att = normalizeAttendance(st.sessionAttendance)`.
- On `Avatar`, add classes (via `cn`):
  - **present**: e.g. `ring-2 ring-green-600 ring-offset-2 ring-offset-background` (and/or `border-green-600`).
  - **absent**: e.g. `ring-2 ring-destructive ring-offset-2 ring-offset-background`.
  - **pending**: e.g. `ring-2 ring-amber-500/80` or `border-muted-foreground/50` so it stays subtle.

Keep `ring-background` interaction with the dumbbell overlay in mind so rings do not clip oddly.

## 2. Manage slot dialog — badge + action row

Location: ~2656–2704.

- **Badge** (~2660): replace generic `variant="default"` for present with explicit `className` greens (`bg-emerald-600` / `text-white` / `border-transparent` or project-consistent green tokens) so “Presente” is clearly green, not primary blue.
- **Falta** button: already `border-destructive/40 text-destructive`; optionally strengthen fill on hover only.
- **Pendente** button: change from plain `ghost` to muted amber outline (`border-amber-500/40 text-amber-800 dark:text-amber-400`) so the three states read as green / red / amber-neutral.

## 3. Filtered student view — small badge

Location: ~3140–3155 when `isSessionStart` and `myEntry` — same Badge class strategy as §2 for consistency.

## Non-goals

- No i18n string changes unless labels move.
- Do not change Firestore attendance semantics, only UI.

## Accessibility

- Do not rely on color alone: existing text labels (“Presente”, “Falta”, “Pendente”) remain; rings supplement for quick scan.
