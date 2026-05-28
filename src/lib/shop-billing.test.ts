import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appendNewPurchaseLines,
  buildPaymentAmounts,
  buildShopBillingPeriodContextForMarkPaid,
  buildShopBillingPeriodContextFromPayments,
  catalogMapFromItems,
  collectShopLinesForPaymentPeriod,
  collectShopLinesPaidByPaymentId,
  computeRegistrationDayTotal,
  computeUnpaidShopForPaymentPeriod,
  buildShopPurchaseWritePayload,
  buildShopRegistrationWritePayload,
  expandLegacyRegistrationDoc,
  filterPurchasesForPeriod,
  markShopRegistrationLinesPaidForPayment,
  markShopPurchasePaidForPayment,
  normalizeShopPurchasesFromDoc,
  isPaymentSettledWithShopCharge,
  revertShopPurchasePaidForFuturePeriods,
  mergeShopLines,
  mergeBillableShopRegistrationsByDate,
  nextBillingPeriodYm,
  periodDateRange,
  formatShopRegistrationDateTime,
  localTimeHms,
  periodFromShopDate,
  resolveBillableShopPaymentPeriod,
  resolveMonthlyRate,
  resolveTargetPaymentPeriodForNewPurchase,
  revertShopRegistrationLinesPaidForFuturePeriods,
  shouldMarkShopLinePaidForPaymentRepair,
  shopLineBillablePaymentPeriod,
  sanitizeShopLinesForStudentWrite,
  summarizeShopRegistrationsForBillingMonth,
  summarizeShopRegistrationsForPeriod,
  summarizeUnpaidShopRegistrations,
} from "./shop-billing";

