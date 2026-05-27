import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

export async function callRepairShopLinesForStudent(
  trainerId: string,
  rosterStudentId: string
): Promise<{ repaired: number }> {
  const functions = getFunctions(getApp(), "europe-west1");
  const repair = httpsCallable<
    { trainerId: string; rosterStudentId: string },
    { ok: boolean; repaired: number }
  >(functions, "repairShopLinesForStudentCallable");
  const result = await repair({ trainerId, rosterStudentId });
  return { repaired: Number(result.data?.repaired ?? 0) };
}
