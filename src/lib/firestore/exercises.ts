import { collection, getDocs, query, where } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import { DEFAULT_EXERCISES } from "@/lib/default-exercises";
import { addDocumentNonBlocking } from "@/firebase";

export async function initializeDefaultExercises(
  db: Firestore,
  userId: string
): Promise<{ success: boolean; message: string; count?: number }> {
  try {
    const exercisesRef = collection(db, "exercises");

    // Check if this user already has exercises
    const existingQuery = query(exercisesRef, where("createdBy", "==", userId));
    const existingDocs = await getDocs(existingQuery);

    if (existingDocs.size > 0) {
      return {
        success: true,
        message: `You already have ${existingDocs.size} exercises in your library.`,
        count: existingDocs.size,
      };
    }

    const now = new Date().toISOString();
    let addedCount = 0;

    for (const exercise of DEFAULT_EXERCISES) {
      try {
        await addDocumentNonBlocking(exercisesRef, {
          ...exercise,
          createdBy: userId,
          createdAt: now,
        });
        addedCount++;
      } catch (error) {
        console.error(`Failed to add exercise: ${exercise.name}`, error);
      }
    }

    return {
      success: true,
      message: `Successfully added ${addedCount} default exercises!`,
      count: addedCount,
    };
  } catch (error) {
    console.error("Failed to initialize default exercises:", error);
    return {
      success: false,
      message: "Failed to initialize default exercises. Please try again.",
    };
  }
}
