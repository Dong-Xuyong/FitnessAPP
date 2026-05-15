"use client";

import { useEffect, useMemo, useState } from "react";
import { Navigation } from "@/components/Navigation";
import { collection, deleteDoc, doc, getDoc, limit, orderBy, query } from "firebase/firestore";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { getStudentDisplayName } from "@/lib/student-display";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Loader2, Store, Trash2 } from "lucide-react";

type ShopRegRow = {
  studentId?: string;
  trainerId?: string;
  date?: string;
  coffeeCount?: number;
  waterServings?: number;
  updatedAt?: string;
};

export default function CoachShopPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { user } = useUser();
  const db = useFirestore();

  const shopQuery = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return query(
      collection(db, "personalTrainers", user.uid, "shopRegistrations"),
      orderBy("date", "desc"),
      limit(100)
    );
  }, [db, user?.uid]);

  const { data: rows, isLoading } = useCollection<ShopRegRow>(shopQuery);
  const sortedRows = useMemo(() => {
    const list = rows || [];
    return [...list].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [rows]);

  const [nameByStudentId, setNameByStudentId] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
        ids.map(async (id) => {
          try {
            const snap = await getDoc(doc(db, "students", id));
            if (snap.exists()) {
              next[id] = getStudentDisplayName(snap.data() as Record<string, unknown>, id.slice(0, 8));
            } else {
              next[id] = id.slice(0, 8);
            }
          } catch {
            next[id] = id.slice(0, 8);
          }
        })
      );
      if (!cancelled) setNameByStudentId(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, sortedRows]);

  const handleDelete = async (regId: string) => {
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
          <CardHeader>
            <CardTitle>{t("shopCoachTableTitle")}</CardTitle>
            <CardDescription>{t("shopCoachTableHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
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
                      <TableHead className="text-right">{t("shopCoffeeLabel")}</TableHead>
                      <TableHead className="text-right">{t("shopWaterLabel")}</TableHead>
                      <TableHead className="w-[72px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRows.map((row) => {
                      const sid = row.studentId || "";
                      const isDeleting = deletingId === row.id;
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium whitespace-nowrap">{row.date || "—"}</TableCell>
                          <TableCell>{nameByStudentId[sid] || sid.slice(0, 8) || "—"}</TableCell>
                          <TableCell className="text-right">{row.coffeeCount ?? 0}</TableCell>
                          <TableCell className="text-right">{row.waterServings ?? 0}</TableCell>
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

        <AlertDialog
          open={!!confirmDeleteId}
          onOpenChange={(open) => {
            if (!open) setConfirmDeleteId(null);
          }}
        >
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
                  if (confirmDeleteId) void handleDelete(confirmDeleteId);
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Navigation>
  );
}
