import type { Firestore } from "firebase/firestore";
import { addDoc, collection, getDocs, limit, query } from "firebase/firestore";

const DEFAULT_ITEMS = [
  { name: "Coffee", price: 1 },
  { name: "Water", price: 0.5 },
] as const;

/**
 * Seeds Coffee + Water when the trainer has no shop items yet.
 */
export async function seedDefaultShopItemsIfEmpty(db: Firestore, trainerId: string): Promise<boolean> {
  const col = collection(db, "personalTrainers", trainerId, "shopItems");
  const snap = await getDocs(query(col, limit(1)));
  if (!snap.empty) return false;

  const now = new Date().toISOString();
  for (const item of DEFAULT_ITEMS) {
    await addDoc(col, {
      name: item.name,
      price: item.price,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }
  return true;
}
