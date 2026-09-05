"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  fetchRegistrationSnapshot,
  routeForSnapshot,
  type RegistrationSnapshot,
} from "@/lib/registrationStatus";
import { AuthGateError } from "@/components/AuthGateError";
import { getToken, getUser } from "@/lib/session";

/**
 * /school/pending-verification — where a school waits after submitting its
 * details.
 *
 * This page sits OUTSIDE the (app) group on purpose: the app shell is the
 * signed-in product, and a school waiting to be let into it has no business
 * rendering the sidebar and the dashboard chrome behind it. So it runs its own
 * gate, which is the same gate, reading the same live status from the same
 * endpoint.
 *
 * The gate here is two-directional, and both directions matter:
 *
 *   A school that is NOT pending must not see this page. An approved school
 *   landing on this URL — a bookmark, a back button, a stale tab left open
 *   through the approval — is sent to its dashboard rather than shown a wait
 *   that is over.
 *
 *   A pending school must not see anything else. That half is enforced by the
 *   app shell's gate, not here.
 */
export default function PendingVerificationPage() {
  const router = useRouter();
  const [gate, setGate] = useState<"checking" | "ready" | "error">("checking");
  const [snapshot, setSnapshot] = useState<RegistrationSnapshot | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [illustrationFailed, setIllustrationFailed] = useState(false);

  const retry = useCallback(() => {
    setGate("checking");
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      // The school session, not whatever a teacher tab in this same browser
      // may hold — the two live under separate keys now (src/lib/session.ts).
      if (!getToken("school")) {
        if (alive) router.replace("/school/login");
        return;
      }
      const user: any = getUser("school");

      // A teacher has no registration of their own to wait on, and the endpoint
      // below is admin-only — asking it on their behalf would only produce a
      // refusal to mishandle.
      if (user?.actorType === "teacher") {
        if (alive) router.replace("/teacher");
        return;
      }

      try {
        const snap = await fetchRegistrationSnapshot();
        if (!alive) return;

        // PENDING is the ONLY status this page is for. Everything else goes
        // wherever the shared rule says it belongs — approved to the dashboard,
        // unverified back to the OTP screen, incomplete back to the form.
        if (snap.registrationStatus !== "PENDING") {
          router.replace(routeForSnapshot(snap) ?? "/school/dashboard");
          return;
        }

        setSnapshot(snap);
        setGate("ready");
      } catch (e: any) {
        if (!alive) return;
        // Already handled by the API client, which has cleared the session.
        if (e?.status === 401) return;
        setGate("error");
      }
    })();

    return () => {
      alive = false;
    };
  }, [router, attempt]);

  /**
   * "Check Status" — ask again, now.
   *
   * A fresh call rather than anything remembered from the mount: the whole
   * reason to press it is that somebody else may have changed the answer since.
   */
  const handleCheckStatus = async () => {
    if (checking || reopening) return;
    setChecking(true);
    try {
      const snap = await fetchRegistrationSnapshot();
      if (snap.registrationStatus === "APPROVED") {
        toast.success("You're approved. Taking you to your dashboard.");
        router.replace("/school/dashboard");
        return;
      }
      if (snap.registrationStatus === "PENDING") {
        toast("You haven't been approved yet.");
        return;
      }
      // Neither pending nor approved any more — the status moved underneath
      // this tab (a "Not Done" in another window, say). Follow it rather than
      // leaving the school looking at a page that no longer describes them.
      router.replace(routeForSnapshot(snap) ?? "/school/dashboard");
    } catch (e: any) {
      if (e?.status === 401) return;
      toast.error(e?.message || "We couldn't check your status. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  /**
   * "Not Done" — the school says the details it sent were wrong.
   *
   * The server moves PENDING back to INCOMPLETE; this only forwards to the form
   * once that has actually happened. Navigating first and letting the reset
   * race behind it would land the school on /school/onboarding while the row
   * still said PENDING, and that page's own gate would bounce it straight back
   * here.
   */
  const handleNotDone = async () => {
    if (checking || reopening) return;
    setReopening(true);
    try {
      await api.post("/school/registration-status/reopen", {});
      router.replace("/school/onboarding");
    } catch (e: any) {
      if (e?.status === 401) return;
      toast.error(e?.message || "We couldn't reopen your details. Please try again.");
      setReopening(false);
    }
  };

  if (gate === "error") return <AuthGateError onRetry={retry} />;

  if (gate !== "ready") {
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

  const busy = checking || reopening;

  const buttonBase: React.CSSProperties = {
    flex: "1 1 0",
    minWidth: 0,
    padding: "11px 16px",
    borderRadius: 9,
    fontSize: "0.875rem",
    fontWeight: 500,
    cursor: busy ? "default" : "pointer",
    transition: "background-color 0.15s, border-color 0.15s, color 0.15s",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        backgroundColor: "#f0f5f9",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "white",
          border: "1px solid #E2E8F0",
          borderRadius: 16,
          padding: "30px 26px 26px",
          textAlign: "center",
          boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
        }}
      >
        {/* The illustration. A missing file must not leave a broken-image icon
            in the middle of the screen, so a failed load collapses it and the
            message carries the page on its own. */}
        {!illustrationFailed && (
          <img
            src="/images/pending-verification.png"
            alt=""
            onError={() => setIllustrationFailed(true)}
            style={{
              display: "block",
              width: "100%",
              maxWidth: 240,
              height: "auto",
              margin: "0 auto 22px",
            }}
          />
        )}

        <p
          style={{
            fontSize: "0.9375rem",
            color: "#0F172A",
            lineHeight: 1.55,
            margin: "0 0 24px",
          }}
        >
          Your account is being reviewed. We&apos;ll get back to you shortly.
        </p>

        {/* Side by side, and they stay side by side: this is two choices of
            equal standing, not a primary action with an escape hatch under it. */}
        <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
          <button
            type="button"
            onClick={handleCheckStatus}
            disabled={busy}
            style={{
              ...buttonBase,
              border: "none",
              background: busy ? "#93B4F5" : "#1D4ED8",
              color: "white",
            }}
          >
            {checking ? "Checking..." : "Check Status"}
          </button>
          <button
            type="button"
            onClick={handleNotDone}
            disabled={busy}
            style={{
              ...buttonBase,
              border: "1px solid #D1D5DB",
              background: "white",
              color: busy ? "#94A3B8" : "#0F172A",
            }}
          >
            {reopening ? "Opening..." : "Not Done"}
          </button>
        </div>

        {snapshot?.schoolName && (
          <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: "16px 0 0" }}>
            {snapshot.schoolName}
          </p>
        )}
      </div>
    </div>
  );
}
