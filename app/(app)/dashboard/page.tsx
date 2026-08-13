"use client";

import { Dashboard } from "@/components/Dashboard";
import { useAppNavigation } from "@/lib/navigation";

export default function DashboardPage() {
  // Without this the setup checklist has nowhere to send anyone — its rows are
  // gated on having a navigate handler, so every one of them was inert on the
  // live dashboard. Same pattern the other pages already use.
  const { navigate } = useAppNavigation();
  return <Dashboard onNavigate={navigate} />;
}
