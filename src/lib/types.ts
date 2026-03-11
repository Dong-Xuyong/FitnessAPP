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