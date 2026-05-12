"use client";

import type { FirebaseApp } from "firebase/app";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { firebaseConfig } from "@/firebase/config";

/**
 * Storage instance with an explicit bucket URL so it works even when the
 * FirebaseApp was initialized without `storageBucket` (e.g. some App Hosting flows).
 */
export function getFirebaseStorage(app: FirebaseApp): FirebaseStorage {
  const bucket = firebaseConfig.storageBucket;
  if (!bucket) {
    throw new Error(
      "Missing storageBucket in firebase config. Set NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET or storageBucket in src/firebase/config.ts."
    );
  }
  return getStorage(app, `gs://${bucket}`);
}
