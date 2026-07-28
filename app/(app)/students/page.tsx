"use client";

import { StudentsManagement } from "@/components/StudentsManagement";
import { useAppNavigation } from "@/lib/navigation";

export default function StudentsPage() {
  const { navigate, viewStudent } = useAppNavigation();
  return <StudentsManagement onNavigate={navigate} onViewStudent={viewStudent} />;
}
