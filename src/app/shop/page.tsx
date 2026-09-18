"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  buildShopPurchaseWritePayload,
  catalogMapFromItems,
  computePurchaseTotal,
  computeRegistrationDayTotal,
  formatPurchaseSummary,
  formatShopLinesSummary,
  isShopPurchasePaid,
  isShopPurchaseUnpaid,
  normalizeShopPurchasesFromDoc,
  type ShopLine,
  type ShopPurchaseLike,
} from "@/lib/shop-billing";
import { slotStudentPlaceholderPhotoUrl } from "@/lib/slot-student-photo";
import { repairShopLinesForPaidPayments, resolveRosterStudentIdClient } from "@/lib/shop-billing-payments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ChevronDown, ChevronUp, Loader2, Minus, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

function localDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rosterStudentPhotoUrl(
  roster: Array<{ id: string } & Record<string, unknown>>,
  rosterId: string
): string {
  const match = roster.find((s) => s.id === rosterId) as Record<string, unknown> | undefined;
  const fromRoster = String(match?.photoUrl ?? "").trim();
  if (fromRoster) return fromRoster;
  return slotStudentPlaceholderPhotoUrl(rosterId);
}

function shopRegistrationStudentId(rosterRow: { id: string; userId?: string }): string {
  const uid = String(rosterRow.userId ?? "").trim();
  return uid || rosterRow.id;
}

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

  const rosterQuery = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return collection(db, "personalTrainers", user.uid, "students");
  }, [db, user?.uid]);
  const { data: rosterStudents, isLoading: rosterLoading } = useCollection<{
    id: string;
    firstName?: string;
    lastName?: string;
    userId?: string;
    photoUrl?: string;
  }>(rosterQuery);

  const rosterStudentsSorted = useMemo(() => {
    const list = [...(rosterStudents || [])] as Array<{ id: string } & Record<string, unknown>>;
    list.sort((a, b) =>
      getStudentDisplayName(a, a.id).localeCompare(getStudentDisplayName(b, b.id), undefined, {
        sensitivity: "base",
      })
    );
    return list;
  }, [rosterStudents]);

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
  const [coachRegisterOpen, setCoachRegisterOpen] = useState(false);
  const [regRosterStudentId, setRegRosterStudentId] = useState("");
  const [regQuantities, setRegQuantities] = useState<Record<string, number>>({});
  const [savingReg, setSavingReg] = useState(false);
  const [confirmRegOpen, setConfirmRegOpen] = useState(false);
  const shopRepairTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeShopItems = useMemo(
    () => (shopItems || []).filter((item) => item.active !== false),
    [shopItems]
  );

  const emptyRegQuantities = useCallback((): Record<string, number> => {
    const next: Record<string, number> = {};
    for (const item of activeShopItems) next[item.id] = 0;
    return next;
  }, [activeShopItems]);

  useEffect(() => {
    setRegQuantities(emptyRegQuantities());
  }, [emptyRegQuantities]);

  const regLinesForSave = useMemo((): ShopLine[] => {
    return Object.entries(regQuantities)
      .filter(([, qty]) => Math.floor(qty) > 0)
      .map(([itemId, qty]) => ({ itemId, quantity: Math.floor(qty) }));
  }, [regQuantities]);

  const regDayTotal = useMemo(
    () => computeRegistrationDayTotal(regLinesForSave, catalogMap),
    [regLinesForSave, catalogMap]
  );

  const regItemsSummary = useMemo(
    () => formatShopLinesSummary(regLinesForSave, catalogMap),
    [regLinesForSave, catalogMap]
  );

  const regStudentDisplayName = useMemo(() => {
    if (!regRosterStudentId) return "";
    const row = rosterStudentsSorted.find((s) => s.id === regRosterStudentId);
    return row ? getStudentDisplayName(row, "—") : "";
  }, [regRosterStudentId, rosterStudentsSorted]);

  const clampRegQty = (n: number) => Math.max(0, Math.min(999, Math.floor(n)));

  const bumpRegQty = (itemId: string, delta: number) => {
    setRegQuantities((prev) => ({
      ...prev,
      [itemId]: clampRegQty((prev[itemId] ?? 0) + delta),
    }));
  };

  const canRegisterPurchase =
    authReady &&
    Boolean(user?.uid) &&
    Boolean(regRosterStudentId) &&
    activeShopItems.length > 0 &&
    regLinesForSave.length > 0 &&
    regDayTotal > 0;

  const handleRegisterPurchase = async () => {
    if (!db || !user?.uid || !regRosterStudentId || !canRegisterPurchase) return;
    const rosterRow = rosterStudentsSorted.find((s) => s.id === regRosterStudentId);
    if (!rosterRow) {
      toast({ variant: "destructive", title: t("shopCoachSelectStudentRequired") });
      return;
    }
    const studentId = shopRegistrationStudentId(
      rosterRow as { id: string; userId?: string }
    );
    const dateStr = localDateYmd(new Date());
    setSavingReg(true);
    try {
      const now = new Date();
      const colRef = collection(db, "personalTrainers", user.uid, "shopRegistrations");
      const batch = writeBatch(db);
      for (const line of regLinesForSave) {
        const payload = buildShopPurchaseWritePayload({
          studentId,
          trainerId: user.uid,
          date: dateStr,
          itemId: line.itemId,
          quantity: line.quantity,
          now,
        });
        batch.set(doc(colRef), payload);
      }
      await batch.commit();
      setNameByStudentId((prev) => ({
        ...prev,
        [studentId]: regStudentDisplayName || prev[studentId] || studentId.slice(0, 8),
      }));
      setRegQuantities(emptyRegQuantities());
      setConfirmRegOpen(false);
      setCoachRegsUnpaidOpen(true);
      toast({ title: t("shopCoachRegisterSuccess"), description: t("shopSaveBillingHint") });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ variant: "destructive", title: t("shopSaveFailed"), description: msg });
    } finally {
      setSavingReg(false);
    }
  };

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

  useEffect(() => {
    if (!rosterStudentsSorted.length) return;
    setNameByStudentId((prev) => {
      const next = { ...prev };
      for (const s of rosterStudentsSorted) {
        const display = getStudentDisplayName(s, s.id.slice(0, 8));
        const authOrRosterId = shopRegistrationStudentId(
          s as { id: string; userId?: string }
        );
        next[authOrRosterId] = display;
        next[s.id] = display;
      }
      return next;
    });
  }, [rosterStudentsSorted]);

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
            <Store className="h-8 w-8 text-primary shrink-0" aria-hidden />
            {t("shop")}
          </h1>
        </header>

        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>{t("shopCatalogTitle")}</CardTitle>
            </div>
            <Button
              type="button"
              size="icon"
              className="shrink-0"
              onClick={openNewItem}
              aria-label={t("shopAddItem")}
              title={t("shopAddItem")}
            >
              <Plus className="h-4 w-4" aria-hidden />
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
          <CardHeader className="pb-3">
            <CardTitle>{t("shopCoachRegisterTitle")}</CardTitle>
          </CardHeader>

          <Collapsible open={coachRegisterOpen} onOpenChange={setCoachRegisterOpen}>
            <div className="px-6">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-xl border bg-muted/30 px-4 py-3 text-sm hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-medium truncate">
                    {regRosterStudentId ? regStudentDisplayName : t("shopCoachSelectStudentsPlaceholder")}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-bold tabular-nums text-base">
                      {`${t("shopPurchase")} · €${regDayTotal.toFixed(2)}`}
                    </span>
                    {coachRegisterOpen ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                </button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent>
          <CardContent className="space-y-5 pt-4">
            <div className="space-y-1.5">
              <Label>{t("shopCoachSelectStudents")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full justify-between font-normal px-3"
                    disabled={!authReady || rosterLoading}
                  >
                    <span
                      className={cn(
                        "truncate text-left",
                        !regRosterStudentId && "text-muted-foreground"
                      )}
                    >
                      {rosterLoading ? (
                        t("shopLoadingDay")
                      ) : !regRosterStudentId ? (
                        t("shopCoachSelectStudentsPlaceholder")
                      ) : (
                        regStudentDisplayName
                      )}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
                  <div className="max-h-60 overflow-y-auto space-y-0.5">
                    {rosterStudentsSorted.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-2 py-1.5">
                        {t("shopCoachNoRosterStudents")}
                      </p>
                    ) : (
                      rosterStudentsSorted.map((s) => {
                        const checked = regRosterStudentId === s.id;
                        const name = getStudentDisplayName(s, "—");
                        const initial =
                          name !== "—" ? name.trim().charAt(0).toUpperCase() || "?" : "?";
                        const photoSrc = rosterStudentPhotoUrl(rosterStudentsSorted, s.id);
                        return (
                          <div
                            key={s.id}
                            role="button"
                            tabIndex={0}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
                            onClick={() => setRegRosterStudentId(checked ? "" : s.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setRegRosterStudentId(checked ? "" : s.id);
                              }
                            }}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => {
                                setRegRosterStudentId(value ? s.id : "");
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <Avatar className="h-7 w-7 shrink-0 border border-border/50">
                              <AvatarImage src={photoSrc} alt="" />
                              <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
                            </Avatar>
                            <span className="truncate">{name}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {catalogLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("shopLoadingDay")}
              </div>
            ) : activeShopItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">{t("shopCatalogEmpty")}</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {activeShopItems.map((item) => {
                    const qty = regQuantities[item.id] ?? 0;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-xl border p-4 transition-colors",
                          qty > 0 ? "border-primary/40 bg-primary/5" : "bg-muted/20"
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
                            onClick={() => bumpRegQty(item.id, -1)}
                            disabled={!regRosterStudentId || qty === 0}
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
                            onClick={() => bumpRegQty(item.id, 1)}
                            disabled={!regRosterStudentId}
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
                  disabled={!canRegisterPurchase || savingReg}
                  onClick={() => {
                    if (!regRosterStudentId) {
                      toast({ variant: "destructive", title: t("shopCoachSelectStudentRequired") });
                      return;
                    }
                    setConfirmRegOpen(true);
                  }}
                >
                  {savingReg ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {`${t("shopPurchase")} · €${regDayTotal.toFixed(2)}`}
                </Button>
              </>
            )}
          </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("shopCoachTableTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {registrationsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("shopLoadingDay")}
              </div>
            ) : (
              <div className="space-y-3">
                {sortedRows.length === 0 && unpaidRegRows.length === 0 && paidRegRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2 text-center mb-2">{t("shopCoachEmpty")}</p>
                ) : null}
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

        <AlertDialog open={confirmRegOpen} onOpenChange={setConfirmRegOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("shopCoachConfirmRegisterTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("shopCoachConfirmRegisterDescription")
                  .replace("{items}", regItemsSummary)
                  .replace("{student}", regStudentDisplayName)
                  .replace("{date}", localDateYmd(new Date()))}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={savingReg}>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                disabled={savingReg || !canRegisterPurchase}
                onClick={() => void handleRegisterPurchase()}
              >
                {savingReg ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t("shopPurchase")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

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
