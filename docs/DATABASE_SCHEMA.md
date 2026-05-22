# Sergio Oliveira PT Database Schema

## Overview
Sergio Oliveira PT uses **Firebase Firestore** as its NoSQL database. The structure is organized into collections and subcollections to manage relationships between trainers, students, and their data.

---

## Database Structure

```
firestore (root)
│
├── personalTrainers/                          # Main collection for trainers
│   └── {trainerId}/                           # Document for each trainer
│       ├── id: string
│       ├── firstName: string
│       ├── lastName: string
│       ├── email: string
│       ├── photoUrl: string (optional)
│       ├── dateJoined: timestamp
│       │
│       └── students/                          # Subcollection of trainer's students
│           └── {studentId}/                   # Document for each student
│               ├── userId: string
│               ├── trainerId: string
│               ├── name: string
│               ├── firstName: string
│               ├── lastName: string
│               ├── email: string
│               ├── photoUrl: string (optional)
│               ├── age: number
│               ├── sex: "male" | "female" | "other"
│               ├── weightKg: number
│               ├── heightCm: number
│               ├── goalType: string
│               ├── goalWeightKg: number
│               ├── activityStatus: "active" | "inactive"
│               ├── joinedAt: timestamp
│               ├── currentProgramId: string (optional)
│               ├── subscriptionStatus: "active" | "expired" | "pending"
│               ├── currentStreakDays: number
│               ├── lastWorkoutAt: timestamp (optional)
│               │
│               └── workoutPlans/              # Subcollection of workout plans
│                   └── {workoutPlanId}/       # Document for each workout plan
│                       ├── planId: string
│                       ├── name: string
│                       ├── description: string
│                       ├── duration: string
│                       ├── createdAt: timestamp
│                       ├── assignedBy: string (trainerId)
│                       ├── exercises: array[]
│                       │   └── {
│                       │       exerciseName: string,
│                       │       sets: number,
│                       │       reps: number,
│                       │       restSeconds: number,
│                       │       notes: string (optional)
│                       │   }
│                       ├── completedDates: array[] (timestamps) (legacy / optional)
│                       ├── sequenceGroupId: string (optional; sequence assignment)
│                       ├── sequenceStepIndex: number (optional; 0-based chain order)
│                       ├── sequenceStepLabel: string (optional; e.g. "A", "B")
│                       ├── sequenceUnlockAfterPlanId: string (optional; prior plan id that must be completed)
│                       ├── sequenceNextPlanId: string (optional; next plan to unlock)
│                       └── studentUnlocked: boolean (optional; false = hidden from student until unlocked)
│
└── students/                                  # Global student directory
    └── {studentId}/                           # Document for each student
        ├── userId: string (Auth UID)
        ├── name: string
        ├── firstName: string
        ├── lastName: string
        ├── email: string
        ├── photoUrl: string (optional)
        ├── age: number
        ├── sex: "male" | "female" | "other"
        ├── weightKg: number
        ├── heightCm: number
        ├── goalType: string
        ├── goalWeightKg: number
        ├── activityStatus: "active" | "inactive"
        ├── joinedAt: timestamp
        ├── currentStreakDays: number
        ├── lastWorkoutAt: timestamp (optional)
        └── trainerId: string (optional - references assigned trainer)

└── milestones/                                # Milestones for students
    └── {milestoneId}/                         # Document for each milestone
        ├── id: string
        ├── studentId: string
        ├── trainerId: string
        ├── title: string
        ├── description: string (optional)
        ├── category: "weight" | "strength" | "endurance" | "flexibility" | "milestone" | "other"
        ├── targetValue: number
        ├── targetUnit: string (e.g., "kg", "lbs", "reps", "km", "%")
        ├── currentValue: number
        ├── dueDate: timestamp
        ├── status: "active" | "completed" | "missed" | "paused"
        ├── completedAt: timestamp (optional)
        ├── createdAt: timestamp
        └── updatedAt: timestamp
```

---

## Collection Descriptions

### 1. `/personalTrainers` Collection
**Purpose**: Stores personal trainer account information.

