export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';

export interface Student {
  id: string;
  name: string;
  age: number;
  weight: number;
  goals: string;
  fitnessLevel: FitnessLevel;
  joinDate: string;
  avatarUrl?: string;
}

export interface Exercise {
  id: string;
  name: string;
  category: 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'cardio';
  description?: string;
}

export interface WorkoutExercise {
  exerciseId: string;
  exerciseName: string;
  sets: number;
  reps: string;
  restTimeSeconds: number;
  notes?: string;
}

export interface WorkoutProgram {
  id: string;
  studentId: string;
  trainerId: string;
  title: string;
  description?: string;
  exercises: WorkoutExercise[];
  createdAt: string;
}

/** Stored on each exercise row inside a training program session (Firestore). */
export interface TrainingProgramExercise {
  exerciseName: string;
  sets: number;
  reps: string;
  restTimeSeconds: number;
  targetWeightKg?: number;
  setDetails?: Array<{
    setNumber: number;
    reps: string;
    targetWeightKg?: number;
    restTimeSeconds: number;
  }>;
  notes?: string;
}

/** One schedulable block (e.g. day or session) inside a reusable program template. */
export interface TrainingProgramSession {
  order: number;
  name: string;
  exercises: TrainingProgramExercise[];
}

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export interface WeeklyProgramItem {
  week: number;
  trainingProgramId: string;
  trainingProgramName: string;
  dayOfWeek: DayOfWeek;
  weightIncreaseKg: number;
  repIncrease: number;
}

/**
 * Reusable program template under root `trainerTrainingPrograms/{programId}` (field `trainerId`).
 */
export interface TrainingProgramDocument {
  trainerId: string;
  name: string;
  description?: string;
  category?: string;
  level?: FitnessLevel | "all";
  durationWeeks?: number;
  sessions: TrainingProgramSession[];
  programType?: 'single' | 'weekly';
  sourceProgramIds?: string[];
  /** Display names parallel to sourceProgramIds (weekly meta-programs). */
  sourceProgramNames?: string[];
  weeklyPlan?: WeeklyProgramItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ProgressLog {
  id: string;
  studentId: string;
  date: string;
  weight?: number;
  notes?: string;
  completedWorkoutId?: string;
}

export interface StrengthRecord {
  id: string;
  studentId: string;
  exerciseId: string;
  date: string;
  weight: number;
  reps: number;
}

export type MilestoneStatus = 'active' | 'completed' | 'missed' | 'paused';
export type MilestoneCategory = 'weight' | 'strength' | 'endurance' | 'flexibility' | 'milestone' | 'other';

export interface Milestone {
  id: string;
  studentId: string;
  trainerId: string;
  title: string;
  description?: string;
  category: MilestoneCategory;
  targetValue: number;
  targetUnit: string; // e.g., "kg", "lbs", "reps", "km", "%"
  currentValue: number;
  dueDate: string; // ISO date string
  status: MilestoneStatus;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}