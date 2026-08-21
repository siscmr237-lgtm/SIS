"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthGate } from "../src/lib/authGate";

export default function Page() {
  const router = useRouter();
  const status = useAuthGate();

  useEffect(() => {
    if (status === "ready") router.replace("/school/dashboard");
  }, [status, router]);

  return <div className="p-6 text-sm text-gray-600">Loading...</div>;
}
