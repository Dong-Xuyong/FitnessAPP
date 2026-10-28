"use client";

import { loyaltyMembershipQuote } from "@/lib/shop-billing";

type Props = {
  listAmount: number;
  chargedAmount: number;
  percent: number;
  eligible: boolean;
  className?: string;
};

/** Full membership price, then the loyalty price, when the charge is the discounted rate. */
export function LoyaltyMembershipFigures({
  listAmount,
  chargedAmount,
  percent,
  eligible,
  className,
}: Props) {
  const quote = loyaltyMembershipQuote(listAmount, chargedAmount, percent, eligible);
  const charged = Number.isFinite(chargedAmount) ? chargedAmount : 0;
  if (!quote.discountApplied) {
    return <span className={className}>€{charged.toFixed(2)}</span>;
  }
  return (
    <span className={className}>
      <span className="line-through font-normal text-muted-foreground">
        €{quote.listAmount.toFixed(2)}
      </span>
      {" → "}€{quote.discountedAmount.toFixed(2)}{" "}
      <span className="font-normal text-muted-foreground">({quote.percent}%)</span>
    </span>
  );
}

export function membershipDiscountApplied(
  listAmount: number,
  chargedAmount: number,
  percent: number,
  eligible: boolean
): boolean {
  return loyaltyMembershipQuote(listAmount, chargedAmount, percent, eligible).discountApplied;
}
