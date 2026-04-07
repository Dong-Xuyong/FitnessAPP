export const DEFAULT_EXERCISES = [
  // Chest
  { name: "Barbell Bench Press", category: "Chest", description: "Classic compound movement for chest development", difficulty: "intermediate", equipment: "Barbell, Bench" },
  { name: "Dumbbell Flyes", category: "Chest", description: "Isolated chest exercise using dumbbells", difficulty: "intermediate", equipment: "Dumbbells, Bench" },
  { name: "Push-ups", category: "Chest", description: "Bodyweight chest exercise", difficulty: "beginner", equipment: "None" },
  { name: "Incline Bench Press", category: "Chest", description: "Targets upper chest and front shoulders", difficulty: "intermediate", equipment: "Barbell, Incline Bench" },

  // Back
  { name: "Barbell Deadlift", category: "Back", description: "Compound movement for total back development", difficulty: "advanced", equipment: "Barbell" },
  { name: "Bent Over Rows", category: "Back", description: "Builds back thickness and strength", difficulty: "intermediate", equipment: "Barbell" },
  { name: "Pull-ups", category: "Back", description: "Bodyweight back exercise", difficulty: "intermediate", equipment: "Pull-up Bar" },
  { name: "Lat Pulldowns", category: "Back", description: "Isolates latissimus dorsi", difficulty: "beginner", equipment: "Cable Machine" },

  // Legs
  { name: "Barbell Squats", category: "Legs", description: "Fundamental compound leg exercise", difficulty: "intermediate", equipment: "Barbell, Rack" },
  { name: "Leg Press", category: "Legs", description: "Machine-based leg exercise", difficulty: "beginner", equipment: "Leg Press Machine" },
  { name: "Romanian Deadlifts", category: "Legs", description: "Targets hamstrings and lower back", difficulty: "intermediate", equipment: "Barbell" },
  { name: "Leg Curls", category: "Legs", description: "Isolates hamstrings", difficulty: "beginner", equipment: "Leg Curl Machine" },

  // Shoulders
  { name: "Barbell Military Press", category: "Shoulders", description: "Compound shoulder pressing exercise", difficulty: "intermediate", equipment: "Barbell" },
  { name: "Lateral Raises", category: "Shoulders", description: "Isolates side delts", difficulty: "beginner", equipment: "Dumbbells" },
  { name: "Dumbbell Shoulder Press", category: "Shoulders", description: "Unilateral shoulder pressing", difficulty: "intermediate", equipment: "Dumbbells, Bench" },
  { name: "Reverse Pec Deck Flyes", category: "Shoulders", description: "Targets rear delts", difficulty: "beginner", equipment: "Reverse Pec Deck Machine" },

  // Arms
  { name: "Barbell Curls", category: "Arms", description: "Bicep building exercise", difficulty: "beginner", equipment: "Barbell" },
  { name: "Dumbbell Curls", category: "Arms", description: "Unilateral bicep exercise", difficulty: "beginner", equipment: "Dumbbells" },
  { name: "Tricep Pushdowns", category: "Arms", description: "Isolates triceps using cable", difficulty: "beginner", equipment: "Cable Machine" },
  { name: "Overhead Tricep Extensions", category: "Arms", description: "Targets long head of triceps", difficulty: "intermediate", equipment: "Dumbbell" },

  // Core
  { name: "Planks", category: "Core", description: "Bodyweight core stabilization", difficulty: "beginner", equipment: "None" },
  { name: "Crunches", category: "Core", description: "Abdominal movement", difficulty: "beginner", equipment: "None" },
  { name: "Dead Bugs", category: "Core", description: "Core stability and coordination", difficulty: "beginner", equipment: "None" },
  { name: "Russian Twists", category: "Core", description: "Oblique targeting exercise", difficulty: "intermediate", equipment: "Weight Plate or Dumbbell" },

  // Cardio
  { name: "Running", category: "Cardio", description: "Cardiovascular endurance training", difficulty: "beginner", equipment: "None or Treadmill" },
  { name: "Cycling", category: "Cardio", description: "Low-impact cardio", difficulty: "beginner", equipment: "Bicycle or Stationary Bike" },
  { name: "Jump Rope", category: "Cardio", description: "High-intensity cardio", difficulty: "intermediate", equipment: "Jump Rope" },
  { name: "Rowing", category: "Cardio", description: "Full-body cardio and strength", difficulty: "intermediate", equipment: "Rowing Machine" },

  // Portuguese Workout Exercises - Treino A
  { name: "Remada T", category: "Back", description: "T-Bar Row for back thickness", difficulty: "intermediate", equipment: "T-Bar Row Machine" },
  { name: "Pull Down Barra", category: "Back", description: "Lat Pulldown with straight bar", difficulty: "beginner", equipment: "Cable Machine, Lat Bar" },
  { name: "Remada Máquina", category: "Back", description: "Machine row for back development", difficulty: "beginner", equipment: "Row Machine" },
  { name: "Remada Alta (cabo)", category: "Shoulders", description: "Cable high row for rear delts and upper back", difficulty: "intermediate", equipment: "Cable Machine" },
  { name: "Rosca Alt. Halter", category: "Arms", description: "Alternating dumbbell curl for biceps", difficulty: "beginner", equipment: "Dumbbells" },
  { name: "Tríceps Francês", category: "Arms", description: "French press for triceps", difficulty: "intermediate", equipment: "EZ Bar or Dumbbell" },
  { name: "KB Deadlift Unilateral", category: "Back", description: "Unilateral kettlebell deadlift", difficulty: "intermediate", equipment: "Kettlebell" },

  // Portuguese Workout Exercises - Treino B
  { name: "Split Squat Halter", category: "Legs", description: "Dumbbell split squat for unilateral leg strength", difficulty: "intermediate", equipment: "Dumbbells" },
  { name: "Abdução Polia", category: "Legs", description: "Cable hip abduction for outer thighs and glutes", difficulty: "beginner", equipment: "Cable Machine, Ankle Strap" },
  { name: "Extensão Quadril Máquina", category: "Legs", description: "Hip extension machine for glutes and hamstrings", difficulty: "beginner", equipment: "Hip Extension Machine" },
  { name: "Agachamento", category: "Legs", description: "Squat - fundamental leg exercise", difficulty: "intermediate", equipment: "Barbell or Bodyweight" },
  { name: "Gémeos Prensa", category: "Legs", description: "Leg press calf raise for calves", difficulty: "beginner", equipment: "Leg Press Machine" },
  { name: "Elevação Pélvica Unilateral", category: "Legs", description: "Unilateral hip thrust for glute activation", difficulty: "intermediate", equipment: "Bench, Weight" },

  // Portuguese Workout Exercises - Treino C
  { name: "Supino Inclinado (Barra)", category: "Chest", description: "Barbell incline bench press for upper chest", difficulty: "intermediate", equipment: "Barbell, Incline Bench" },
  { name: "Pullover Halter", category: "Chest", description: "Dumbbell pullover for chest and lats", difficulty: "intermediate", equipment: "Dumbbell, Bench" },
  { name: "Peck Deck", category: "Chest", description: "Pec deck fly machine for chest isolation", difficulty: "beginner", equipment: "Pec Deck Machine" },
  { name: "Tríceps Testa", category: "Arms", description: "Lying tricep extension (skull crusher)", difficulty: "intermediate", equipment: "EZ Bar or Barbell" },
  { name: "Bíceps Martelo", category: "Arms", description: "Hammer curl for biceps and brachialis", difficulty: "beginner", equipment: "Dumbbells" },
  { name: "Femoral", category: "Legs", description: "Leg curl for hamstring isolation", difficulty: "beginner", equipment: "Leg Curl Machine" },
];
