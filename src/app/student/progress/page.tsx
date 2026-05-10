"use client";

import { StudentNavigation } from "@/components/StudentNavigation";
import { StudentProgressPanel } from "@/components/StudentProgressPanel";

export default function StudentProgressPage() {
  return (
    <StudentNavigation>
      <StudentProgressPanel />
    </StudentNavigation>
  );
}
