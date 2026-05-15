"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useUser, useFirestore, useDoc, useMemoFirebase } from "@/firebase";
import { isOpenTrainingAccess, normalizeTrainingAccessMode } from "@/lib/student-training-access";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, Minus, Plus, Store } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

function localDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function StudentShopPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { user } = useUser();
  const db = useFirestore();
  const router = useRouter();

  const studentRef = useMemoFirebase(() => {
    if (!db || !user?.uid) return null;
    return doc(db, "students", user.uid);
  }, [db, user?.uid]);

  const { data: studentData, isLoading: isStudentLoading } = useDoc(studentRef);
  const trainerId = typeof studentData?.trainerId === "string" ? studentData.trainerId : undefined;

  useEffect(() => {
    if (!db || !user?.uid || isStudentLoading) return;
    let cancelled = false;
    (async () => {
      let mode = normalizeTrainingAccessMode(studentData?.trainingAccessMode);
      const tid = typeof studentData?.trainerId === "string" ? studentData.trainerId : undefined;
      const rosterId =
        (typeof studentData?.rosterDocId === "string" && studentData.rosterDocId.trim()) ||
        user.uid;
      if (tid) {
        try {
          const rosterSnap = await getDoc(
            doc(db, "personalTrainers", tid, "students", rosterId)
          );
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

  const [dateStr, setDateStr] = useState(() => localDateYmd(new Date()));
  const [coffeeCount, setCoffeeCount] = useState(0);
  const [waterServings, setWaterServings] = useState(0);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);

  const regDocRef = useMemoFirebase(() => {
    if (!db || !user?.uid || !dateStr || !trainerId) return null;
    return doc(db, "personalTrainers", trainerId, "shopRegistrations", `${user.uid}_${dateStr}`);
  }, [db, user?.uid, dateStr, trainerId]);

  const loadDay = useCallback(async () => {
    if (!regDocRef || !user?.uid) return;
    setLoadingDoc(true);
    try {
      const snap = await getDoc(regDocRef);
      if (snap.exists()) {
        const d = snap.data();
        setCoffeeCount(typeof d.coffeeCount === "number" && d.coffeeCount >= 0 ? d.coffeeCount : 0);
        setWaterServings(typeof d.waterServings === "number" && d.waterServings >= 0 ? d.waterServings : 0);
      } else {
        setCoffeeCount(0);
        setWaterServings(0);
      }
    } catch (e) {
      console.error(e);
      setCoffeeCount(0);
      setWaterServings(0);
    } finally {
      setLoadingDoc(false);
    }
  }, [regDocRef, user?.uid]);

  useEffect(() => {
    void loadDay();
  }, [loadDay]);

  const clamp = (n: number) => Math.max(0, Math.min(999, Math.floor(n)));

  const handleSave = async () => {
    if (!db || !user?.uid || !trainerId || !dateStr) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, "personalTrainers", trainerId, "shopRegistrations", `${user.uid}_${dateStr}`),
        {
          studentId: user.uid,
          trainerId,
          date: dateStr,
          coffeeCount: clamp(coffeeCount),
          waterServings: clamp(waterServings),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      toast({ title: t("shopSaveSuccess") });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ variant: "destructive", title: t("shopSaveFailed"), description: msg });
    } finally {
      setSaving(false);
    }
  };

  const canSave = Boolean(trainerId && user?.uid && dateStr);

  const bumpCoffee = (delta: number) => setCoffeeCount((c) => clamp(c + delta));
  const bumpWater = (delta: number) => setWaterServings((w) => clamp(w + delta));

  return (
    <div className="space-y-6 w-full min-w-0 max-w-lg">
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

      <Card>
        <CardHeader>
          <CardTitle>{t("shopLogTitle")}</CardTitle>
          <CardDescription>{t("shopLogDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="shop-date">{t("date")}</Label>
            <Input
              id="shop-date"
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              disabled={!trainerId}
            />
          </div>

          {loadingDoc ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("shopLoadingDay")}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <Label>{t("shopCoffeeLabel")}</Label>
                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" size="icon" onClick={() => bumpCoffee(-1)} disabled={!trainerId}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    min={0}
                    max={999}
                    className="w-24 text-center"
                    value={coffeeCount}
                    onChange={(e) => setCoffeeCount(clamp(Number(e.target.value) || 0))}
                    disabled={!trainerId}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={() => bumpCoffee(1)} disabled={!trainerId}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <Label>{t("shopWaterLabel")}</Label>
                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" size="icon" onClick={() => bumpWater(-1)} disabled={!trainerId}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    type="number"
                    min={0}
                    max={999}
                    className="w-24 text-center"
                    value={waterServings}
                    onChange={(e) => setWaterServings(clamp(Number(e.target.value) || 0))}
                    disabled={!trainerId}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={() => bumpWater(1)} disabled={!trainerId}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Button className="w-full sm:w-auto" onClick={() => void handleSave()} disabled={!canSave || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("shopSave")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
