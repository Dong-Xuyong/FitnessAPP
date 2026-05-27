import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { ShopPurchaseLike } from "@/lib/shop-billing";

export async function fetchMyShopPurchases(): Promise<ShopPurchaseLike[]> {
  const functions = getFunctions(getApp(), "europe-west1");
  const list = httpsCallable<Record<string, never>, { ok: boolean; purchases: ShopPurchaseLike[] }>(
    functions,
    "listMyShopPurchasesCallable"
  );
  const result = await list({});
  return Array.isArray(result.data?.purchases) ? result.data.purchases : [];
}
