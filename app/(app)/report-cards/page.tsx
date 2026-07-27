"use client";

import { ReportCards } from "@/components/ReportCards";
import { useAppNavigation } from "@/lib/navigation";

export default function ReportCardsPage() {
  const { navigate } = useAppNavigation();
  return <ReportCards onNavigate={navigate} />;
}
