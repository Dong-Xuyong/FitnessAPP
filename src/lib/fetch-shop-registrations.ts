import type { Firestore } from "firebase/firestore";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { mergeShopRegistrationsByDate, type ShopLine, type ShopRegistrationLike } from "@/lib/shop-billing";

function periodDateBounds(period: string): { startDate: string; endDate: string } | null {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return null;
  const startDate = `${period}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${period}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate };
}

function mapRegistrationDocs(
  docs: Array<{ data: () => Record<string, unknown> }>
): ShopRegistrationLike[] {
  return docs.map((d) => {
    const data = d.data();
    return {
      date: String(data.date ?? ""),
      lines: Array.isArray(data.lines) ? (data.lines as ShopLine[]) : [],
    };
  });
}

function isMissingIndexError(e: unknown): boolean {
  const code = (e as { code?: string })?.code ?? "";
  if (code === "failed-precondition") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("requires an index");
}

/**
 * Loads shop registrations for one student in a billing period (`YYYY-MM`).
 * Uses a composite query when indexed; falls back to studentId-only + client date filter.
 */
/** All Firestore `studentId` values that may own shop rows for this signed-in student. */
export async function resolveShopRegistrationStudentIds(
  db: Firestore,
  trainerId: string,
  authUid: string,
  globalStudent?: Record<string, unknown> | null
): Promise<string[]> {
  const ids = new Set<string>();
  const uid = String(authUid || "").trim();
  if (uid) ids.add(uid);
  const rosterDocId = String(globalStudent?.rosterDocId ?? "").trim();
  const rosterPathId = rosterDocId || uid;
  if (rosterPathId) ids.add(rosterPathId);
  if (trainerId && rosterPathId) {
    try {
      const rosterSnap = await getDoc(
        doc(db, "personalTrainers", trainerId, "students", rosterPathId)
      );
      if (rosterSnap.exists()) {
        const rd = rosterSnap.data() as Record<string, unknown>;
        const linkedUid = String(rd.userId ?? "").trim();
        if (linkedUid) ids.add(linkedUid);
      }
    } catch {
      /* ignore */
    }
  }
  return [...ids];
}

export async function fetchShopRegistrationsForPeriod(
  db: Firestore,
  trainerId: string,
  studentId: string,
  period: string
): Promise<ShopRegistrationLike[]> {
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
    return mapRegistrationDocs(snap.docs);
  } catch (e) {
    if (!isMissingIndexError(e)) throw e;
    const snap = await getDocs(query(col, where("studentId", "==", studentId)));
    return mapRegistrationDocs(snap.docs).filter((reg) => {
      const d = String(reg.date ?? "");
      return d >= startDate && d <= endDate;
    });
  }
}

/**
 * Loads one student's month via per-day `get` on `{authUid}_{YYYY-MM-DD}` docs.
 * Students cannot `list` shopRegistrations (rules); `get` on own doc ids is allowed.
 */
export async function fetchShopRegistrationsForPeriodByAuthDocIds(
  db: Firestore,
  trainerId: string,
  authUid: string,
  period: string
): Promise<ShopRegistrationLike[]> {
  const bounds = periodDateBounds(period);
  const uid = String(authUid || "").trim();
  if (!bounds || !uid) return [];

  const [y, m] = period.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const colRef = collection(db, "personalTrainers", trainerId, "shopRegistrations");

  const snaps = await Promise.all(
    Array.from({ length: lastDay }, (_, i) => {
      const day = i + 1;
      const date = `${period}-${String(day).padStart(2, "0")}`;
      const regId = `${uid}_${date}`;
      return getDoc(doc(colRef, regId));
    })
  );

  const regs: ShopRegistrationLike[] = [];
  for (let i = 0; i < snaps.length; i++) {
    const snap = snaps[i];
    if (!snap.exists()) continue;
    const data = snap.data() as Record<string, unknown>;
    const day = i + 1;
    const date = `${period}-${String(day).padStart(2, "0")}`;
    regs.push({
      date: String(data.date ?? date),
      lines: Array.isArray(data.lines) ? (data.lines as ShopLine[]) : [],
    });
  }
  return regs;
}

export type FetchShopRegistrationsCandidatesOptions = {
  /** When set, loads this id via per-day doc `get` instead of a collection `list` query. */
  authUidForDocIdFetch?: string;
};

/** Loads shop rows for every linked student id, merged by calendar day. */
export async function fetchShopRegistrationsForPeriodCandidates(
  db: Firestore,
  trainerId: string,
  studentIds: string[],
  period: string,
  options?: FetchShopRegistrationsCandidatesOptions
): Promise<ShopRegistrationLike[]> {
  const uniqueIds = [...new Set(studentIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!uniqueIds.length) return [];
  const authUid = String(options?.authUidForDocIdFetch ?? "").trim();
  const merged: ShopRegistrationLike[] = [];
  for (const sid of uniqueIds) {
    const regs =
      authUid && sid === authUid
        ? await fetchShopRegistrationsForPeriodByAuthDocIds(db, trainerId, sid, period)
        : await fetchShopRegistrationsForPeriod(db, trainerId, sid, period);
    merged.push(...regs);
  }
  return mergeShopRegistrationsByDate(merged);
}
