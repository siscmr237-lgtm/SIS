"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthGateWithRetry } from "@/lib/authGate";
import { AuthGateError } from "@/components/AuthGateError";

/**
 * '/' — the school door again.
 *
 * The root held the marketing page for a while; that page is still here, at
 * /home, and nothing about it changed except its address. What the root does
 * now is what it did before the landing page arrived, with one difference: a
 * visitor with no session goes to /school/signup rather than /school/login.
 * Somebody who typed lewa.app and nothing else is more likely to be arriving
 * for the first time than to be a proprietor who knows the way in — and the
 * signup page carries a link to the login page for the ones who are.
 *
 * A client page rather than a next.config redirect, and it has to be: the
 * session lives in localStorage, so a config redirect — resolved on the server
 * before any of our JS runs — could only ever be unconditional, and would send
 * a signed-in proprietor to the signup form.
 *
 * Every other case is the gate's, which is the same gate the (app) layout runs,
 * so this page cannot drift from it: a teacher session to /teacher, an
 * unverified email to /school/verify-email, an unfinished setup to
 * /school/onboarding, a school still waiting on the platform team to
 * /school/pending-verification. 'ready' means a signed-in admin whose school
 * the server has confirmed is APPROVED, and that is the only case that opens
 * the dashboard.
 *
 * Identical in shape to app/school/page.tsx, which does this same job for
 * '/school' and takes the default signed-out destination — so /school leads to
 * /school/login while '/' leads to /school/signup.
 */
export default function Page() {
  const router = useRouter();
  const { status, retry } = useAuthGateWithRetry("/school/signup");

  useEffect(() => {
    if (status === "ready") router.replace("/school/dashboard");
  }, [status, router]);

  // The gate could not reach an answer. Holding here rather than forwarding to
  // the dashboard is the same choice the app shell makes — see AuthGateError.
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
