import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPaymentAmounts,
  catalogMapFromItems,
  computeRegistrationDayTotal,
  computeShopTotalForStudentPeriod,
  filterRegistrationsForPeriod,
  mergeShopLines,
  periodDateRange,
  paymentPeriodForShopMonth,
  periodFromShopDate,
  resolveMonthlyRate,
  shopSourcePeriodForPaymentPeriod,
  summarizeShopRegistrationsForPeriod,
} from "./shop-billing";

describe("shop-billing", () => {
  const catalog = catalogMapFromItems([
    { id: "coffee", name: "Coffee", price: 1.5, active: true },
    { id: "water", name: "Water", price: 0.5, active: true },
    { id: "inactive", name: "Old", price: 10, active: false },
  ]);

  it("extracts YYYY-MM from shop date", () => {
    assert.equal(periodFromShopDate("2026-05-16"), "2026-05");
    assert.equal(periodFromShopDate("invalid"), null);
  });

  it("maps shop month to next payment period", () => {
    assert.equal(paymentPeriodForShopMonth("2026-05"), "2026-06");
    assert.equal(paymentPeriodForShopMonth("2026-12"), "2027-01");
    assert.equal(shopSourcePeriodForPaymentPeriod("2026-06"), "2026-05");
    assert.equal(shopSourcePeriodForPaymentPeriod("2026-01"), "2025-12");
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
    assert.equal(
      computeRegistrationDayTotal([{ itemId: "inactive", quantity: 1 }], catalog),
      0
    );
    assert.equal(computeRegistrationDayTotal(undefined, catalog), 0);
  });

  it("sums registrations in a billing period", () => {
    const total = computeShopTotalForStudentPeriod(
      [
        { date: "2026-05-01", lines: [{ itemId: "coffee", quantity: 1 }] },
        { date: "2026-05-02", lines: [{ itemId: "coffee", quantity: 2 }] },
        { date: "2026-04-30", lines: [{ itemId: "coffee", quantity: 5 }] },
        { date: "2026-05-03" },
      ],
      catalog,
      "2026-05"
    );
    assert.equal(total, 4.5);
  });

  it("periodDateRange returns month bounds", () => {
    assert.deepEqual(periodDateRange("2026-05"), {
      startDate: "2026-05-01",
      endDate: "2026-05-31",
    });
    assert.equal(periodDateRange("bad"), null);
  });

  it("filterRegistrationsForPeriod keeps only matching month", () => {
    const regs = [
      { date: "2026-05-01", lines: [] },
      { date: "2026-04-30", lines: [] },
    ];
    assert.equal(filterRegistrationsForPeriod(regs, "2026-05").length, 1);
    assert.equal(filterRegistrationsForPeriod(regs, "2026-05")[0].date, "2026-05-01");
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

  it("summarizeShopRegistrationsForPeriod returns sorted day lines and total", () => {
    const { entries, monthShopTotal } = summarizeShopRegistrationsForPeriod(
      [
        { date: "2026-05-01", lines: [{ itemId: "coffee", quantity: 1 }] },
        { date: "2026-05-03", lines: [{ itemId: "water", quantity: 2 }] },
        { date: "2026-04-30", lines: [{ itemId: "coffee", quantity: 10 }] },
        { date: "2026-05-02", lines: [{ itemId: "coffee", quantity: 0 }] },
      ],
      catalog,
      "2026-05"
    );
    assert.equal(monthShopTotal, 2.5);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].date, "2026-05-03");
    assert.equal(entries[0].summary, "Water ×2");
    assert.equal(entries[0].dayTotal, 1);
    assert.equal(entries[1].date, "2026-05-01");
    assert.equal(entries[1].dayTotal, 1.5);
  });

  it("builds payment amount breakdown", () => {
    assert.deepEqual(buildPaymentAmounts(100, 12.5), {
      amount: 112.5,
      baseAmount: 100,
      shopAmount: 12.5,
    });
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

  it("resolveMonthlyRate falls back to session rates", () => {
    assert.equal(
      resolveMonthlyRate({
        monthlyRate: 0,
        rate60Min: 10,
        sessionsPerWeek: 3,
        sessionDurationMin: 60,
      }),
      120
    );
    assert.equal(
      resolveMonthlyRate({
        rate30Min: 8,
        sessionsPerWeek: 2,
        sessionDurationMin: 30,
      }),
      64
    );
  });

  it("resolveMonthlyRate returns 0 when rates missing", () => {
    assert.equal(resolveMonthlyRate({ sessionsPerWeek: 3 }), 0);
    assert.equal(resolveMonthlyRate({ rate60Min: 10 }), 0);
  });
});
