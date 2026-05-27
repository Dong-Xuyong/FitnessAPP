import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

export async function callRepairMyShopBilling(): Promise<{ repaired: number }> {
  const functions = getFunctions(getApp(), "europe-west1");
  const repair = httpsCallable<Record<string, never>, { ok: boolean; repaired: number }>(
    functions,
    "repairMyShopBillingCallable"
  );
  const result = await repair({});
  return { repaired: Number(result.data?.repaired ?? 0) };
}
