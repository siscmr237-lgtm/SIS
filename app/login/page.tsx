"use client";

import { Button } from "@/components/ui/button";
import { EyeIcon, EyeOffIcon, PhoneIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../src/lib/api";
import {
  AuthDiagnosticEntry,
  clearAuthDiagnostics,
  describeHeldToken,
  readAuthDiagnostics,
  readTokenClaims,
  recordAuthDiagnostic,
} from "../../src/lib/authDiagnostic";

function mapLoginError(err: any): string {
  if (err?.status === 0 || err?.code === 'NETWORK_ERROR') {
    return 'Unable to connect to the server. Please try again in a moment.';
  }
  switch (err?.code) {
    case 'PHONE_NOT_FOUND': return 'No account linked to this number.';
    case 'INVALID_CREDENTIALS': return 'Invalid phone number or password.';
    case 'ACCOUNT_CLOSED': return 'This account has been closed. Contact support if this was a mistake.';
    case 'MISSING_FIELDS': return 'Please enter your phone number and password.';
    case 'SERVER_ERROR': return 'Something went wrong on our end. Please try again shortly.';
    default:
      if (err?.status >= 500) return 'Something went wrong on our end. Please try again shortly.';
      return 'Something went wrong on our end. Please try again shortly.';
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  // TEMPORARY DIAGNOSTIC (see src/lib/authDiagnostic.ts).
  const [diagnostics, setDiagnostics] = useState<AuthDiagnosticEntry[]>([]);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagCopied, setDiagCopied] = useState(false);

  useEffect(() => {
    setDiagnostics(readAuthDiagnostics());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    let shouldCleanUrl = false;
    if (params.get('reason') === 'expired') {
      setSessionMessage('Your session has expired. Please sign in again.');
      shouldCleanUrl = true;
    }
    if (params.get('message') === 'password_updated') {
      setSuccessMessage('Password updated — please sign in with your new password.');
      shouldCleanUrl = true;
    }
    // Strip the query param once read so a refresh or renewed navigation to /login
    // can't get stuck re-showing a banner from a one-time event.
    if (shouldCleanUrl) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (!phoneNumber.trim() || !password.trim()) {
      setError('Please enter your phone number and password.');
      return;
    }

    setLoading(true);
    try {
      // TEMPORARY DIAGNOSTIC — capture what we held BEFORE the login so the
      // recorded entry can prove whether a login actually mints a new token.
      const tokenBefore =
        typeof window !== "undefined" ? window.localStorage.getItem("auth_token") : null;

      const res = await api.post("/auth/login", { phoneNumber, password });
      if ((res as any)?.token) {
        const user = (res as any).user;
        if (typeof window !== "undefined") {
          window.localStorage.setItem("auth_token", (res as any).token);
          window.localStorage.setItem("user", JSON.stringify(user));

          // TEMPORARY DIAGNOSTIC (see src/lib/authDiagnostic.ts). If
          // tokenIatAfter is not newer than tokenIatBefore, login itself is at
          // fault; if it IS newer yet a later api-401 entry reports the older
          // iat again, something overwrote it after the fact.
          const before = readTokenClaims(tokenBefore);
          const after = readTokenClaims((res as any).token);
          recordAuthDiagnostic({
            source: "login",
            reason:
              after?.iat != null && before?.iat != null && after.iat <= before.iat
                ? "login did NOT mint a newer token"
                : "login stored a freshly minted token",
            tokenIatBefore: before?.iat,
            tokenIatAfter: after?.iat,
            ...describeHeldToken((res as any).token),
          });
        }
        if (user?.emailVerified === false) {
          router.replace("/verify-email");
        } else {
          const school = user?.School?.[0];
          router.replace(school?.onboardingCompleted === false ? "/onboarding" : "/");
        }
      } else {
        setError("Something went wrong on our end. Please try again shortly.");
      }
    } catch (err: any) {
      setError(mapLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  const groupBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusedField(null);
  };

  const fieldRing = (field: string): React.CSSProperties => ({
    border: `1.5px solid ${focusedField === field ? "#2563EB" : "#D1D5DB"}`,
    boxShadow:
      focusedField === field ? "0 0 0 3px rgba(37,99,235,0.12)" : "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  });

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: "#f0f5f9" }}
    >
      <div
        className="w-full rounded-2xl shadow-lg overflow-hidden flex flex-col md:flex-row"
        style={{ maxWidth: 900 }}
      >
        {/* Left: illustration */}
        <div
          className="hidden md:flex flex-col items-center justify-center"
          style={{
            width: "55%",
            background:
              "linear-gradient(145deg, #EBF4FF 0%, #F0F9FF 50%, #F8FAFC 100%)",
            padding: "3.5rem",
          }}
        >
          <img
            src="/illustration.svg"
            alt=""
            style={{ width: "100%", maxWidth: 340, height: "auto" }}
          />
        </div>

        {/* Right: form */}
        <div className="flex-1 bg-white flex flex-col justify-center p-6 md:p-8">
          {/* Heading */}
          <div className="text-center md:text-left" style={{ marginBottom: "1.75rem" }}>
            <h1
              className="text-3xl font-bold tracking-tight"
              style={{ color: "#0F172A" }}
            >
              Login
            </h1>
            <p
              className="text-sm"
              style={{ color: "#6B7280", marginTop: "0.375rem" }}
            >
              Welcome back — sign in to your school dashboard
            </p>
          </div>

          {successMessage && (
            <div
              style={{
                marginBottom: "1.25rem",
                padding: "0.75rem 1rem",
                borderRadius: 10,
                backgroundColor: "#F0FDF4",
                border: "1px solid #86EFAC",
                color: "#15803D",
                fontSize: "0.875rem",
              }}
            >
              {successMessage}
            </div>
          )}

          {sessionMessage && (
            <div
              style={{
                marginBottom: "1.25rem",
                padding: "0.75rem 1rem",
                borderRadius: 10,
                backgroundColor: "#FEF3C7",
                border: "1px solid #FCD34D",
                color: "#92400E",
                fontSize: "0.875rem",
              }}
            >
              {sessionMessage}
            </div>
          )}

          {/* ================= TEMPORARY DIAGNOSTIC =================
              Renders only when the app has actually recorded a bounce back to
              this page. Remove together with src/lib/authDiagnostic.ts once the
              "Session expired" cause is confirmed. */}
          {diagnostics.length > 0 && (
            <div
              style={{
                marginBottom: "1.25rem",
                borderRadius: 10,
                border: "1px solid #CBD5E1",
                backgroundColor: "#F8FAFC",
                fontSize: "0.75rem",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => setDiagOpen((v) => !v)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "0.625rem 0.75rem",
                  color: "#334155",
                  fontWeight: 500,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {diagOpen ? "▾" : "▸"} Session diagnostic — {diagnostics.length} event
                {diagnostics.length === 1 ? "" : "s"} recorded (tap to {diagOpen ? "hide" : "view"})
              </button>

              {diagOpen && (
                <div style={{ padding: "0 0.75rem 0.75rem" }}>
                  <pre
                    style={{
                      margin: 0,
                      padding: "0.625rem",
                      backgroundColor: "#0F172A",
                      color: "#E2E8F0",
                      borderRadius: 8,
                      fontSize: "0.6875rem",
                      lineHeight: 1.5,
                      maxHeight: 260,
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {JSON.stringify(diagnostics, null, 2)}
                  </pre>
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={async () => {
                        const text = JSON.stringify(diagnostics, null, 2);
                        try {
                          await navigator.clipboard.writeText(text);
                          setDiagCopied(true);
                          setTimeout(() => setDiagCopied(false), 2000);
                        } catch {
                          // Clipboard is blocked in plenty of mobile contexts —
                          // the <pre> above is always selectable as a fallback.
                          setDiagCopied(false);
                        }
                      }}
                      style={{
                        padding: "0.375rem 0.625rem",
                        borderRadius: 6,
                        border: "1px solid #CBD5E1",
                        backgroundColor: "#FFFFFF",
                        color: "#334155",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                      }}
                    >
                      {diagCopied ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearAuthDiagnostics();
                        setDiagnostics([]);
                        setDiagOpen(false);
                      }}
                      style={{
                        padding: "0.375rem 0.625rem",
                        borderRadius: 6,
                        border: "1px solid #CBD5E1",
                        backgroundColor: "#FFFFFF",
                        color: "#334155",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            {/* Phone Number */}
            <div>
              <label
                className="text-sm font-medium"
                style={{ display: "block", marginBottom: 6, color: "#374151" }}
              >
                Phone Number
              </label>
              <div
                onFocus={() => setFocusedField("phone")}
                onBlur={groupBlur}
                style={{
                  display: "flex",
                  alignItems: "stretch",
                  height: 44,
                  borderRadius: 12,
                  overflow: "hidden",
                  backgroundColor: "white",
                  ...fieldRing("phone"),
                }}
              >
                <select
                  defaultValue="CM +237"
                  aria-label="Country code"
                  style={{
                    border: "none",
                    borderRight: "1px solid #E5E7EB",
                    padding: "0 8px 0 12px",
                    backgroundColor: "#F9FAFB",
                    fontSize: "0.875rem",
                    color: "#374151",
                    outline: "none",
                    minWidth: 90,
                  }}
                >
                  <option>CM +237</option>
                  <option>NG +234</option>
                  <option>GH +233</option>
                </select>
                <div
                  className="relative flex-1"
                  style={{ display: "flex", alignItems: "center" }}
                >
                  <PhoneIcon
                    className="absolute"
                    style={{ left: 12, color: "#9CA3AF", width: 16, height: 16 }}
                  />
                  <input
                    type="tel"
                    placeholder="Enter your phone number"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    style={{
                      flex: 1,
                      height: "100%",
                      paddingLeft: "2.5rem",
                      paddingRight: "0.75rem",
                      border: "none",
                      outline: "none",
                      fontSize: "0.875rem",
                      color: "#111827",
                      background: "transparent",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                className="text-sm font-medium"
                style={{ display: "block", marginBottom: 6, color: "#374151" }}
              >
                Password
              </label>
              <div
                onFocus={() => setFocusedField("password")}
                onBlur={groupBlur}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  height: 44,
                  borderRadius: 12,
                  overflow: "hidden",
                  backgroundColor: "white",
                  ...fieldRing("password"),
                }}
              >
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{
                    flex: 1,
                    height: "100%",
                    paddingLeft: "1rem",
                    paddingRight: "3rem",
                    border: "none",
                    outline: "none",
                    fontSize: "0.875rem",
                    color: "#111827",
                    background: "transparent",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2"
                  style={{
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#9CA3AF",
                    padding: 4,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    lineHeight: 0,
                  }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOffIcon style={{ width: 16, height: 16 }} />
                  ) : (
                    <EyeIcon style={{ width: 16, height: 16 }} />
                  )}
                </button>
              </div>
            </div>

            {/* Forgot password — right-aligned */}
            <div className="flex justify-end">
              <a
                href="/password-reset"
                className="text-sm font-medium"
                style={{ color: "#2563EB" }}
              >
                Forgot your password?
              </a>
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full font-semibold"
              style={{
                height: 44,
                borderRadius: 12,
                backgroundColor: "#1e3a8a",
                color: "white",
                boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </Button>

            <p className="text-center text-sm text-gray-500">
              Don't have an account?{" "}
              <a
                href="/signup"
                className="font-medium"
                style={{ color: "#2563EB" }}
              >
                Sign up
              </a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