**Key Fields**:
- `id`: Unique identifier (Firebase Auth UID)
- `firstName`, `lastName`: Trainer's name
- `email`: Trainer's email address
- `photoUrl`: Profile picture URL
- `dateJoined`: When the trainer registered
- `availability`: Weekly schedule — per weekday (`sunday` … `saturday`): `{ enabled, ranges: [{ startTime, endTime }] }` (times as `HH:mm`)
- `vacationPeriods`: Date-specific time off — array of `{ id, startDate, endDate, label }` with inclusive `YYYY-MM-DD` bounds and a required short description; overrides weekly hours for new bookings
- `slotDurationMin`, `maxStudentsPerSlot`: Calendar block settings (minutes per slot, default capacity)

**Access Pattern**: 
- Trainers can read/write their own document
- Used for trainer profile management

---

### 2. `/personalTrainers/{trainerId}/students` Subcollection
**Purpose**: Stores the roster of students managed by a specific trainer. This is the trainer's personalized view of their clients.

**Key Fields**:
- `userId`: Links to the student's Auth UID
- `trainerId`: References the parent trainer
- `name`, `firstName`, `lastName`, `email`: Student identity
- `age`, `sex`, `weightKg`, `heightCm`: Physical metrics
- `goalType`, `goalWeightKg`: Fitness goals
- `activityStatus`: Whether the student is actively training
- `joinedAt`: When added to this trainer's roster
- `currentProgramId`: Active workout program reference
- `subscriptionStatus`: Payment/subscription state
- `currentStreakDays`: Legacy / optional streak field (UI streaks largely derived from calendar attendance + workout data)
- `lastWorkoutAt`: Most recent workout completion

**Access Pattern**:
- Trainers can read/write to their own students subcollection
- Used in trainer dashboard, student management, workout assignment

---

### `/personalTrainers/{trainerId}/shopItems/{itemId}` Documents
**Purpose**: Coach-managed catalog for the gym shop (name + price).

**Key Fields**:
- `name`: Display name
- `price`: Price in EUR
- `active`: When `false`, hidden from students
- `createdAt`, `updatedAt`: ISO timestamps

---

### `/personalTrainers/{trainerId}/shopRegistrations/{regId}` Documents
**Purpose**: Daily shop purchase log per student. Doc id: `{authUid}_{YYYY-MM-DD}`.

**Key Fields**:
- `studentId`, `trainerId`, `date` (`YYYY-MM-DD`)
- `lines`: `[{ itemId, quantity }]` (quantity 0–999)
- `updatedAt`: ISO timestamp

Shop charges for a calendar month roll into the student’s **pending** payment for that `YYYY-MM` period (see Cloud Function `syncShopPaymentOnRegistrationWrite`).

---

### `/personalTrainers/{trainerId}/students/{studentId}/payments/{paymentId}` — shop breakdown
**Optional fields** (when shop sync ran):
- `baseAmount`: Membership (`monthlyRate`)
- `shopAmount`: Shop total for `period`
- `amount`: `baseAmount + shopAmount`
- `shopSyncedAt`: Last sync timestamp

---

### `/personalTrainers/{trainerId}/sessionSlots/{slotId}` Documents
**Purpose**: Calendar blocks where students enroll. Doc id encodes `{date}_{startTime_without_colon}` (e.g. `2026-04-10_1200`). Long sessions span multiple consecutive slot documents; each duplicated `students[]` row shares the same `sessionStart`, `sessionDurationMin`, and attendance fields.

**Key Fields per slot doc**:
- `date`: `YYYY-MM-DD`
- `startTime`: Block start (`HH:mm`)
- `maxStudents`: Capacity for this block
- `students`: Array of `SlotStudent`:
  - `studentId`, `studentName`: Roster identifiers (students book with Auth UID aligned to roster doc id where applicable)
  - `sessionStart`: First block’s `startTime` for the booked session (continuation blocks reuse it)
  - `sessionDurationMin`: Total session length
  - `workoutPlanId`, `workoutTitle` (optional): Linked assignment
  - `sessionAttendance`: `"pending"` (default/missing), `"present"`, or `"absent"` — set by coach after the session ends; drives **session attendance streak** in the UI
  - `sessionAttendanceAt`: ISO timestamp when attendance was recorded

