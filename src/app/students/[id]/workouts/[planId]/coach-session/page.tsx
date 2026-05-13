import CoachWorkoutSessionPage from "./client-page";

export function generateStaticParams() {
  return [];
}

export default async function Page({ params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;
  return <CoachWorkoutSessionPage storageStudentId={id} planId={planId} />;
}
