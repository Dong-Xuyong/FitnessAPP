import type { FirebaseApp } from "firebase/app";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage } from "@/firebase/storage";

const MAX_BYTES = 5 * 1024 * 1024;

function extensionForFile(file: File): string {
  const t = file.type;
  if (t === "image/png") return ".png";
  if (t === "image/webp") return ".webp";
  if (t === "image/gif") return ".gif";
  if (t === "image/jpeg" || t === "image/jpg") return ".jpg";
  const name = file.name.toLowerCase();
  const m = /\.(jpe?g|png|webp|gif)$/.exec(name);
  return m ? m[0] : ".jpg";
}

/**
 * Uploads a trainer profile image to Storage at personalTrainers/{uid}/profile-photo.{ext}.
 * Caller must ensure the user is signed in as uid (rules enforce this).
 */
export async function uploadTrainerProfilePhoto(
  app: FirebaseApp,
  uid: string,
  file: File
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("INVALID_IMAGE_TYPE");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }
  const storage = getFirebaseStorage(app);
  const ext = extensionForFile(file);
  const path = `personalTrainers/${uid}/profile-photo${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "image/jpeg",
  });
  return getDownloadURL(storageRef);
}
