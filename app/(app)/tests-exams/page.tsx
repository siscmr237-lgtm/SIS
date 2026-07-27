"use client";

import { TestsExamsManagement } from "@/components/TestsExamsManagement";
import { useAppNavigation } from "@/lib/navigation";

export default function TestsExamsPage() {
  const { navigate } = useAppNavigation();
  return <TestsExamsManagement onNavigate={navigate} />;
}
