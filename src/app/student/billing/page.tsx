"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Banknote, Dumbbell } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { collection, doc, getDocs } from "firebase/firestore";
import {
  fetchShopRegistrationsForPeriodCandidates,
  resolveShopRegistrationStudentIds,
} from "@/lib/fetch-shop-registrations";
import { normalizedPaymentPaid, normalizedPaymentPending } from "@/lib/student-payment-due";
import { currentBillingPeriod, nextBillingPeriod } from "@/lib/roster-payment-status";
import {
  buildPaymentAmounts,
  catalogMapFromItems,
  computeShopTotalForStudentPeriod,
  paymentHasShopBreakdown,
  resolveMonthlyRate,
  type ShopLine,
} from "@/lib/shop-billing";
import { useEffect, useMemo, useState } from "react";

type ShopItemRow = { id: string; name?: string; price?: number; active?: boolean };

export default function StudentBillingPage() {
  const { t } = useI18n();
  const { user } = useUser();
  const db = useFirestore();

  const studentRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, "students", user.uid);
  }, [db, user]);
  const { data: studentData } = useDoc(studentRef);

  const trainerId = studentData?.trainerId as string | undefined;
  const rosterDocId = (studentData?.rosterDocId as string | undefined) || user?.uid;

  const billingConfigRef = useMemoFirebase(() => {
    if (!db || !trainerId || !rosterDocId) return null;
    return doc(db, "personalTrainers", trainerId, "students", rosterDocId);
  }, [db, trainerId, rosterDocId]);
  const { data: rosterData } = useDoc(billingConfigRef);

  const paymentsRef = useMemoFirebase(() => {
    if (!db || !trainerId || !rosterDocId) return null;
    return collection(db, "personalTrainers", trainerId, "students", rosterDocId, "payments");
  }, [db, trainerId, rosterDocId]);
  const { data: payments } = useCollection(paymentsRef);

  const [monthRegs, setMonthRegs] = useState<Array<{ date?: string; lines?: ShopLine[] }>>([]);
  const [shopItems, setShopItems] = useState<ShopItemRow[]>([]);

  const sortedPayments = (payments || []).sort(
    (a: any, b: any) => (b.dueDate || "").localeCompare(a.dueDate || "")
  );

  const billing = rosterData as Record<string, unknown> | undefined;
  const resolvedMonthlyRate = useMemo(
    () => (billing ? resolveMonthlyRate(billing) : 0),
    [billing]
  );
  const currentPeriod = currentBillingPeriod();

  const currentPeriodPayment = useMemo(() => {
    const list = payments || [];
    return list.find((p: { period?: string }) => String(p.period ?? "") === currentPeriod) as
      | { shopAmount?: number; baseAmount?: number; amount?: number; status?: string }
      | undefined;
  }, [payments, currentPeriod]);

  const currentPendingPayment = useMemo(() => {
    if (!currentPeriodPayment || !normalizedPaymentPending(currentPeriodPayment.status)) {
      return undefined;
    }
    return currentPeriodPayment;
  }, [currentPeriodPayment]);

  const currentPeriodIsPaid = useMemo(
    () => Boolean(currentPeriodPayment && normalizedPaymentPaid(currentPeriodPayment.status)),
    [currentPeriodPayment]
  );

  const catalogMap = useMemo(
    () =>
      catalogMapFromItems(
        shopItems.map((item) => ({
          id: item.id,
          name: String(item.name ?? ""),
          price: Number(item.price ?? 0),
          active: item.active !== false,
        }))
      ),
    [shopItems]
  );

  const monthShopTotal = useMemo(
    () => computeShopTotalForStudentPeriod(monthRegs, catalogMap, currentPeriod),
    [monthRegs, catalogMap, currentPeriod]
  );

  useEffect(() => {
    if (!db || !trainerId || !user?.uid) {
      setShopItems([]);
      setMonthRegs([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const itemsSnap = await getDocs(collection(db, "personalTrainers", trainerId, "shopItems"));
        if (cancelled) return;
        const items = itemsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as ShopItemRow))
          .filter((i) => i.active !== false);
        setShopItems(items);

        const studentIds = await resolveShopRegistrationStudentIds(
          db,
          trainerId,
          user.uid,
          studentData as Record<string, unknown> | undefined
        );
        const regs = await fetchShopRegistrationsForPeriodCandidates(
          db,
          trainerId,
          studentIds,
          currentPeriod,
          { authUidForDocIdFetch: user.uid }
        );
        if (cancelled) return;
        setMonthRegs(regs);
      } catch {
        if (!cancelled) {
          setShopItems([]);
          setMonthRegs([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, trainerId, user?.uid, currentPeriod, studentData]);

  const { totalDue, baseAmount, shopAmount } = useMemo(() => {
    if (currentPeriodIsPaid) {
      return { totalDue: 0, baseAmount: 0, shopAmount: 0 };
    }
    if (currentPendingPayment) {
      const amount = Number(currentPendingPayment.amount ?? 0);
      const base = Number(
        currentPendingPayment.baseAmount ?? resolveMonthlyRate(billing ?? {})
      );
      const shop = Number(currentPendingPayment.shopAmount ?? 0);
      return { totalDue: amount, baseAmount: base, shopAmount: shop };
    }
    const amounts = buildPaymentAmounts(resolvedMonthlyRate, 0);
    return {
      totalDue: amounts.amount,
      baseAmount: amounts.baseAmount,
      shopAmount: 0,
    };
  }, [billing, currentPeriodIsPaid, currentPendingPayment, resolvedMonthlyRate]);

  const nextPaymentPeriod = nextBillingPeriod();

  const sessionsPerWeek = billing?.sessionsPerWeek as number | undefined;
  const sessionDurationMin = billing?.sessionDurationMin as number | undefined;
  const hasPlanInfo = sessionsPerWeek || sessionDurationMin;

  const paymentMethodLabel = (method: string | undefined) =>
    method === "mbway" ? "MB WAY" : method === "bank_transfer" ? "Bank Transfer" : method || "—";

  return (
    <div className="space-y-6 w-full min-w-0">
      <header>
        <h1 className="text-3xl font-bold font-headline">{t("billing")}</h1>
        <p className="text-muted-foreground">{t("viewPaymentStatus")}</p>
      </header>

      {hasPlanInfo && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 shrink-0">
                <Dumbbell className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wide">
                  {t("currentPlan") || "Plano Atual"}
                </p>
                <p className="text-xl font-bold">
                  {sessionsPerWeek ? `${sessionsPerWeek}x ${t("perWeek") || "por semana"}` : ""}
                  {sessionsPerWeek && sessionDurationMin ? " · " : ""}
                  {sessionDurationMin ? `${sessionDurationMin} min` : ""}
                </p>
              </div>
              <div className="text-center sm:text-right shrink-0 space-y-1">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wide">
                  {t("shopBillingTotal")}
                </p>
                {currentPeriodIsPaid ? (
                  <p className="text-2xl font-bold text-primary">€0.00</p>
                ) : totalDue > 0 ? (
                  <p className="text-2xl font-bold text-primary">€{totalDue.toFixed(2)}</p>
                ) : (
                  <p className="text-2xl font-bold text-primary">{t("notSet")}</p>
                )}
                {shopAmount > 0 && !currentPeriodIsPaid && totalDue > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("shopBillingMembership")}: €{baseAmount.toFixed(2)} · {t("shopBillingShop")}: €
                    {shopAmount.toFixed(2)}
                  </p>
                )}
                {monthShopTotal > 0 && !currentPeriodIsPaid && (
                  <p className="text-xs text-muted-foreground">
                    {t("shopBillingAppliedToNext")
                      .replace("{amount}", monthShopTotal.toFixed(2))
                      .replace("{period}", nextPaymentPeriod)}
                  </p>
                )}
                {currentPeriodIsPaid && (
                  <p className="text-xs text-muted-foreground">{t("paid")}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {typeof billing?.paymentDetails === "string" && billing.paymentDetails.trim() && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("paymentInstructionsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-lg bg-muted/50 border text-sm whitespace-pre-wrap">
              {billing.paymentDetails}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("paymentHistory")}</CardTitle>
          <CardDescription>{t("paymentsRecordedByCoach")}</CardDescription>
        </CardHeader>
        <CardContent>
          {sortedPayments.length > 0 ? (
            <>
              <div className="md:hidden space-y-3">
                {sortedPayments.map((p: any) => (
                  <div
                    key={p.id}
                    className="rounded-lg border bg-card/50 p-4 space-y-3 text-sm min-w-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 gap-y-1">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                          {t("period")}
                        </p>
                        <p className="font-semibold break-words">{p.period || "—"}</p>
                      </div>
                      <p className="text-lg font-bold text-primary shrink-0">€{p.amount || 0}</p>
                    </div>
                    {paymentHasShopBreakdown(p) && (
                      <p className="text-xs text-muted-foreground">
                        {t("shopBillingMembership")}: €{Number(p.baseAmount ?? 0).toFixed(2)} ·{" "}
                        {t("shopBillingShop")}: €{Number(p.shopAmount ?? 0).toFixed(2)}
                      </p>
                    )}
                    <div className="grid grid-cols-1 gap-2 text-xs sm:text-sm">
                      <div>
                        <p className="text-muted-foreground">{t("method")}</p>
                        <p className="capitalize break-words">{paymentMethodLabel(p.method)}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-muted-foreground">{t("status")}</p>
                          <Badge
                            variant={normalizedPaymentPaid(p.status) ? "default" : "outline"}
                            className={
                              normalizedPaymentPaid(p.status)
                                ? "bg-green-100 text-green-800 normal-case mt-1"
                                : normalizedPaymentPending(p.status)
                                  ? "bg-yellow-100 text-yellow-800 normal-case mt-1"
                                  : "mt-1"
                            }
                          >
                            {normalizedPaymentPaid(p.status)
                              ? t("paid")
                              : normalizedPaymentPending(p.status)
                                ? t("pending")
                                : String(p.status ?? "—")}
                          </Badge>
                        </div>
                        <div className="text-right min-w-0">
                          <p className="text-muted-foreground">{t("datePaid")}</p>
                          <p className="font-medium">
                            {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block w-full min-w-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("period")}</TableHead>
                      <TableHead>{t("amount")}</TableHead>
                      <TableHead>{t("method")}</TableHead>
                      <TableHead>{t("status")}</TableHead>
                      <TableHead>{t("datePaid")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPayments.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.period || "—"}</TableCell>
                        <TableCell>
                          <div>€{p.amount || 0}</div>
                          {paymentHasShopBreakdown(p) && (
                            <p className="text-xs text-muted-foreground font-normal">
                              {t("shopBillingMembership")}: €{Number(p.baseAmount ?? 0).toFixed(2)} ·{" "}
                              {t("shopBillingShop")}: €{Number(p.shopAmount ?? 0).toFixed(2)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="capitalize">{paymentMethodLabel(p.method)}</TableCell>
                        <TableCell>
                          <Badge
                            variant={normalizedPaymentPaid(p.status) ? "default" : "outline"}
                            className={
                              normalizedPaymentPaid(p.status)
                                ? "bg-green-100 text-green-800 normal-case"
                                : normalizedPaymentPending(p.status)
                                  ? "bg-yellow-100 text-yellow-800 normal-case"
                                  : ""
                            }
                          >
                            {normalizedPaymentPaid(p.status)
                              ? t("paid")
                              : normalizedPaymentPending(p.status)
                                ? t("pending")
                                : String(p.status ?? "—")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Banknote className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">{t("noPaymentRecords")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
