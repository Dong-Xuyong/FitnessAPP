"use client";

import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { getPaymentReminderState, type PaymentReminderState } from "@/lib/student-payment-due";

export function useStudentPaymentReminder(
  db: Firestore | null | undefined,
  userUid: string | undefined
) {
  const [reminder, setReminder] = useState<PaymentReminderState>({ show: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (db == null || !userUid) {
      setReminder({ show: false });
      setLoading(false);
      return;
    }

    const fs = db;
    const uid = userUid;

    let cancelled = false;

    async function run() {
      setLoading(true);
      try {
        const globalSnap = await getDoc(doc(fs, "students", uid));
        if (!globalSnap.exists() || cancelled) {
          if (!cancelled) setReminder({ show: false });
          return;
        }

        const global = globalSnap.data() as Record<string, unknown>;
        const trainerId = global.trainerId as string | undefined;
        const rosterDocId = (global.rosterDocId as string | undefined) || uid;
        if (!trainerId || cancelled) {
          if (!cancelled) setReminder({ show: false });
          return;
        }

        const rosterSnap = await getDoc(doc(fs, "personalTrainers", trainerId, "students", rosterDocId));
        if (!rosterSnap.exists() || cancelled) {
          if (!cancelled) setReminder({ show: false });
          return;
        }

        const roster = rosterSnap.data() as Record<string, unknown>;
        const billingStatus = String(roster.billingStatus ?? "inactive");
        const monthlyRate = Number(roster.monthlyRate ?? 0);

        const paymentsSnap = await getDocs(
          collection(fs, "personalTrainers", trainerId, "students", rosterDocId, "payments")
        );
        const payments = paymentsSnap.docs.map((snap) => snap.data() as { period?: string; status?: string });

        if (cancelled) return;
        setReminder(
          getPaymentReminderState({
            now: new Date(),
            billingStatus,
            monthlyRate,
            payments,
          })
        );
      } catch {
        if (!cancelled) setReminder({ show: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    const intervalMs = 60 * 60 * 1000;
    const tick = setInterval(() => {
      if (!cancelled) void run();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && !cancelled) void run();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [db, userUid]);

  return { loading, reminder };
}
