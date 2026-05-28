"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Navigation } from "@/components/Navigation";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  writeBatch,
  getDoc,
  limit,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { getStudentDisplayName } from "@/lib/student-display";
import { seedDefaultShopItemsIfEmpty } from "@/lib/shop-catalog";
import {
  catalogMapFromItems,
  computePurchaseTotal,
  formatPurchaseSummary,
  isShopPurchasePaid,
  isShopPurchaseUnpaid,
  normalizeShopPurchasesFromDoc,
  type ShopPurchaseLike,
} from "@/lib/shop-billing";
import { repairShopLinesForPaidPayments, resolveRosterStudentIdClient } from "@/lib/shop-billing-payments";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type ShopItemRow = {
  id: string;
  name?: string;
  price?: number;
  active?: boolean;
};

type ShopRegRow = {
  id: string;
  studentId?: string;
  trainerId?: string;
  date?: string;
  time?: string;
  itemId?: string;
  quantity?: number;
  billingStatus?: "unpaid" | "paid";
  paidInPaymentId?: string;
  lines?: unknown[];
  updatedAt?: string;
};

type EnrichedPurchaseRow = ShopPurchaseLike & {
  id: string;
  studentId?: string;
  lineTotal: number;
  summary: string;
};

function flattenPurchaseRows(
  rows: ShopRegRow[],
  catalogMap: ReturnType<typeof catalogMapFromItems>
): EnrichedPurchaseRow[] {
  const out: EnrichedPurchaseRow[] = [];
  for (const row of rows) {
    const purchases = normalizeShopPurchasesFromDoc(row as Record<string, unknown>, row.id);
    for (const purchase of purchases) {
      const lineTotal = computePurchaseTotal(purchase, catalogMap);
      if (lineTotal <= 0) continue;
      out.push({
        ...purchase,
        id: purchase.id ?? row.id,
        studentId: row.studentId,
        lineTotal,
        summary: formatPurchaseSummary(purchase, catalogMap),
      });
    }
  }
  return out;
}

