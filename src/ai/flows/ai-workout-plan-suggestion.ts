'use server';
/**
 * @fileOverview An AI agent that suggests initial workout plans or exercises based on student profiles.
 *
 * - aiWorkoutPlanSuggestion - A function that handles the AI workout plan suggestion process.
 * - AiWorkoutPlanSuggestionInput - The input type for the aiWorkoutPlanSuggestion function.
 * - AiWorkoutPlanSuggestionOutput - The return type for the aiWorkoutPlanSuggestion function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AiWorkoutPlanSuggestionInputSchema = z.object({
  studentGoals: z
    .string()
    .describe('The primary fitness goal of the student (e.g., "build muscle mass", "lose weight", "improve endurance").'),
  studentAge: z.number().describe("The student's age in years."),
  studentWeightKg: z.number().describe("The student's weight in kilograms."),
  studentFitnessLevel: z
    .string()
    .describe('The current fitness level of the student (e.g., "beginner", "intermediate", "advanced").'),
});
export type AiWorkoutPlanSuggestionInput = z.infer<typeof AiWorkoutPlanSuggestionInputSchema>;

const ExerciseSchema = z.object({
  exerciseName: z.string().describe('The name of the exercise (e.g., "Barbell Bench Press", "Squats", "Overhead Press").'),
  sets: z.number().describe('The number of sets for this exercise.'),
  reps: z.string().describe('The repetition range for this exercise (e.g., "8-12", "3x5", "15-20", "AMRAP").'),
  restTimeSeconds: z.number().describe('The recommended rest time in seconds after each set.'),
  notes: z.string().optional().describe('Any additional specific instructions or tips for this exercise.'),
});

const AiWorkoutPlanSuggestionOutputSchema = z.object({
  workoutPlan: z.array(ExerciseSchema).describe('A suggested workout plan consisting of a list of exercises for a single session.'),
  planSummary: z.string().describe('A brief summary and rationale for the generated workout plan, explaining why these exercises were chosen.'),
});
export type AiWorkoutPlanSuggestionOutput = z.infer<typeof AiWorkoutPlanSuggestionOutputSchema>;

export async function aiWorkoutPlanSuggestion(
  input: AiWorkoutPlanSuggestionInput
): Promise<AiWorkoutPlanSuggestionOutput> {
  return aiWorkoutPlanSuggestionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'aiWorkoutPlanSuggestionPrompt',
  input: {schema: AiWorkoutPlanSuggestionInputSchema},
  output: {schema: AiWorkoutPlanSuggestionOutputSchema},
  prompt: `You are an expert personal trainer and fitness coach. Your task is to generate an initial draft of a workout plan or suggest relevant exercises for a student based on their profile.

Consider the following student information:
- Goals: {{{studentGoals}}}
- Age: {{{studentAge}}} years
- Weight: {{{studentWeightKg}}} kg
- Fitness Level: {{{studentFitnessLevel}}}

Based on this information, suggest a workout plan for a single training session. The plan should be realistic, safe, and effective for the student's current level and goals. Provide 4-6 exercises.

Provide a list of exercises, including the exercise name, number of sets, repetition range, and recommended rest time in seconds. Also, provide a brief summary and rationale for the generated workout plan.

Example structure for a single exercise:
Exercise Name: Barbell Bench Press
Sets: 3
Reps: 8-12
Rest Time Seconds: 90
Notes: Focus on controlled movement.

Remember to output only the JSON object as defined by the output schema.`,
});

const aiWorkoutPlanSuggestionFlow = ai.defineFlow(
  {
    name: 'aiWorkoutPlanSuggestionFlow',
    inputSchema: AiWorkoutPlanSuggestionInputSchema,
    outputSchema: AiWorkoutPlanSuggestionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    if (!output) {
        throw new Error('Failed to generate workout plan.');
    }
    return output;
  }
);
