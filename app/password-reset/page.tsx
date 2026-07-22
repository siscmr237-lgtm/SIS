"use client";

import { Button } from "@/components/ui/button";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OtpVerifyScreen } from "../../src/components/OtpVerifyScreen";
import { PasswordHints } from "../../src/components/PasswordHints";
import { api } from "../../src/lib/api";

// ---------------------------------------------------------------------------
// Shared style helpers
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

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------
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
// Step 1 — enter phone number
// ---------------------------------------------------------------------------
function StepPhone({ onSuccess }: { onSuccess: (phone: string) => void }) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/password-reset/request", { phoneNumber: phone });
    } catch {
      // Backend always returns 200 — silently continue
    } finally {
      setLoading(false);
      onSuccess(phone);
    }
  };

  return (
    <>
      <div className="text-center md:text-left" style={{ marginBottom: "1.75rem" }}>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "#0F172A" }}
        >
          Reset your password
        </h1>
        <p className="text-sm" style={{ color: "#6B7280", marginTop: "0.375rem" }}>
          Enter your account phone number and we'll send a reset code to your email.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <div>
          <label
            className="text-sm font-medium"
            style={{ display: "block", marginBottom: 6, color: "#374151" }}
          >
            Phone Number
          </label>
          <input
            type="tel"
            placeholder="Enter your account phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={textInputStyle(focused)}
          />
        </div>

        <Button
          type="submit"
          disabled={loading || !phone.trim()}
          className="w-full font-semibold"
          style={{
            height: 44,
            borderRadius: 12,
            backgroundColor: "#1e3a8a",
            color: "white",
            opacity: loading || !phone.trim() ? 0.6 : 1,
          }}
        >
          {loading ? "Sending…" : "Send reset code"}
        </Button>

        <p className="text-center text-sm text-gray-500">
          <a href="/login" className="font-medium" style={{ color: "#2563EB" }}>
            ← Back to login
          </a>
        </p>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — set new password
// ---------------------------------------------------------------------------
function StepNewPassword({ resetToken }: { resetToken: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const groupBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.post("/password-reset/complete", {
        resetToken,
        newPassword: password,
        confirmPassword: confirm,
      });
      router.replace("/login?message=password_updated");
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="text-center md:text-left" style={{ marginBottom: "1.75rem" }}>
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{ color: "#0F172A" }}
        >
          Set new password
        </h1>
        <p className="text-sm" style={{ color: "#6B7280", marginTop: "0.375rem" }}>
          Choose a strong password for your account.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        {/* New password with live hints */}
        <div>
          <label
            className="text-sm font-medium"
            style={{ display: "block", marginBottom: 6, color: "#374151" }}
          >
            New Password
          </label>
          <div
            onFocus={() => setFocused("pw")}
            onBlur={groupBlur}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              height: 44,
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: "white",
              ...fieldRingStyle(focused === "pw"),
            }}
          >
            <input
              type={showPassword ? "text" : "password"}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
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
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#9CA3AF",
                padding: 4,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                lineHeight: 0,
              }}
            >
              {showPassword ? (
                <EyeOffIcon style={{ width: 16, height: 16 }} />
              ) : (
                <EyeIcon style={{ width: 16, height: 16 }} />
              )}
            </button>
          </div>
          <PasswordHints password={password} />
        </div>

        {/* Confirm password */}
        <div>
          <label
            className="text-sm font-medium"
            style={{ display: "block", marginBottom: 6, color: "#374151" }}
          >
            Confirm Password
          </label>
          <div
            onFocus={() => setFocused("confirm")}
            onBlur={groupBlur}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              height: 44,
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: "white",
              ...fieldRingStyle(focused === "confirm"),
            }}
          >
            <input
              type={showConfirm ? "text" : "password"}
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
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
              onClick={() => setShowConfirm((v) => !v)}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#9CA3AF",
                padding: 4,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                lineHeight: 0,
              }}
            >
              {showConfirm ? (
                <EyeOffIcon style={{ width: 16, height: 16 }} />
              ) : (
                <EyeIcon style={{ width: 16, height: 16 }} />
              )}
            </button>
          </div>
          {/* Mismatch indicator */}
          {confirm && password !== confirm && (
            <p style={{ fontSize: "0.75rem", color: "#DC2626", marginTop: 4 }}>
              Passwords do not match.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button
          type="submit"
          disabled={loading}
          className="w-full font-semibold"
          style={{
            height: 44,
            borderRadius: 12,
            backgroundColor: "#1e3a8a",
            color: "white",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Updating…" : "Update password"}
        </Button>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
// Root page
// ---------------------------------------------------------------------------
type Step =
  | { name: "phone" }
  | { name: "otp"; phone: string }
  | { name: "password"; resetToken: string };

export default function PasswordResetPage() {
  const [step, setStep] = useState<Step>({ name: "phone" });

  const handleOtpVerify = async (code: string) => {
    if (step.name !== "otp") return;
    const res = (await api.post("/password-reset/verify", {
      phoneNumber: step.phone,
      code,
    })) as any;
    setStep({ name: "password", resetToken: res.resetToken });
  };

  const handleOtpResend = async () => {
    if (step.name !== "otp") return;
    await api.post("/password-reset/resend", { phoneNumber: step.phone });
  };

  return (
    <Shell>
      {step.name === "phone" && (
        <StepPhone onSuccess={(phone) => setStep({ name: "otp", phone })} />
      )}

      {step.name === "otp" && (
        <OtpVerifyScreen
          emoji="🔐"
          heading="Enter reset code"
          subtext={
            <>
              Enter the 6-digit code sent to the email on file for
              <br />
              <strong style={{ color: "#374151" }}>{step.phone}</strong>
            </>
          }
          onVerify={handleOtpVerify}
          onResend={handleOtpResend}
          onBack={{ label: "Try a different number", onClick: () => setStep({ name: "phone" }) }}
        />
      )}

      {step.name === "password" && (
        <StepNewPassword resetToken={step.resetToken} />
      )}
    </Shell>
  );
}
