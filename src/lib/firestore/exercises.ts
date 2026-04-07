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

    const existingQuery = query(exercisesRef, where("createdBy", "==", userId));
    const existingDocs = await getDocs(existingQuery);
    const existingNames = new Set(existingDocs.docs.map((d) => d.data().name as string));

    const missing = DEFAULT_EXERCISES.filter((ex) => !existingNames.has(ex.name));

    if (missing.length === 0) {
      return {
        success: true,
        message: `Your exercise library is already up to date (${existingDocs.size} exercises).`,
        count: existingDocs.size,
      };
    }

    const now = new Date().toISOString();
    let addedCount = 0;

    for (const exercise of missing) {
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
      message: `Added ${addedCount} missing exercise${addedCount !== 1 ? "s" : ""} to your library!`,
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
