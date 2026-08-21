"use client";

import { ClassesManagement } from "@/components/ClassesManagement";
import { useAppNavigation } from "@/lib/navigation";

export default function ClassesPage() {
  const { navigate } = useAppNavigation();
  return <ClassesManagement onNavigate={navigate} />;
}
