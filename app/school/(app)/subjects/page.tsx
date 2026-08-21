"use client";

import { SubjectsManagement } from "@/components/SubjectsManagement";
import { useAppNavigation } from "@/lib/navigation";

export default function SubjectsPage() {
  const { navigate } = useAppNavigation();
  return <SubjectsManagement onNavigate={navigate} />;
}
