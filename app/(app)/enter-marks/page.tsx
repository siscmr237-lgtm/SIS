"use client";

import { EnterMarks } from "@/components/EnterMarks";
import { useAppNavigation } from "@/lib/navigation";

export default function EnterMarksPage() {
  const { navigate } = useAppNavigation();
  return <EnterMarks onNavigate={navigate} />;
}
