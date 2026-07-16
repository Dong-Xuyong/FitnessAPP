"use client";

import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { collection, getDocs, query, where } from "firebase/firestore";
import {
  getRosterBirthdaysToday,
  type BirthdayStudent,
} from "@/lib/coach-birthday-reminders";

export function useCoachBirthdayReminders(
  db: Firestore | null | undefined,
  trainerUid: string | undefined,
  unnamedFallback = "Student"
) {
  const [birthdays, setBirthdays] = useState<BirthdayStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (db == null || !trainerUid) {
      setBirthdays([]);
      setLoading(false);
      return;
    }

    const fs = db;
    const uid = trainerUid;
    let cancelled = false;

    async function run() {
      setLoading(true);
      try {
        const [rosterSnap, globalSnap] = await Promise.all([
          getDocs(collection(fs, "personalTrainers", uid, "students")),
          getDocs(query(collection(fs, "students"), where("trainerId", "==", uid))),
        ]);
        if (cancelled) return;

        const globalById = new Map<string, Record<string, unknown>>();
        for (const d of globalSnap.docs) {
          globalById.set(d.id, d.data() as Record<string, unknown>);
        }

        const rows = rosterSnap.docs.map((d) => {
          const roster = d.data() as Record<string, unknown>;
          const linkedUid = typeof roster.userId === "string" ? roster.userId : d.id;
          const global = globalById.get(d.id) ?? globalById.get(linkedUid);
          return {
            id: d.id,
            ...roster,
            birthDate: roster.birthDate ?? global?.birthDate ?? null,
          };
        });

        setBirthdays(getRosterBirthdaysToday(rows, new Date(), unnamedFallback));
      } catch {
        if (!cancelled) setBirthdays([]);
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
  }, [db, trainerUid, unnamedFallback]);

  return { loading, birthdays };
}
