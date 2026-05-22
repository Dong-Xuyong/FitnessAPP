"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Banknote, Dumbbell, ShoppingBag, Receipt } from "lucide-react";
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
  summarizeShopRegistrationsForPeriod,
  type ShopLine,
} from "@/lib/shop-billing";
import { useEffect, useMemo, useState } from "react";

type ShopItemRow = { id: string; name?: string; price?: number; active?: boolean };

function formatPeriodLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period.trim());
  if (!m) return period;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatYmdDisplay(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

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

  const monthSummary = useMemo(
    () => summarizeShopRegistrationsForPeriod(monthRegs, catalogMap, currentPeriod),
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
    <div className="space-y-6 w-full min-w-0 max-w-2xl">
      <header className="flex items-center gap-3">
        <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 shrink-0">
          <Receipt className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold font-headline">{t("billing")}</h1>
          <p className="text-sm text-muted-foreground">{t("viewPaymentStatus")}</p>
        </div>
      </header>

      {/* Current period summary */}
      {hasPlanInfo && (
        <Card className="overflow-hidden">
          <div className="bg-primary/5 border-b px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 shrink-0">
                <Dumbbell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                  {t("currentPlan") || "Plano Atual"}
                </p>
                <p className="font-semibold">
                  {sessionsPerWeek ? `${sessionsPerWeek}x ${t("perWeek") || "por semana"}` : ""}
                  {sessionsPerWeek && sessionDurationMin ? " · " : ""}
                  {sessionDurationMin ? `${sessionDurationMin} min` : ""}
                </p>
              </div>
            </div>
            <div className="sm:text-right shrink-0">
              <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                {t("shopBillingTotal")}
              </p>
              <p className="text-3xl font-bold text-primary tabular-nums">
                {currentPeriodIsPaid ? "€0.00" : totalDue > 0 ? `€${totalDue.toFixed(2)}` : t("notSet")}
              </p>
              {currentPeriodIsPaid && (
                <p className="text-xs text-green-600 font-medium">{t("paid")}</p>
              )}
            </div>
          </div>

          {/* Cost breakdown rows */}
          <CardContent className="p-0">
            <div className="divide-y">
              {/* Membership row */}
              <div className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-2">
                  <Dumbbell className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">{t("shopBillingMembership")}</span>
                </div>
                <span className="text-sm font-medium tabular-nums">
                  {baseAmount > 0 ? `€${baseAmount.toFixed(2)}` : resolvedMonthlyRate > 0 ? `€${resolvedMonthlyRate.toFixed(2)}` : "—"}
                </span>
              </div>
              {/* Shop row */}
              <div className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm">{t("shopBillingShop")} · {formatPeriodLabel(currentPeriod)}</span>
                </div>
                <span className="text-sm font-medium tabular-nums">
                  {shopAmount > 0 ? `€${shopAmount.toFixed(2)}` : monthShopTotal > 0 ? `€${monthShopTotal.toFixed(2)}` : "€0.00"}
                </span>
              </div>
            </div>
            {monthShopTotal > 0 && !currentPeriodIsPaid && (
              <div className="px-6 pb-3">
                <p className="text-xs text-muted-foreground">
                  {t("shopBillingAppliedToNext")
                    .replace("{amount}", monthShopTotal.toFixed(2))
                    .replace("{period}", nextPaymentPeriod)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Payment instructions */}
      {typeof billing?.paymentDetails === "string" && billing.paymentDetails.trim() && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t("paymentInstructionsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="p-4 rounded-xl bg-muted/40 border text-sm whitespace-pre-wrap">
              {billing.paymentDetails}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shop purchases this month */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                {t("shopBillingPurchases")}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {formatPeriodLabel(currentPeriod)}
              </CardDescription>
            </div>
            {monthSummary.monthShopTotal > 0 && (
              <span className="rounded-full bg-accent/10 px-3 py-1 text-sm font-semibold text-accent tabular-nums shrink-0">
                €{monthSummary.monthShopTotal.toFixed(2)}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {monthSummary.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("shopBillingNoPurchases")}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {monthSummary.entries.map((entry) => {
                const reg = monthRegs.find((r) => String(r.date ?? "") === entry.date);
                const lines = (reg?.lines ?? []).filter((l) => {
                  const qty = Math.floor(Number(l.quantity) || 0);
                  return qty > 0 && catalogMap.get(l.itemId);
                });
                return (
                  <div key={entry.date} className="rounded-xl border bg-muted/20 overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-muted/40 border-b">
                      <p className="text-sm font-semibold">{formatYmdDisplay(entry.date)}</p>
                      <span className="text-sm font-bold tabular-nums">€{entry.dayTotal.toFixed(2)}</span>
                    </div>
                    <div className="divide-y">
                      {lines.map((line) => {
                        const item = catalogMap.get(line.itemId);
                        const qty = Math.floor(Number(line.quantity) || 0);
                        const lineTotal = Number(item?.price ?? 0) * qty;
                        return (
                          <div key={line.itemId} className="flex items-center justify-between gap-3 px-4 py-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
                                {qty}
                              </span>
                              <span className="text-sm truncate">{item?.name ?? line.itemId}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground tabular-nums">
                              <span>€{Number(item?.price ?? 0).toFixed(2)} × {qty}</span>
                              <span className="font-semibold text-foreground">€{lineTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-muted-foreground" />
            {t("paymentHistory")}
          </CardTitle>
          <CardDescription>{t("paymentsRecordedByCoach")}</CardDescription>
        </CardHeader>
        <CardContent>
          {sortedPayments.length > 0 ? (
            <div className="flex flex-col gap-3">
              {sortedPayments.map((p: any) => {
                const isPaid = normalizedPaymentPaid(p.status);
                const isPending = normalizedPaymentPending(p.status);
                return (
                  <div key={p.id} className="rounded-xl border bg-muted/20 overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-muted/40 border-b">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{formatPeriodLabel(p.period) || p.period || "—"}</p>
                        <Badge
                          variant={isPaid ? "default" : "outline"}
                          className={
                            isPaid
                              ? "bg-green-100 text-green-800 normal-case text-[10px] px-1.5 py-0"
                              : isPending
                                ? "bg-yellow-100 text-yellow-800 normal-case text-[10px] px-1.5 py-0"
                                : "text-[10px] px-1.5 py-0"
                          }
                        >
                          {isPaid ? t("paid") : isPending ? t("pending") : String(p.status ?? "—")}
                        </Badge>
                      </div>
                      <span className="text-base font-bold tabular-nums">€{Number(p.amount ?? 0).toFixed(2)}</span>
                    </div>
                    <div className="divide-y">
                      {paymentHasShopBreakdown(p) && (
                        <>
                          <div className="flex items-center justify-between px-4 py-2 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Dumbbell className="h-3.5 w-3.5" />
                              <span>{t("shopBillingMembership")}</span>
                            </div>
                            <span className="tabular-nums">€{Number(p.baseAmount ?? 0).toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between px-4 py-2 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <ShoppingBag className="h-3.5 w-3.5" />
                              <span>{t("shopBillingShop")}</span>
                            </div>
                            <span className="tabular-nums">€{Number(p.shopAmount ?? 0).toFixed(2)}</span>
                          </div>
                        </>
                      )}
                      <div className="flex items-center justify-between px-4 py-2 text-sm text-muted-foreground">
                        <span>{t("method")}</span>
                        <span className="capitalize">{paymentMethodLabel(p.method)}</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-2 text-sm text-muted-foreground">
                        <span>{t("datePaid")}</span>
                        <span>{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
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
