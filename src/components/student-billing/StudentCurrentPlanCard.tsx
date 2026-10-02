"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Euro, Repeat } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { StudentBillingPlan } from "@/hooks/use-student-billing-data";
import { paymentMethodLabel } from "@/components/student-billing/payment-method-label";

type Props = {
  plan: StudentBillingPlan;
};

export function StudentCurrentPlanCard({ plan }: Props) {
  const { t } = useI18n();
  const isActive = plan.billingStatus.trim().toLowerCase() === "active";
  const durationLabel =
    plan.sessionDurationMin === 30 ? t("thirtyMin") : t("sixtyMin");
  const weeklyLabel =
    plan.sessionsPerWeek > 0
      ? `${plan.sessionsPerWeek} ${t("perWeek")}`
      : t("notSet");
  const monthlyLabel =
    plan.monthlyRate > 0 ? `€${plan.monthlyRate.toFixed(2)}` : t("notSet");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">{t("currentPlan")}</CardTitle>
          <Badge variant={isActive ? "default" : "secondary"}>
            {isActive ? t("active") : plan.billingStatus || t("notSet")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 text-sm">
          <li className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3">
            <Repeat className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">{t("sessionDuration")}</p>
              <p className="font-semibold">{durationLabel}</p>
            </div>
          </li>
          <li className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3">
            <Calendar className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">{t("timesPerWeek")}</p>
              <p className="font-semibold">{weeklyLabel}</p>
            </div>
          </li>
          <li className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3">
            <Euro className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">{t("monthlyRate")}</p>
              <p className="font-semibold tabular-nums">{monthlyLabel}</p>
            </div>
          </li>
          <li className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3">
            <Clock className="h-4 w-4 shrink-0 text-primary mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground">{t("method")}</p>
              <p className="font-semibold">{paymentMethodLabel(plan.paymentMethod, t)}</p>
            </div>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}