describe("shop-billing", () => {
  const catalog = catalogMapFromItems([
    { id: "coffee", name: "Coffee", price: 1.5, active: true },
    { id: "water", name: "Water", price: 0.5, active: true },
    { id: "inactive", name: "Old", price: 10, active: false },
  ]);

  const p = (
    date: string,
    itemId: string,
    quantity: number,
    billingStatus: "paid" | "unpaid" = "unpaid",
    extra?: { time?: string; paidInPaymentId?: string }
  ) => ({
    date,
    time: extra?.time,
    itemId,
    quantity,
    billingStatus,
    paidInPaymentId: extra?.paidInPaymentId,
  });

  it("periodFromShopDate accepts YYYY-MM-DD prefix", () => {
    assert.equal(periodFromShopDate("2026-05-16T14:30:00"), "2026-05");
  });

  it("localTimeHms and formatShopRegistrationDateTime", () => {
    const d = new Date(2026, 4, 27, 9, 5, 3);
    assert.equal(localTimeHms(d), "09:05:03");
    assert.equal(formatShopRegistrationDateTime("2026-05-27", "09:05:03"), "2026-05-27 09:05:03");
  });

  it("extracts YYYY-MM from shop date", () => {
    assert.equal(periodFromShopDate("2026-05-16"), "2026-05");
    assert.equal(periodFromShopDate("invalid"), null);
  });

  it("nextBillingPeriodYm advances calendar month", () => {
    assert.equal(nextBillingPeriodYm("2026-05"), "2026-06");
    assert.equal(nextBillingPeriodYm("2026-12"), "2027-01");
  });

  it("resolveTargetPaymentPeriodForNewPurchase", () => {
    assert.equal(resolveTargetPaymentPeriodForNewPurchase("2026-05", true), "2026-05");
    assert.equal(resolveTargetPaymentPeriodForNewPurchase("2026-05", false), "2026-06");
  });

  it("appendNewPurchaseLines keeps paid rows separate", () => {
    const merged = appendNewPurchaseLines(
      [
        { itemId: "coffee", quantity: 2, billingStatus: "paid", paidInPaymentId: "p1" },
        { itemId: "water", quantity: 1, billingStatus: "unpaid" },
      ],
      [{ itemId: "coffee", quantity: 1 }]
    );
    const paidCoffee = merged.filter((l) => l.itemId === "coffee" && l.billingStatus === "paid");
    const unpaidCoffee = merged.filter((l) => l.itemId === "coffee" && l.billingStatus !== "paid");
    assert.equal(paidCoffee.length, 1);
    assert.equal(paidCoffee[0].quantity, 2);
    assert.equal(unpaidCoffee.length, 1);
    assert.equal(unpaidCoffee[0].quantity, 1);
  });

  it("resolveBillableShopPaymentPeriod cascades past closed paid months", () => {
    const payments = [
      { period: "2026-05", status: "paid" },
      { period: "2026-06", status: "paid" },
    ];
    const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextFromPayments(payments);
    assert.equal(billablePeriodForPurchaseMonth("2026-05"), "2026-07");
  });

  it("resolveBillableShopPaymentPeriod stays on pending target month", () => {
    const payments = [
      { period: "2026-05", status: "paid" },
      { period: "2026-06", status: "pending" },
    ];
    const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextFromPayments(payments);
    assert.equal(billablePeriodForPurchaseMonth("2026-05"), "2026-06");
  });

  it("uses payment createdAt cutoff for pending payment rows", () => {
    const payments = [
      { period: "2026-06", status: "pending", createdAt: "2026-05-28T11:27:42.000Z" },
    ];
    const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextFromPayments(payments);
    assert.equal(
      billablePeriodForPurchaseMonth("2026-05", "2026-05-28", "12:27:40"),
      "2026-06"
    );
    assert.equal(
      billablePeriodForPurchaseMonth("2026-05", "2026-05-28", "12:27:58"),
      "2026-07"
    );
  });

  it("uses payment createdAt cutoff for paid payment rows", () => {
    const payments = [
      { period: "2026-06", status: "paid", createdAt: "2026-05-28T11:27:42.000Z" },
    ];
    const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextFromPayments(payments);
    assert.equal(
      billablePeriodForPurchaseMonth("2026-05", "2026-05-28", "12:27:40"),
      "2026-06"
    );
    assert.equal(
      billablePeriodForPurchaseMonth("2026-05", "2026-05-28", "12:27:58"),
      "2026-07"
    );
  });

  it("markShopRegistrationLinesPaidForPayment uses billable period resolver", () => {
    const billableForPurchaseMonth = (m: string, date?: string, time?: string) =>
      resolveBillableShopPaymentPeriod(
        m,
        date,
        time,
        (pm) => pm === "2026-05",
        () => false
      );
    const paidMay = markShopRegistrationLinesPaidForPayment(
      {
        date: "2026-05-10",
        lines: [
          { itemId: "coffee", quantity: 1, billingStatus: "unpaid" },
          { itemId: "water", quantity: 2, billingStatus: "unpaid" },
        ],
      },
      "2026-05",
      "pay1",
      billableForPurchaseMonth
    );
    assert.equal(paidMay[0].billingStatus, "paid");
    assert.equal(paidMay[0].paidInPaymentId, "pay1");
    assert.equal(paidMay[1].billingStatus, "paid");
    const junePurchase = markShopRegistrationLinesPaidForPayment(
      {
        date: "2026-06-01",
        lines: [{ itemId: "coffee", quantity: 1, billingStatus: "unpaid" }],
      },
      "2026-05",
      "pay1",
      billableForPurchaseMonth
    );
    assert.equal(junePurchase[0].billingStatus, "unpaid");
  });

  it("computeUnpaidShopForPaymentPeriod sums by derived effective period", () => {
    const purchases = [
      p("2026-05-01", "coffee", 2, "paid"),
      p("2026-05-01", "water", 3, "unpaid"),
      p("2026-06-10", "coffee", 1, "unpaid"),
    ];
    const resolver = (pm: string) =>
      resolveTargetPaymentPeriodForNewPurchase(pm, pm === "2026-06");
    assert.equal(computeUnpaidShopForPaymentPeriod(purchases, catalog, "2026-05", resolver), 0);
    assert.equal(computeUnpaidShopForPaymentPeriod(purchases, catalog, "2026-06", resolver), 3);
  });

  it("computes day total from lines", () => {
    assert.equal(
      computeRegistrationDayTotal(
        [
          { itemId: "coffee", quantity: 2 },
          { itemId: "water", quantity: 1 },
        ],
        catalog
      ),
      3.5
    );
  });

  it("periodDateRange returns month bounds", () => {
    assert.deepEqual(periodDateRange("2026-05"), {
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
  });

  it("filterPurchasesForPeriod keeps only matching month", () => {
    const purchases = [p("2026-05-01", "coffee", 1), p("2026-04-30", "water", 1)];
    assert.equal(filterPurchasesForPeriod(purchases, "2026-05").length, 1);
  });

  it("mergeShopLines adds quantities per item across purchases", () => {
    assert.deepEqual(
      mergeShopLines(
        [{ itemId: "coffee", quantity: 1 }],
        [{ itemId: "coffee", quantity: 2 }, { itemId: "water", quantity: 1 }]
      ),
      [
        { itemId: "coffee", quantity: 3 },
        { itemId: "water", quantity: 1 },
      ]
    );
  });

  it("summarizeShopRegistrationsForBillingMonth splits paid and deferred May purchases", () => {
    const payments = [
      { period: "2026-05", status: "paid" },
      { period: "2026-06", status: "paid" },
    ];
    const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextFromPayments(payments);
    const purchases = [
      p("2026-05-20", "coffee", 4, "paid"),
      p("2026-05-20", "water", 2, "paid"),
      p("2026-05-22", "water", 2, "paid"),
      p("2026-05-22", "coffee", 1, "paid"),
      p("2026-05-27", "water", 1, "unpaid"),
    ];
    const summary = summarizeShopRegistrationsForBillingMonth(
      purchases,
      catalog,
      "2026-05",
      billablePeriodForPurchaseMonth
    );
    assert.equal(summary.entries.length, 4);
    assert.equal(summary.deferredEntries.length, 1);
    assert.equal(summary.deferredEntries[0].date, "2026-05-27");
    assert.equal(summary.deferredEntries[0].billsOnPeriod, "2026-07");
    assert.equal(summary.deferredTotal, 0.5);
    assert.equal(summary.monthShopTotal, 9.5);
  });

  it("computeUnpaidShopForPaymentPeriod uses cascaded billable period", () => {
    const payments = [
      { period: "2026-05", status: "paid" },
      { period: "2026-06", status: "paid" },
    ];
    const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextFromPayments(payments);
    const purchases = [p("2026-05-27", "water", 1, "unpaid")];
    assert.equal(
      computeUnpaidShopForPaymentPeriod(purchases, catalog, "2026-06", billablePeriodForPurchaseMonth),
      0
    );
    assert.equal(
      computeUnpaidShopForPaymentPeriod(purchases, catalog, "2026-07", billablePeriodForPurchaseMonth),
      0.5
    );
  });

  it("summarizeUnpaidShopRegistrations lists only unpaid lines with bill period", () => {
    const payments = [
      { period: "2026-05", status: "paid" },
      { period: "2026-06", status: "paid" },
    ];
    const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextFromPayments(payments);
    const purchases = [
      p("2026-05-20", "coffee", 4, "paid"),
      p("2026-05-20", "water", 2, "paid"),
      p("2026-05-27", "water", 1, "unpaid"),
    ];
    const summary = summarizeUnpaidShopRegistrations(purchases, catalog, billablePeriodForPurchaseMonth);
    assert.equal(summary.entries.length, 1);
    assert.equal(summary.entries[0].date, "2026-05-27");
    assert.equal(summary.entries[0].billsOnPeriod, "2026-07");
    assert.equal(summary.totalUnpaid, 0.5);
  });

  it("summarizeUnpaidShopRegistrations on mixed day shows unpaid lines only", () => {
    const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextFromPayments([]);
    const purchases = [
      p("2026-05-10", "coffee", 2, "paid"),
      p("2026-05-10", "water", 1, "unpaid"),
    ];
    const summary = summarizeUnpaidShopRegistrations(purchases, catalog, billablePeriodForPurchaseMonth);
    assert.equal(summary.entries.length, 1);
    assert.equal(summary.entries[0].dayTotal, 0.5);
    assert.match(summary.entries[0].summary, /Water/);
    assert.doesNotMatch(summary.entries[0].summary, /Coffee/);
  });

  it("buildShopRegistrationWritePayload produces rule-safe document shape", () => {
    const payload = buildShopRegistrationWritePayload({
      studentId: "stu1",
      trainerId: "coach1",
      date: "2026-05-27",
      lines: [{ itemId: "coffee", quantity: 1, billingStatus: "unpaid" }],
      now: new Date(2026, 4, 27, 14, 30, 45),
    });
    assert.equal(payload.date, "2026-05-27");
    assert.equal(payload.time, "14:30:45");
    assert.equal(Object.keys(payload).sort().join(","), "date,lines,studentId,time,trainerId,updatedAt");
    assert.equal(payload.lines[0].billingStatus, "unpaid");
    assert.equal(payload.lines[0].quantity, 1);
  });

  it("sanitizeShopLinesForStudentWrite strips paid lines to allowed keys", () => {
    const lines = sanitizeShopLinesForStudentWrite([
      { itemId: "coffee", quantity: 1, billingStatus: "unpaid" },
      { itemId: "water", quantity: 2, billingStatus: "paid", paidInPaymentId: "p1" },
      { itemId: "tea", quantity: 1, billingStatus: "paid" },
    ]);
    assert.equal(lines.length, 3);
    assert.deepEqual(Object.keys(lines[0]).sort(), ["billingStatus", "itemId", "quantity"]);
    assert.equal(lines[0].billingStatus, "unpaid");
    assert.equal(lines[1].paidInPaymentId, "p1");
    assert.deepEqual(Object.keys(lines[2]).sort(), ["billingStatus", "itemId", "quantity"]);
  });

  it("summarizeShopRegistrationsForPeriod returns sorted day lines and total", () => {
    const { entries, monthShopTotal } = summarizeShopRegistrationsForPeriod(
      [p("2026-05-01", "coffee", 1), p("2026-05-03", "water", 2)],
      catalog,
      "2026-05"
    );
    assert.equal(monthShopTotal, 2.5);
    assert.equal(entries.length, 2);
  });

  it("builds payment amount breakdown", () => {
    assert.deepEqual(buildPaymentAmounts(100, 12.5), {
      amount: 112.5,
      baseAmount: 100,
      shopAmount: 12.5,
    });
  });

  it("mergeBillableShopRegistrationsByDate preserves paid billing status", () => {
    const merged = mergeBillableShopRegistrationsByDate([
      {
        date: "2026-05-20",
        lines: [{ itemId: "coffee", quantity: 1, billingStatus: "paid", paidInPaymentId: "p1" }],
      },
      {
        date: "2026-05-20",
        lines: [{ itemId: "water", quantity: 2, billingStatus: "unpaid" }],
      },
    ]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].lines?.filter((l) => l.billingStatus === "paid").length, 1);
    assert.equal(merged[0].lines?.filter((l) => l.billingStatus !== "paid").length, 1);
  });

  it("resolveMonthlyRate prefers stored monthlyRate", () => {
    assert.equal(
      resolveMonthlyRate({
        monthlyRate: 120,
        rate60Min: 10,
        sessionsPerWeek: 3,
        sessionDurationMin: 60,
      }),
      120
    );
  });

  it("buildShopBillingPeriodContextForMarkPaid keeps May purchases on May when marking May", () => {
    const payments = [{ period: "2026-05", status: "pending" }];
    const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextForMarkPaid(
      payments,
      "2026-05"
    );
    assert.equal(billablePeriodForPurchaseMonth("2026-05"), "2026-05");
  });

  it("buildShopBillingPeriodContextForMarkPaid keeps May purchases on June when repairing June", () => {
    const payments = [
      { period: "2026-05", status: "paid" },
      { period: "2026-06", status: "paid" },
    ];
    const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextForMarkPaid(
      payments,
      "2026-06"
    );
    assert.equal(billablePeriodForPurchaseMonth("2026-05"), "2026-06");
    assert.equal(
      buildShopBillingPeriodContextFromPayments(payments).billablePeriodForPurchaseMonth(
        "2026-05"
      ),
      "2026-07"
    );
  });

  it("markShopRegistrationLinesPaidForPayment repairs May lines via mark-paid context", () => {
    const payments = [
      { period: "2026-05", status: "paid" },
      { period: "2026-06", status: "paid" },
    ];
    const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextForMarkPaid(
      payments,
      "2026-06"
    );
    const reg = {
      date: "2026-05-27",
      lines: [
        { itemId: "water", quantity: 1, billingStatus: "unpaid" as const },
        { itemId: "coffee", quantity: 1, billingStatus: "unpaid" as const },
      ],
    };
    const next = markShopRegistrationLinesPaidForPayment(
      reg,
      "2026-06",
      "pay-june",
      billablePeriodForPurchaseMonth
    );
    assert.equal(next.every((l) => l.billingStatus === "paid"), true);
    assert.equal(next[0].paidInPaymentId, "pay-june");
  });

  it("collectShopLinesPaidByPaymentId and collectShopLinesForPaymentPeriod", () => {
    const payments = [
      { period: "2026-05", status: "paid" },
      { period: "2026-06", status: "paid" },
    ];
    const linkedPurchases = [
      p("2026-05-27", "water", 1, "paid", { time: "03:20:57", paidInPaymentId: "p1" }),
      p("2026-05-27", "coffee", 1, "paid", { time: "03:20:57", paidInPaymentId: "p1" }),
    ];
    const linked = collectShopLinesPaidByPaymentId(linkedPurchases, "p1", catalog);
    assert.equal(linked.length, 2);
    assert.equal(linked[0].date, "2026-05-27");
    assert.equal(linked[0].syncStatus, "paid");

    const unsynced = collectShopLinesForPaymentPeriod(linkedPurchases, catalog, payments, "2026-06");
    assert.equal(unsynced.length, 0);

    const unpaidPurchases = [
      p("2026-05-27", "water", 1, "unpaid"),
      p("2026-05-27", "coffee", 1, "unpaid"),
    ];
    const stale = collectShopLinesForPaymentPeriod(unpaidPurchases, catalog, payments, "2026-06");
    assert.equal(stale.length, 2);
    assert.equal(stale[0].syncStatus, "unpaid");
    assert.equal(stale.reduce((sum, row) => sum + row.dayTotal, 0), 2);
  });

  it("buildShopPurchaseWritePayload produces one product per document", () => {
    const payload = buildShopPurchaseWritePayload({
      studentId: "stu1",
      trainerId: "coach1",
      date: "2026-05-27",
      itemId: "coffee",
      quantity: 2,
      now: new Date(2026, 4, 27, 14, 30, 45),
    });
    assert.equal(payload.date, "2026-05-27");
    assert.equal(payload.time, "14:30:45");
    assert.equal(payload.itemId, "coffee");
    assert.equal(payload.quantity, 2);
    assert.equal(payload.billingStatus, "unpaid");
  });

  it("expandLegacyRegistrationDoc splits day-grouped lines into purchases", () => {
    const expanded = expandLegacyRegistrationDoc({
      date: "2026-05-27",
      time: "09:15:00",
      lines: [
        { itemId: "water", quantity: 1, billingStatus: "unpaid" },
        { itemId: "coffee", quantity: 1, billingStatus: "paid", paidInPaymentId: "p1" },
      ],
    });
    assert.equal(expanded.length, 2);
    assert.equal(expanded[0].time, "09:15:00");
    assert.equal(normalizeShopPurchasesFromDoc({ itemId: "water", quantity: 1, date: "2026-05-27", billingStatus: "unpaid" }).length, 1);
  });

  it("repair gate skips May purchases when live cascade bills to July", () => {
    const payments = [
      { period: "2026-05", status: "paid" },
      { period: "2026-06", status: "paid" },
    ];
    const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextFromPayments(payments);
    const purchase = p("2026-05-27", "water", 1, "unpaid");
    const next = markShopPurchasePaidForPayment(
      purchase,
      "2026-06",
      "pay-june",
      billablePeriodForPurchaseMonth
    );
    assert.equal(next.billingStatus, "unpaid");
  });

  it("repair gate marks May purchases paid when June is still pending", () => {
    const payments = [
      { period: "2026-05", status: "paid" },
      { period: "2026-06", status: "pending" },
    ];
    assert.equal(
      shouldMarkShopLinePaidForPaymentRepair("2026-05-27", undefined, "2026-06", payments),
      true
    );
    const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextFromPayments(payments);
    const next = markShopPurchasePaidForPayment(
      p("2026-05-27", "water", 1, "unpaid"),
      "2026-06",
      "pay-june",
      billablePeriodForPurchaseMonth
    );
    assert.equal(next.billingStatus, "paid");
    assert.equal(next.paidInPaymentId, "pay-june");
  });

  it("revertShopPurchasePaidForFuturePeriods unmarks purchases billed forward", () => {
    const payments = [
      { period: "2026-05", status: "paid" },
      { period: "2026-06", status: "paid" },
    ];
    const paymentIdToPeriod = new Map([["pay-june", "2026-06"]]);
    const reverted = revertShopPurchasePaidForFuturePeriods(
      p("2026-05-27", "water", 1, "paid", { paidInPaymentId: "pay-june" }),
      payments,
      paymentIdToPeriod
    );
    assert.equal(reverted.billingStatus, "unpaid");
    assert.equal(reverted.paidInPaymentId, undefined);
  });

  it("shouldMarkShopLinePaidForPaymentRepair rejects purchases after month is closed paid", () => {
    const payments = [{ period: "2026-05", status: "paid" }];
    assert.equal(shopLineBillablePaymentPeriod("2026-05-27", payments), "2026-06");
    assert.equal(
      shouldMarkShopLinePaidForPaymentRepair("2026-05-27", undefined, "2026-05", payments),
      false
    );
  });

  it("markShopPurchasePaidForPayment does not mark post-hoc purchase against closed paid month via repair gate", () => {
    const payments = [{ period: "2026-05", status: "paid" }];
    const purchase = p("2026-05-27", "chocolate", 1, "unpaid");
    assert.equal(
      shouldMarkShopLinePaidForPaymentRepair("2026-05-27", undefined, "2026-05", payments),
      false
    );
    const { billablePeriodForPurchaseMonth } = buildShopBillingPeriodContextFromPayments(payments);
    const next = markShopPurchasePaidForPayment(
      purchase,
      "2026-05",
      "pay-may",
      billablePeriodForPurchaseMonth
    );
    assert.equal(next.billingStatus, "unpaid");
  });

  it("revertShopPurchasePaidForFuturePeriods keeps purchases settled on paid shop payment", () => {
    const payments = [
      { period: "2026-05", status: "paid" },
      { period: "2026-06", status: "paid" },
    ];
    const paymentIdToPeriod = new Map([["pay-june", "2026-06"]]);
    const paymentIdToSettlement = new Map([
      ["pay-june", { period: "2026-06", status: "paid", shopAmount: 2 }],
    ]);
    const kept = revertShopPurchasePaidForFuturePeriods(
      p("2026-05-27", "chocolate", 1, "paid", { paidInPaymentId: "pay-june" }),
      payments,
      paymentIdToPeriod,
      paymentIdToSettlement
    );
    assert.equal(kept.billingStatus, "paid");
    assert.equal(kept.paidInPaymentId, "pay-june");
    assert.equal(isPaymentSettledWithShopCharge(paymentIdToSettlement.get("pay-june")), true);
  });
});
