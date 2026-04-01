import WorkoutSessionPage from "./client-page";

export function generateStaticParams() {
  return [];
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <WorkoutSessionPage params={params} />;
}