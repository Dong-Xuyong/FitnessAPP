import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import type { Milestone, MilestoneStatus } from "@/lib/types";

const MILESTONES_COLLECTION = "milestones";

/**
 * Create a new milestone for a student
 */
export async function createMilestone(
  db: Firestore,
  trainerId: string,
  studentId: string,
  milestone: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "studentId" | "trainerId">
): Promise<string> {
  try {
    const milestonesRef = collection(db, MILESTONES_COLLECTION);
    const docRef = await addDoc(milestonesRef, {
      ...milestone,
      trainerId,
      studentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return docRef.id;
  } catch (error: any) {
    console.error("Error creating milestone:", error);
    throw new Error(`Failed to create milestone: ${error.message}`);
  }
}

/**
 * Update an existing milestone
 */
export async function updateMilestone(
  db: Firestore,
  milestoneId: string,
  updates: Partial<Omit<Milestone, "id" | "studentId" | "trainerId">>
): Promise<void> {
  try {
    const milestoneRef = doc(db, MILESTONES_COLLECTION, milestoneId);
    await updateDoc(milestoneRef, {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error updating milestone:", error);
    throw new Error(`Failed to update milestone: ${error.message}`);
  }
}

/**
 * Update milestone progress (currentValue)
 */
export async function updateMilestoneProgress(
  db: Firestore,
  milestoneId: string,
  currentValue: number
): Promise<void> {
  try {
    const milestoneRef = doc(db, MILESTONES_COLLECTION, milestoneId);
    
    // Get the milestone to check if it should be marked completed
    const milestoneDocs = await getDoc(milestoneRef);
    
    if (!milestoneDocs.exists()) {
      throw new Error("Milestone not found");
    }

    const data = milestoneDocs.data() as Milestone;
    
    // Determine if milestone is completed based on category
    let updatedStatus: MilestoneStatus = data.status;
    let completedAt: string | undefined = data.completedAt;

    if (currentValue >= data.targetValue && data.status === "active") {
      updatedStatus = "completed";
      completedAt = new Date().toISOString();
    }

    await updateDoc(milestoneRef, {
      currentValue,
      status: updatedStatus,
      ...(completedAt && { completedAt }),
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error updating milestone progress:", error);
    throw new Error(`Failed to update progress: ${error.message}`);
  }
}

/**
 * Complete a milestone manually
 */
export async function completeMilestone(
  db: Firestore,
  milestoneId: string,
  currentValue?: number
): Promise<void> {
  try {
    const milestoneRef = doc(db, MILESTONES_COLLECTION, milestoneId);
    const updates: any = {
      status: "completed",
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    if (currentValue !== undefined) {
      updates.currentValue = currentValue;
    }
    
    await updateDoc(milestoneRef, updates);
  } catch (error: any) {
    console.error("Error completing milestone:", error);
    throw new Error(`Failed to complete milestone: ${error.message}`);
  }
}

/**
 * Delete a milestone
 */
export async function deleteMilestone(db: Firestore, milestoneId: string): Promise<void> {
  try {
    const milestoneRef = doc(db, MILESTONES_COLLECTION, milestoneId);
    await deleteDoc(milestoneRef);
  } catch (error: any) {
    console.error("Error deleting milestone:", error);
    throw new Error(`Failed to delete milestone: ${error.message}`);
  }
}

/**
 * Get all milestones for a specific student
 */
export async function getStudentMilestones(
  db: Firestore,
  studentId: string
): Promise<Milestone[]> {
  try {
    const milestonesRef = collection(db, MILESTONES_COLLECTION);
    const q = query(milestonesRef, where("studentId", "==", studentId));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as Milestone));
  } catch (error: any) {
    console.error("Error fetching milestones:", error);
    throw new Error(`Failed to fetch milestones: ${error.message}`);
  }
}

/**
 * Get milestones by status for a student
 */
export async function getStudentMilestonesByStatus(
  db: Firestore,
  studentId: string,
  status: "active" | "completed" | "missed" | "paused"
): Promise<Milestone[]> {
  try {
    const milestonesRef = collection(db, MILESTONES_COLLECTION);
    const q = query(
      milestonesRef,
      where("studentId", "==", studentId),
      where("status", "==", status)
    );
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    } as Milestone));
  } catch (error: any) {
    console.error("Error fetching milestones by status:", error);
    throw new Error(`Failed to fetch milestones: ${error.message}`);
  }
}

/**
 * Calculate completion percentage
 */
export function calculateProgress(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, (current / target) * 100);
}

/**
 * Format milestone display
 */
export function formatMilestone(milestone: Milestone): string {
  const progress = calculateProgress(milestone.currentValue, milestone.targetValue);
  return `${milestone.title}: ${milestone.currentValue}${milestone.targetUnit} / ${milestone.targetValue}${milestone.targetUnit} (${progress.toFixed(0)}%)`;
}

/**
 * Check if milestone is overdue
 */
export function isMilestoneOverdue(milestone: Milestone): boolean {
  if (milestone.status !== "active") return false;
  const dueDate = new Date(milestone.dueDate);
  return dueDate < new Date();
}