**Streak semantics** (computed in app code): elapsed booked sessions sorted by end time descending; streak counts consecutive `present` until the first `pending` or `absent`.

---

### 3. `/personalTrainers/{trainerId}/students/{studentId}/workoutPlans` Subcollection
**Purpose**: Stores workout plans assigned by trainers to specific students.

**Key Fields**:
- `planId`: Unique workout plan identifier
- `name`: Workout plan name (e.g., "Week 1 - Upper Body")
- `description`: Plan overview
- `duration`: Expected duration (e.g., "4 weeks")
- `createdAt`: When the plan was created
- `assignedBy`: Trainer who created it
- `exercises`: Array of exercise objects with sets, reps, rest times
- `completedDates`: Array tracking when student completed this workout (legacy / optional)
- **Sequence fields** (optional): Coaches may assign an ordered chain (e.g. A→B→C) with repeat cycles. All steps are created up front; `studentUnlocked` is `true` only for the first step. Completing a step (session batch) sets `completedAt` / `status` on that plan and sets `studentUnlocked: true` on `sequenceNextPlanId`. Students may only read plans where `studentUnlocked` is not `false`.

**Access Pattern**:
- Trainers create and manage workout plans
- Students view and log completion of assigned workouts (and may unlock the next sequence step per security rules)

---

### 4. `/students` Collection
**Purpose**: Global directory of all student accounts. This allows students to be discovered by trainers and serves as the single source of truth for student profiles.

**Key Fields**:
- `userId`: Firebase Auth UID
- `name`, `firstName`, `lastName`, `email`: Student identity
- `age`, `sex`, `weightKg`, `heightCm`: Physical metrics
- `goalType`, `goalWeightKg`: Fitness goals
- `activityStatus`: Current training status
- `trainerId`: (Optional) Reference to assigned trainer
- `joinedAt`: When the account was created

**Access Pattern**:
- Used for student registration
- Trainers query this to discover and add students
- Students update their own global profile
- Synced with trainer's subcollection when updates occur

---

### 5. `/milestones` Collection
**Purpose**: Stores fitness milestones and goals for students. Allows trainers to set specific, measurable targets and track progress.

**Key Fields**:
- `studentId`: References the student this milestone belongs to
- `trainerId`: References the trainer who created the milestone
- `title`: Milestone name (e.g., "Reach 75kg weight", "Bench press 100kg")
- `description`: Optional detailed description of the milestone
- `category`: Type of milestone (weight, strength, endurance, flexibility, or general)
- `targetValue`: The numeric goal to achieve
- `targetUnit`: Unit of measurement (kg, lbs, reps, km, miles, %)
- `currentValue`: Current progress toward the target
- `dueDate`: When the milestone should be achieved
- `status`: Current status (active, completed, missed, paused)
- `completedAt`: Timestamp when milestone was completed
- `createdAt`: When the milestone was created
- `updatedAt`: Last update timestamp

**Access Pattern**:
- Trainers create milestones for their students
- Trainers update progress and mark as completed
- Students view their milestones on their dashboard
- Sorted by status (active first) and due date

---

## Data Synchronization

### Dual-Storage Pattern
Students exist in **two places**:
1. **Global Directory** (`/students/{studentId}`) - Master record
2. **Trainer Roster** (`/personalTrainers/{trainerId}/students/{studentId}`) - Trainer's copy

**Why?**
- **Global Directory**: Allows any trainer to discover and add students
- **Trainer Roster**: Each trainer has their own view/copy for faster queries and personalized data

**Sync Strategy**:
When a student updates their profile:
```javascript
// Update global record
updateDoc(doc(db, "students", studentId), data);

// Update in trainer's subcollection if assigned
if (trainerId) {
  updateDoc(doc(db, "personalTrainers", trainerId, "students", studentId), data);
}
```

---

