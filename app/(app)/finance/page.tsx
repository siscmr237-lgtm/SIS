"use client";

import { FinanceOverview } from "@/components/FinanceOverview";
import { useAppNavigation } from "@/lib/navigation";

export default function FinancePage() {
  const { navigate, viewStudent } = useAppNavigation();
  return <FinanceOverview onNavigate={navigate} onViewStudent={viewStudent} />;
}
