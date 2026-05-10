import { Suspense } from "react";
import StudentDetailPage from "./client-page";

export function generateStaticParams() {
  return [];
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  // #region agent log
  let id: string;
  try {
    const resolved = await params;
    id = resolved.id;
    console.info("[debug-c5653c H2-post] students/[id]/page resolved id=%s env=%s suspense=wrapped", id, process.env.NODE_ENV);
  } catch (e) {
    console.error("[debug-c5653c H2-post] students/[id]/page params failed", e);
    throw e;
  }
  // #endregion
  return (
    <Suspense fallback={null}>
      <StudentDetailPage id={id} />
    </Suspense>
  );
}