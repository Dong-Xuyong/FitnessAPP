import StudentDetailPage from "./client-page";

export function generateStaticParams() {
  return [];
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <StudentDetailPage params={params} />;
}