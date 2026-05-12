"use client";

import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Banknote, Dumbbell } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection } from "firebase/firestore";
import { normalizedPaymentPaid, normalizedPaymentPending } from "@/lib/student-payment-due";

export default function StudentBillingPage() {
  const { t } = useI18n();
  const { user } = useUser();
  const db = useFirestore();

  // Get student's global doc to find trainerId
  const studentRef = useMemoFirebase(() => {
    if (!db || !user) return null;
    return doc(db, "students", user.uid);
  }, [db, user]);
  const { data: studentData } = useDoc(studentRef);

  const trainerId = studentData?.trainerId as string | undefined;
  // Use rosterDocId if set (handles cases where data was stored under a different doc ID)
  const rosterDocId = (studentData?.rosterDocId as string | undefined) || user?.uid;

  // Get billing config from trainer's student subdoc
  const billingConfigRef = useMemoFirebase(() => {
    if (!db || !trainerId || !rosterDocId) return null;
    return doc(db, "personalTrainers", trainerId, "students", rosterDocId);
  }, [db, trainerId, rosterDocId]);
  const { data: rosterData } = useDoc(billingConfigRef);

  // Get payment records
  const paymentsRef = useMemoFirebase(() => {
    if (!db || !trainerId || !rosterDocId) return null;
    return collection(db, "personalTrainers", trainerId, "students", rosterDocId, "payments");
  }, [db, trainerId, rosterDocId]);
  const { data: payments } = useCollection(paymentsRef);

  const sortedPayments = (payments || []).sort(
    (a: any, b: any) => (b.dueDate || "").localeCompare(a.dueDate || "")
  );

  const billing = rosterData as any;
  const monthlyAmount = billing?.monthlyRate || 0;
  const sessionsPerWeek = billing?.sessionsPerWeek as number | undefined;
  const sessionDurationMin = billing?.sessionDurationMin as number | undefined;
  const hasPlanInfo = sessionsPerWeek || sessionDurationMin;

  const paymentMethodLabel = (method: string | undefined) =>
    method === "mbway" ? "MB WAY" : method === "bank_transfer" ? "Bank Transfer" : method || "—";

  return (
    <StudentNavigation>
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
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wide">{t("currentPlan") || "Plano Atual"}</p>
                  <p className="text-xl font-bold">
                    {sessionsPerWeek ? `${sessionsPerWeek}x ${t("perWeek") || "por semana"}` : ""}
                    {sessionsPerWeek && sessionDurationMin ? " · " : ""}
                    {sessionDurationMin ? `${sessionDurationMin} min` : ""}
                  </p>
                </div>
                <div className="text-center sm:text-right shrink-0">
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wide">{t("monthlyRate")}</p>
                  <p className="text-2xl font-bold text-primary">
                    {monthlyAmount > 0 ? `€${monthlyAmount}` : t("notSet")}
                    {monthlyAmount > 0 && <span className="text-sm font-normal text-muted-foreground">/mês</span>}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {billing?.paymentDetails && (
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
                          <TableCell>€{p.amount || 0}</TableCell>
                          <TableCell className="capitalize">
                            {paymentMethodLabel(p.method)}
                          </TableCell>
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
    </StudentNavigation>
  );
}
