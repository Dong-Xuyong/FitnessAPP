"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { Banknote, Loader2, TrendingUp, Users, Wallet } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFirestore, useUser, useCollection, useMemoFirebase } from "@/firebase";
import { useI18n } from "@/lib/i18n";
import { getStudentDisplayName } from "@/lib/student-display";
import {
  buildCoachRevenueSnapshot,
  paymentFromDoc,
  type CoachRevenueSnapshot,
  type CoachRevenueStudent,
} from "@/lib/coach-revenue";
import {
  CoachRevenueMethodChart,
  CoachRevenueMixChart,
  CoachRevenueMonthlyChart,
  formatRevenuePeriodLabel,
} from "@/components/CoachRevenueCharts";

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const limit = Math.max(1, Math.min(concurrency, items.length));

  async function runWorker() {
    while (nextIndex < items.length) {
      const i = nextIndex;
      nextIndex += 1;
      results[i] = await worker(items[i]);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => runWorker()));
  return results;
}

function formatEuro(n: number): string {
  return `€${n.toFixed(2)}`;
}

function formatSignedPercent(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(0)}%`;
}

type RosterRow = Record<string, unknown> & { id: string };

export default function CoachRevenuePage() {
  const { t, locale } = useI18n();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();

  const rosterQuery = useMemoFirebase(() => {
    if (!db || !user) return null;
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user]);

  const { data: rosterStudents, isLoading: isLoadingRoster } = useCollection(rosterQuery);

  const [snapshot, setSnapshot] = useState<CoachRevenueSnapshot | null>(null);
  const [loadingPayments, setLoadingPayments] = useState(false);

  const rosterRows = useMemo(
    () => (rosterStudents ?? []) as RosterRow[],
    [rosterStudents]
  );

  const rosterIdsKey = useMemo(
    () =>
      rosterRows
        .map((s) => s.id)
        .filter(Boolean)
        .sort()
        .join(","),
    [rosterRows]
  );

  const loadRevenue = useCallback(async () => {
    if (!db || !user) {
      setSnapshot(null);
      return;
    }
    if (rosterStudents == null) return;

    const fs = db;
    const trainerUid = user.uid;
    const nameFallback = t("unnamed");
    setLoadingPayments(true);
    try {
      const students: CoachRevenueStudent[] = await mapPool(rosterRows, 6, async (row) => {
        const paymentsSnap = await getDocs(
          collection(fs, "personalTrainers", trainerUid, "students", row.id, "payments")
        );
        return {
          id: row.id,
          name: getStudentDisplayName(row, nameFallback),
          roster: {
            billingStatus: row.billingStatus,
            monthlyRate: row.monthlyRate,
            rate30Min: row.rate30Min,
            rate60Min: row.rate60Min,
            sessionDurationMin: row.sessionDurationMin,
            sessionsPerWeek: row.sessionsPerWeek,
          },
          payments: paymentsSnap.docs.map((d) => paymentFromDoc(d.id, d.data() as Record<string, unknown>)),
        };
      });
      setSnapshot(buildCoachRevenueSnapshot(students));
    } catch (error) {
      console.error("Error loading coach revenue", error);
      setSnapshot(buildCoachRevenueSnapshot([]));
    } finally {
      setLoadingPayments(false);
    }
  }, [db, user, rosterStudents, rosterRows, t]);

  useEffect(() => {
    void loadRevenue();
  }, [loadRevenue, rosterIdsKey]);

  const waitingForData = Boolean(user) && (isLoadingRoster || loadingPayments || snapshot == null);

  if (isUserLoading) {
    return (
      <Navigation>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Navigation>
    );
  }

  const hasActivity =
    snapshot != null &&
    (snapshot.thisMonthCollected > 0 ||
      snapshot.nextMonthForecast > 0 ||
      snapshot.outstandingPending > 0 ||
      snapshot.monthTable.some((m) => m.collected > 0 || m.pending > 0));

  return (
    <Navigation>
      <div className="space-y-6 min-w-0">
        <header className="space-y-1">
          <h2 className="text-2xl sm:text-3xl font-bold font-headline">{t("revenuePageTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("revenuePageDescription")}</p>
        </header>

        {waitingForData ? (
          <div className="flex items-center justify-center h-[40vh]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : snapshot && hasActivity ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t("revenueThisMonth")}</CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums">{formatEuro(snapshot.thisMonthCollected)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("revenueThisMonthHint")
                      .replace("{period}", formatRevenuePeriodLabel(snapshot.currentPeriod, locale))
                      .replace("{pending}", formatEuro(snapshot.thisMonthPending))}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t("revenueNextMonthForecast")}</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums">{formatEuro(snapshot.nextMonthForecast)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("revenueNextMonthForecastHint").replace(
                      "{period}",
                      formatRevenuePeriodLabel(snapshot.nextPeriod, locale)
                    )}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t("revenueOutstanding")}</CardTitle>
                  <Banknote className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums">{formatEuro(snapshot.outstandingPending)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t("revenueOutstandingHint")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{t("revenueActiveStudents")}</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold tabular-nums">{snapshot.activeBilledStudents}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("revenueActiveStudentsHint")
                      .replace("{paying}", String(snapshot.payingStudentsThisMonth))
                      .replace(
                        "{rate}",
                        snapshot.collectionRate == null
                          ? "—"
                          : `${Math.round(snapshot.collectionRate * 100)}%`
                      )}
                  </p>
                </CardContent>
              </Card>
            </div>

            {(snapshot.momPercent != null || snapshot.yoyPercent != null) && (
              <p className="text-sm text-muted-foreground">
                {snapshot.lastClosedPeriod
                  ? t("revenueClosedMonthStats")
                      .replace("{period}", formatRevenuePeriodLabel(snapshot.lastClosedPeriod, locale))
                      .replace("{mom}", formatSignedPercent(snapshot.momPercent))
                      .replace("{yoy}", formatSignedPercent(snapshot.yoyPercent))
                  : null}
              </p>
            )}

            <Card>
              <CardHeader>
                <CardTitle>{t("revenueMonthlyChartTitle")}</CardTitle>
                <CardDescription>{t("revenueMonthlyChartHint")}</CardDescription>
              </CardHeader>
              <CardContent>
                <CoachRevenueMonthlyChart data={snapshot.chartMonths} emptyLabel={t("revenueNoChartData")} />
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>{t("revenueCurrentMixTitle")}</CardTitle>
                  <CardDescription>
                    {formatRevenuePeriodLabel(snapshot.currentPeriod, locale)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CoachRevenueMixChart mix={snapshot.currentPeriodMix} emptyLabel={t("revenueNoChartData")} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t("revenueMethodMixTitle")}</CardTitle>
                  <CardDescription>{t("revenueMethodMixHint")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <CoachRevenueMethodChart rows={snapshot.methodMix} emptyLabel={t("revenueNoChartData")} />
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>{t("revenueMonthTableTitle")}</CardTitle>
                </CardHeader>
                <CardContent>
                  {snapshot.monthTable.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("revenueNoChartData")}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("revenueMonthTablePeriod")}</TableHead>
                          <TableHead className="text-right">{t("revenueMonthTableCollected")}</TableHead>
                          <TableHead className="text-right">{t("revenueMonthTablePending")}</TableHead>
                          <TableHead className="text-right">{t("revenueMonthTableStudents")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {snapshot.monthTable.map((row) => (
                          <TableRow key={row.period}>
                            <TableCell className="font-medium">
                              {formatRevenuePeriodLabel(row.period, locale)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatEuro(row.collected)}</TableCell>
                            <TableCell className="text-right tabular-nums">{formatEuro(row.pending)}</TableCell>
                            <TableCell className="text-right tabular-nums">{row.payingStudentCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>{t("revenueForecastTableTitle")}</CardTitle>
                  <CardDescription>
                    {formatRevenuePeriodLabel(snapshot.nextPeriod, locale)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {snapshot.forecastByStudent.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("revenueForecastTableEmpty")}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t("revenueForecastTableStudent")}</TableHead>
                          <TableHead>{t("revenueForecastTableSource")}</TableHead>
                          <TableHead className="text-right">{t("revenueForecastTableAmount")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {snapshot.forecastByStudent.map((row) => (
                          <TableRow key={row.studentId}>
                            <TableCell className="font-medium">{row.name}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">
                                  {row.source === "payment_row"
                                    ? t("revenueForecastFromPayment")
                                    : t("revenueForecastFromRate")}
                                </span>
                                {row.paid ? (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {t("paid")}
                                  </Badge>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatEuro(row.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t("revenueEmptyTitle")}</CardTitle>
              <CardDescription>{t("revenueEmptyDescription")}</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </Navigation>
  );
}
