const projectId = "studio-1236371135-55aee";

/** Default GCS bucket for Firebase Storage; override if your console shows a different bucket. */
const defaultStorageBucket = `${projectId}.firebasestorage.app`;

export const firebaseConfig = {
  projectId,
  appId: "1:651596638636:web:9a85c8d88fcd253b297209",
  apiKey: "AIzaSyD00MoY7CHc15ap9ouBLNyBb9OF9mYLP1A",
  authDomain: "studio-1236371135-55aee.web.app",
  storageBucket:
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim()) ||
    defaultStorageBucket,
  measurementId: "",
  messagingSenderId: "651596638636",
};
