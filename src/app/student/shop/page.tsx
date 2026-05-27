"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, getDocs, writeBatch } from "firebase/firestore";
import { useUser, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { isOpenTrainingAccess, normalizeTrainingAccessMode } from "@/lib/student-training-access";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import {
  catalogMapFromItems,
  computeRegistrationDayTotal,
  formatShopLinesSummary,
  buildShopPurchaseWritePayload,
  periodFromShopDate,
  isShopPurchasePaid,
  purchaseAsBillableLine,
  roundMoney,
  type ShopCatalogItem,
  type ShopPurchaseLike,
  type ShopLine,
} from "@/lib/shop-billing";
import {
  fetchShopPurchasesForStudentCandidates,
  resolveShopRegistrationStudentIds,
} from "@/lib/fetch-shop-registrations";
import { fetchMyShopPurchases } from "@/lib/list-my-shop-purchases-client";
import { callRepairMyShopBilling } from "@/lib/repair-my-shop-billing-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

type MonthDayGroup = {
  date: string;
  purchases: Array<{
    id?: string;
    time?: string;
    itemId: string;
    quantity: number;
    lineTotal: number;
  }>;
  dayTotal: number;
};

function computePurchaseDisplayTotal(
  purchase: ShopPurchaseLike,
  catalogMap: ReadonlyMap<string, ShopCatalogItem>
): number {
  const line = purchaseAsBillableLine(purchase);
  if (!line) return 0;
  const item = catalogMap.get(line.itemId);
  if (!item) return 0;
  const qty = Math.floor(Number(line.quantity) || 0);
  const price = Number(item.price);
  if (!Number.isFinite(price) || price < 0 || qty <= 0) return 0;
  return roundMoney(price * qty);
}

function shopRegistrationStudentIdsForClient(
  authUid: string,
  studentData?: Record<string, unknown> | null
): string[] {
  const rosterDocId = String(studentData?.rosterDocId ?? "").trim();
  return [...new Set([authUid, rosterDocId].filter(Boolean))];
}

function dedupePurchasesById(purchases: ShopPurchaseLike[]): ShopPurchaseLike[] {
  const seen = new Set<string>();
  const out: ShopPurchaseLike[] = [];
  for (const purchase of purchases) {
    const key = purchase.id
      ? purchase.id
      : `${purchase.date ?? ""}|${purchase.time ?? ""}|${purchase.itemId ?? ""}|${purchase.quantity ?? 0}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(purchase);
  }
  return out;
}

function buildPurchaseDayGroups(
  purchases: ShopPurchaseLike[],
  catalogMap: ReturnType<typeof catalogMapFromItems>,
  paid: boolean
): MonthDayGroup[] {
  const byDate = new Map<string, MonthDayGroup>();
  for (const purchase of purchases) {
    const date = String(purchase.date ?? "").trim();
    if (!date) continue;
    const isPaid = isShopPurchasePaid(purchase);
    if (paid !== isPaid) continue;
    const itemId = String(purchase.itemId ?? "").trim();
    const qty = Math.floor(Number(purchase.quantity) || 0);
    if (qty <= 0 || !itemId) continue;
    const lineTotal = computePurchaseDisplayTotal(purchase, catalogMap);
    let group = byDate.get(date);
    if (!group) {
      group = { date, purchases: [], dayTotal: 0 };
      byDate.set(date, group);
    }
    group.purchases.push({
      id: purchase.id,
      time: purchase.time ? String(purchase.time).trim() : undefined,
      itemId,
      quantity: qty,
      lineTotal,
    });
    group.dayTotal += lineTotal;
  }
  return [...byDate.values()]
    .map((g) => ({ ...g, dayTotal: Math.round(g.dayTotal * 100) / 100 }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function ShopMonthDayGroup({
  group,
  catalogMap,
}: {
  group: MonthDayGroup;
  catalogMap: ReturnType<typeof catalogMapFromItems>;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-muted/40 border-b">
        <p className="text-sm font-semibold">{formatYmdForDisplay(group.date)}</p>
        <span className="text-sm font-bold tabular-nums">€{group.dayTotal.toFixed(2)}</span>
      </div>
      <div className="divide-y">
        {group.purchases.map((purchase, idx) => {
          const item = catalogMap.get(purchase.itemId);
          return (
            <div
              key={`${purchase.id ?? purchase.itemId}-${idx}-${purchase.time ?? ""}`}
              className="flex items-center justify-between gap-3 px-4 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">
                  {purchase.quantity}
                </span>
                <span className="text-sm truncate">{item?.name ?? purchase.itemId}</span>
                {purchase.time ? (
                  <span className="text-xs text-muted-foreground shrink-0">{purchase.time}</span>
                ) : null}
              </div>
              <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground tabular-nums">
                <span>
                  €{Number(item?.price ?? 0).toFixed(2)} × {purchase.quantity}
                </span>
                <span className="font-semibold text-foreground">€{purchase.lineTotal.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ShopItemRow = { id: string; name?: string; price?: number; active?: boolean };

export default function StudentShopPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { user, isUserLoading: isAuthLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const todayYmd = useMemo(() => localDateYmd(new Date()), []);
  const authReady = mounted && !isAuthLoading;

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

  const [allShopItems, setAllShopItems] = useState<ShopItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [dateStr, setDateStr] = useState(() => localDateYmd(new Date()));
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [shopPurchases, setShopPurchases] = useState<ShopPurchaseLike[]>([]);
  const [shopLogOpen, setShopLogOpen] = useState(true);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [unpaidMonthOpen, setUnpaidMonthOpen] = useState(true);
  const [paidMonthOpen, setPaidMonthOpen] = useState(false);
  const shopBillingRepairRanRef = useRef(false);

  const shopItems = useMemo(
    () => allShopItems.filter((i) => i.active !== false),
    [allShopItems]
  );

  useEffect(() => {
    if (!db || !trainerId) {
      setAllShopItems([]);
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
          .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
        setAllShopItems(items);
      } catch {
        if (!cancelled) setAllShopItems([]);
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
        allShopItems.map((item) => ({
          id: item.id,
          name: String(item.name ?? ""),
          price: Number(item.price ?? 0),
          active: item.active !== false,
        }))
      ),
    [allShopItems]
  );


  useEffect(() => {
    if (!shopItems.length) return;
    // Always start the form at 0 — the form represents a NEW purchase to add on
    // top of the existing day total, not an edit of what's already saved.
    const next: Record<string, number> = {};
    for (const item of shopItems) next[item.id] = 0;
    setQuantities(next);
  }, [shopItems]);

  const loadShopPurchases = useCallback(async () => {
    if (!user?.uid) {
      setShopPurchases([]);
      return;
    }
    try {
      const purchases = await fetchMyShopPurchases();
      setShopPurchases(dedupePurchasesById(purchases));
      return;
    } catch {
      /* fall back to direct Firestore read */
    }
    if (!db || !trainerId) {
      setShopPurchases([]);
      return;
    }
    try {
      const studentIds = studentData
        ? await resolveShopRegistrationStudentIds(
            db,
            trainerId,
            user.uid,
            studentData as Record<string, unknown>
          )
        : shopRegistrationStudentIdsForClient(user.uid, studentData);
      const purchases = await fetchShopPurchasesForStudentCandidates(db, trainerId, studentIds);
      setShopPurchases(dedupePurchasesById(purchases));
    } catch {
      setShopPurchases([]);
    }
  }, [db, trainerId, user?.uid, studentData]);

  useEffect(() => {
    if (!user?.uid) return;
    void loadShopPurchases();
  }, [loadShopPurchases, saving, user?.uid]);

  useEffect(() => {
    if (!user?.uid || !trainerId || shopBillingRepairRanRef.current) return;
    shopBillingRepairRanRef.current = true;
    void (async () => {
      try {
        await callRepairMyShopBilling();
        await loadShopPurchases();
      } catch {
        /* repair is best-effort; shop still loads unpaid lines from Firestore */
      }
    })();
  }, [user?.uid, trainerId, loadShopPurchases]);

  const unpaidMonthGroups = useMemo(
    () => buildPurchaseDayGroups(shopPurchases, catalogMap, false),
    [shopPurchases, catalogMap]
  );

  const paidMonthGroups = useMemo(
    () => buildPurchaseDayGroups(shopPurchases, catalogMap, true),
    [shopPurchases, catalogMap]
  );

  const unpaidMonthTotal = useMemo(
    () => unpaidMonthGroups.reduce((sum, g) => sum + g.dayTotal, 0),
    [unpaidMonthGroups]
  );

  const paidMonthTotal = useMemo(
    () => paidMonthGroups.reduce((sum, g) => sum + g.dayTotal, 0),
    [paidMonthGroups]
  );

  useEffect(() => {
    if (unpaidMonthGroups.length === 0 && paidMonthGroups.length > 0) {
      setPaidMonthOpen(true);
    }
  }, [unpaidMonthGroups.length, paidMonthGroups.length]);

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
      if (!periodFromShopDate(dateStr)) throw new Error("Invalid date");

      const now = new Date();
      const colRef = collection(db, "personalTrainers", trainerId, "shopRegistrations");
      const batch = writeBatch(db);
      const newPurchases: ShopPurchaseLike[] = [];

      for (const line of linesForSave) {
        const payload = buildShopPurchaseWritePayload({
          studentId: user.uid,
          trainerId,
          date: dateStr,
          itemId: line.itemId,
          quantity: line.quantity,
          now,
        });
        const ref = doc(colRef);
        batch.set(ref, payload);
        newPurchases.push({
          id: ref.id,
          date: payload.date,
          time: payload.time,
          itemId: payload.itemId,
          quantity: payload.quantity,
          billingStatus: "unpaid",
        });
      }

      await batch.commit();
      setShopPurchases((prev) => [...prev, ...newPurchases]);
      setConfirmSaveOpen(false);
      setShopLogOpen(false);
      setQuantities(emptyQuantities());
      toast({ title: t("shopSaveSuccess"), description: t("shopSaveBillingHint") });
      void loadShopPurchases();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ variant: "destructive", title: t("shopSaveFailed"), description: msg });
    } finally {
      setSaving(false);
    }
  };

  const canSave = authReady && Boolean(trainerId && user?.uid && dateStr && shopItems.length > 0);
  const canConfirmSave = canSave && linesForSave.length > 0 && dayTotal > 0;
  const isToday = dateStr === todayYmd;
  const displayDate = authReady ? formatYmdForDisplay(dateStr) : dateStr;
  const bumpQty = (itemId: string, delta: number) => {
    setQuantities((prev) => ({
      ...prev,
      [itemId]: clamp((prev[itemId] ?? 0) + delta),
    }));
  };

  return (
    <div className="space-y-6 w-full min-w-0 max-w-2xl">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold font-headline flex items-center gap-2">
            <Store className="h-8 w-8 text-accent shrink-0" />
            {t("shop")}
          </h1>
          <p className="text-muted-foreground">{t("shopPageDescription")}</p>
        </div>
      </header>

      {!authReady ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          {t("shopLoadingDay")}
        </div>
      ) : (
      <>
      {!isStudentLoading && !trainerId && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("shopNoTrainerTitle")}</AlertTitle>
          <AlertDescription>{t("shopNoTrainerDescription")}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-6">
        {/* Daily purchase card */}
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle>{t("shopLogTitle")}</CardTitle>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                {t("shopLogActiveDay").replace("{date}", displayDate)}
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
                  className="flex w-full items-center justify-between gap-2 rounded-xl border bg-muted/30 px-4 py-3 text-sm hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={!trainerId}
                >
                  <span className="font-medium">{t("shopPurchaseTotal")}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-bold tabular-nums text-base">€{dayTotal.toFixed(2)}</span>
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
                {itemsLoading ? (
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
                    <div className="grid gap-3 sm:grid-cols-2">
                      {shopItems.map((item) => {
                        const qty = quantities[item.id] ?? 0;
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              "flex items-center justify-between gap-3 rounded-xl border p-4 transition-colors",
                              qty > 0 ? "border-accent/40 bg-accent/5" : "bg-muted/20"
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{item.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                €{Number(item.price ?? 0).toFixed(2)} / un.
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                onClick={() => bumpQty(item.id, -1)}
                                disabled={!trainerId || qty === 0}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <span className="w-8 text-center font-semibold tabular-nums text-sm">
                                {qty}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 rounded-lg"
                                onClick={() => bumpQty(item.id, 1)}
                                disabled={!trainerId}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => setConfirmSaveOpen(true)}
                      disabled={!canConfirmSave || saving}
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {saving ? t("shopPurchase") : `${t("shopPurchase")} · €${dayTotal.toFixed(2)}`}
                    </Button>
                  </>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* All purchases — paid vs unpaid */}
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("shopMonthPurchasesTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Collapsible open={unpaidMonthOpen} onOpenChange={setUnpaidMonthOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-lg border bg-amber-500/5 px-4 py-3 text-left hover:bg-amber-500/10 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {unpaidMonthOpen ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                      {t("shopMonthUnpaidSection")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({unpaidMonthGroups.reduce((n, g) => n + g.purchases.length, 0)})
                    </span>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-amber-800 dark:text-amber-300">
                    €{unpaidMonthTotal.toFixed(2)}
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 space-y-3">
                {unpaidMonthGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-1">{t("shopMonthUnpaidEmpty")}</p>
                ) : (
                  unpaidMonthGroups.map((group) => (
                    <ShopMonthDayGroup key={group.date} group={group} catalogMap={catalogMap} />
                  ))
                )}
              </CollapsibleContent>
            </Collapsible>

            <Collapsible open={paidMonthOpen} onOpenChange={setPaidMonthOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-lg border bg-green-500/5 px-4 py-3 text-left hover:bg-green-500/10 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {paidMonthOpen ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="text-sm font-semibold text-green-800 dark:text-green-300">
                      {t("shopMonthPaidSection")}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({paidMonthGroups.reduce((n, g) => n + g.purchases.length, 0)})
                    </span>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-green-800 dark:text-green-300">
                    €{paidMonthTotal.toFixed(2)}
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3 space-y-3">
                {paidMonthGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-1">{t("shopMonthPaidEmpty")}</p>
                ) : (
                  paidMonthGroups.map((group) => (
                    <ShopMonthDayGroup key={group.date} group={group} catalogMap={catalogMap} />
                  ))
                )}
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </div>
      </>
      )}

      <AlertDialog open={confirmSaveOpen} onOpenChange={setConfirmSaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("shopConfirmSaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p suppressHydrationWarning>
                  {t("shopConfirmSaveDescription").replace("{date}", displayDate)}
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
