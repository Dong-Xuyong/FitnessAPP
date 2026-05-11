/**
 * Scheduled enforcement: unpaid `YYYY-MM` after day 6 → block from day 7 (Europe/Lisbon calendar).
 * Keep calendar logic aligned with `src/lib/student-payment-due.ts` (client uses device local time).
 */
import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";

admin.initializeApp();
const db = getFirestore();

const LISBON_TZ = "Europe/Lisbon";

function lisbonYmd(now: Date): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: LISBON_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = s.split("-").map((x) => Number(x));
  return { y, m, d };
}

function currentYm(parts: { y: number; m: number }): string {
  return `${parts.y}-${String(parts.m).padStart(2, "0")}`;
}

function parseYm(period: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period || "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  return { y, m: mo };
}

function canonicalYm(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(s);
  if (!m) return null;
  const mo = Number(m[2]);
  if (!Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}`;
}

function isPaidStatus(s: unknown): boolean {
  const t = String(s ?? "").toLowerCase().trim();
  return t === "paid" || t === "pago";
}

function isPeriodPaid(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  period: string
): boolean {
  const target = parseYm(period);
  if (!target) return false;
  const tstr = `${target.y}-${String(target.m).padStart(2, "0")}`;
  return docs.some((d) => {
    const c = canonicalYm(d.data().period);
    return c === tstr && isPaidStatus(d.data().status);
  });
}

/** Unpaid and Lisbon wall date is on or after day 7 of that payment month (or a later month). */
function shouldAutoBlockForUnpaidPeriod(
  lisbon: { y: number; m: number; d: number },
  period: string
): boolean {
  const p = parseYm(period);
  if (!p) return false;
  if (lisbon.y > p.y) return true;
  if (lisbon.y < p.y) return false;
  if (lisbon.m > p.m) return true;
  if (lisbon.m < p.m) return false;
  return lisbon.d >= 7;
}

export const enforcePaymentBlocking = onSchedule(
  {
    schedule: "5 0 * * *",
    timeZone: LISBON_TZ,
    region: "europe-west1",
    memory: "512MiB",
  },
  async () => {
    const lisbon = lisbonYmd(new Date());
    const currentPeriod = currentYm(lisbon);
    const trainersSnap = await db.collection("personalTrainers").get();
    let batch = db.batch();
    let writes = 0;

    const flush = async () => {
      if (writes === 0) return;
      await batch.commit();
      batch = db.batch();
      writes = 0;
    };

    const enqueueSet = async (
      ref: FirebaseFirestore.DocumentReference,
      data: Record<string, unknown>
    ) => {
      batch.set(ref, data, { merge: true });
      writes += 1;
      if (writes >= 450) await flush();
    };

    for (const tDoc of trainersSnap.docs) {
      const tid = tDoc.id;
      const studentsSnap = await db.collection("personalTrainers").doc(tid).collection("students").get();

      for (const sDoc of studentsSnap.docs) {
        const roster = sDoc.data() as Record<string, unknown>;
        if (String(roster.billingStatus ?? "").trim().toLowerCase() !== "active") continue;
        const rate = Number(roster.monthlyRate ?? 0);
        if (!Number.isFinite(rate) || rate <= 0) continue;

        const reason = String(roster.blockedReason ?? "");
        if (roster.blocked === true && reason !== "payment") {
          continue;
        }

        const paymentsSnap = await db
          .collection("personalTrainers")
          .doc(tid)
          .collection("students")
          .doc(sDoc.id)
          .collection("payments")
          .get();
        const payDocs = paymentsSnap.docs;

        const periods = new Set<string>();
        periods.add(currentPeriod);
        for (const p of payDocs) {
          const c = canonicalYm(p.data().period);
          if (c) periods.add(c);
        }

        let needsBlock = false;
        for (const period of periods) {
          if (isPeriodPaid(payDocs, period)) continue;
          if (shouldAutoBlockForUnpaidPeriod(lisbon, period)) {
            needsBlock = true;
            break;
          }
        }

        const rosterRef = db.collection("personalTrainers").doc(tid).collection("students").doc(sDoc.id);
        const authUid = String(roster.userId ?? "").trim() || sDoc.id;
        const globalRef = db.collection("students").doc(authUid);

        if (needsBlock) {
          await enqueueSet(rosterRef, { blocked: true, blockedReason: "payment" });
          await enqueueSet(globalRef, { blocked: true, blockedReason: "payment" });
        } else if (roster.blocked === true && reason === "payment") {
          await enqueueSet(rosterRef, { blocked: false, blockedReason: null });
          await enqueueSet(globalRef, { blocked: false, blockedReason: null });
        }
      }
    }

    await flush();
    logger.info("enforcePaymentBlocking completed", { lisbon });
  }
);
