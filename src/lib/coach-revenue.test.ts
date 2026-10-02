import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCoachRevenueSnapshot,
  forecastStudentAmount,
  listPeriodsEndingAt,
  shiftBillingPeriod,
  splitPaymentAmounts,
  type CoachRevenueStudent,
} from "./coach-revenue";

function student(partial: Partial<CoachRevenueStudent> & { id: string; name: string }): CoachRevenueStudent {
  return {
    roster: {},
    payments: [],
    ...partial,
  };
}

describe("splitPaymentAmounts", () => {
  it("splits membership and shop when breakdown is present", () => {
    assert.deepEqual(
      splitPaymentAmounts({ amount: 130, baseAmount: 100, shopAmount: 30 }),
      { total: 130, membership: 100, shop: 30 }
    );
  });

  it("treats a bare amount as membership", () => {
    assert.deepEqual(splitPaymentAmounts({ amount: 80 }), {
      total: 80,
      membership: 80,
      shop: 0,
    });
  });

  it("counts shop-only breakdown", () => {
    assert.deepEqual(splitPaymentAmounts({ amount: 12, baseAmount: 0, shopAmount: 12 }), {
      total: 12,
      membership: 0,
      shop: 12,
    });
  });
});

describe("shiftBillingPeriod", () => {
  it("rolls December to January", () => {
    assert.equal(shiftBillingPeriod("2026-12", 1), "2027-01");
    assert.equal(shiftBillingPeriod("2026-01", -1), "2025-12");
  });
});

describe("listPeriodsEndingAt", () => {
  it("returns the last 3 months inclusive", () => {
    assert.deepEqual(listPeriodsEndingAt("2026-08", 3), ["2026-06", "2026-07", "2026-08"]);
  });
});

describe("forecastStudentAmount", () => {
  it("uses an existing next-period payment row", () => {
    const row = forecastStudentAmount(
      student({
        id: "a",
        name: "Ana",
        roster: { billingStatus: "active", monthlyRate: 90 },
        payments: [{ period: "2026-09", amount: 110, baseAmount: 90, shopAmount: 20, status: "pending" }],
      }),
      "2026-09"
    );
    assert.equal(row?.amount, 110);
    assert.equal(row?.source, "payment_row");
    assert.equal(row?.paid, false);
  });

  it("falls back to monthly rate when billing is active and no next-period row exists", () => {
    const row = forecastStudentAmount(
      student({
        id: "b",
        name: "Bruno",
        roster: { billingStatus: "active", monthlyRate: 75 },
        payments: [{ period: "2026-08", amount: 75, status: "paid" }],
      }),
      "2026-09"
    );
    assert.equal(row?.amount, 75);
    assert.equal(row?.source, "monthly_rate");
  });

  it("returns null for inactive students without a next-period row", () => {
    const row = forecastStudentAmount(
      student({
        id: "c",
        name: "Carla",
        roster: { billingStatus: "inactive", monthlyRate: 80 },
        payments: [],
      }),
      "2026-09"
    );
    assert.equal(row, null);
  });
});

