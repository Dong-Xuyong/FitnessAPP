import type { TrainingProgramSession } from "@/lib/types";

export interface DefaultTrainingProgram {
  name: string;
  description: string;
  category: string;
  level: "beginner" | "intermediate" | "advanced" | "all";
  durationWeeks: number;
  sessions: TrainingProgramSession[];
}

export const DEFAULT_TRAINING_PROGRAMS: DefaultTrainingProgram[] = [
  {
    name: "Full Body Beginner",
    description: "A 3-day full body routine perfect for those new to weight training. Covers all major muscle groups each session.",
    category: "Full Body",
    level: "beginner",
    durationWeeks: 8,
    sessions: [
      {
        order: 0,
        name: "Day A – Full Body",
        exercises: [
          { exerciseName: "Barbell Squats", sets: 3, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Barbell Bench Press", sets: 3, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Bent Over Rows", sets: 3, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Lateral Raises", sets: 3, reps: "12", restTimeSeconds: 60 },
          { exerciseName: "Planks", sets: 3, reps: "30s", restTimeSeconds: 60 },
        ],
      },
      {
        order: 1,
        name: "Day B – Full Body",
        exercises: [
          { exerciseName: "Leg Press", sets: 3, reps: "12", restTimeSeconds: 90 },
          { exerciseName: "Dumbbell Shoulder Press", sets: 3, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Lat Pulldowns", sets: 3, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Dumbbell Curls", sets: 3, reps: "12", restTimeSeconds: 60 },
          { exerciseName: "Crunches", sets: 3, reps: "15", restTimeSeconds: 60 },
        ],
      },
    ],
  },
  {
    name: "Push / Pull / Legs",
    description: "Classic PPL split for intermediate lifters looking to build muscle. Run it twice per week for best results.",
    category: "Split",
    level: "intermediate",
    durationWeeks: 12,
    sessions: [
      {
        order: 0,
        name: "Push Day",
        exercises: [
          { exerciseName: "Barbell Bench Press", sets: 4, reps: "8", restTimeSeconds: 120 },
          { exerciseName: "Incline Bench Press", sets: 3, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Dumbbell Shoulder Press", sets: 3, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Lateral Raises", sets: 3, reps: "15", restTimeSeconds: 60 },
          { exerciseName: "Tricep Pushdowns", sets: 3, reps: "12", restTimeSeconds: 60 },
          { exerciseName: "Overhead Tricep Extensions", sets: 3, reps: "12", restTimeSeconds: 60 },
        ],
      },
      {
        order: 1,
        name: "Pull Day",
        exercises: [
          { exerciseName: "Barbell Deadlift", sets: 4, reps: "6", restTimeSeconds: 180 },
          { exerciseName: "Bent Over Rows", sets: 4, reps: "8", restTimeSeconds: 120 },
          { exerciseName: "Lat Pulldowns", sets: 3, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Reverse Pec Deck Flyes", sets: 3, reps: "15", restTimeSeconds: 60 },
          { exerciseName: "Barbell Curls", sets: 3, reps: "10", restTimeSeconds: 60 },
          { exerciseName: "Dumbbell Curls", sets: 3, reps: "12", restTimeSeconds: 60 },
        ],
      },
      {
        order: 2,
        name: "Leg Day",
        exercises: [
          { exerciseName: "Barbell Squats", sets: 4, reps: "8", restTimeSeconds: 120 },
          { exerciseName: "Leg Press", sets: 3, reps: "12", restTimeSeconds: 90 },
          { exerciseName: "Romanian Deadlifts", sets: 3, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Leg Curls", sets: 3, reps: "12", restTimeSeconds: 60 },
          { exerciseName: "Russian Twists", sets: 3, reps: "20", restTimeSeconds: 60 },
        ],
      },
    ],
  },
  {
    name: "Upper / Lower Split",
    description: "4-day upper/lower split balancing strength and hypertrophy. Great for intermediate to advanced trainees.",
    category: "Split",
    level: "intermediate",
    durationWeeks: 10,
    sessions: [
      {
        order: 0,
        name: "Upper A – Strength",
        exercises: [
          { exerciseName: "Barbell Bench Press", sets: 5, reps: "5", restTimeSeconds: 180 },
          { exerciseName: "Bent Over Rows", sets: 5, reps: "5", restTimeSeconds: 180 },
          { exerciseName: "Barbell Military Press", sets: 4, reps: "6", restTimeSeconds: 120 },
          { exerciseName: "Barbell Curls", sets: 3, reps: "10", restTimeSeconds: 60 },
          { exerciseName: "Tricep Pushdowns", sets: 3, reps: "10", restTimeSeconds: 60 },
        ],
      },
      {
        order: 1,
        name: "Lower A – Strength",
        exercises: [
          { exerciseName: "Barbell Squats", sets: 5, reps: "5", restTimeSeconds: 180 },
          { exerciseName: "Romanian Deadlifts", sets: 4, reps: "8", restTimeSeconds: 120 },
          { exerciseName: "Leg Press", sets: 3, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Leg Curls", sets: 3, reps: "12", restTimeSeconds: 60 },
          { exerciseName: "Planks", sets: 3, reps: "45s", restTimeSeconds: 60 },
        ],
      },
      {
        order: 2,
        name: "Upper B – Hypertrophy",
        exercises: [
          { exerciseName: "Incline Bench Press", sets: 4, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Lat Pulldowns", sets: 4, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Dumbbell Shoulder Press", sets: 3, reps: "12", restTimeSeconds: 60 },
          { exerciseName: "Dumbbell Flyes", sets: 3, reps: "12", restTimeSeconds: 60 },
          { exerciseName: "Dumbbell Curls", sets: 3, reps: "12", restTimeSeconds: 60 },
          { exerciseName: "Overhead Tricep Extensions", sets: 3, reps: "12", restTimeSeconds: 60 },
        ],
      },
      {
        order: 3,
        name: "Lower B – Hypertrophy",
        exercises: [
          { exerciseName: "Leg Press", sets: 4, reps: "12", restTimeSeconds: 90 },
          { exerciseName: "Romanian Deadlifts", sets: 3, reps: "12", restTimeSeconds: 90 },
          { exerciseName: "Barbell Squats", sets: 3, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Leg Curls", sets: 3, reps: "15", restTimeSeconds: 60 },
          { exerciseName: "Russian Twists", sets: 3, reps: "20", restTimeSeconds: 60 },
          { exerciseName: "Dead Bugs", sets: 3, reps: "12", restTimeSeconds: 60 },
        ],
      },
    ],
  },
  {
    name: "Strength Builder 5×5",
    description: "Focused barbell strength program built around the big compound lifts. Ideal for building a solid foundation.",
    category: "Strength",
    level: "beginner",
    durationWeeks: 12,
    sessions: [
      {
        order: 0,
        name: "Workout A",
        exercises: [
          { exerciseName: "Barbell Squats", sets: 5, reps: "5", restTimeSeconds: 180 },
          { exerciseName: "Barbell Bench Press", sets: 5, reps: "5", restTimeSeconds: 180 },
          { exerciseName: "Bent Over Rows", sets: 5, reps: "5", restTimeSeconds: 180 },
        ],
      },
      {
        order: 1,
        name: "Workout B",
        exercises: [
          { exerciseName: "Barbell Squats", sets: 5, reps: "5", restTimeSeconds: 180 },
          { exerciseName: "Barbell Military Press", sets: 5, reps: "5", restTimeSeconds: 180 },
          { exerciseName: "Barbell Deadlift", sets: 1, reps: "5", restTimeSeconds: 180 },
        ],
      },
    ],
  },
  {
    name: "Cardio & Core Conditioning",
    description: "Cardiovascular fitness and core stability program. Perfect as a complement to strength training or for active recovery days.",
    category: "Conditioning",
    level: "all",
    durationWeeks: 6,
    sessions: [
      {
        order: 0,
        name: "Cardio Session",
        exercises: [
          { exerciseName: "Running", sets: 1, reps: "20 min", restTimeSeconds: 0 },
          { exerciseName: "Jump Rope", sets: 4, reps: "2 min", restTimeSeconds: 60 },
          { exerciseName: "Rowing", sets: 3, reps: "5 min", restTimeSeconds: 90 },
          { exerciseName: "Cycling", sets: 1, reps: "15 min", restTimeSeconds: 0 },
        ],
      },
      {
        order: 1,
        name: "Core Session",
        exercises: [
          { exerciseName: "Planks", sets: 4, reps: "45s", restTimeSeconds: 30 },
          { exerciseName: "Dead Bugs", sets: 3, reps: "12", restTimeSeconds: 45 },
          { exerciseName: "Russian Twists", sets: 3, reps: "20", restTimeSeconds: 45 },
          { exerciseName: "Crunches", sets: 3, reps: "20", restTimeSeconds: 30 },
        ],
      },
    ],
  },
  {
    name: "Treino A - Back & Arms",
    description: "Back and arms focused workout with rows, pulldowns, and bicep/tricep exercises. Great for building upper body strength.",
    category: "Split",
    level: "intermediate",
    durationWeeks: 8,
    sessions: [
      {
        order: 0,
        name: "Treino A",
        exercises: [
          { exerciseName: "Remada T", sets: 4, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Pull Down Barra", sets: 4, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Remada Máquina", sets: 3, reps: "12", restTimeSeconds: 90 },
          { exerciseName: "Remada Alta (cabo)", sets: 3, reps: "12", restTimeSeconds: 60 },
          { exerciseName: "Rosca Alt. Halter", sets: 3, reps: "12", restTimeSeconds: 60 },
          { exerciseName: "Tríceps Francês", sets: 3, reps: "12", restTimeSeconds: 60 },
          { exerciseName: "KB Deadlift Unilateral", sets: 3, reps: "10", restTimeSeconds: 90 },
        ],
      },
    ],
  },
  {
    name: "Treino B - Legs & Glutes",
    description: "Comprehensive lower body workout targeting quads, hamstrings, glutes, and calves with unilateral and bilateral movements.",
    category: "Split",
    level: "intermediate",
    durationWeeks: 8,
    sessions: [
      {
        order: 0,
        name: "Treino B",
        exercises: [
          { exerciseName: "Split Squat Halter", sets: 4, reps: "10", restTimeSeconds: 90 },
          { exerciseName: "Abdução Polia", sets: 3, reps: "15", restTimeSeconds: 60 },
          { exerciseName: "Extensão Quadril Máquina", sets: 3, reps: "12", restTimeSeconds: 90 },
          { exerciseName: "Agachamento", sets: 4, reps: "8", restTimeSeconds: 120 },
          { exerciseName: "Gémeos Prensa", sets: 4, reps: "15", restTimeSeconds: 60 },
          { exerciseName: "Elevação Pélvica Unilateral", sets: 3, reps: "12", restTimeSeconds: 60 },
        ],
      },
    ],
  },
  {
    name: "Treino C - Chest & Arms",
    description: "Chest-focused workout with incline pressing and flyes, complemented by tricep and bicep exercises for complete upper body development.",
    category: "Split",
    level: "intermediate",
    durationWeeks: 8,
    sessions: [
      {
        order: 0,
        name: "Treino C",
        exercises: [
          { exerciseName: "Supino Inclinado (Barra)", sets: 4, reps: "8", restTimeSeconds: 120 },
          { exerciseName: "Pullover Halter", sets: 3, reps: "12", restTimeSeconds: 90 },
          { exerciseName: "Peck Deck", sets: 3, reps: "12", restTimeSeconds: 60 },
          { exerciseName: "Tríceps Testa", sets: 3, reps: "12", restTimeSeconds: 60 },
          { exerciseName: "Bíceps Martelo", sets: 3, reps: "12", restTimeSeconds: 60 },
          { exerciseName: "Femoral", sets: 3, reps: "12", restTimeSeconds: 60 },
        ],
      },
    ],
  },
];
