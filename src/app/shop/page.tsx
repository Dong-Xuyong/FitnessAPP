"use client";

import { useEffect, useMemo, useState } from "react";
import { Navigation } from "@/components/Navigation";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
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
  computeRegistrationDayTotal,
  formatShopLinesSummary,
  type ShopLine,
} from "@/lib/shop-billing";
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
import { Loader2, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

type ShopItemRow = {
  id: string;
  name?: string;
  price?: number;
  active?: boolean;
};

type ShopRegRow = {
  studentId?: string;
  trainerId?: string;
  date?: string;
  lines?: ShopLine[];
  updatedAt?: string;
};

export default function CoachShopPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { user } = useUser();
  const db = useFirestore();

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

  const [nameByStudentId, setNameByStudentId] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ShopItemRow | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemActive, setItemActive] = useState(true);
  const [savingItem, setSavingItem] = useState(false);
  const [confirmDeleteItemId, setConfirmDeleteItemId] = useState<string | null>(null);

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
            {itemsLoading ? (
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
            {regsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("shopLoadingDay")}
              </div>
            ) : sortedRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">{t("shopCoachEmpty")}</p>
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
                    {sortedRows.map((row) => {
                      const sid = row.studentId || "";
                      const isDeleting = deletingId === row.id;
                      const dayTotal = computeRegistrationDayTotal(row.lines, catalogMap);
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium whitespace-nowrap">{row.date || "—"}</TableCell>
                          <TableCell>{nameByStudentId[sid] || sid.slice(0, 8) || "—"}</TableCell>
                          <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                            {formatShopLinesSummary(row.lines, catalogMap)}
                          </TableCell>
                          <TableCell className="text-right font-medium">€{dayTotal.toFixed(2)}</TableCell>
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
