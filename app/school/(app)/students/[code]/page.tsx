"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { StudentProfile } from "@/components/StudentProfile";
import { useAppNavigation } from "@/lib/navigation";
import type { Student } from "@/types";
import { ContentLoader } from "@/components/ContentLoader";

function StudentProfileLoader() {
  const params = useParams<{ code: string }>();
  const { navigate } = useAppNavigation();
  const [student, setStudent] = useState<Student | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    api
      .get(`/students/${encodeURIComponent(params.code)}`)
      .then((data) => {
        if (!alive) return;
        setStudent(data);
        setStatus("ready");
      })
      .catch(() => {
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [params.code]);

  if (status === "loading") {
    return <div className="p-4 md:p-8"><ContentLoader minHeight={280} /></div>;
  }
  if (status === "error" || !student) {
    return <div className="p-4 md:p-8 text-gray-500">Student not found.</div>;
  }
  return <StudentProfile student={student} onNavigate={navigate} />;
}

export default function StudentProfilePage() {
  return (
    <Suspense fallback={<div className="p-4 md:p-8"><ContentLoader minHeight={280} /></div>}>
      <StudentProfileLoader />
    </Suspense>
  );
}
