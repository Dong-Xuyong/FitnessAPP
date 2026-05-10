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
    console.info("[debug-c5653c H2] students/[id]/page resolved id=%s env=%s", id, process.env.NODE_ENV);
  } catch (e) {
    console.error("[debug-c5653c H2] students/[id]/page params failed", e);
    throw e;
  }
  // #endregion
  return <StudentDetailPage id={id} />;
}