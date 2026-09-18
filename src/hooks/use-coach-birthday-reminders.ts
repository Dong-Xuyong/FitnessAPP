"use client";

import { useEffect, useState } from "react";
import type { Firestore } from "firebase/firestore";
import { collection, getDocs, query, where } from "firebase/firestore";
import {
  getRosterBirthdaysToday,
  getRosterUpcomingBirthdays,
  type BirthdayStudent,
  type UpcomingBirthdayStudent,
} from "@/lib/coach-birthday-reminders";

async function loadCoachStudentRows(
  fs: Firestore,
  uid: string
): Promise<Array<Record<string, unknown> & { id: string }>> {
  const [rosterSnap, globalSnap] = await Promise.all([
    getDocs(collection(fs, "personalTrainers", uid, "students")),
    getDocs(query(collection(fs, "students"), where("trainerId", "==", uid))),
  ]);

  const globalById = new Map<string, Record<string, unknown>>();
  for (const d of globalSnap.docs) {
    globalById.set(d.id, d.data() as Record<string, unknown>);
  }

  return rosterSnap.docs.map((d) => {
    const roster = d.data() as Record<string, unknown>;
    const linkedUid = typeof roster.userId === "string" ? roster.userId : d.id;
    const global = globalById.get(d.id) ?? globalById.get(linkedUid);
    return {
      id: d.id,
      ...roster,
      birthDate: roster.birthDate ?? global?.birthDate ?? null,
    };
  });
}

export function useCoachBirthdayReminders(
  db: Firestore | null | undefined,
  trainerUid: string | undefined,
  unnamedFallback = "Student"
) {
  const [birthdays, setBirthdays] = useState<BirthdayStudent[]>([]);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<UpcomingBirthdayStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (db == null || !trainerUid) {
      setBirthdays([]);
      setUpcomingBirthdays([]);
      setLoading(false);
      return;
    }

    const fs = db;
    const uid = trainerUid;
    let cancelled = false;

    async function run() {
      setLoading(true);
      try {
        const rows = await loadCoachStudentRows(fs, uid);
        if (cancelled) return;
        const now = new Date();
        setBirthdays(getRosterBirthdaysToday(rows, now, unnamedFallback));
        setUpcomingBirthdays(getRosterUpcomingBirthdays(rows, now, unnamedFallback));
      } catch {
        if (!cancelled) {
          setBirthdays([]);
          setUpcomingBirthdays([]);
        }
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

  return { loading, birthdays, upcomingBirthdays };
}