export default function CoachShopPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const itemsQuery = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return query(collection(db, "personalTrainers", user.uid, "shopItems"), orderBy("name", "asc"));
  }, [db, user?.uid]);
  const { data: shopItems, isLoading: itemsLoading } = useCollection<ShopItemRow>(itemsQuery);

  const shopQuery = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return query(
      collection(db, "personalTrainers", user.uid, "shopRegistrations"),
      orderBy("date", "desc"),
      limit(100)
    );
  }, [db, user?.uid]);
  const { data: rows, isLoading: regsLoading } = useCollection<ShopRegRow>(shopQuery);

  const authReady = mounted && !isUserLoading;
  const catalogLoading = !authReady || itemsLoading;
  const registrationsLoading = !authReady || regsLoading;

  const catalogMap = useMemo(
    () =>
      catalogMapFromItems(
        (shopItems || []).map((item) => ({
          id: item.id,
          name: String(item.name ?? ""),
          price: Number(item.price ?? 0),
          active: item.active !== false,
        }))
      ),
    [shopItems]
  );

  const sortedRows = useMemo(() => {
    const list = rows || [];
    return [...list].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [rows]);

  const enrichedRows = useMemo(
    () => flattenPurchaseRows(sortedRows as ShopRegRow[], catalogMap),
    [sortedRows, catalogMap]
  );

  const unpaidRegRows = useMemo(
    () => enrichedRows.filter((r) => isShopPurchaseUnpaid(r)),
    [enrichedRows]
  );
  const paidRegRows = useMemo(
    () => enrichedRows.filter((r) => isShopPurchasePaid(r)),
    [enrichedRows]
  );

  useEffect(() => {
    if (unpaidRegRows.length === 0 && paidRegRows.length > 0) {
      setCoachRegsPaidOpen(true);
    }
  }, [unpaidRegRows.length, paidRegRows.length]);

  const [nameByStudentId, setNameByStudentId] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteAllPaidStep, setDeleteAllPaidStep] = useState<0 | 1 | 2>(0);
  const [deletingAllPaid, setDeletingAllPaid] = useState(false);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ShopItemRow | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemActive, setItemActive] = useState(true);
  const [savingItem, setSavingItem] = useState(false);
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);
  const [coachRegsUnpaidOpen, setCoachRegsUnpaidOpen] = useState(true);
  const [coachRegsPaidOpen, setCoachRegsPaidOpen] = useState(false);
  const shopRepairTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!db || !user?.uid) return;
    const studentIds = [
      ...new Set(sortedRows.map((r) => r.studentId).filter(Boolean)),
    ] as string[];
    if (!studentIds.length) return;
    if (shopRepairTimerRef.current) clearTimeout(shopRepairTimerRef.current);
    shopRepairTimerRef.current = setTimeout(() => {
      void (async () => {
        for (const sid of studentIds) {
          try {
            const rosterId = await resolveRosterStudentIdClient(db, user.uid, sid);
            await repairShopLinesForPaidPayments(db, user.uid, rosterId, sid);
          } catch (e) {
            console.error(e);
          }
        }
      })();
    }, 400);
    return () => {
      if (shopRepairTimerRef.current) clearTimeout(shopRepairTimerRef.current);
    };
  }, [db, user?.uid, sortedRows]);

  useEffect(() => {
    if (!db || !user?.uid) return;
    void seedDefaultShopItemsIfEmpty(db, user.uid).catch(() => {});
  }, [db, user?.uid]);

  useEffect(() => {
    if (!db || !sortedRows.length) {
      setNameByStudentId({});
      return;
    }
    const ids = [...new Set(sortedRows.map((r) => r.studentId).filter(Boolean))] as string[];
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      await Promise.all(
        ids.map(async (sid) => {
          try {
            const snap = await getDoc(doc(db, "students", sid));
            if (snap.exists()) {
              next[sid] = getStudentDisplayName(snap.data() as Record<string, unknown>, sid.slice(0, 8));
            } else {
              next[sid] = sid.slice(0, 8);
            }
          } catch {
            next[sid] = sid.slice(0, 8);
          }
        })
      );
      if (!cancelled) setNameByStudentId(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, sortedRows]);

  const openNewItem = () => {
    setEditingItem(null);
    setItemName("");
    setItemPrice("");
    setItemActive(true);
    setItemDialogOpen(true);
  };

  const openEditItem = (item: ShopItemRow) => {
    setEditingItem(item);
    setItemName(String(item.name ?? ""));
    setItemPrice(String(item.price ?? ""));
    setItemActive(item.active !== false);
    setItemDialogOpen(true);
  };

  const handleSaveItem = async () => {
    if (!db || !user?.uid) return;
    const name = itemName.trim();
    const price = Number(itemPrice);
    if (!name) {
      toast({ variant: "destructive", title: t("shopItemNameRequired") });
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast({ variant: "destructive", title: t("shopItemPriceInvalid") });
      return;
    }
    setSavingItem(true);
    const now = new Date().toISOString();
    try {
      if (editingItem?.id) {
        await updateDoc(doc(db, "personalTrainers", user.uid, "shopItems", editingItem.id), {
          name,
          price: Number(price.toFixed(2)),
          active: itemActive,
          updatedAt: now,
        });
      } else {
        await addDoc(collection(db, "personalTrainers", user.uid, "shopItems"), {
          name,
          price: Number(price.toFixed(2)),
          active: itemActive,
          createdAt: now,
          updatedAt: now,
        });
      }
      toast({ title: t("shopItemSaved") });
      setItemDialogOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ variant: "destructive", title: t("shopSaveFailed"), description: msg });
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!db || !user?.uid) return;
    try {
      await updateDoc(doc(db, "personalTrainers", user.uid, "shopItems", itemId), {
        active: false,
        updatedAt: new Date().toISOString(),
      });
      toast({ title: t("shopItemDeactivated") });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ variant: "destructive", title: t("shopSaveFailed"), description: msg });
    } finally {
      setConfirmDeleteItemId(null);
    }
  };

  const handleDeleteReg = async (regId: string) => {
    if (!db || !user?.uid) return;
    setDeletingId(regId);
    try {
      await deleteDoc(doc(db, "personalTrainers", user.uid, "shopRegistrations", regId));
      toast({ title: t("delete") });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ variant: "destructive", title: t("shopSaveFailed"), description: msg });
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const paidRegDocIds = useMemo(
    () => [...new Set(paidRegRows.map((r) => r.id).filter(Boolean))] as string[],
    [paidRegRows]
  );

  const handleDeleteAllPaid = async () => {
    if (!db || !user?.uid || !paidRegDocIds.length) return;
    setDeletingAllPaid(true);
    try {
      const BATCH_SIZE = 400;
      for (let i = 0; i < paidRegDocIds.length; i += BATCH_SIZE) {
        const chunk = paidRegDocIds.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);
        for (const regId of chunk) {
          batch.delete(doc(db, "personalTrainers", user.uid, "shopRegistrations", regId));
        }
        await batch.commit();
      }
      toast({
        title: t("shopDeleteAllPaidSuccess"),
        description: String(paidRegDocIds.length),
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ variant: "destructive", title: t("shopSaveFailed"), description: msg });
    } finally {
      setDeletingAllPaid(false);
      setDeleteAllPaidStep(0);
    }
  };

  const formatDeleteAllPaidMessage = (key: "shopDeleteAllPaidStep1Desc" | "shopDeleteAllPaidStep2Desc") =>
    t(key).replace("{count}", String(paidRegDocIds.length));

  const sortedItems = [...(shopItems || [])].sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? ""))
  );

  return (
    <Navigation>
      <div className="space-y-6 w-full min-w-0 max-w-5xl mx-auto">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold font-headline flex items-center gap-2">
            <Store className="h-8 w-8 text-primary shrink-0" />
            {t("shop")}
          </h1>
          <p className="text-muted-foreground">{t("shopCoachDescription")}</p>
        </header>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{t("shopCatalogTitle")}</CardTitle>
              <CardDescription>{t("shopCatalogHint")}</CardDescription>
            </div>
            <Button type="button" size="sm" className="gap-1 shrink-0" onClick={openNewItem}>
              <Plus className="h-4 w-4" />
              {t("shopAddItem")}
            </Button>
          </CardHeader>
          <CardContent>
            {catalogLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-6 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("shopLoadingDay")}
              </div>
            ) : sortedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">{t("shopCatalogEmpty")}</p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("shopItemName")}</TableHead>
                      <TableHead className="text-right">{t("shopItemPrice")}</TableHead>
                      <TableHead>{t("status")}</TableHead>
                      <TableHead className="w-[88px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedItems.map((item) => (
                      <TableRow key={item.id} className={item.active === false ? "opacity-60" : undefined}>
                        <TableCell className="font-medium">{item.name || "—"}</TableCell>
                        <TableCell className="text-right">€{Number(item.price ?? 0).toFixed(2)}</TableCell>
                        <TableCell>
                          {item.active === false ? t("shopItemInactive") : t("shopItemActive")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t("edit")}
                            onClick={() => openEditItem(item)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {item.active !== false && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              aria-label={t("shopDeactivateItem")}
                              onClick={() => setConfirmDeleteItemId(item.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("shopCoachTableTitle")}</CardTitle>
            <CardDescription>{t("shopCoachTableHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {registrationsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("shopLoadingDay")}
              </div>
            ) : sortedRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">{t("shopCoachEmpty")}</p>
            ) : (
              <div className="space-y-3">
                <Collapsible open={coachRegsUnpaidOpen} onOpenChange={setCoachRegsUnpaidOpen}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-lg border bg-amber-500/5 px-4 py-3 text-left hover:bg-amber-500/10 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {coachRegsUnpaidOpen ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                          {t("shopMonthUnpaidSection")}
                        </span>
                        <span className="text-xs text-muted-foreground">({unpaidRegRows.length})</span>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    {unpaidRegRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-1 py-2">{t("shopCoachNoUnpaidRegs")}</p>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("date")}</TableHead>
                              <TableHead>{t("shopTableStudent")}</TableHead>
                              <TableHead>{t("shopTableItems")}</TableHead>
                              <TableHead className="text-right">{t("shopDayTotal")}</TableHead>
                              <TableHead className="w-[72px]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {unpaidRegRows.map((row) => {
                              const sid = row.studentId || "";
                              const isDeleting = deletingId === row.id;
                              return (
                                <TableRow key={`${row.id}-unpaid`}>
                                  <TableCell className="font-medium whitespace-nowrap">
                                    {row.date || "—"}
                                    {row.time ? (
                                      <span className="block text-xs text-muted-foreground">{row.time}</span>
                                    ) : null}
                                  </TableCell>
                                  <TableCell>{nameByStudentId[sid] || sid.slice(0, 8) || "—"}</TableCell>
                                  <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                                    {row.summary}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    €{row.lineTotal.toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-right w-[72px]">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                      disabled={isDeleting}
                                      aria-label={t("shopDeleteRegistration")}
                                      onClick={() => setConfirmDeleteId(row.id)}
                                    >
                                      {isDeleting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible open={coachRegsPaidOpen} onOpenChange={setCoachRegsPaidOpen}>
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                        "bg-green-500/5 hover:bg-green-500/10"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {coachRegsPaidOpen ? (
                          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="text-sm font-semibold text-green-800 dark:text-green-300">
                          {t("shopMonthPaidSection")}
                        </span>
                        <span className="text-xs text-muted-foreground">({paidRegRows.length})</span>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    {paidRegRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-1 py-2">{t("shopCoachNoPaidRegs")}</p>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex justify-end px-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                            disabled={deletingAllPaid}
                            onClick={() => setDeleteAllPaidStep(1)}
                          >
                            {deletingAllPaid ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Trash2 className="h-4 w-4 mr-2" />
                            )}
                            {t("shopDeleteAllPaid")}
                          </Button>
                        </div>
                        <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t("date")}</TableHead>
                              <TableHead>{t("shopTableStudent")}</TableHead>
                              <TableHead>{t("shopTableItems")}</TableHead>
                              <TableHead className="text-right">{t("shopDayTotal")}</TableHead>
                              <TableHead className="w-[72px]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paidRegRows.map((row) => {
                              const sid = row.studentId || "";
                              const isDeleting = deletingId === row.id;
                              return (
                                <TableRow key={`${row.id}-paid`}>
                                  <TableCell className="font-medium whitespace-nowrap">
                                    {row.date || "—"}
                                    {row.time ? (
                                      <span className="block text-xs text-muted-foreground">{row.time}</span>
                                    ) : null}
                                  </TableCell>
                                  <TableCell>{nameByStudentId[sid] || sid.slice(0, 8) || "—"}</TableCell>
                                  <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                                    {row.summary}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    €{row.lineTotal.toFixed(2)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                      disabled={isDeleting}
                                      aria-label={t("shopDeleteRegistration")}
                                      onClick={() => setConfirmDeleteId(row.id)}
                                    >
                                      {isDeleting ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                        </div>
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingItem ? t("shopEditItem") : t("shopAddItem")}</DialogTitle>
              <DialogDescription>{t("shopCatalogHint")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="shop-item-name">{t("shopItemName")}</Label>
                <Input
                  id="shop-item-name"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="shop-item-price">{t("shopItemPrice")}</Label>
                <Input
                  id="shop-item-price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={itemPrice}
                  onChange={(e) => setItemPrice(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="shop-item-active">{t("shopItemActive")}</Label>
                <Switch id="shop-item-active" checked={itemActive} onCheckedChange={setItemActive} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setItemDialogOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="button" onClick={() => void handleSaveItem()} disabled={savingItem}>
                {savingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : t("shopSave")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive">{t("shopDeleteRegistration")}</AlertDialogTitle>
              <AlertDialogDescription>{t("shopDeleteRegistrationConfirm")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => {
                  if (confirmDeleteId) void handleDeleteReg(confirmDeleteId);
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={deleteAllPaidStep > 0}
          onOpenChange={(open) => {
            if (!open && !deletingAllPaid) setDeleteAllPaidStep(0);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive">
                {deleteAllPaidStep === 1
                  ? t("shopDeleteAllPaidStep1Title")
                  : t("shopDeleteAllPaidStep2Title")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleteAllPaidStep === 1
                  ? formatDeleteAllPaidMessage("shopDeleteAllPaidStep1Desc")
                  : formatDeleteAllPaidMessage("shopDeleteAllPaidStep2Desc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingAllPaid}>{t("cancel")}</AlertDialogCancel>
              {deleteAllPaidStep === 1 ? (
                <Button type="button" onClick={() => setDeleteAllPaidStep(2)}>
                  {t("shopDeleteAllPaidContinue")}
                </Button>
              ) : (
                <AlertDialogAction
                  className="bg-destructive hover:bg-destructive/90"
                  disabled={deletingAllPaid}
                  onClick={() => void handleDeleteAllPaid()}
                >
                  {deletingAllPaid ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  {t("shopDeleteAllPaidConfirm")}
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={!!confirmDeleteItemId}
          onOpenChange={(open) => !open && setConfirmDeleteItemId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("shopDeactivateItem")}</AlertDialogTitle>
              <AlertDialogDescription>{t("shopDeactivateItemConfirm")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => confirmDeleteItemId && void handleDeleteItem(confirmDeleteItemId)}>
                {t("shopDeactivateItem")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Navigation>
  );
}
