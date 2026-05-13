import WorkoutSessionPage from "./client-page";

export function generateStaticParams() {
  return [];
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkoutSessionPage workoutId={id} />;
}