import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { isPaidStatus, isPendingStatus, resolveMonthlyRate, shopSourcePeriodForPaymentPeriod } from "./shop-billing";
import { lisbonYmd, nextBillingPeriod } from "./lisbon-billing-window";
import { syncShopPaymentForPeriod } from "./shop-billing-sync";

const db = getFirestore();

export type NextPeriodBulkResult = {
  period: string;
  deleted?: number;
  processed?: number;
  skipped?: number;
  errors?: number;
};

/** Delete pending payments for the next billing period only (one coach roster). */
export async function removeNextPeriodPendingForTrainer(
  trainerId: string,
  now = new Date()
): Promise<NextPeriodBulkResult> {
  const lisbon = lisbonYmd(now);
  const period = nextBillingPeriod(lisbon);
  let deleted = 0;

  const studentsSnap = await db
    .collection("personalTrainers")
    .doc(trainerId)
    .collection("students")
    .get();

  for (const sDoc of studentsSnap.docs) {
    const paymentsSnap = await sDoc.ref.collection("payments").where("period", "==", period).get();
    for (const pDoc of paymentsSnap.docs) {
      const data = pDoc.data();
      if (isPaidStatus(data.status)) continue;
      if (!isPendingStatus(data.status) && data.status) continue;
      await pDoc.ref.delete();
      deleted += 1;
    }
  }

  return { period, deleted };
}

/** Create or refresh pending payments for the next billing period (one coach roster). */
export async function createNextPeriodPendingForTrainer(
  trainerId: string,
  now = new Date()
): Promise<NextPeriodBulkResult> {
  const lisbon = lisbonYmd(now);
  const paymentPeriod = nextBillingPeriod(lisbon);
  const shopSourcePeriod = shopSourcePeriodForPaymentPeriod(paymentPeriod);
  if (!shopSourcePeriod) {
    return { period: paymentPeriod, processed: 0, skipped: 0, errors: 0 };
  }

  const studentsSnap = await db
    .collection("personalTrainers")
    .doc(trainerId)
    .collection("students")
    .get();

  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const sDoc of studentsSnap.docs) {
    const roster = sDoc.data() as Record<string, unknown>;
    if (String(roster.billingStatus ?? "").trim().toLowerCase() !== "active") {
      skipped += 1;
      continue;
    }
    const monthlyRate = resolveMonthlyRate(roster);
    if (!Number.isFinite(monthlyRate) || monthlyRate <= 0) {
      skipped += 1;
      continue;
    }

    const authUid = String(roster.userId ?? "").trim() || sDoc.id;
    try {
      await syncShopPaymentForPeriod(trainerId, authUid, paymentPeriod, shopSourcePeriod, {
        createSource: "coach_bulk_next_month",
        bypassBillingWindow: true,
      });
      processed += 1;
    } catch (e) {
      errors += 1;
      logger.error("createNextPeriodPendingForTrainer failed", {
        trainerId,
        rosterId: sDoc.id,
        paymentPeriod,
        error: e,
      });
    }
  }

  return { period: paymentPeriod, processed, skipped, errors };
}

function assertCoachTrainerId(request: { auth?: { uid?: string } | null }, trainerId: string): string {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const tid = String(trainerId || request.auth.uid).trim();
  if (!tid || request.auth.uid !== tid) {
    throw new HttpsError("permission-denied", "Only the signed-in coach can run this action.");
  }
  return tid;
}

export const createNextPeriodPaymentsCallable = onCall(
  { region: "europe-west1" },
  async (request) => {
    const trainerId = assertCoachTrainerId(
      request,
      String(request.data?.trainerId ?? "").trim()
    );
    const result = await createNextPeriodPendingForTrainer(trainerId);
    return { ok: true, ...result };
  }
);

export const removeNextPeriodPaymentsCallable = onCall(
  { region: "europe-west1" },
  async (request) => {
    const trainerId = assertCoachTrainerId(
      request,
      String(request.data?.trainerId ?? "").trim()
    );
    const result = await removeNextPeriodPendingForTrainer(trainerId);
    return { ok: true, ...result };
  }
);
