"use client";

import { ClassRanking } from "@/components/ClassRanking";
import { useAppNavigation } from "@/lib/navigation";

export default function ClassRankingPage() {
  const { navigate } = useAppNavigation();
  return <ClassRanking onNavigate={navigate} />;
}
