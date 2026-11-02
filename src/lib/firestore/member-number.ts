import { collection, getDocs, type Firestore } from "firebase/firestore";
import {
  findRosterStudentByMemberNumber,
  memberNumberKey,
  type MemberNumberMatch,
  type MemberNumberRosterRow,
} from "@/lib/member-number";

/**
 * Look up one student by coach and member number.
 * Reads `personalTrainers/{coachId}/students` and compares `memberNumber`
 * after trim, case-insensitively. Returns null when the number is blank or unused.
 */
export async function findStudentByCoachAndMemberNumber(
  db: Firestore,
  coachId: string,
  memberNumber: string,
  options?: { excludeIds?: readonly string[] }
): Promise<MemberNumberMatch | null> {
  const coach = coachId.trim();
  if (!coach || !memberNumberKey(memberNumber)) return null;
  const snap = await getDocs(collection(db, "personalTrainers", coach, "students"));
  const students: MemberNumberRosterRow[] = snap.docs.map((docSnap) => {
    const data = docSnap.data() as Omit<MemberNumberRosterRow, "id">;
    return { id: docSnap.id, ...data };
  });
  return findRosterStudentByMemberNumber(students, memberNumber, options);
}
