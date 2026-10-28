"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Banknote, Percent, ShoppingBag } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatBillingPeriodLabel } from "@/lib/billing-period-label";
import { paymentHasShopBreakdown } from "@/lib/shop-billing";
import type { StudentPaymentRecord } from "@/hooks/use-student-billing-data";
import { paymentMethodLabel } from "@/components/student-billing/payment-method-label";
import {
  LoyaltyMembershipFigures,
  membershipDiscountApplied,
} from "@/components/student-billing/LoyaltyMembershipFigures";

type Props = {
  payment: StudentPaymentRecord;
  paymentMethod: string;
  /** Hide CTA when already on the billing page. */
  hideInstructionsLink?: boolean;
  listMonthlyRate?: number;
  loyaltyDiscountPercent?: number;
  loyaltyDiscountActive?: boolean;
};

export function StudentPendingPaymentCard({
  payment,
  paymentMethod,
  hideInstructionsLink = false,
  listMonthlyRate = 0,
  loyaltyDiscountPercent = 0,
  loyaltyDiscountActive = false,
}: Props) {
  const { t, locale } = useI18n();
  const periodLabel = formatBillingPeriodLabel(
    String(payment.period ?? ""),
    locale === "pt" ? "pt-PT" : undefined
  );
  const amount = Number.isFinite(payment.amount) ? payment.amount! : 0;
  const showBreakdown = paymentHasShopBreakdown(payment);
  const membershipCharged = Number(payment.baseAmount ?? 0);
  const discountOnMembership = membershipDiscountApplied(
    listMonthlyRate,
    membershipCharged,
    loyaltyDiscountPercent,
    loyaltyDiscountActive
  );
  const shop = Number(payment.shopAmount ?? 0);
  const socio = Number(payment.socioAmount ?? 0);
  const bareAmountIsMembership = !showBreakdown && shop <= 0 && socio <= 0;
  const discountOnTotal =
    bareAmountIsMembership &&
    membershipDiscountApplied(listMonthlyRate, amount, loyaltyDiscountPercent, loyaltyDiscountActive);

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">{t("pendingPaymentTitle")}</CardTitle>
          <Badge
            variant="outline"
            className="bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-700"
          >
            {t("pending")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold capitalize">{periodLabel}</p>
          <p className="text-lg font-bold tabular-nums">
            {discountOnTotal ? (
              <LoyaltyMembershipFigures
                listAmount={listMonthlyRate}
                chargedAmount={amount}
                percent={loyaltyDiscountPercent}
                eligible={loyaltyDiscountActive}
              />
            ) : (
              <>€{amount.toFixed(2)}</>
            )}
          </p>
        </div>
        <ul className="text-sm space-y-2">
          {showBreakdown ? (
            <>
              <li className="flex items-center gap-2 text-muted-foreground">
                <Percent className="h-4 w-4 shrink-0 text-primary" />
                <span>
                  {t("shopBillingMembership")}:{" "}
                  <LoyaltyMembershipFigures
                    listAmount={listMonthlyRate}
                    chargedAmount={membershipCharged}
                    percent={loyaltyDiscountPercent}
                    eligible={loyaltyDiscountActive}
                  />
                </span>
              </li>
              {socio > 0 ? (
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Banknote className="h-4 w-4 shrink-0 text-primary" />
                  <span>
                    {t("socioFeeShort")}: €{socio.toFixed(2)}
                  </span>
                </li>
              ) : null}
              <li className="flex items-center gap-2 text-muted-foreground">
                <ShoppingBag className="h-4 w-4 shrink-0 text-primary" />
                <span>
                  {discountOnMembership && shop > 0
                    ? t("shopBillingShopFullPrice")
                    : t("shopBillingShop")}
                  : €
                  {shop.toFixed(2)}
                </span>
              </li>
            </>
          ) : null}
          <li className="flex items-center gap-2 text-muted-foreground">
            <Banknote className="h-4 w-4 shrink-0 text-primary" />
            <span>
              {t("method")}: {paymentMethodLabel(payment.method ?? paymentMethod, t)}
            </span>
          </li>
        </ul>
        {!hideInstructionsLink ? (
          <Button size="sm" variant="outline" className="w-full sm:w-auto" asChild>
            <Link href="/student/billing">{t("pendingPaymentViewInstructions")}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