## Security Rules (Recommended)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Personal Trainers
    match /personalTrainers/{trainerId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == trainerId;
      
      // Trainer's Students Subcollection
      match /students/{studentId} {
        allow read, write: if request.auth.uid == trainerId;
        
        // Workout Plans
        match /workoutPlans/{planId} {
          allow read: if request.auth.uid == trainerId || 
                        request.auth.uid == studentId;
          allow write: if request.auth.uid == trainerId;
        }
      }
    }
    
    // Global Students Directory
    match /students/{studentId} {
      allow read: if request.auth != null;
      allow create: if request.auth.uid == studentId;
      allow update: if request.auth.uid == studentId;
      allow delete: if request.auth.uid == studentId;
    }
  }
}
```

---

## Query Examples

### 1. Get Trainer's Student Roster
```typescript
const studentsQuery = collection(
  db, 
  "personalTrainers", 
  trainerId, 
  "students"
);
const snapshot = await getDocs(studentsQuery);
```

### 2. Find All Students in Global Directory
```typescript
const allStudentsQuery = collection(db, "students");
const snapshot = await getDocs(allStudentsQuery);
```

### 3. Get Student's Workout Plans
```typescript
const workoutPlansQuery = collection(
  db,
  "personalTrainers",
  trainerId,
  "students",
  studentId,
  "workoutPlans"
);
const plans = await getDocs(workoutPlansQuery);
```

### 4. Add Student to Trainer's Roster
```typescript
const studentRef = doc(
  db,
  "personalTrainers",
  trainerId,
  "students",
  studentId
);
await setDoc(studentRef, {
  userId: studentId,
  trainerId: trainerId,
  name: "John Doe",
  email: "john@example.com",
  joinedAt: new Date(),
  // ... other fields
});
```

---

## Future Enhancements

### Potential Additional Collections:

1. **`/exercises`** - Centralized exercise database
```
exercises/
  └── {exerciseId}/
      ├── name: string
      ├── category: string (chest, back, legs, etc.)
      ├── description: string
      ├── videoUrl: string
      ├── difficulty: string
      └── equipment: array[]
```

2. **`/messages`** - Trainer-student messaging
```
messages/
  └── {conversationId}/
      ├── trainerId: string
      ├── studentId: string
      ├── lastMessage: string
      ├── lastMessageAt: timestamp
      └── messages/
          └── {messageId}/
              ├── senderId: string
              ├── text: string
              ├── timestamp: timestamp
              └── read: boolean
```

3. **`/progressLogs`** - Detailed workout logging
```
personalTrainers/{trainerId}/students/{studentId}/progressLogs/
  └── {logId}/
      ├── date: timestamp
      ├── workoutPlanId: string
      ├── exercises: array[]
      ├── duration: number
      ├── notes: string
      └── completedSets: array[]
```

4. **`/notifications`** - System notifications
```
notifications/
  └── {userId}/
      └── items/
          └── {notificationId}/
              ├── type: string
              ├── title: string
              ├── message: string
              ├── createdAt: timestamp
              ├── read: boolean
              └── actionUrl: string
```

---

## Best Practices

✅ **DO**:
- Use subcollections for hierarchical data (workouts under students)
- Index frequently queried fields
- Batch write operations when updating multiple documents
- Use transactions for critical operations
- Keep individual documents under 1MB
- Denormalize data for faster reads (student info in trainer roster)

❌ **DON'T**:
- Don't create deeply nested subcollections (max 100 levels, but stay shallow)
- Don't use array fields for unbounded data (use subcollections instead)
- Don't perform queries without proper indexes
- Don't store sensitive data without encryption
- Don't forget to validate data on both client and server

---

## Performance Tips

1. **Use Pagination**: Limit queries to 20-50 documents at a time
2. **Cache Data**: Use React Query or Firebase's offline persistence
3. **Optimize Reads**: Structure data to minimize document reads
4. **Batch Operations**: Use `writeBatch()` for multiple updates
5. **Indexed Queries**: Ensure all query combinations are indexed

---

This database structure supports all core features of Sergio Oliveira PT including:
- ✅ Trainer registration and profile management
- ✅ Student roster management
- ✅ Workout program creation and assignment
- ✅ Progress tracking
- ✅ Multi-trainer support for students
- ✅ Global student discovery


