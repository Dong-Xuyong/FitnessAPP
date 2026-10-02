"use client";

import { Badge } from "@/components/ui/badge";
import { Banknote, Percent, ShoppingBag } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatBillingPeriodLabel } from "@/lib/billing-period-label";
import { paymentHasShopBreakdown } from "@/lib/shop-billing";
import type { StudentPaymentRecord } from "@/hooks/use-student-billing-data";
import { paymentMethodLabel } from "@/components/student-billing/payment-method-label";

type Props = {
  payments: StudentPaymentRecord[];
  defaultMethod?: string;
};

export function StudentPaymentHistoryList({ payments, defaultMethod }: Props) {
  const { t, locale } = useI18n();

  if (payments.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Banknote className="h-8 w-8 mx-auto mb-2 opacity-20" />
        <p className="text-sm">{t("noPaymentRecords")}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {payments.map((p) => {
        const periodLabel = formatBillingPeriodLabel(
          String(p.period ?? ""),
          locale === "pt" ? "pt-PT" : undefined
        );
        const amount = Number.isFinite(p.amount) ? p.amount! : 0;
        const showBreakdown = paymentHasShopBreakdown(p);
        const paidAtRaw = p.paidAt;
        const paidAtLabel =
          paidAtRaw && Number.isFinite(Date.parse(paidAtRaw))
            ? new Date(paidAtRaw).toLocaleDateString(locale === "pt" ? "pt-PT" : undefined)
            : "—";

        return (
          <li
            key={p.id}
            className="rounded-lg border bg-muted/20 p-3 space-y-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold capitalize">{periodLabel}</p>
              <div className="flex items-center gap-2">
                <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200">
                  {t("paid")}
                </Badge>
                <span className="text-sm font-bold tabular-nums">€{amount.toFixed(2)}</span>
              </div>
            </div>
            <ul className="text-xs space-y-1.5 text-muted-foreground">
              {showBreakdown ? (
                <>
                  <li className="flex items-center gap-2">
                    <Percent className="h-3.5 w-3.5 shrink-0" />
                    {t("shopBillingMembership")}: €{Number(p.baseAmount ?? 0).toFixed(2)}
                  </li>
                  <li className="flex items-center gap-2">
                    <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
                    {t("shopBillingShop")}: €{Number(p.shopAmount ?? 0).toFixed(2)}
                  </li>
                </>
              ) : null}
              <li>
                {t("method")}: {paymentMethodLabel(p.method ?? defaultMethod, t)}
              </li>
              <li>
                {t("datePaid")}: {paidAtLabel}
              </li>
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
