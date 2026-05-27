"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CreditCard } from "lucide-react";
import { useUser, useFirestore } from "@/firebase";
import { useI18n } from "@/lib/i18n";
import { useStudentBillingData } from "@/hooks/use-student-billing-data";
import { StudentPaymentHistoryList } from "@/components/student-billing/StudentPaymentHistoryList";
import { StudentCurrentPlanCard } from "@/components/student-billing/StudentCurrentPlanCard";
import { StudentPendingPaymentCard } from "@/components/student-billing/StudentPendingPaymentCard";

export default function StudentBillingPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const { t } = useI18n();
  const {
    loading,
    paymentInstructions,
    paymentMethod,
    plan,
    currentPeriodPending,
    paidPayments,
  } = useStudentBillingData(db, user?.uid);

  if (isUserLoading || loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full min-w-0 max-w-2xl">
      <header>
        <h1 className="text-3xl font-bold font-headline flex items-center gap-2">
          <CreditCard className="h-8 w-8 text-primary" />
          {t("billing")}
        </h1>
        <p className="text-muted-foreground mt-1">{t("viewPaymentStatus")}</p>
      </header>

      {plan ? <StudentCurrentPlanCard plan={plan} /> : null}

      {currentPeriodPending ? (
        <StudentPendingPaymentCard
          payment={currentPeriodPending}
          paymentMethod={paymentMethod}
          hideInstructionsLink
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("paymentInstructionsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {paymentInstructions ? (
            <p className="text-sm whitespace-pre-wrap">{paymentInstructions}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">{t("notSet")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("paymentHistory")}</CardTitle>
          <CardDescription>{t("paymentsRecordedByCoach")}</CardDescription>
        </CardHeader>
        <CardContent>
          <StudentPaymentHistoryList payments={paidPayments} defaultMethod={paymentMethod} />
        </CardContent>
      </Card>
    </div>
  );
}
