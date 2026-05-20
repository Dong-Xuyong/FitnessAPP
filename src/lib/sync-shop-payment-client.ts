import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

export async function callSyncShopPayment(
  trainerId: string,
  studentId: string,
  paymentPeriod: string,
  shopSourcePeriod?: string
): Promise<void> {
  const functions = getFunctions(getApp(), "europe-west1");
  const sync = httpsCallable<
    {
      trainerId: string;
      studentId: string;
      paymentPeriod: string;
      shopSourcePeriod?: string;
      /** @deprecated use paymentPeriod */
      period?: string;
    },
    { ok: boolean }
  >(functions, "syncShopPaymentCallable");
  await sync({
    trainerId,
    studentId,
    paymentPeriod,
    period: paymentPeriod,
    shopSourcePeriod,
  });
}
