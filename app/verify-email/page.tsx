"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OtpVerifyScreen } from "../../src/components/OtpVerifyScreen";
import { api } from "../../src/lib/api";

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
        <div
          className="hidden md:flex flex-col items-center justify-center"
          style={{
            width: "55%",
            background: "linear-gradient(145deg,#EBF4FF 0%,#F0F9FF 50%,#F8FAFC 100%)",
            padding: "3.5rem",
          }}
        >
          <img
            src="/illustration.svg"
            alt=""
            style={{ width: "100%", maxWidth: 340, height: "auto" }}
          />
        </div>
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
    const token = typeof window !== "undefined" ? window.localStorage.getItem("auth_token") : null;
    if (!token) {
      router.replace("/login");
      return;
    }
    try {
      const userStr = window.localStorage.getItem("user");
      const user = userStr ? JSON.parse(userStr) : null;
      if (!user?.email) {
        router.replace("/login");
        return;
      }
      if (user.emailVerified === true) {
        const school = user?.School?.[0];
        router.replace(school?.onboardingCompleted === false ? "/onboarding" : "/");
        return;
      }
      setEmail(user.email);
      setReady(true);
    } catch {
      router.replace("/login");
    }
  }, [router]);

  const persistEmail = (newEmail: string) => {
    setEmail(newEmail);
    try {
      const userStr = window.localStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        user.email = newEmail;
        window.localStorage.setItem("user", JSON.stringify(user));
      }
    } catch {}
  };

  const handleVerify = async (code: string) => {
    const res = (await api.post("/auth/otp/verify-signup", { code })) as any;
    if (res?.user) {
      window.localStorage.setItem("user", JSON.stringify(res.user));
      const school = res.user?.School?.[0];
      router.replace(school?.onboardingCompleted === false ? "/onboarding" : "/");
    }
  };

  const handleResend = async () => {
    await api.post("/auth/otp/send-code", {});
  };

  const handleBackToLogin = () => {
    try {
      window.localStorage.removeItem("auth_token");
      window.localStorage.removeItem("user");
    } catch {}
    router.replace("/login");
  };

  if (!ready) {
    return <div className="p-6 text-sm text-gray-600">Loading...</div>;
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
