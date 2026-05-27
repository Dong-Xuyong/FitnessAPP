import type { Firestore } from "firebase/firestore";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { resolveShopRegistrationStudentIds } from "@/lib/fetch-shop-registrations";
import {
  buildShopBillingPeriodContextForMarkPaid,
  buildShopBillingPeriodContextFromPayments,
  isLegacyShopRegistrationDoc,
  markShopPurchasePaidForPayment,
  normalizeShopPurchaseDoc,
  revertShopPurchasePaidForFuturePeriods,
  shouldMarkShopLinePaidForPaymentRepair,
  type ShopPurchaseLike,
} from "@/lib/shop-billing";
import { normalizedPaymentPaid, normalizedPaymentPending } from "@/lib/student-payment-due";

export type MarkShopPaidOptions = {
  repairMode?: boolean;
};

export async function purchaseMonthHasPendingPayment(
  db: Firestore,
  trainerId: string,
  rosterStudentId: string,
  purchaseMonth: string
): Promise<boolean> {
  const snap = await getDocs(
    query(
      collection(db, "personalTrainers", trainerId, "students", rosterStudentId, "payments"),
      where("period", "==", purchaseMonth)
    )
  );
  return snap.docs.some((d) => normalizedPaymentPending(String(d.data().status ?? "pending")));
}

export async function markShopRegistrationsPaidForPayment(
  db: Firestore,
  trainerId: string,
  authStudentId: string,
  paymentPeriod: string,
  paymentId: string,
  options?: MarkShopPaidOptions
): Promise<number> {
  const rosterStudentId = await resolveRosterStudentIdClient(db, trainerId, authStudentId);
  const paySnap = await getDocs(
    collection(db, "personalTrainers", trainerId, "students", rosterStudentId, "payments")
  );
  const payments = paySnap.docs.map((d) => ({
    period: String(d.data().period ?? ""),
    status: d.data().status,
  }));
  const { billablePeriodForPurchaseMonth } = options?.repairMode
    ? buildShopBillingPeriodContextFromPayments(payments)
    : buildShopBillingPeriodContextForMarkPaid(payments, paymentPeriod);

  const shopStudentIdCandidates = await resolveShopRegistrationStudentIds(
    db,
    trainerId,
    authStudentId,
    { rosterDocId: rosterStudentId }
  );

  let updated = 0;
  const seenRegIds = new Set<string>();
  for (const sid of shopStudentIdCandidates) {
    const regsSnap = await getDocs(
      query(
        collection(db, "personalTrainers", trainerId, "shopRegistrations"),
        where("studentId", "==", sid)
      )
    );
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
        !shouldMarkShopLinePaidForPaymentRepair(date, paymentPeriod, payments)
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
      await setDoc(
        regDoc.ref,
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
  return updated;
}

/** Re-run mark-paid for every paid payment row (backfill stale shop line status). */
export async function repairShopLinesForPaidPayments(
  db: Firestore,
  trainerId: string,
  rosterStudentId: string,
  shopAuthStudentId: string
): Promise<number> {
  const paySnap = await getDocs(
    collection(db, "personalTrainers", trainerId, "students", rosterStudentId, "payments")
  );
  const paymentsWithId = paySnap.docs.map((d) => ({
    id: d.id,
    period: String(d.data().period ?? "").trim(),
    status: d.data().status,
    shopAmount: Number(d.data().shopAmount ?? 0),
  }));
  const payments = paymentsWithId.map((p) => ({ period: p.period, status: p.status }));
  const paymentIdToPeriod = new Map(
    paymentsWithId.filter((p) => p.id && p.period).map((p) => [p.id, p.period])
  );
  const paymentIdToSettlement = new Map(
    paymentsWithId
      .filter((p) => p.id)
      .map((p) => [p.id, { period: p.period, status: p.status, shopAmount: p.shopAmount }])
  );

  const shopStudentIdCandidates = await resolveShopRegistrationStudentIds(
    db,
    trainerId,
    shopAuthStudentId,
    { rosterDocId: rosterStudentId }
  );

  let updated = 0;
  const seenRegIds = new Set<string>();
  for (const sid of shopStudentIdCandidates) {
    const regsSnap = await getDocs(
      query(
        collection(db, "personalTrainers", trainerId, "shopRegistrations"),
        where("studentId", "==", sid)
      )
    );
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
      await setDoc(
        regDoc.ref,
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

  for (const d of paySnap.docs) {
    if (!normalizedPaymentPaid(String(d.data().status ?? ""))) continue;
    const period = String(d.data().period ?? "").trim();
    if (!period) continue;
    const shopAmount = Number(d.data().shopAmount ?? 0);
    // Paid rows with a shop charge use mark-paid context so included purchases stay paid.
    updated += await markShopRegistrationsPaidForPayment(
      db,
      trainerId,
      shopAuthStudentId,
      period,
      d.id,
      { repairMode: shopAmount <= 0 }
    );
  }
  return updated;
}

export async function resolveRosterStudentIdClient(
  db: Firestore,
  trainerId: string,
  authStudentId: string
): Promise<string> {
  const g = await getDoc(doc(db, "students", authStudentId));
  if (g.exists()) {
    const rosterDocId = g.data()?.rosterDocId;
    if (typeof rosterDocId === "string" && rosterDocId.trim()) {
      const rosterSnap = await getDoc(
        doc(db, "personalTrainers", trainerId, "students", rosterDocId.trim())
      );
      if (rosterSnap.exists()) return rosterDocId.trim();
    }
  }
  const direct = await getDoc(doc(db, "personalTrainers", trainerId, "students", authStudentId));
  if (direct.exists()) return authStudentId;
  return authStudentId;
}
