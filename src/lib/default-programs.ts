import type { TrainingProgramSession } from "@/lib/types";

/** Canonical Firestore `name` for the seeded default weekly strength meta-program. */
export const DEFAULT_WEEKLY_STRENGTH_CYCLE_TITLE = "Ciclo força — 6 treinos / 5 semanas";

/** Ordered names for the default weekly strength cycle seed (must match `name` on each program). */
export const DEFAULT_WEEKLY_STRENGTH_CYCLE_NAMES = [
  "Main pu",
  "Volume pu",
  "Main Dip",
  "Volume Dip",
  "Main Squat",
  "Volume Front Squat",
] as const;

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
          { exerciseName: "Remada T",                  sets: 1, reps: "", restTimeSeconds: 0, notes: "4 séries × 10 reps | Descanso: 90 seg | Carga progressiva — aumentar peso quando conseguir completar todas as séries com boa técnica." },
          { exerciseName: "Pull Down Barra",            sets: 1, reps: "", restTimeSeconds: 0, notes: "4 séries × 10 reps | Descanso: 90 seg | Puxar até ao peito, cotovelos apontados para baixo." },
          { exerciseName: "Remada Máquina",             sets: 1, reps: "", restTimeSeconds: 0, notes: "3 séries × 12 reps | Descanso: 90 seg | Manter coluna neutra, retrair as omoplatas no final do movimento." },
          { exerciseName: "Remada Alta (cabo)",         sets: 1, reps: "", restTimeSeconds: 0, notes: "3 séries × 12 reps | Descanso: 60 seg | Cotovelos acima dos ombros no ponto de contração." },
          { exerciseName: "Rosca Alt. Halter",          sets: 1, reps: "", restTimeSeconds: 0, notes: "3 séries × 12 reps | Descanso: 60 seg | Alternar os braços, supinar o punho no topo do movimento." },
          { exerciseName: "Tríceps Francês",            sets: 1, reps: "", restTimeSeconds: 0, notes: "3 séries × 12 reps | Descanso: 60 seg | Cotovelos fixos apontados para o teto, descer a barra até à testa." },
          { exerciseName: "KB Deadlift Unilateral",     sets: 1, reps: "", restTimeSeconds: 0, notes: "3 séries × 10 reps (cada lado) | Descanso: 90 seg | Manter anca alinhada, coluna neutra e core ativo durante todo o movimento." },
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
          { exerciseName: "Split Squat Halter",              sets: 1, reps: "", restTimeSeconds: 0, notes: "4 séries × 10 reps (cada perna) | Descanso: 90 seg | Joelho traseiro a 2 cm do chão, tronco ereto." },
          { exerciseName: "Abdução Polia",                   sets: 1, reps: "", restTimeSeconds: 0, notes: "3 séries × 15 reps | Descanso: 60 seg | Movimento controlado, evitar compensação com o tronco." },
          { exerciseName: "Extensão Quadril Máquina",        sets: 1, reps: "", restTimeSeconds: 0, notes: "3 séries × 12 reps | Descanso: 90 seg | Contrair os glúteos no ponto máximo, descer de forma controlada." },
          { exerciseName: "Agachamento",                     sets: 1, reps: "", restTimeSeconds: 0, notes: "4 séries × 8 reps | Descanso: 120 seg | Descer até às coxas paralelas ao chão, joelhos alinhados com os pés." },
          { exerciseName: "Gémeos Prensa",                   sets: 1, reps: "", restTimeSeconds: 0, notes: "4 séries × 15 reps | Descanso: 60 seg | Amplitude completa — calcanhar abaixo da plataforma no ponto baixo." },
          { exerciseName: "Elevação Pélvica Unilateral",     sets: 1, reps: "", restTimeSeconds: 0, notes: "3 séries × 12 reps (cada lado) | Descanso: 60 seg | Contrair o glúteo no topo, manter anca nivelada." },
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
          { exerciseName: "Supino Inclinado (Barra)", sets: 1, reps: "", restTimeSeconds: 0, notes: "4 séries × 8 reps | Descanso: 120 seg | Barra desce até ao peito, cotovelos a ~45° do tronco." },
          { exerciseName: "Pullover Halter",          sets: 1, reps: "", restTimeSeconds: 0, notes: "3 séries × 12 reps | Descanso: 90 seg | Braços semifletidos, descer o halter atrás da cabeça até ao nível do banco." },
          { exerciseName: "Peck Deck",                sets: 1, reps: "", restTimeSeconds: 0, notes: "3 séries × 12 reps | Descanso: 60 seg | Contrair o peitoral no centro, retroceder de forma controlada." },
          { exerciseName: "Tríceps Testa",            sets: 1, reps: "", restTimeSeconds: 0, notes: "3 séries × 12 reps | Descanso: 60 seg | Cotovelos fixos apontados para o teto, extensão completa no topo." },
          { exerciseName: "Bíceps Martelo",           sets: 1, reps: "", restTimeSeconds: 0, notes: "3 séries × 12 reps | Descanso: 60 seg | Pega neutra (polegar para cima), curl até aos ombros." },
          { exerciseName: "Femoral",                  sets: 1, reps: "", restTimeSeconds: 0, notes: "3 séries × 12 reps | Descanso: 60 seg | Amplitude completa, contração no final de cada repetição." },
        ],
      },
    ],
  },

  {
    name: "Main pu",
    description:
      "Bloco principal da progressão (main lift 3×4). Sobrecarga linear semanal 35 kg – 45 kg (+2,5 kg/semana). Corpo + lastro. Cinco sessões = semanas 1–5 na atribuição semanal.",
    category: "Strength",
    level: "intermediate",
    durationWeeks: 5,
    sessions: [
      { order: 0, name: "Semana 1", exercises: [{ exerciseName: "Pull-Up", sets: 1, reps: "", restTimeSeconds: 0, notes: "Main lift | 3×4 @ 35 kg adicional." }] },
      { order: 1, name: "Semana 2", exercises: [{ exerciseName: "Pull-Up", sets: 1, reps: "", restTimeSeconds: 0, notes: "Main lift | 3×4 @ 37,5 kg adicional." }] },
      { order: 2, name: "Semana 3", exercises: [{ exerciseName: "Pull-Up", sets: 1, reps: "", restTimeSeconds: 0, notes: "Main lift | 3×4 @ 40 kg adicional." }] },
      { order: 3, name: "Semana 4", exercises: [{ exerciseName: "Pull-Up", sets: 1, reps: "", restTimeSeconds: 0, notes: "Main lift | 3×4 @ 42,5 kg adicional." }] },
      { order: 4, name: "Semana 5", exercises: [{ exerciseName: "Pull-Up", sets: 1, reps: "", restTimeSeconds: 0, notes: "Main lift | 3×4 @ 45 kg adicional." }] },
    ],
  },

  {
    name: "Volume pu",
    description:
      "Bloco de volume ponderado (5×5) 25 kg – 35 kg (+2,5 kg/semana). Cinco sessões = semanas 1–5 na atribuição semanal.",
    category: "Strength",
    level: "intermediate",
    durationWeeks: 5,
    sessions: [
      { order: 0, name: "Semana 1", exercises: [{ exerciseName: "Pull-Up", sets: 1, reps: "", restTimeSeconds: 0, notes: "Weighted volume | 5×5 @ 25 kg." }] },
      { order: 1, name: "Semana 2", exercises: [{ exerciseName: "Pull-Up", sets: 1, reps: "", restTimeSeconds: 0, notes: "Weighted volume | 5×5 @ 27,5 kg." }] },
      { order: 2, name: "Semana 3", exercises: [{ exerciseName: "Pull-Up", sets: 1, reps: "", restTimeSeconds: 0, notes: "Weighted volume | 5×5 @ 30 kg." }] },
      { order: 3, name: "Semana 4", exercises: [{ exerciseName: "Pull-Up", sets: 1, reps: "", restTimeSeconds: 0, notes: "Weighted volume | 5×5 @ 32,5 kg." }] },
      { order: 4, name: "Semana 5", exercises: [{ exerciseName: "Pull-Up", sets: 1, reps: "", restTimeSeconds: 0, notes: "Weighted volume | 5×5 @ 35 kg." }] },
    ],
  },

  {
    name: "Main Dip",
    description:
      "Bloco de intensidade (3×10) 20 kg – 30 kg (+2,5 kg/semana). Cinco sessões = semanas 1–5 na atribuição semanal.",
    category: "Strength",
    level: "intermediate",
    durationWeeks: 5,
    sessions: [
      { order: 0, name: "Semana 1", exercises: [{ exerciseName: "Dip", sets: 1, reps: "", restTimeSeconds: 0, notes: "Weighted intensity | 3×10 @ 20 kg." }] },
      { order: 1, name: "Semana 2", exercises: [{ exerciseName: "Dip", sets: 1, reps: "", restTimeSeconds: 0, notes: "Weighted intensity | 3×10 @ 22,5 kg." }] },
      { order: 2, name: "Semana 3", exercises: [{ exerciseName: "Dip", sets: 1, reps: "", restTimeSeconds: 0, notes: "Weighted intensity | 3×10 @ 25 kg." }] },
      { order: 3, name: "Semana 4", exercises: [{ exerciseName: "Dip", sets: 1, reps: "", restTimeSeconds: 0, notes: "Weighted intensity | 3×10 @ 27,5 kg." }] },
      { order: 4, name: "Semana 5", exercises: [{ exerciseName: "Dip", sets: 1, reps: "", restTimeSeconds: 0, notes: "Weighted intensity | 3×10 @ 30 kg." }] },
    ],
  },

  {
    name: "Volume Dip",
    description:
      "Bloco de volume (4×8) 20 kg – 30 kg (+2,5 kg/semana). Cinco sessões = semanas 1–5 na atribuição semanal.",
    category: "Strength",
    level: "intermediate",
    durationWeeks: 5,
    sessions: [
      { order: 0, name: "Semana 1", exercises: [{ exerciseName: "Dip", sets: 1, reps: "", restTimeSeconds: 0, notes: "Weighted volume | 4×8 @ 20 kg." }] },
      { order: 1, name: "Semana 2", exercises: [{ exerciseName: "Dip", sets: 1, reps: "", restTimeSeconds: 0, notes: "Weighted volume | 4×8 @ 22,5 kg." }] },
      { order: 2, name: "Semana 3", exercises: [{ exerciseName: "Dip", sets: 1, reps: "", restTimeSeconds: 0, notes: "Weighted volume | 4×8 @ 25 kg." }] },
      { order: 3, name: "Semana 4", exercises: [{ exerciseName: "Dip", sets: 1, reps: "", restTimeSeconds: 0, notes: "Weighted volume | 4×8 @ 27,5 kg." }] },
      { order: 4, name: "Semana 5", exercises: [{ exerciseName: "Dip", sets: 1, reps: "", restTimeSeconds: 0, notes: "Weighted volume | 4×8 @ 30 kg." }] },
    ],
  },

  {
    name: "Main Squat",
    description:
      "Bloco de intensidade (3×10) 70 kg – 80 kg (+2,5 kg/semana). Cinco sessões = semanas 1–5 na atribuição semanal.",
    category: "Strength",
    level: "beginner",
    durationWeeks: 5,
    sessions: [
      { order: 0, name: "Semana 1", exercises: [{ exerciseName: "Barbell Squat", sets: 1, reps: "", restTimeSeconds: 0, notes: "Intensity | 3×10 @ 70 kg." }] },
      { order: 1, name: "Semana 2", exercises: [{ exerciseName: "Barbell Squat", sets: 1, reps: "", restTimeSeconds: 0, notes: "Intensity | 3×10 @ 72,5 kg." }] },
      { order: 2, name: "Semana 3", exercises: [{ exerciseName: "Barbell Squat", sets: 1, reps: "", restTimeSeconds: 0, notes: "Intensity | 3×10 @ 75 kg." }] },
      { order: 3, name: "Semana 4", exercises: [{ exerciseName: "Barbell Squat", sets: 1, reps: "", restTimeSeconds: 0, notes: "Intensity | 3×10 @ 77,5 kg." }] },
      { order: 4, name: "Semana 5", exercises: [{ exerciseName: "Barbell Squat", sets: 1, reps: "", restTimeSeconds: 0, notes: "Intensity | 3×10 @ 80 kg." }] },
    ],
  },

  {
    name: "Volume Front Squat",
    description:
      "Bloco de volume (5×5) 50 kg – 60 kg (+2,5 kg/semana). Técnica/volume; Cinco sessões = semanas 1–5 na atribuição semanal.",
    category: "Strength",
    level: "beginner",
    durationWeeks: 5,
    sessions: [
      { order: 0, name: "Semana 1", exercises: [{ exerciseName: "Barbell Squat", sets: 1, reps: "", restTimeSeconds: 0, notes: "Volume Technique | 5×5 @ 50 kg." }] },
      { order: 1, name: "Semana 2", exercises: [{ exerciseName: "Barbell Squat", sets: 1, reps: "", restTimeSeconds: 0, notes: "Volume Technique | 5×5 @ 52,5 kg." }] },
      { order: 2, name: "Semana 3", exercises: [{ exerciseName: "Barbell Squat", sets: 1, reps: "", restTimeSeconds: 0, notes: "Volume Technique | 5×5 @ 55 kg." }] },
      { order: 3, name: "Semana 4", exercises: [{ exerciseName: "Barbell Squat", sets: 1, reps: "", restTimeSeconds: 0, notes: "Volume Technique | 5×5 @ 57,5 kg." }] },
      { order: 4, name: "Semana 5", exercises: [{ exerciseName: "Barbell Squat", sets: 1, reps: "", restTimeSeconds: 0, notes: "Volume Technique | 5×5 @ 60 kg." }] },
    ],
  },
];
