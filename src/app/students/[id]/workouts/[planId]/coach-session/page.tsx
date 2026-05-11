import CoachWorkoutSessionPage from "./client-page";

export function generateStaticParams() {
  return [];
}

export default function Page({ params }: { params: Promise<{ id: string; planId: string }> }) {
  return <CoachWorkoutSessionPage params={params} />;
}
