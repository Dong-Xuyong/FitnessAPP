"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { useUser, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { isOpenTrainingAccess, normalizeTrainingAccessMode } from "@/lib/student-training-access";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import {
  catalogMapFromItems,
  computeRegistrationDayTotal,
  formatShopLinesSummary,
  mergeShopLines,
  mergeShopRegistrationsByDate,
  summarizeShopRegistrationsForPeriod,
  type ShopLine,
} from "@/lib/shop-billing";
import {
  fetchShopRegistrationsForPeriodCandidates,
  resolveShopRegistrationStudentIds,
} from "@/lib/fetch-shop-registrations";
import { currentBillingPeriod } from "@/lib/roster-payment-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Minus, Plus, Store } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

function localDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ymdToLocalDate(ymd: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return undefined;
  return new Date(y, mo - 1, day);
}

function formatYmdForDisplay(ymd: string): string {
  const d = ymdToLocalDate(ymd);
  if (!d) return ymd;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatBillingPeriodLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period.trim());
  if (!m) return period;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

type ShopItemRow = { id: string; name?: string; price?: number; active?: boolean };

export default function StudentShopPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { user } = useUser();
  const db = useFirestore();
  const router = useRouter();

  const currentMonthPeriod = currentBillingPeriod();
  const todayYmd = useMemo(() => localDateYmd(new Date()), []);

  const studentRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, "students", user.uid);
  }, [db, user?.uid]);

  const { data: studentData, isLoading: isStudentLoading } = useDoc(studentRef);
  const trainerId = typeof studentData?.trainerId === "string" ? studentData.trainerId : undefined;

  useEffect(() => {
    if (!db || !user?.uid || isStudentLoading) return;
    let cancelled = false;
    void (async () => {
      let mode = normalizeTrainingAccessMode(studentData?.trainingAccessMode);
      const tid = typeof studentData?.trainerId === "string" ? studentData.trainerId : undefined;
      const rosterId =
        (typeof studentData?.rosterDocId === "string" && studentData.rosterDocId.trim()) ||
        user.uid;
      if (tid) {
        try {
          const rosterSnap = await getDoc(doc(db, "personalTrainers", tid, "students", rosterId));
          if (rosterSnap.exists()) {
            const rd = rosterSnap.data();
            if (rd?.trainingAccessMode != null) {
              mode = normalizeTrainingAccessMode(rd.trainingAccessMode);
            }
          }
        } catch {
          /* keep global mode */
        }
      }
      if (!cancelled && isOpenTrainingAccess(mode)) {
        router.replace("/student/workouts");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, user?.uid, isStudentLoading, studentData, router]);

  const [shopItems, setShopItems] = useState<ShopItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [dateStr, setDateStr] = useState(() => localDateYmd(new Date()));
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [monthRegs, setMonthRegs] = useState<Array<{ date?: string; lines?: ShopLine[] }>>([]);
  const [shopLogOpen, setShopLogOpen] = useState(true);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);

  useEffect(() => {
    if (!db || !trainerId) {
      setShopItems([]);
      return;
    }
    let cancelled = false;
    setItemsLoading(true);
    void (async () => {
      try {
        const snap = await getDocs(collection(db, "personalTrainers", trainerId, "shopItems"));
        if (cancelled) return;
        const items = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as ShopItemRow))
          .filter((i) => i.active !== false)
          .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
        setShopItems(items);
      } catch {
        if (!cancelled) setShopItems([]);
      } finally {
        if (!cancelled) setItemsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, trainerId]);

  const catalogMap = useMemo(
    () =>
      catalogMapFromItems(
        shopItems.map((item) => ({
          id: item.id,
          name: String(item.name ?? ""),
          price: Number(item.price ?? 0),
          active: true,
        }))
      ),
    [shopItems]
  );

  const regDocRef = useMemoFirebase(() => {
    if (!db || !user?.uid || !dateStr || !trainerId) return null;
    return doc(db, "personalTrainers", trainerId, "shopRegistrations", `${user.uid}_${dateStr}`);
  }, [db, user?.uid, dateStr, trainerId]);

  useEffect(() => {
    if (!regDocRef || !user?.uid) return;
    let cancelled = false;
    setLoadingDoc(true);
    void (async () => {
      try {
        const snap = await getDoc(regDocRef);
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const item of shopItems) next[item.id] = 0;
        if (snap.exists()) {
          const lines = Array.isArray(snap.data().lines) ? (snap.data().lines as ShopLine[]) : [];
          for (const line of lines) {
            const id = String(line.itemId || "");
            if (!id) continue;
            const q = typeof line.quantity === "number" ? line.quantity : 0;
            next[id] = Math.max(0, Math.min(999, Math.floor(q)));
          }
        }
        setQuantities(next);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          const next: Record<string, number> = {};
          for (const item of shopItems) next[item.id] = 0;
          setQuantities(next);
        }
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [regDocRef, user?.uid, shopItems]);

  const loadMonthRegs = useCallback(async () => {
    if (!db || !trainerId || !user?.uid) {
      setMonthRegs([]);
      return;
    }
    try {
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
        currentMonthPeriod,
        { authUidForDocIdFetch: user.uid }
      );
      setMonthRegs(regs);
    } catch {
      setMonthRegs([]);
    }
  }, [db, trainerId, user?.uid, studentData, currentMonthPeriod]);

  useEffect(() => {
    void loadMonthRegs();
  }, [loadMonthRegs, saving]);

  const monthSummary = useMemo(
    () => summarizeShopRegistrationsForPeriod(monthRegs, catalogMap, currentMonthPeriod),
    [monthRegs, catalogMap, currentMonthPeriod]
  );

  const linesForSave = useMemo((): ShopLine[] => {
    return Object.entries(quantities)
      .filter(([, qty]) => Math.floor(qty) > 0)
      .map(([itemId, qty]) => ({ itemId, quantity: Math.floor(qty) }));
  }, [quantities]);

  const dayTotal = useMemo(
    () => computeRegistrationDayTotal(linesForSave, catalogMap),
    [linesForSave, catalogMap]
  );

  const saveItemsSummary = useMemo(
    () => formatShopLinesSummary(linesForSave, catalogMap),
    [linesForSave, catalogMap]
  );

  const clamp = (n: number) => Math.max(0, Math.min(999, Math.floor(n)));

  const emptyQuantities = useCallback((): Record<string, number> => {
    const next: Record<string, number> = {};
    for (const item of shopItems) next[item.id] = 0;
    return next;
  }, [shopItems]);

  const selectDay = (ymd: string) => {
    setDateStr(ymd);
    setShopLogOpen(true);
  };

  const goToToday = () => {
    setDateStr(todayYmd);
    setShopLogOpen(true);
  };

  const handleSave = async () => {
    if (!db || !user?.uid || !trainerId || !dateStr) return;
    setSaving(true);
    try {
      const regRef = doc(
        db,
        "personalTrainers",
        trainerId,
        "shopRegistrations",
        `${user.uid}_${dateStr}`
      );
      const existingSnap = await getDoc(regRef);
      const existingLines =
        existingSnap.exists() && Array.isArray(existingSnap.data().lines)
          ? (existingSnap.data().lines as ShopLine[])
          : [];
      const mergedLines = mergeShopLines(existingLines, linesForSave);

      await setDoc(
        regRef,
        {
          studentId: user.uid,
          trainerId,
          date: dateStr,
          lines: mergedLines,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      setMonthRegs((prev) =>
        mergeShopRegistrationsByDate([
          ...prev.filter((r) => String(r.date ?? "") !== dateStr),
          ...(mergedLines.length > 0 ? [{ date: dateStr, lines: mergedLines }] : []),
        ])
      );
      setConfirmSaveOpen(false);
      setShopLogOpen(false);
      setQuantities(emptyQuantities());
      toast({ title: t("shopSaveSuccess"), description: t("shopSaveBillingHint") });
      void loadMonthRegs();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ variant: "destructive", title: t("shopSaveFailed"), description: msg });
    } finally {
      setSaving(false);
    }
  };

  const canSave = Boolean(trainerId && user?.uid && dateStr && shopItems.length > 0);
  const canConfirmSave = canSave && linesForSave.length > 0 && dayTotal > 0;
  const isToday = dateStr === todayYmd;

  const bumpQty = (itemId: string, delta: number) => {
    setQuantities((prev) => ({
      ...prev,
      [itemId]: clamp((prev[itemId] ?? 0) + delta),
    }));
  };

  return (
    <div className="space-y-6 w-full min-w-0 max-w-4xl">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold font-headline flex items-center gap-2">
            <Store className="h-8 w-8 text-accent shrink-0" />
            {t("shop")}
          </h1>
          <p className="text-muted-foreground">{t("shopPageDescription")}</p>
        </div>
      </header>

      {!isStudentLoading && !trainerId && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("shopNoTrainerTitle")}</AlertTitle>
          <AlertDescription>{t("shopNoTrainerDescription")}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(240px,300px)] lg:items-start">
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle>{t("shopLogTitle")}</CardTitle>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <p className="text-sm text-muted-foreground">
                {t("shopLogActiveDay").replace("{date}", formatYmdForDisplay(dateStr))}
              </p>
              {!isToday && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!trainerId}
                  onClick={goToToday}
                >
                  {t("shopLogToday")}
                </Button>
              )}
            </div>
          </CardHeader>

          <Collapsible open={shopLogOpen} onOpenChange={setShopLogOpen}>
            <div className="px-6">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={!trainerId}
                >
                  <span className="font-medium">{t("shopPurchaseTotal")}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold tabular-nums">€{dayTotal.toFixed(2)}</span>
                    {shopLogOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                </button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent>
              <CardContent className="space-y-6 pt-4">
                {itemsLoading || loadingDoc ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("shopLoadingDay")}
                  </div>
                ) : shopItems.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>{t("shopCatalogEmptyStudent")}</AlertTitle>
                    <AlertDescription>{t("shopCatalogEmptyStudentHint")}</AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="space-y-4">
                      {shopItems.map((item) => (
                        <div key={item.id} className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Label>{item.name}</Label>
                            <span className="text-sm text-muted-foreground">
                              €{Number(item.price ?? 0).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => bumpQty(item.id, -1)}
                              disabled={!trainerId}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                              type="number"
                              min={0}
                              max={999}
                              className="w-24 text-center"
                              value={quantities[item.id] ?? 0}
                              onChange={(e) =>
                                setQuantities((prev) => ({
                                  ...prev,
                                  [item.id]: clamp(Number(e.target.value) || 0),
                                }))
                              }
                              disabled={!trainerId}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => bumpQty(item.id, 1)}
                              disabled={!trainerId}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button
                      className="w-full sm:w-auto"
                      onClick={() => setConfirmSaveOpen(true)}
                      disabled={!canSave || saving}
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("shopPurchase")}
                    </Button>
                  </>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        <Card className="min-w-0 lg:sticky lg:top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("shopMonthPurchasesTitle")}</CardTitle>
            <CardDescription className="text-xs">
              {formatBillingPeriodLabel(currentMonthPeriod)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("shopMonthPurchasesHint")}</p>
            {monthSummary.entries.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">{t("shopBillingNoPurchases")}</p>
            ) : (
              <div className="rounded-md border overflow-x-auto max-h-[min(70vh,32rem)] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("date")}</TableHead>
                      <TableHead>{t("shopTableItems")}</TableHead>
                      <TableHead className="text-right">{t("shopDayTotal")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthSummary.entries.map((entry) => {
                      const isSelected = entry.date === dateStr;
                      return (
                        <TableRow
                          key={entry.date}
                          className={cn(
                            "cursor-pointer",
                            isSelected && "bg-primary/5"
                          )}
                          onClick={() => selectDay(entry.date)}
                        >
                          <TableCell className="font-medium whitespace-nowrap">
                            {formatYmdForDisplay(entry.date)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                            <span className="line-clamp-2">{entry.summary}</span>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                            €{entry.dayTotal.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="border-t pt-3 flex justify-between text-sm font-semibold">
              <span>{t("shopMonthTotal")}</span>
              <span className="tabular-nums">€{monthSummary.monthShopTotal.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("shopConfirmSaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  {t("shopConfirmSaveDescription").replace(
                    "{date}",
                    formatYmdForDisplay(dateStr)
                  )}
                </p>
                <p className="text-foreground">{saveItemsSummary}</p>
                <p className="flex justify-between font-semibold text-foreground">
                  <span>{t("shopPurchaseTotal")}</span>
                  <span className="tabular-nums">€{dayTotal.toFixed(2)}</span>
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canConfirmSave || saving}
              onClick={(e) => {
                e.preventDefault();
                void handleSave();
              }}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
