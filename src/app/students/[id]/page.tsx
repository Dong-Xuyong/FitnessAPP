import { Suspense } from "react";
import StudentDetailPage from "./client-page";

export function generateStaticParams() {
  return [];
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <StudentDetailPage id={id} />
    </Suspense>
  );
}