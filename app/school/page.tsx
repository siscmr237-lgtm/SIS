"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthGateWithRetry } from "@/lib/authGate";
import { AuthGateError } from "@/components/AuthGateError";

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
 * /school/onboarding, and a school still waiting on the platform team to
 * /school/pending-verification. 'ready' is what is left over, and it now means
 * something narrower than it used to: a signed-in admin whose school the server
 * has confirmed is APPROVED. That is the only case the dashboard opens for.
 *
 * Identical in shape to app/page.tsx, which does this same job for '/' — with
 * the one difference that the root sends a visitor with no session to
 * /school/signup, while this page keeps the gate's default and sends them to
 * /school/login. Somebody who typed /school knows the section exists; somebody
 * who typed the bare domain may not.
 */
export default function SchoolIndexPage() {
  const router = useRouter();
  const { status, retry } = useAuthGateWithRetry();

  useEffect(() => {
    if (status === "ready") router.replace("/school/dashboard");
  }, [status, router]);

  if (status === "error") return <AuthGateError onRetry={retry} />;

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
