import { getFirestore, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  buildPaymentAmounts,
  computeShopTotalForStudentPeriod,
  isPaidStatus,
  isPendingStatus,
  paymentPeriodForShopMonth,
  periodDateRange,
  periodFromShopDate,
  resolveMonthlyRate,
  type ShopCatalogItem,
  type ShopLine,
} from "./shop-billing";

const db = getFirestore();

async function loadCatalog(trainerId: string): Promise<Map<string, ShopCatalogItem>> {
  const snap = await db.collection("personalTrainers").doc(trainerId).collection("shopItems").get();
  const map = new Map<string, ShopCatalogItem>();
  for (const docSnap of snap.docs) {
    const d = docSnap.data();
    map.set(docSnap.id, {
      name: String(d.name ?? ""),
      price: Number(d.price ?? 0),
      active: d.active !== false,
    });
  }
  return map;
}

async function resolveRosterStudentId(trainerId: string, authStudentId: string): Promise<string> {
  const globalSnap = await db.collection("students").doc(authStudentId).get();
  if (globalSnap.exists) {
    const rosterDocId = globalSnap.data()?.rosterDocId;
    if (typeof rosterDocId === "string" && rosterDocId.trim()) {
      const rosterSnap = await db
        .collection("personalTrainers")
        .doc(trainerId)
        .collection("students")
        .doc(rosterDocId.trim())
        .get();
      if (rosterSnap.exists) return rosterDocId.trim();
    }
  }
  const directSnap = await db
    .collection("personalTrainers")
    .doc(trainerId)
    .collection("students")
    .doc(authStudentId)
    .get();
  if (directSnap.exists) return authStudentId;

  const q = await db
    .collection("personalTrainers")
    .doc(trainerId)
    .collection("students")
    .where("userId", "==", authStudentId)
    .limit(1)
    .get();
  if (!q.empty) return q.docs[0].id;
  return authStudentId;
}

export async function syncShopPaymentForPeriod(
  trainerId: string,
  authStudentId: string,
  paymentPeriod: string,
  shopSourcePeriod?: string
): Promise<void> {
  const rosterStudentId = await resolveRosterStudentId(trainerId, authStudentId);
  const rosterRef = db.collection("personalTrainers").doc(trainerId).collection("students").doc(rosterStudentId);
  const rosterSnap = await rosterRef.get();
  if (!rosterSnap.exists) {
    logger.warn("syncShopPayment: roster not found", { trainerId, rosterStudentId });
    return;
  }

  const roster = rosterSnap.data() as Record<string, unknown>;
  if (String(roster.billingStatus ?? "").trim().toLowerCase() !== "active") return;

  const monthlyRate = resolveMonthlyRate(roster);
  const sourcePeriod = shopSourcePeriod ?? paymentPeriod;
  const range = periodDateRange(sourcePeriod);
  if (!range) return;
  const { startDate, endDate } = range;

  const regsSnap = await db
    .collection("personalTrainers")
    .doc(trainerId)
    .collection("shopRegistrations")
    .where("studentId", "==", authStudentId)
    .where("date", ">=", startDate)
    .where("date", "<=", endDate)
    .get();

  const catalog = await loadCatalog(trainerId);
  const registrations = regsSnap.docs.map((d) => {
    const data = d.data();
    return {
      date: String(data.date ?? ""),
      lines: Array.isArray(data.lines) ? (data.lines as ShopLine[]) : [],
    };
  });

  const shopTotal = computeShopTotalForStudentPeriod(registrations, catalog, sourcePeriod);
  if (monthlyRate <= 0 && shopTotal <= 0) return;

  const amounts = buildPaymentAmounts(monthlyRate, shopTotal);
  const nowIso = new Date().toISOString();

  const paymentsCol = rosterRef.collection("payments");
  const pendingSnap = await paymentsCol.where("period", "==", paymentPeriod).get();

  let pendingDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  for (const p of pendingSnap.docs) {
    if (isPaidStatus(p.data().status)) continue;
    if (isPendingStatus(p.data().status) || !p.data().status) {
      pendingDoc = p;
      break;
    }
  }

  const paymentPayload = {
    period: paymentPeriod,
    amount: amounts.amount,
    baseAmount: amounts.baseAmount,
    shopAmount: amounts.shopAmount,
    method: String(roster.paymentMethod ?? "mbway") || "mbway",
    status: "pending",
    paidAt: null,
    shopSyncedAt: nowIso,
  };

  if (pendingDoc) {
    await pendingDoc.ref.update(paymentPayload);
    return;
  }

  const anyPaid = pendingSnap.docs.some((p) => isPaidStatus(p.data().status));
  if (anyPaid) return;

  await paymentsCol.add({
    ...paymentPayload,
    createdAt: nowIso,
    source: "shop_sync",
  });
}

function periodFromRegistrationWrite(
  before: DocumentData | undefined,
  after: DocumentData | undefined
): { trainerId: string; studentId: string; paymentPeriod: string; shopSourcePeriod: string } | null {
  const data = after ?? before;
  if (!data) return null;
  const trainerId = String(data.trainerId ?? "").trim();
  const studentId = String(data.studentId ?? "").trim();
  const date = String(data.date ?? "").trim();
  const shopSourcePeriod = periodFromShopDate(date);
  if (!trainerId || !studentId || !shopSourcePeriod) return null;
  const paymentPeriod = paymentPeriodForShopMonth(shopSourcePeriod);
  if (!paymentPeriod) return null;
  return { trainerId, studentId, paymentPeriod, shopSourcePeriod };
}

export const syncShopPaymentOnRegistrationWrite = onDocumentWritten(
  {
    document: "personalTrainers/{trainerId}/shopRegistrations/{regId}",
    region: "europe-west1",
  },
  async (event) => {
    const info = periodFromRegistrationWrite(
      event.data?.before.data(),
      event.data?.after.data()
    );
    if (!info) return;
    try {
      await syncShopPaymentForPeriod(
        info.trainerId,
        info.studentId,
        info.paymentPeriod,
        info.shopSourcePeriod
      );
    } catch (e) {
      logger.error("syncShopPaymentOnRegistrationWrite failed", e);
      throw e;
    }
  }
);

export const syncShopPaymentCallable = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    const trainerId = String(request.data?.trainerId ?? "").trim();
    const studentId = String(request.data?.studentId ?? "").trim();
    const paymentPeriod = String(request.data?.paymentPeriod ?? request.data?.period ?? "").trim();
    const shopSourcePeriod = String(request.data?.shopSourcePeriod ?? "").trim() || undefined;
    if (!trainerId || !studentId || !/^\d{4}-\d{2}$/.test(paymentPeriod)) {
      throw new HttpsError(
        "invalid-argument",
        "trainerId, studentId, and paymentPeriod (YYYY-MM) required."
      );
    }
    if (shopSourcePeriod && !/^\d{4}-\d{2}$/.test(shopSourcePeriod)) {
      throw new HttpsError("invalid-argument", "shopSourcePeriod must be YYYY-MM when provided.");
    }
    if (request.auth.uid !== trainerId) {
      throw new HttpsError("permission-denied", "Only the coach can recalculate shop billing.");
    }
    await syncShopPaymentForPeriod(trainerId, studentId, paymentPeriod, shopSourcePeriod);
    return { ok: true };
  }
);
