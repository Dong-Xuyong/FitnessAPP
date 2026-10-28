import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyStoredLoyaltyDiscount,
  clampLoyaltyDiscountAfterMonths,
  loyaltyDiscountEligible,
  loyaltyWaitMonths,
} from "./shop-billing";

function paidMonths(fromYm: string, toYm: string): Array<{ period: string; status: string }> {
  let [y, m] = fromYm.split("-").map(Number);
  const [endY, endM] = toYm.split("-").map(Number);
  const rows: Array<{ period: string; status: string }> = [];
  while (y < endY || (y === endY && m <= endM)) {
    rows.push({ period: `${y}-${String(m).padStart(2, "0")}`, status: "paid" });
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return rows;
}

describe("functions loyalty wait in months", () => {
  const start = "2025-10-01";
  const paid = paidMonths("2025-10", "2027-09");
  const atTwelveMonths = new Date(2026, 9, 1);
  const atSixMonths = new Date(2026, 3, 1);

  it("defaults a missing wait to 12 months and reads an old year field", () => {
    assert.equal(clampLoyaltyDiscountAfterMonths(undefined), 12);
    assert.equal(clampLoyaltyDiscountAfterMonths(""), 12);
    assert.equal(clampLoyaltyDiscountAfterMonths(0), 0);
    assert.equal(loyaltyWaitMonths({}), 12);
    assert.equal(loyaltyWaitMonths({ loyaltyDiscountAfterYears: 1 }), 12);
    assert.equal(loyaltyWaitMonths({ loyaltyDiscountAfterYears: 2 }), 24);
    assert.equal(loyaltyWaitMonths({ loyaltyDiscountAfterYears: 0 }), 0);
    assert.equal(
      loyaltyWaitMonths({ loyaltyDiscountAfterMonths: 6, loyaltyDiscountAfterYears: 2 }),
      6
    );
    assert.equal(
      loyaltyWaitMonths({ loyaltyDiscountAfterMonths: 0, loyaltyDiscountAfterYears: 1 }),
      0
    );
  });

  it("counts complete months and restarts after a missed payment", () => {
    assert.equal(applyStoredLoyaltyDiscount(100, 5, start, new Date(2026, 8, 30), paid), 100);
    assert.equal(applyStoredLoyaltyDiscount(100, 5, start, atTwelveMonths, paid), 95);
    assert.equal(
      applyStoredLoyaltyDiscount(100, 5, start, atTwelveMonths, paid, loyaltyWaitMonths({ loyaltyDiscountAfterYears: 2 })),
      100
    );
    assert.equal(applyStoredLoyaltyDiscount(100, 5, start, atSixMonths, paid, 6), 95);
    assert.equal(loyaltyDiscountEligible(start, atSixMonths, 6, paid), true);
    assert.equal(applyStoredLoyaltyDiscount(100, 5, start, new Date(2025, 9, 1), [], 0), 95);

    const missed = paidMonths("2026-01", "2026-05").map((row) =>
      row.period === "2026-03" ? { ...row, status: "pending" } : row
    );
    assert.equal(applyStoredLoyaltyDiscount(100, 5, "2026-01-01", new Date(2026, 5, 1), missed, 5), 100);
  });
});
