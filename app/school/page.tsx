"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthGate } from "@/lib/authGate";

/**
 * /school — the school admin section's bare root, which until now was a 404.
 *
 * A client page rather than a next.config redirect, and it has to be: the
 * session lives in localStorage, and config redirects are resolved on the
 * server before any of our JS runs. A redirect there could only ever be
 * unconditional, which would mean sending a signed-in proprietor to the login
 * page.
 *
 * The whole decision is delegated to useAuthGate — the same gate the (app)
 * layout runs — so this page cannot drift from it. That gate already routes
 * every case: no session to /school/login, a teacher who wandered in to
 * /teacher, an unverified email to /school/verify-email, an unfinished setup to
 * /school/onboarding. 'ready' is what is left over, and it means a signed-in
 * admin with nothing outstanding, so the dashboard is where they go.
 *
 * Identical in shape to app/page.tsx, which does this same job for '/'.
 */
export default function SchoolIndexPage() {
  const router = useRouter();
  const status = useAuthGate();

  useEffect(() => {
    if (status === "ready") router.replace("/school/dashboard");
  }, [status, router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        fontSize: "0.875rem",
        color: "#6B7280",
      }}
    >
      Loading...
    </div>
  );
}
