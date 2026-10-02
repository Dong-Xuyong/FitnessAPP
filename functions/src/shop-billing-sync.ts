import { getFirestore, type CollectionReference, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import {
  buildPaymentAmounts,
  buildShopBillingPeriodContextForMarkPaid,
  buildShopBillingPeriodContextFromPayments,
  collectTargetPaymentPeriodsFromRegistrations,
  computeUnpaidShopForPaymentPeriod,
  isLegacyShopRegistrationDoc,
  isPaidStatus,
  isPendingStatus,
  markShopPurchasePaidForPayment,
  normalizeShopPurchaseDoc,
  normalizeShopPurchasesFromDoc,
  periodFromShopDate,
  resolveMonthlyRate,
  revertShopPurchasePaidForFuturePeriods,
  shouldMarkShopLinePaidForPaymentRepair,
  type ShopCatalogItem,
  type ShopPurchaseLike,
} from "./shop-billing";
import { maySyncFuturePaymentPeriod } from "./lisbon-billing-window";

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

async function resolveShopRegistrationStudentIdsAdmin(
  trainerId: string,
  seedId: string
): Promise<string[]> {
  const seed = String(seedId || "").trim();
  const rosterDocIds: string[] = [];
  const reverseAuthUids: string[] = [];
  const rosterUserIds: string[] = [];

  if (seed) {
    const globalSnap = await db.collection("students").doc(seed).get();
    if (globalSnap.exists) {
      const rosterDocId = String(globalSnap.data()?.rosterDocId ?? "").trim();
      if (rosterDocId) rosterDocIds.push(rosterDocId);
    }
  }

  const rosterPathCandidates = [
    ...new Set([seed, ...rosterDocIds].map((s) => String(s || "").trim()).filter(Boolean)),
  ];

  for (const rosterCandidate of rosterPathCandidates) {
    const reverseSnap = await db
      .collection("students")
      .where("rosterDocId", "==", rosterCandidate)
      .get();
    for (const d of reverseSnap.docs) {
      reverseAuthUids.push(d.id);
    }
  }

  for (const rosterCandidate of rosterPathCandidates) {
    const rosterSnap = await db
      .collection("personalTrainers")
      .doc(trainerId)
      .collection("students")
      .doc(rosterCandidate)
      .get();
    if (rosterSnap.exists) {
      const linkedUid = String(rosterSnap.data()?.userId ?? "").trim();
      if (linkedUid) rosterUserIds.push(linkedUid);
    }
  }

  return [
    ...new Set(
      [seed, ...rosterDocIds, ...rosterPathCandidates, ...rosterUserIds, ...reverseAuthUids]
        .map((s) => String(s || "").trim())
        .filter(Boolean)
    ),
  ];
}

async function loadStudentPurchases(
  trainerId: string,
  authStudentId: string
): Promise<ShopPurchaseLike[]> {
  const candidateIds = await resolveShopRegistrationStudentIdsAdmin(trainerId, authStudentId);
  const seenRegIds = new Set<string>();
  const out: ShopPurchaseLike[] = [];

  for (const sid of candidateIds) {
    const regsSnap = await db
      .collection("personalTrainers")
      .doc(trainerId)
      .collection("shopRegistrations")
      .where("studentId", "==", sid)
      .get();

    for (const d of regsSnap.docs) {
      if (seenRegIds.has(d.id)) continue;
      seenRegIds.add(d.id);
      out.push(...normalizeShopPurchasesFromDoc(d.data() as Record<string, unknown>, d.id));
    }
  }
  return out;
}

/** @deprecated Use loadStudentPurchases */
const loadStudentRegistrations = loadStudentPurchases;

async function buildDefaultTargetResolver(
  paymentsCol: CollectionReference
): Promise<(purchaseMonth: string) => string> {
  const snap = await paymentsCol.get();
  const payments = snap.docs.map((d) => ({
    period: String(d.data().period ?? ""),
    status: d.data().status,
    createdAt: d.data().createdAt,
  }));
  return buildShopBillingPeriodContextFromPayments(payments).billablePeriodForPurchaseMonth;
}

async function normalizePurchaseDocOnWrite(
  trainerId: string,
  regId: string,
  data: DocumentData
): Promise<ShopPurchaseLike | null> {
  if (isLegacyShopRegistrationDoc(data as Record<string, unknown>)) {
    return null;
  }
  const normalized = normalizeShopPurchaseDoc(data as Record<string, unknown>, regId);
  if (!normalized) return null;
  return normalized;
}

export async function syncShopPaymentForPeriod(
  trainerId: string,
  authStudentId: string,
  paymentPeriod: string,
  options?: {
    createSource?: string;
    bypassBillingWindow?: boolean;
    shopSourcePeriod?: string;
    overwriteLockedPending?: boolean;
  }
): Promise<void> {
  void options?.shopSourcePeriod;
  if (!options?.bypassBillingWindow && !maySyncFuturePaymentPeriod(paymentPeriod)) {
    return;
  }

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
  const paymentsCol = rosterRef.collection("payments");
  const registrations = await loadStudentPurchases(trainerId, authStudentId);

  const purchaseMonths = new Set<string>();
  for (const purchase of registrations) {
    const pm = purchase.date ? periodFromShopDate(purchase.date) : null;
    if (pm) purchaseMonths.add(pm);
  }
  const defaultTargetByRegDate = await buildDefaultTargetResolver(paymentsCol);

  const catalog = await loadCatalog(trainerId);
  const shopTotal = computeUnpaidShopForPaymentPeriod(
    registrations,
    catalog,
    paymentPeriod,
    defaultTargetByRegDate
  );

  if (monthlyRate <= 0 && shopTotal <= 0) return;

  const amounts = buildPaymentAmounts(monthlyRate, shopTotal);
  const nowIso = new Date().toISOString();

  const periodSnap = await paymentsCol.where("period", "==", paymentPeriod).get();

  const paidDocs = periodSnap.docs.filter((p) => isPaidStatus(p.data().status));
  const pendingDocs = periodSnap.docs.filter(
    (p) => isPendingStatus(p.data().status) || !p.data().status
  );

  // Remove orphan pending rows when the period is already paid and nothing is owed.
  if (paidDocs.length > 0 && shopTotal <= 0) {
    for (const p of pendingDocs) {
      await p.ref.delete();
    }
    return;
  }

  let pendingDoc: QueryDocumentSnapshot<DocumentData> | null = pendingDocs[0] ?? null;
  if (pendingDocs.length > 1) {
    for (let i = 1; i < pendingDocs.length; i++) {
      await pendingDocs[i].ref.delete();
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
    // For normal sync flows, preserve coach-locked pending rows (snapshot behavior).
    // Bulk "create next period" can opt in to overwrite so totals are recalculated.
    const existingData = pendingDoc.data();
    const shopLocked = existingData.shopAmount != null;
    await pendingDoc.ref.update(
      shopLocked && !options?.overwriteLockedPending
        ? { shopSyncedAt: nowIso }
        : paymentPayload
    );
    return;
  }

  // Never create a second payment row for the same period when one is already paid.
  // Otherwise a race (sync before shop lines are flagged paid) or stale shopTotal
  // would add a duplicate "pending" next to an existing "paid" for the same YYYY-MM.
  if (paidDocs.length > 0) {
    return;
  }

  await paymentsCol.add({
    ...paymentPayload,
    createdAt: nowIso,
    source: options?.createSource ?? "shop_sync",
  });
}

export async function syncAllAffectedShopPaymentPeriods(
  trainerId: string,
  authStudentId: string,
  purchases: ShopPurchaseLike[],
  options?: { createSource?: string; bypassBillingWindow?: boolean }
): Promise<void> {
  const rosterStudentId = await resolveRosterStudentId(trainerId, authStudentId);
  const paymentsCol = db
    .collection("personalTrainers")
    .doc(trainerId)
    .collection("students")
    .doc(rosterStudentId)
    .collection("payments");

  const purchaseMonths = new Set<string>();
  for (const purchase of purchases) {
    const pm = purchase.date ? periodFromShopDate(purchase.date) : null;
    if (pm) purchaseMonths.add(pm);
  }
  const defaultTargetByRegDate = await buildDefaultTargetResolver(paymentsCol);
  const periods = collectTargetPaymentPeriodsFromRegistrations(purchases, defaultTargetByRegDate);

  for (const period of periods) {
    await syncShopPaymentForPeriod(trainerId, authStudentId, period, options);
  }
}

export async function markShopLinesPaidForPaymentRecord(
  trainerId: string,
  authStudentId: string,
  paymentPeriod: string,
  paymentId: string,
  options?: { repairMode?: boolean }
): Promise<void> {
  const rosterStudentId = await resolveRosterStudentId(trainerId, authStudentId);
  const shopStudentIdCandidates = await resolveShopRegistrationStudentIdsAdmin(
    trainerId,
    authStudentId
  );
  if (!shopStudentIdCandidates.includes(rosterStudentId)) {
    shopStudentIdCandidates.push(rosterStudentId);
  }

  const paymentsCol = db
    .collection("personalTrainers")
    .doc(trainerId)
    .collection("students")
    .doc(rosterStudentId)
    .collection("payments");
  const paymentsSnap = await paymentsCol.get();
  const payments = paymentsSnap.docs.map((p) => ({
    period: String(p.data().period ?? ""),
    status: p.data().status,
    createdAt: p.data().createdAt,
  }));
  const { billablePeriodForPurchaseMonth } = options?.repairMode
    ? buildShopBillingPeriodContextFromPayments(payments)
    : buildShopBillingPeriodContextForMarkPaid(payments, paymentPeriod);

  const seenRegIds = new Set<string>();
  for (const sid of shopStudentIdCandidates) {
    const regsSnap = await db
      .collection("personalTrainers")
      .doc(trainerId)
      .collection("shopRegistrations")
      .where("studentId", "==", sid)
      .get();

    for (const regDoc of regsSnap.docs) {
      if (seenRegIds.has(regDoc.id)) continue;
      seenRegIds.add(regDoc.id);
      const raw = regDoc.data() as Record<string, unknown>;
      if (isLegacyShopRegistrationDoc(raw)) continue;
      const before = normalizeShopPurchaseDoc(raw, regDoc.id);
      if (!before) continue;
      const date = String(before.date ?? "").trim();
      if (
        options?.repairMode &&
        !shouldMarkShopLinePaidForPaymentRepair(
          date,
          String(before.time ?? "").trim() || undefined,
          paymentPeriod,
          payments
        )
      ) {
        continue;
      }
      const next = markShopPurchasePaidForPayment(
        before,
        paymentPeriod,
        paymentId,
        billablePeriodForPurchaseMonth
      );
      if (JSON.stringify(before) === JSON.stringify(next)) continue;
      await regDoc.ref.set(
        {
          billingStatus: next.billingStatus,
          paidInPaymentId: next.paidInPaymentId ?? null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }
  }
}

/** Revert incorrectly paid lines, then re-mark with repair gate (Admin SDK). */
export async function repairShopLinesForPaidPaymentsAdmin(
  trainerId: string,
  authStudentId: string
): Promise<number> {
  const rosterStudentId = await resolveRosterStudentId(trainerId, authStudentId);
  const shopStudentIdCandidates = await resolveShopRegistrationStudentIdsAdmin(
    trainerId,
    authStudentId
  );
  if (!shopStudentIdCandidates.includes(rosterStudentId)) {
    shopStudentIdCandidates.push(rosterStudentId);
  }

  const paymentsCol = db
    .collection("personalTrainers")
    .doc(trainerId)
    .collection("students")
    .doc(rosterStudentId)
    .collection("payments");
  const paymentsSnap = await paymentsCol.get();
  const paymentsWithId = paymentsSnap.docs.map((p) => ({
    id: p.id,
    period: String(p.data().period ?? "").trim(),
    status: p.data().status,
    shopAmount: Number(p.data().shopAmount ?? 0),
    createdAt: p.data().createdAt,
  }));
  const payments = paymentsWithId.map((p) => ({
    period: p.period,
    status: p.status,
    createdAt: p.createdAt,
  }));
  const paymentIdToPeriod = new Map(
    paymentsWithId.filter((p) => p.id && p.period).map((p) => [p.id, p.period])
  );
  const paymentIdToSettlement = new Map(
    paymentsWithId
      .filter((p) => p.id)
      .map((p) => [p.id, { period: p.period, status: p.status, shopAmount: p.shopAmount }])
  );

  let updated = 0;
  const seenRegIds = new Set<string>();
  for (const sid of shopStudentIdCandidates) {
    const regsSnap = await db
      .collection("personalTrainers")
      .doc(trainerId)
      .collection("shopRegistrations")
      .where("studentId", "==", sid)
      .get();

    for (const regDoc of regsSnap.docs) {
      if (seenRegIds.has(regDoc.id)) continue;
      seenRegIds.add(regDoc.id);
      const raw = regDoc.data() as Record<string, unknown>;
      if (isLegacyShopRegistrationDoc(raw)) continue;
      const before = normalizeShopPurchaseDoc(raw, regDoc.id);
      if (!before) continue;
      const next = revertShopPurchasePaidForFuturePeriods(
        before,
        payments,
        paymentIdToPeriod,
        paymentIdToSettlement
      );
      if (JSON.stringify(before) === JSON.stringify(next)) continue;
      await regDoc.ref.set(
        {
          billingStatus: next.billingStatus,
          paidInPaymentId: next.paidInPaymentId ?? null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      updated += 1;
    }
  }

  for (const p of paymentsSnap.docs) {
    if (!isPaidStatus(p.data().status)) continue;
    const period = String(p.data().period ?? "").trim();
    if (!period) continue;
    const shopAmount = Number(p.data().shopAmount ?? 0);
    await markShopLinesPaidForPaymentRecord(
      trainerId,
      authStudentId,
      period,
      p.id,
      { repairMode: shopAmount <= 0 }
    );
    updated += 1;
  }
  return updated;
}

export const syncShopPaymentOnRegistrationWrite = onDocumentWritten(
  {
    document: "personalTrainers/{trainerId}/shopRegistrations/{regId}",
    region: "europe-west1",
  },
  async (event) => {
    const trainerId = event.params.trainerId;
    const regId = event.params.regId;
    const after = event.data?.after.data();
    const before = event.data?.before.data();
    const data = after ?? before;
    if (!data) return;

    const studentId = String(data.studentId ?? "").trim();
    if (!studentId) return;

    try {
      await resolveRosterStudentId(trainerId, studentId);
      await normalizePurchaseDocOnWrite(trainerId, regId, data);

      const allPurchases = await loadStudentPurchases(trainerId, studentId);
      await syncAllAffectedShopPaymentPeriods(trainerId, studentId, allPurchases, {
        createSource: "shop_sync",
      });
      // Do not auto-mark purchases paid here: new shop lines after a payment is
      // pending/paid must stay unpaid until included in a new payment snapshot.
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
    if (!trainerId || !studentId || !/^\d{4}-\d{2}$/.test(paymentPeriod)) {
      throw new HttpsError(
        "invalid-argument",
        "trainerId, studentId, and paymentPeriod (YYYY-MM) required."
      );
    }
    if (request.auth.uid !== trainerId) {
      throw new HttpsError("permission-denied", "Only the coach can recalculate shop billing.");
    }
    await syncShopPaymentForPeriod(trainerId, studentId, paymentPeriod, {
      bypassBillingWindow: true,
    });
    return { ok: true };
  }
);

export const repairShopLinesForStudentCallable = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    const trainerId = String(request.data?.trainerId ?? request.auth.uid).trim();
    const rosterStudentId = String(
      request.data?.rosterStudentId ?? request.data?.studentId ?? ""
    ).trim();
    if (!trainerId || !rosterStudentId) {
      throw new HttpsError("invalid-argument", "trainerId and rosterStudentId required.");
    }
    if (request.auth.uid !== trainerId) {
      throw new HttpsError("permission-denied", "Only the coach can repair shop billing.");
    }

    const candidateIds = await resolveShopRegistrationStudentIdsAdmin(trainerId, rosterStudentId);
    const authStudentId =
      candidateIds.find((id) => id !== rosterStudentId) ?? rosterStudentId;

    const repaired = await repairShopLinesForPaidPaymentsAdmin(trainerId, authStudentId);
    return { ok: true, repaired };
  }
);

/** Linked student: load all shop purchases (Admin SDK — same ids as coach billing). */
export const listMyShopPurchasesCallable = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    const authUid = request.auth.uid;
    const studentSnap = await db.collection("students").doc(authUid).get();
    if (!studentSnap.exists) {
      throw new HttpsError("failed-precondition", "Student profile not found.");
    }
    const trainerId = String(studentSnap.data()?.trainerId ?? "").trim();
    if (!trainerId) {
      throw new HttpsError("failed-precondition", "Student is not linked to a coach.");
    }

    const purchases = await loadStudentPurchases(trainerId, authUid);
    return { ok: true, purchases };
  }
);

/** Linked student: sync shop line billingStatus from paid payment rows (Admin SDK). */
export const repairMyShopBillingCallable = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    const authUid = request.auth.uid;
    const studentSnap = await db.collection("students").doc(authUid).get();
    if (!studentSnap.exists) {
      throw new HttpsError("failed-precondition", "Student profile not found.");
    }
    const trainerId = String(studentSnap.data()?.trainerId ?? "").trim();
    const rosterStudentId = String(studentSnap.data()?.rosterDocId ?? "").trim();
    if (!trainerId || !rosterStudentId) {
      throw new HttpsError("failed-precondition", "Student is not linked to a coach roster.");
    }

    const repaired = await repairShopLinesForPaidPaymentsAdmin(trainerId, authUid);
    return { ok: true, repaired };
  }
);

export const migrateShopRegistrationsCallable = onCall(
  { region: "europe-west1" },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    const trainerId = String(request.data?.trainerId ?? request.auth.uid).trim();
    if (request.auth.uid !== trainerId) {
      throw new HttpsError("permission-denied", "Only the coach can migrate shop data.");
    }

    const col = db.collection("personalTrainers").doc(trainerId).collection("shopRegistrations");
    const snap = await col.get();
    let migratedDocs = 0;
    let createdPurchases = 0;
    let deletedLegacyDocs = 0;

    for (const legacyDoc of snap.docs) {
      const data = legacyDoc.data() as Record<string, unknown>;
      if (!isLegacyShopRegistrationDoc(data)) continue;

      const studentId = String(data.studentId ?? "").trim();
      const coachTrainerId = String(data.trainerId ?? trainerId).trim();
      const date = String(data.date ?? "").trim();
      const time = data.time != null ? String(data.time).trim() : undefined;
      const lines = Array.isArray(data.lines) ? data.lines : [];

      for (const rawLine of lines) {
        const line = rawLine as Record<string, unknown>;
        const itemId = String(line.itemId ?? "").trim();
        const quantity = Math.max(0, Math.min(999, Math.floor(Number(line.quantity) || 0)));
        if (!itemId || quantity <= 0) continue;
        const billingStatus =
          String(line.billingStatus ?? "unpaid").trim().toLowerCase() === "paid"
            ? "paid"
            : "unpaid";
        const payload: Record<string, unknown> = {
          studentId,
          trainerId: coachTrainerId,
          date,
          time: time ?? "00:00:00",
          itemId,
          quantity,
          billingStatus,
          updatedAt: new Date().toISOString(),
        };
        if (billingStatus === "paid" && line.paidInPaymentId) {
          payload.paidInPaymentId = String(line.paidInPaymentId);
        }
        await col.add(payload);
        createdPurchases += 1;
      }

      await legacyDoc.ref.delete();
      migratedDocs += 1;
      deletedLegacyDocs += 1;
    }

    return { ok: true, migratedDocs, createdPurchases, deletedLegacyDocs };
  }
);

