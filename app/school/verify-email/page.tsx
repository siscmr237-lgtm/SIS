"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OtpVerifyScreen } from "../../../src/components/OtpVerifyScreen";
import { api } from "../../../src/lib/api";
import { routeForFreshUser } from "../../../src/lib/registrationStatus";
import { SCHOOL_HOME_PATH } from "../../../src/lib/registrationRoutes";
import { ContentLoader } from "@/components/ContentLoader";
import { clearSession, getToken, getUser, setUser } from "../../../src/lib/session";

// ---------------------------------------------------------------------------
// Shared style helpers (same look as signup/login/password-reset)
// ---------------------------------------------------------------------------
const fieldRingStyle = (focused: boolean): React.CSSProperties => ({
  border: `1.5px solid ${focused ? "#2563EB" : "#D1D5DB"}`,
  boxShadow: focused ? "0 0 0 3px rgba(37,99,235,0.12)" : "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
});

const textInputStyle = (focused: boolean): React.CSSProperties => ({
  display: "block",
  width: "100%",
  height: 44,
  padding: "0 0.875rem",
  borderRadius: 12,
  fontSize: "0.875rem",
  color: "#111827",
  backgroundColor: "white",
  outline: "none",
  ...fieldRingStyle(focused),
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: "#f0f5f9" }}
    >
      <div
        className="w-full rounded-2xl shadow-lg overflow-hidden flex flex-col md:flex-row"
        style={{ maxWidth: 900 }}
      >
        {/* Left: the Lewa logo. The art arrives on its own opaque #EFF8FF
            field with a wide margin baked in, so it goes in as the panel's
            background rather than as an <img>: reaching every edge is the
            only way an opaque image meets this panel without showing a seam,
            and it lets the baked-in margin do the centring instead of
            padding. The colour underneath is the image's own field colour, so
            a failed load and a fractional rounding gap both land on the same
            blue -- and it replaces a gradient an opaque image would have
            covered anyway.

            Sized to 150% of the panel width rather than `cover`. That baked-in
            margin leaves cover showing a mark of only about 140px, and since
            cover keys off whichever axis is larger it grows on the taller
            cards -- the same logo at a different size on each of the seven
            pages. A width percentage keys off one axis, so every page matches,
            and the crop can only ever take empty field. backgroundSize rather
            than object-fit because an inline style has nowhere to fall back
            to. */}
        <div
          className="hidden md:flex"
          style={{
            width: "55%",
            backgroundColor: "#EFF8FF",
            backgroundImage: "url('/images/lewa-logo.png')",
            backgroundSize: "150%",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        />
        <div className="flex-1 bg-white flex flex-col justify-center p-6 md:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State 1 — Confirm Email
// ---------------------------------------------------------------------------
function ConfirmEmailStep({
  email,
  startEditing,
  onCodeSent,
  onBackToLogin,
}: {
  email: string;
  startEditing: boolean;
  onCodeSent: (email: string) => void;
  onBackToLogin: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [draftEmail, setDraftEmail] = useState(email);
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async () => {
    setError(null);
    setSending(true);
    try {
      await api.post("/auth/otp/send-code", {});
      onCodeSent(email);
    } catch (err: any) {
      setError(err?.message || "Could not send the code. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleSaveEdit = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = (await api.patch("/auth/pending-email", { email: draftEmail })) as any;
      onCodeSent(res?.email || draftEmail);
    } catch (err: any) {
      setError(err?.message || "Could not update the email. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
        <div style={{ fontSize: "2.75rem", marginBottom: "0.75rem", lineHeight: 1 }}>📧</div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0F172A", margin: "0 0 0.5rem" }}>
          Confirm your email
        </h1>
        <div style={{ fontSize: "0.875rem", color: "#6B7280", lineHeight: 1.6 }}>
          We'll send a 6-digit verification code to this address.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {editing ? (
          <div>
            <label
              className="text-sm font-medium"
              style={{ display: "block", marginBottom: 6, color: "#374151" }}
            >
              Email Address
            </label>
            <input
              type="email"
              value={draftEmail}
              onChange={(e) => setDraftEmail(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={textInputStyle(focused)}
              autoFocus
            />
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <Button
                onClick={handleSaveEdit}
                disabled={saving || !draftEmail.trim()}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 10,
                  backgroundColor: "#1e3a8a",
                  color: "white",
                  opacity: saving || !draftEmail.trim() ? 0.6 : 1,
                }}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setDraftEmail(email);
                  setEditing(false);
                  setError(null);
                }}
                style={{ height: 40, borderRadius: 10 }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.875rem 1rem",
              borderRadius: 12,
              border: "1.5px solid #E5E7EB",
              backgroundColor: "#F9FAFB",
            }}
          >
            <span style={{ fontSize: "0.9375rem", fontWeight: 500, color: "#111827" }}>{email}</span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "#2563EB",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              Edit
            </button>
          </div>
        )}

        {error && (
          <p style={{ fontSize: "0.875rem", color: "#DC2626", textAlign: "center", margin: 0 }}>
            {error}
          </p>
        )}

        {!editing && (
          <Button
            onClick={handleSendCode}
            disabled={sending}
            style={{
              width: "100%",
              height: 44,
              borderRadius: 12,
              backgroundColor: "#1e3a8a",
              color: "white",
              fontWeight: 600,
              fontSize: "0.9375rem",
              opacity: sending ? 0.6 : 1,
            }}
          >
            {sending ? "Sending…" : "Looks good, send code"}
          </Button>
        )}

        <div style={{ textAlign: "center", marginTop: "0.25rem" }}>
          <button
            type="button"
            onClick={onBackToLogin}
            style={{
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: "#2563EB",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            ← Back to Login
          </button>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Root page
// ---------------------------------------------------------------------------
export default function VerifyEmailPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"confirm" | "code">("confirm");
  const [editEmailOnReturn, setEditEmailOnReturn] = useState(false);

  useEffect(() => {
    const token = getToken("school");
    if (!token) {
      router.replace("/school/login");
      return;
    }
    try {
      const user = getUser("school");
      if (!user?.email) {
        router.replace("/school/login");
        return;
      }
      if (user.emailVerified === true) {
        // Forwarded to the app rather than worked out here, because the only
        // thing this page knows about the school is the cached copy in
        // localStorage — and that cannot be trusted to say where an approved,
        // pending or incomplete school belongs. The (app) layout runs the real
        // gate, which asks the server, and lands them in the right place from
        // there.
        //
        // This used to point at "/", back when the root was that gate. It is
        // now the public landing page, so the destination has to be named.
        router.replace(SCHOOL_HOME_PATH);
        return;
      }
      setEmail(user.email);
      setReady(true);
    } catch {
      router.replace("/school/login");
    }
  }, [router]);

  const persistEmail = (newEmail: string) => {
    setEmail(newEmail);
    try {
      const user = getUser("school");
      if (user) {
        user.email = newEmail;
        setUser(user, "school");
      }
    } catch {}
  };

  const handleVerify = async (code: string) => {
    const res = (await api.post("/auth/otp/verify-signup", { code })) as any;
    if (res?.user) {
      setUser(res.user, "school");
      // res.user is re-read by the server AFTER it moves the school out of
      // FAILED, so the status on it is the post-verification one — a school
      // that has just proved its email lands on the KYC form, not back here.
      router.replace(routeForFreshUser(res.user));
    }
  };

  const handleResend = async () => {
    await api.post("/auth/otp/send-code", {});
  };

  const handleBackToLogin = () => {
    // The school session only — a teacher signed in in another tab of this
    // browser keeps theirs.
    clearSession("school");
    router.replace("/school/login");
  };

  if (!ready) {
    return <ContentLoader minHeight={"100vh"} />;
  }

  return (
    <Shell>
      {step === "confirm" ? (
        <ConfirmEmailStep
          email={email}
          startEditing={editEmailOnReturn}
          onCodeSent={(sentEmail) => {
            persistEmail(sentEmail);
            setEditEmailOnReturn(false);
            setStep("code");
          }}
          onBackToLogin={handleBackToLogin}
        />
      ) : (
        <>
          <OtpVerifyScreen
            emoji="📧"
            heading="Check your email"
            subtext={
              <>
                We sent a 6-digit code to
                <br />
                <strong style={{ color: "#374151" }}>{email}</strong>
              </>
            }
            onVerify={handleVerify}
            onResend={handleResend}
            onBack={{
              label: "Wrong email? Edit it",
              onClick: () => {
                setEditEmailOnReturn(true);
                setStep("confirm");
              },
            }}
          />
          <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
            <button
              type="button"
              onClick={handleBackToLogin}
              style={{
                fontSize: "0.8125rem",
                fontWeight: 500,
                color: "#2563EB",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              ← Back to Login
            </button>
          </div>
        </>
      )}
    </Shell>
  );
}
