# Database README (Firestore)

This document describes the Firestore data model used by the app and the access model enforced in `firestore.rules`.

## Core Collections

### `exercises/{exerciseId}`
- Global exercise library.
- Typical fields: `name`, `category`, `muscleGroup`, `createdBy`.
- Access:
  - Read: any signed-in user.
  - Create/Update/Delete: trainer users (with ownership checks for updates/deletes).

### `students/{studentId}`
- Global student profile keyed by auth uid.
- Typical fields: `name`, `email`, `trainerId`, `rosterDocId`.
- Purpose:
  - Stores global identity and link to trainer roster record.
  - `rosterDocId` allows a student auth uid to map to a different doc id under trainer subcollections.

### `milestones/{milestoneId}`
- Goal tracking and progression milestones.
- Typical fields: `trainerId`, `studentId`, `title`, `status`, `dueDate`.
- Access:
  - Trainer reads/writes milestones they own.
  - Student reads milestones where `studentId == auth.uid`.

## Trainer Root

### `personalTrainers/{personalTrainerId}`
- Trainer profile and parent node for trainer-owned subcollections.
- Common usage:
  - Trainer creates/updates own profile.
  - Signed-in users can read trainer docs (for linked experiences).

#### `personalTrainingPrograms/{programId}`
- Program library created by trainer.
- Includes normal programs and weekly-cycle style programs.
- Typical fields:
  - `name`, `description`, `programType`, `durationWeeks`
  - `sessions[]` with `exercises[]`
  - optional weekly metadata such as `sourceProgramIds`
- Access: trainer owner only.

#### `students/{studentId}`
- Trainer roster record for one student.
- Typical fields:
  - `trainerId`, `firstName`, `lastName`
  - billing fields like `sessionsPerWeek`, `sessionDurationMin`, `monthlyAmount`
- Access:
  - Trainer owner.
  - Student by matching auth uid.
  - Linked student via `rosterDocId` mapping (`isLinkedStudent` rule helper).

##### `workoutPlans/{workoutPlanId}`
- Assigned plans for students.
- Typical fields:
  - `title`, `exercises[]`, `weekStart`
  - `weeklyProgramId`, `weeklyProgramName`, `sourceTrainingProgramId`
- Access:
  - Read: trainer + student + linked student.
  - Create/Update: trainer.
  - Delete: trainer + student + linked student.

##### `workoutSessions/{workoutSessionId}`
- Logged/finished workout sessions.
- Typical fields:
  - `workoutPlanId`, `workoutTitle`, `completedAt`
  - `exercises[]` with set logs (weight/reps/completed)
- Access:
  - Read: trainer + student + linked student.
  - Create/Update: trainer + student + linked student.
  - Delete: trainer.

##### `payments/{paymentId}`
- Student billing records under trainer.
- Typical fields: `sessionsPerWeek`, `sessionDurationMin`, `monthlyAmount`, dates/status.
- Access:
  - Read: trainer + student + linked student.
  - Create/Update/Delete: trainer.

## Security Model Summary

Rules helper functions in `firestore.rules`:
- `isSignedIn()`
- `isOwner(userId)`
- `isTrainer()`
- `isFieldUnchanged(field)` (immutable-field enforcement)
- `isLinkedStudent(personalTrainerId, studentId)` (global uid -> roster doc mapping)

This gives:
- Strong trainer ownership for program/billing management.
- Student visibility into own plans/sessions/payments.
- Support for cases where student auth uid differs from trainer roster document id.

## Notes for Future Changes

- Keep `trainerId` immutable in trainer-student roster docs.
- If new subcollections are added under `personalTrainers/{id}`, add explicit rules for them.
- If new scheduling collections are introduced, document:
  - document id strategy
  - week/date normalization strategy
  - read/write actors (trainer, student, linked student)

