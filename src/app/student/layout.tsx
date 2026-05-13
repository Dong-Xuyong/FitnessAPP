import type { ReactNode } from "react";
import { StudentNavigation } from "@/components/StudentNavigation";

export default function StudentLayout({ children }: { children: ReactNode }) {
  return <StudentNavigation>{children}</StudentNavigation>;
}