export const markShopPaidOnPaymentWrite = onDocumentWritten(
  {
    document: "personalTrainers/{trainerId}/students/{studentId}/payments/{paymentId}",
    region: "europe-west1",
  },
  async (event) => {
    const after = event.data?.after.data();
    const before = event.data?.before.data();
    if (!after) return;

    const wasPaid = before ? isPaidStatus(before.status) : false;
    const isPaid = isPaidStatus(after.status);
    if (!isPaid || wasPaid) return;

    const trainerId = event.params.trainerId;
    const rosterStudentId = event.params.studentId;
    const paymentId = event.params.paymentId;
    const paymentPeriod = String(after.period ?? "").trim();
    if (!paymentPeriod) return;

    const rosterSnap = await db
      .collection("personalTrainers")
      .doc(trainerId)
      .collection("students")
      .doc(rosterStudentId)
      .get();
    if (!rosterSnap.exists) return;
    const authStudentId =
      String(rosterSnap.data()?.userId ?? "").trim() || rosterStudentId;
    const candidateIds = await resolveShopRegistrationStudentIdsAdmin(
      trainerId,
      authStudentId
    );
    const shopAuthStudentId =
      candidateIds.find((id) => id !== rosterStudentId) ?? authStudentId;

    try {
      await markShopLinesPaidForPaymentRecord(
        trainerId,
        shopAuthStudentId,
        paymentPeriod,
        paymentId
      );
      const allPurchases = await loadStudentPurchases(trainerId, authStudentId);
      await syncAllAffectedShopPaymentPeriods(trainerId, authStudentId, allPurchases, {
        createSource: "shop_sync_after_pay",
        bypassBillingWindow: true,
      });
    } catch (e) {
      logger.error("markShopPaidOnPaymentWrite failed", e);
      throw e;
    }
  }
);
