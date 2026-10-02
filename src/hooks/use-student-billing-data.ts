"use client";

import { useEffect, useMemo, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import {
  canonicalBillingPeriodYm,
  normalizedPaymentPaid,
  selectDashboardPendingPayment,
} from "@/lib/student-payment-due";
import { resolveMonthlyRate } from "@/lib/shop-billing";

export type StudentBillingPlan = {
  billingStatus: string;
  sessionsPerWeek: number;
  sessionDurationMin: number;
  monthlyRate: number;
  paymentMethod: string;
};

export type StudentPaymentRecord = {
  id: string;
  period?: string;
  amount?: number;
  status?: string;
  method?: string;
  paidAt?: string | null;
  baseAmount?: number;
  shopAmount?: number;
};

export type StudentBillingData = {
  loading: boolean;
  paymentInstructions: string;
  paymentMethod: string;
  plan: StudentBillingPlan | null;
  payments: StudentPaymentRecord[];
  currentPeriodPending: StudentPaymentRecord | null;
  paidPayments: StudentPaymentRecord[];
};

function planFromRoster(roster: Record<string, unknown>): StudentBillingPlan {
  const sessionDurationMin = Number(roster.sessionDurationMin ?? 60);
  return {
    billingStatus: String(roster.billingStatus ?? "inactive").trim() || "inactive",
    sessionsPerWeek: Number(roster.sessionsPerWeek ?? 0),
    sessionDurationMin:
      Number.isFinite(sessionDurationMin) && sessionDurationMin > 0 ? sessionDurationMin : 60,
    monthlyRate: resolveMonthlyRate({
      monthlyRate: roster.monthlyRate,
      rate30Min: roster.rate30Min,
      rate60Min: roster.rate60Min,
      sessionDurationMin: roster.sessionDurationMin,
      sessionsPerWeek: roster.sessionsPerWeek,
    }),
    paymentMethod: String(roster.paymentMethod ?? "mbway").trim() || "mbway",
  };
}

function comparePeriodsDesc(a: StudentPaymentRecord, b: StudentPaymentRecord): number {
  const ay = canonicalBillingPeriodYm(a.period) ?? "";
  const by = canonicalBillingPeriodYm(b.period) ?? "";
  return by.localeCompare(ay);
}

export function useStudentBillingData(
  db: Firestore | null | undefined,
  userUid: string | undefined
): StudentBillingData {
  const [loading, setLoading] = useState(true);
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("mbway");
  const [plan, setPlan] = useState<StudentBillingPlan | null>(null);
  const [payments, setPayments] = useState<StudentPaymentRecord[]>([]);

  useEffect(() => {
    if (db == null || !userUid) {
      setPaymentInstructions("");
      setPaymentMethod("mbway");
      setPlan(null);
      setPayments([]);
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
          if (!cancelled) {
            setPayments([]);
            setPaymentInstructions("");
          }
          return;
        }

        const global = globalSnap.data() as Record<string, unknown>;
        const trainerId = global.trainerId as string | undefined;
        const rosterDocId = (global.rosterDocId as string | undefined) || uid;
        if (!trainerId || cancelled) {
          if (!cancelled) setPayments([]);
          return;
        }

        const rosterSnap = await getDoc(
          doc(fs, "personalTrainers", trainerId, "students", rosterDocId)
        );
        if (!rosterSnap.exists() || cancelled) {
          if (!cancelled) {
            setPayments([]);
            setPlan(null);
          }
          return;
        }

        const roster = rosterSnap.data() as Record<string, unknown>;
        const rosterPlan = planFromRoster(roster);
        const instructions = String(roster.paymentDetails ?? "").trim();
        const method = rosterPlan.paymentMethod;

        const paymentsSnap = await getDocs(
          collection(fs, "personalTrainers", trainerId, "students", rosterDocId, "payments")
        );
        const rows: StudentPaymentRecord[] = paymentsSnap.docs.map((snap) => {
          const data = snap.data() as Record<string, unknown>;
          return {
            id: snap.id,
            period: data.period != null ? String(data.period) : undefined,
            amount: Number(data.amount),
            status: data.status != null ? String(data.status) : undefined,
            method: data.method != null ? String(data.method) : undefined,
            paidAt: data.paidAt != null ? String(data.paidAt) : null,
            baseAmount: Number(data.baseAmount),
            shopAmount: Number(data.shopAmount),
          };
        });

        if (cancelled) return;
        setPaymentInstructions(instructions);
        setPaymentMethod(method);
        setPlan(rosterPlan);
        setPayments(rows);
      } catch {
        if (!cancelled) {
          setPayments([]);
          setPaymentInstructions("");
          setPlan(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [db, userUid]);

  const currentPeriodPending = useMemo(
    () => selectDashboardPendingPayment(payments),
    [payments]
  );

  const paidPayments = useMemo(
    () => payments.filter((p) => normalizedPaymentPaid(p.status)).sort(comparePeriodsDesc),
    [payments]
  );

  return {
    loading,
    paymentInstructions,
    paymentMethod,
    plan,
    payments,
    currentPeriodPending,
    paidPayments,
  };
}
