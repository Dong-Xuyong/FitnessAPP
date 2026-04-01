import { doc, collection, getDocs, writeBatch, getDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

/**
 * Remove a student from a trainer roster.
 * Removes the student from:
 * 1. Trainer's students subcollection
 * 2. All trainer-owned related data (workout plans, sessions, payments)
 *
 * Note: The global students profile is not deleted because Firestore rules disallow it.
 */
export async function deleteStudent(
  db: Firestore,
  trainerId: string,
  studentId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const batch = writeBatch(db);

    // Delete from trainer's students subcollection and all related data
    const studentRef = doc(db, "personalTrainers", trainerId, "students", studentId);
    batch.delete(studentRef);

    // Delete all workout plans for this student
    const workoutPlansRef = collection(db, "personalTrainers", trainerId, "students", studentId, "workoutPlans");
    const workoutPlansDocs = await getDocs(workoutPlansRef);
    workoutPlansDocs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete all workout sessions for this student
    const workoutSessionsRef = collection(db, "personalTrainers", trainerId, "students", studentId, "workoutSessions");
    const workoutSessionsDocs = await getDocs(workoutSessionsRef);
    workoutSessionsDocs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete all payments for this student
    const paymentsRef = collection(db, "personalTrainers", trainerId, "students", studentId, "payments");
    const paymentsDocs = await getDocs(paymentsRef);
    paymentsDocs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Commit all deletions
    await batch.commit();

    // Best-effort unlink: if this student points to this trainer, clear that linkage.
    try {
      const globalStudentRef = doc(db, "students", studentId);
      const globalSnap = await getDoc(globalStudentRef);
      if (globalSnap.exists() && globalSnap.data()?.trainerId === trainerId) {
        await writeBatch(db)
          .update(globalStudentRef, {
            trainerId: null,
          })
          .commit();
      }
    } catch (unlinkError) {
      console.warn("Student removed from roster, but global unlink failed", unlinkError);
    }

    return {
      success: true,
      message: "Student removed from your roster and trainer data deleted.",
    };
  } catch (error: any) {
    console.error("Error deleting student:", error);
    return {
      success: false,
      message: `Failed to delete student: ${error.message}`,
    };
  }
}
