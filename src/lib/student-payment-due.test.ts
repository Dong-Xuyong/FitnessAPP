import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPaymentReminderState } from "./student-payment-due";

const activeBilling = {
  billingStatus: "active",
  monthlyRate: 50,
  payments: [{ period: "2026-05", status: "paid" }] as Array<{ period?: string; status?: string }>,
};

describe("getPaymentReminderState soon window", () => {
  it("shows soon on May 30 (penultimate day, inside last 4 days)", () => {
    const result = getPaymentReminderState({
      ...activeBilling,
      now: new Date(2026, 4, 30, 12, 0, 0),
    });
    assert.equal(result.show, true);
    if (result.show) {
      assert.equal(result.variant, "soon");
      assert.equal(result.dueDate.getFullYear(), 2026);
      assert.equal(result.dueDate.getMonth(), 5);
      assert.equal(result.dueDate.getDate(), 6);
    }
  });

  it("shows soon on May 31 (last day, previously missed)", () => {
    const result = getPaymentReminderState({
      ...activeBilling,
      now: new Date(2026, 4, 31, 12, 0, 0),
    });
    assert.equal(result.show, true);
    if (result.show) {
      assert.equal(result.variant, "soon");
      assert.equal(result.dueDate.getFullYear(), 2026);
      assert.equal(result.dueDate.getMonth(), 5);
      assert.equal(result.dueDate.getDate(), 6);
    }
  });

  it("does not show soon on May 27 (outside last 4 days)", () => {
    const result = getPaymentReminderState({
      ...activeBilling,
      now: new Date(2026, 4, 27, 12, 0, 0),
    });
    assert.deepEqual(result, { show: false });
  });

  it("does not show soon when next month is already paid", () => {
    const result = getPaymentReminderState({
      ...activeBilling,
      now: new Date(2026, 4, 31, 12, 0, 0),
      payments: [
        { period: "2026-05", status: "paid" },
        { period: "2026-06", status: "paid" },
      ],
    });
    assert.deepEqual(result, { show: false });
  });
});

describe("getPaymentReminderState overdue", () => {
  it("shows overdue on June 8 when May is unpaid", () => {
    const result = getPaymentReminderState({
      ...activeBilling,
      now: new Date(2026, 5, 8, 12, 0, 0),
      payments: [
        { period: "2026-05", status: "pending" },
        { period: "2026-06", status: "paid" },
      ],
    });
    assert.equal(result.show, true);
    if (result.show) {
      assert.equal(result.variant, "overdue");
      assert.equal(result.dueDate.getFullYear(), 2026);
      assert.equal(result.dueDate.getMonth(), 4);
      assert.equal(result.dueDate.getDate(), 6);
    }
  });
});
