import type { Firestore } from "firebase/firestore";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import {
  normalizeShopPurchasesFromDoc,
  type ShopPurchaseLike,
} from "@/lib/shop-billing";

function periodDateBounds(period: string): { startDate: string; endDate: string } | null {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return null;
  const startDate = `${period}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${period}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate };
}

function mapPurchaseDocs(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>
): ShopPurchaseLike[] {
  const purchases: ShopPurchaseLike[] = [];
  for (const d of docs) {
    purchases.push(...normalizeShopPurchasesFromDoc(d.data(), d.id));
  }
  return purchases;
}

function isMissingIndexError(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? "";
  if (code === "failed-precondition") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("requires an index");
}

function uniqueNonEmptyIds(...values: (string | undefined | null)[]): string[] {
  return [
    ...new Set(
      values.map((v) => String(v ?? "").trim()).filter(Boolean)
    ),
  ];
}

/** Pure merge of id sets from roster, auth uid, and reverse lookups (unit-testable). */
export function collectShopRegistrationStudentIds(
  ...groups: (string | undefined | null)[][]
): string[] {
  return uniqueNonEmptyIds(...groups.flat());
}

/**
 * All Firestore `studentId` values that may own shop rows for a student.
 * `seedId` may be the Firebase auth UID or the roster document id.
 */
export async function resolveShopRegistrationStudentIds(
  db: Firestore,
  trainerId: string,
  seedId: string,
  globalStudent?: Record<string, unknown> | null
): Promise<string[]> {
  const seed = String(seedId || "").trim();
  const fromGlobalRoster = String(globalStudent?.rosterDocId ?? "").trim();
  const fromGlobalUserId = String(globalStudent?.userId ?? "").trim();

  let rosterDocIdFromAuth = "";
  if (seed) {
    try {
      const globalSnap = await getDoc(doc(db, "students", seed));
      if (globalSnap.exists()) {
        rosterDocIdFromAuth = String(globalSnap.data()?.rosterDocId ?? "").trim();
      }
    } catch {
      /* ignore */
    }
  }

  const rosterPathCandidates = uniqueNonEmptyIds(
    fromGlobalRoster,
    rosterDocIdFromAuth,
    seed
  );

  const reverseAuthUids: string[] = [];
  for (const rosterCandidate of rosterPathCandidates) {
    try {
      const reverseSnap = await getDocs(
        query(collection(db, "students"), where("rosterDocId", "==", rosterCandidate))
      );
      for (const d of reverseSnap.docs) {
        reverseAuthUids.push(d.id);
      }
    } catch {
      /* ignore */
    }
  }

  const rosterUserIds: string[] = [];
  for (const rosterCandidate of rosterPathCandidates) {
    if (!trainerId || !rosterCandidate) continue;
    try {
      const rosterSnap = await getDoc(
        doc(db, "personalTrainers", trainerId, "students", rosterCandidate)
      );
      if (rosterSnap.exists()) {
        const linkedUid = String(rosterSnap.data()?.userId ?? "").trim();
        if (linkedUid) rosterUserIds.push(linkedUid);
      }
    } catch {
      /* ignore */
    }
  }

  return collectShopRegistrationStudentIds(
    [seed, fromGlobalUserId],
    rosterPathCandidates,
    rosterUserIds,
    reverseAuthUids
  );
}

export async function fetchShopPurchasesForPeriod(
  db: Firestore,
  trainerId: string,
  studentId: string,
  period: string
): Promise<ShopPurchaseLike[]> {
  const bounds = periodDateBounds(period);
  if (!bounds) return [];

  const { startDate, endDate } = bounds;
  const col = collection(db, "personalTrainers", trainerId, "shopRegistrations");

  try {
    const snap = await getDocs(
      query(
        col,
        where("studentId", "==", studentId),
        where("date", ">=", startDate),
        where("date", "<=", endDate)
      )
    );
    return mapPurchaseDocs(snap.docs.map((d) => ({ id: d.id, data: () => d.data() })));
  } catch (e) {
    if (!isMissingIndexError(e)) throw e;
    const snap = await getDocs(query(col, where("studentId", "==", studentId)));
    return mapPurchaseDocs(snap.docs.map((d) => ({ id: d.id, data: () => d.data() }))).filter(
      (purchase) => {
        const d = String(purchase.date ?? "");
        return d >= startDate && d <= endDate;
      }
    );
  }
}

/** @deprecated Use fetchShopPurchasesForPeriod */
export const fetchShopRegistrationsForPeriod = fetchShopPurchasesForPeriod;

/** Loads shop purchases for every linked student id in a billing month. */
export async function fetchShopPurchasesForPeriodCandidates(
  db: Firestore,
  trainerId: string,
  studentIds: string[],
  period: string
): Promise<ShopPurchaseLike[]> {
  const uniqueIds = [...new Set(studentIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!uniqueIds.length) return [];
  const merged: ShopPurchaseLike[] = [];
  for (const sid of uniqueIds) {
    merged.push(...(await fetchShopPurchasesForPeriod(db, trainerId, sid, period)));
  }
  return merged;
}

/** @deprecated Use fetchShopPurchasesForPeriodCandidates */
export async function fetchShopRegistrationsForPeriodCandidates(
  db: Firestore,
  trainerId: string,
  studentIds: string[],
  period: string
): Promise<ShopPurchaseLike[]> {
  return fetchShopPurchasesForPeriodCandidates(db, trainerId, studentIds, period);
}

/** Loads all shop purchases for every linked student id (no date filter). */
export async function fetchShopPurchasesForStudentCandidates(
  db: Firestore,
  trainerId: string,
  studentIds: string[]
): Promise<ShopPurchaseLike[]> {
  const uniqueIds = [...new Set(studentIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!uniqueIds.length) return [];

  const col = collection(db, "personalTrainers", trainerId, "shopRegistrations");
  const merged: ShopPurchaseLike[] = [];

  for (const sid of uniqueIds) {
    try {
      const snap = await getDocs(query(col, where("studentId", "==", sid)));
      merged.push(...mapPurchaseDocs(snap.docs.map((d) => ({ id: d.id, data: () => d.data() }))));
    } catch {
      /* skip ids the caller cannot list (e.g. roster doc id on student client) */
    }
  }

  return merged;
}

/** @deprecated Use fetchShopPurchasesForStudentCandidates */
export const fetchShopRegistrationsForStudentCandidates = fetchShopPurchasesForStudentCandidates;
