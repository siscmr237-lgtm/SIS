"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthGateWithRetry } from "../src/lib/authGate";
import { AuthGateError } from "../src/components/AuthGateError";

export default function Page() {
  const router = useRouter();
  const { status, retry } = useAuthGateWithRetry();

  useEffect(() => {
    if (status === "ready") router.replace("/school/dashboard");
  }, [status, router]);

  // The gate could not reach an answer. Holding here rather than forwarding to
  // the dashboard is the same choice the app shell makes — see AuthGateError.
  if (status === "error") return <AuthGateError onRetry={retry} />;

  return <div className="p-6 text-sm text-gray-600">Loading...</div>;
}
