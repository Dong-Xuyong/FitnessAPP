"use client";

import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Banknote, Smartphone, Clock, CheckCircle2, AlertCircle, CalendarDays, Dumbbell } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useUser, useFirestore, useDoc, useCollection, useMemoFirebase } from "@/firebase";
import { doc, collection } from "firebase/firestore";

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
  const paymentMethod = billing?.paymentMethod || "bank_transfer";
  const billingStatus = billing?.billingStatus || "inactive";

  const hasPlanInfo = sessionsPerWeek || sessionDurationMin;

  const statusIcon = {
    active: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    past_due: <AlertCircle className="h-4 w-4 text-red-500" />,
    inactive: <Clock className="h-4 w-4 text-muted-foreground" />,
  }[billingStatus] || <Clock className="h-4 w-4 text-muted-foreground" />;

  const statusColor = {
    active: "bg-green-100 text-green-800",
    past_due: "bg-red-100 text-red-800",
    inactive: "bg-gray-100 text-gray-800",
  }[billingStatus as string] || "bg-gray-100 text-gray-800";

  return (
    <StudentNavigation>
      <div className="space-y-6">
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

        <div className="grid md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center space-y-2">
              <Banknote className="h-6 w-6 text-primary" />
              <p className="text-xs text-muted-foreground uppercase font-bold">{t("monthlyRate")}</p>
              <p className="text-2xl font-bold">{monthlyAmount > 0 ? `€${monthlyAmount}` : t("notSet")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center space-y-2">
              <Smartphone className="h-6 w-6 text-primary" />
              <p className="text-xs text-muted-foreground uppercase font-bold">{t("paymentMethod")}</p>
              <p className="text-lg font-bold capitalize">
                {paymentMethod === "mbway" ? "MB WAY" : paymentMethod === "bank_transfer" ? "Bank Transfer" : paymentMethod}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 flex flex-col items-center text-center space-y-2">
              {statusIcon}
              <p className="text-xs text-muted-foreground uppercase font-bold">{t("status")}</p>
              <Badge className={statusColor + " capitalize"}>{billingStatus.replace("_", " ")}</Badge>
            </CardContent>
          </Card>
        </div>

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
                        {p.method === "mbway" ? "MB WAY" : p.method === "bank_transfer" ? "Bank Transfer" : (p.method || "—")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={p.status === "paid" ? "default" : "outline"}
                          className={p.status === "paid" ? "bg-green-100 text-green-800" : p.status === "pending" ? "bg-yellow-100 text-yellow-800" : ""}
                        >
                          {p.status === "paid" ? t("paid") : t("pending")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
