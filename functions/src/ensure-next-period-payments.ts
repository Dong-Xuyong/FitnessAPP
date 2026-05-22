import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { isPaidStatus, isPendingStatus, resolveMonthlyRate, shopSourcePeriodForPaymentPeriod } from "./shop-billing";
import {
  currentBillingPeriod,
  isWithinLastThreeDaysOfMonth,
  lisbonYmd,
  nextBillingPeriod,
} from "./lisbon-billing-window";
import { syncShopPaymentForPeriod } from "./shop-billing-sync";

const db = getFirestore();
const LISBON_TZ = "Europe/Lisbon";

/** Remove pending payment rows for calendar months after the current Lisbon month. */
async function cleanupFuturePendingPayments(currentPeriod: string): Promise<number> {
  const trainersSnap = await db.collection("personalTrainers").get();
  let deleted = 0;

  for (const tDoc of trainersSnap.docs) {
    const trainerId = tDoc.id;
    const studentsSnap = await db
      .collection("personalTrainers")
      .doc(trainerId)
      .collection("students")
      .get();

    for (const sDoc of studentsSnap.docs) {
      const paymentsSnap = await sDoc.ref.collection("payments").get();
      for (const pDoc of paymentsSnap.docs) {
        const data = pDoc.data();
        const period = String(data.period ?? "").trim();
        if (!period || period <= currentPeriod) continue;
        if (isPaidStatus(data.status)) continue;
        if (!isPendingStatus(data.status) && data.status) continue;
        await pDoc.ref.delete();
        deleted += 1;
      }
    }
  }

  return deleted;
}

/**
 * Daily (Europe/Lisbon): outside the last 3 days, delete premature next-month pending rows.
 * Inside the window, create or refresh pending payments for the next billing period.
 */
export const ensureNextPeriodPayments = onSchedule(
  {
    schedule: "0 6 * * *",
    timeZone: LISBON_TZ,
    region: "europe-west1",
    memory: "512MiB",
  },
  async () => {
    const lisbon = lisbonYmd(new Date());
    const currentPeriod = currentBillingPeriod(lisbon);

    if (!isWithinLastThreeDaysOfMonth(lisbon)) {
      const removed = await cleanupFuturePendingPayments(currentPeriod);
      logger.info("ensureNextPeriodPayments: cleaned future pending rows", {
        lisbon,
        currentPeriod,
        removed,
      });
      return;
    }

    const paymentPeriod = nextBillingPeriod(lisbon);
    const shopSourcePeriod = shopSourcePeriodForPaymentPeriod(paymentPeriod);
    if (!shopSourcePeriod) {
      logger.warn("ensureNextPeriodPayments: invalid payment period", { paymentPeriod });
      return;
    }

    const trainersSnap = await db.collection("personalTrainers").get();
    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const tDoc of trainersSnap.docs) {
      const trainerId = tDoc.id;
      const studentsSnap = await db
        .collection("personalTrainers")
        .doc(trainerId)
        .collection("students")
        .get();

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
          await syncShopPaymentForPeriod(
            trainerId,
            authUid,
            paymentPeriod,
            shopSourcePeriod,
            { createSource: "auto_next_month_scheduled" }
          );
          processed += 1;
        } catch (e) {
          errors += 1;
          logger.error("ensureNextPeriodPayments student failed", {
            trainerId,
            rosterId: sDoc.id,
            paymentPeriod,
            error: e,
          });
        }
      }
    }

    logger.info("ensureNextPeriodPayments completed", {
      lisbon,
      paymentPeriod,
      shopSourcePeriod,
      processed,
      skipped,
      errors,
    });
  }
);
