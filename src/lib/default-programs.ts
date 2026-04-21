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
];
