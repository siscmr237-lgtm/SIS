"use client";

import { StaffManagement } from "@/components/StaffManagement";
import { useAppNavigation } from "@/lib/navigation";

export default function StaffPage() {
  const { navigate, viewStaff } = useAppNavigation();
  return <StaffManagement onNavigate={navigate} onViewStaff={viewStaff} />;
}
