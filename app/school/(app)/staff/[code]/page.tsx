"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { StaffProfile } from "@/components/StaffProfile";
import { useAppNavigation } from "@/lib/navigation";
import type { Staff } from "@/types";

function StaffProfileLoader() {
  const params = useParams<{ code: string }>();
  const { navigate } = useAppNavigation();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    api
      .get(`/staff/${encodeURIComponent(params.code)}`)
      .then((data) => {
        if (!alive) return;
        setStaff(data);
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
    return <div className="p-4 md:p-8 text-gray-500">Loading...</div>;
  }
  if (status === "error" || !staff) {
    return <div className="p-4 md:p-8 text-gray-500">Staff member not found.</div>;
  }
  return <StaffProfile staff={staff} onNavigate={navigate} />;
}

export default function StaffProfilePage() {
  return (
    <Suspense fallback={<div className="p-4 md:p-8 text-gray-500">Loading...</div>}>
      <StaffProfileLoader />
    </Suspense>
  );
}