describe("buildCoachRevenueSnapshot", () => {
  const now = new Date(2026, 7, 15, 12, 0, 0); // 15 Aug 2026 — current 2026-08, next 2026-09

  it("returns zeros for an empty roster", () => {
    const snap = buildCoachRevenueSnapshot([], now);
    assert.equal(snap.currentPeriod, "2026-08");
    assert.equal(snap.nextPeriod, "2026-09");
    assert.equal(snap.thisMonthCollected, 0);
    assert.equal(snap.nextMonthForecast, 0);
    assert.equal(snap.outstandingPending, 0);
    assert.equal(snap.activeBilledStudents, 0);
    assert.equal(snap.chartMonths[snap.chartMonths.length - 1]?.period, "2026-09");
  });

  it("sums paid amounts by period and ignores pending in collected", () => {
    const inGrace = new Date(2026, 7, 5, 12, 0, 0);
    const snap = buildCoachRevenueSnapshot(
      [
        student({
          id: "a",
          name: "Ana",
          roster: { billingStatus: "active", monthlyRate: 100 },
          payments: [
            { period: "2026-07", amount: 100, baseAmount: 100, shopAmount: 0, status: "paid" },
            { period: "2026-08", amount: 115, baseAmount: 100, shopAmount: 15, status: "paid" },
          ],
        }),
        student({
          id: "b",
          name: "Bruno",
          roster: { billingStatus: "active", monthlyRate: 80 },
          payments: [{ period: "2026-08", amount: 80, baseAmount: 80, shopAmount: 0, status: "pending" }],
        }),
      ],
      inGrace
    );

    assert.equal(snap.thisMonthCollected, 115);
    const august = snap.monthTable.find((m) => m.period === "2026-08");
    assert.equal(august?.membershipCollected, 100);
    assert.equal(august?.shopCollected, 15);
    assert.equal(august?.pending, 80);
    assert.equal(august?.payingStudentCount, 1);
    assert.equal(snap.payingStudentsThisMonth, 1);
    assert.equal(snap.activeBilledStudents, 2);
    assert.equal(snap.outstandingPending, 80);
    assert.equal(snap.currentPeriodMix.paid, 115);
    assert.equal(snap.currentPeriodMix.pending, 80);
    assert.equal(snap.currentPeriodMix.overdue, 0);
  });

  it("treats Portuguese paid status as collected", () => {
    const snap = buildCoachRevenueSnapshot(
      [
        student({
          id: "a",
          name: "Ana",
          roster: { billingStatus: "active", monthlyRate: 50 },
          payments: [{ period: "2026-08", amount: 50, status: "pago" }],
        }),
      ],
      now
    );
    assert.equal(snap.thisMonthCollected, 50);
  });

  it("forecasts next month from payment rows and monthly-rate fallback", () => {
    const snap = buildCoachRevenueSnapshot(
      [
        student({
          id: "a",
          name: "Ana",
          roster: { billingStatus: "active", monthlyRate: 100 },
          payments: [{ period: "2026-09", amount: 120, baseAmount: 100, shopAmount: 20, status: "pending" }],
        }),
        student({
          id: "b",
          name: "Bruno",
          roster: { billingStatus: "active", monthlyRate: 80 },
          payments: [{ period: "2026-08", amount: 80, status: "paid" }],
        }),
        student({
          id: "c",
          name: "Carla",
          roster: { billingStatus: "inactive", monthlyRate: 200 },
          payments: [],
        }),
      ],
      now
    );

    assert.equal(snap.nextMonthForecast, 200);
    assert.equal(snap.forecastByStudent.length, 2);
    assert.equal(snap.forecastByStudent.find((r) => r.studentId === "a")?.source, "payment_row");
    assert.equal(snap.forecastByStudent.find((r) => r.studentId === "b")?.source, "monthly_rate");
    const forecastPoint = snap.chartMonths.find((p) => p.period === "2026-09");
    assert.equal(forecastPoint?.forecast, 200);
    assert.equal(forecastPoint?.membership, 0);
  });

  it("marks unpaid current-period amounts overdue after the grace deadline", () => {
    const afterGrace = new Date(2026, 7, 8, 12, 0, 0);
    const snap = buildCoachRevenueSnapshot(
      [
        student({
          id: "a",
          name: "Ana",
          roster: { billingStatus: "active", monthlyRate: 90 },
          payments: [{ period: "2026-08", amount: 90, status: "pending" }],
        }),
      ],
      afterGrace
    );
    assert.equal(snap.currentPeriodMix.paid, 0);
    assert.equal(snap.currentPeriodMix.pending, 0);
    assert.equal(snap.currentPeriodMix.overdue, 90);
    assert.equal(snap.thisMonthPending, 90);
  });

  it("computes MoM change on the last closed month", () => {
    const snap = buildCoachRevenueSnapshot(
      [
        student({
          id: "a",
          name: "Ana",
          roster: { billingStatus: "active", monthlyRate: 100 },
          payments: [
            { period: "2026-06", amount: 100, status: "paid" },
            { period: "2026-07", amount: 150, status: "paid" },
          ],
        }),
      ],
      now
    );
    assert.equal(snap.lastClosedPeriod, "2026-07");
    assert.equal(snap.momPercent, 50);
  });

  it("groups paid methods for the current year", () => {
    const snap = buildCoachRevenueSnapshot(
      [
        student({
          id: "a",
          name: "Ana",
          roster: { billingStatus: "active", monthlyRate: 100 },
          payments: [
            { period: "2026-07", amount: 100, method: "mbway", status: "paid" },
            { period: "2026-08", amount: 40, method: "cash", status: "paid" },
            { period: "2025-12", amount: 999, method: "mbway", status: "paid" },
          ],
        }),
      ],
      now
    );
    assert.deepEqual(snap.methodMix, [
      { method: "mbway", amount: 100 },
      { method: "cash", amount: 40 },
    ]);
  });
});
