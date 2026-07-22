"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";

// ---------------------------------------------------------------------------
// OTP box grid
// ---------------------------------------------------------------------------
function OtpBoxes({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focused, setFocused] = useState<number | null>(null);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const handleChange = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    const next = [...value];
    next[i] = digit;
    onChange(next);
    if (digit && i < 5) refs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[i] && i > 0) {
      const next = [...value];
      next[i - 1] = "";
      onChange(next);
      refs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = Array(6).fill("");
    for (let i = 0; i < digits.length; i++) next[i] = digits[i];
    onChange(next);
    refs.current[Math.min(digits.length, 5)]?.focus();
  };

  return (
    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
      {value.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={() => setFocused(i)}
          onBlur={() => setFocused(null)}
          style={{
            width: 46,
            height: 54,
            textAlign: "center",
            fontSize: "1.375rem",
            fontWeight: 700,
            borderRadius: 12,
            border: `2px solid ${
              focused === i ? "#2563EB" : digit ? "#93C5FD" : "#E5E7EB"
            }`,
            outline: "none",
            color: "#0F172A",
            backgroundColor: digit ? "#EFF6FF" : "white",
            transition: "border-color 0.1s, background-color 0.1s",
            cursor: disabled ? "not-allowed" : "text",
            opacity: disabled ? 0.55 : 1,
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------
interface OtpVerifyScreenProps {
  emoji?: string;
  heading: string;
  subtext: React.ReactNode;
  /** Called with the 6-digit code string. Should throw on error, navigate on success. */
  onVerify: (code: string) => Promise<void>;
  /** Called to resend the code. Should throw on error. */
  onResend: () => Promise<void>;
  onBack?: { label: string; onClick: () => void };
  initialCooldown?: number;
}

export function OtpVerifyScreen({
  emoji = "📧",
  heading,
  subtext,
  onVerify,
  onResend,
  onBack,
  initialCooldown = 60,
}: OtpVerifyScreenProps) {
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [resending, setResending] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async (digits: string[]) => {
    const code = digits.join("");
    if (code.length < 6 || submitting.current) return;
    submitting.current = true;
    setError(null);
    setLoading(true);
    try {
      await onVerify(code);
      // on success, parent navigates away — component stays at "Verifying…"
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      if ((err?.message ?? "").toLowerCase().includes("too many")) {
        setOtp(Array(6).fill(""));
      }
      submitting.current = false;
      setLoading(false);
    }
  };

  const handleChange = (digits: string[]) => {
    setOtp(digits);
    if (digits.every((d) => d !== "")) verify(digits);
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    try {
      await onResend();
      setCooldown(60);
      setOtp(Array(6).fill(""));
      submitting.current = false;
    } catch (err: any) {
      setError(err?.message || "Could not resend. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const codeComplete = otp.every((d) => d !== "");

  return (
    <>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
        <div style={{ fontSize: "2.75rem", marginBottom: "0.75rem", lineHeight: 1 }}>{emoji}</div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0F172A", margin: "0 0 0.5rem" }}>
          {heading}
        </h1>
        <div style={{ fontSize: "0.875rem", color: "#6B7280", lineHeight: 1.6 }}>{subtext}</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <OtpBoxes value={otp} onChange={handleChange} disabled={loading} />

        {error && (
          <p style={{ fontSize: "0.875rem", color: "#DC2626", textAlign: "center", margin: 0 }}>
            {error}
          </p>
        )}

        <Button
          onClick={() => verify(otp)}
          disabled={loading || !codeComplete}
          style={{
            width: "100%",
            height: 44,
            borderRadius: 12,
            backgroundColor: "#1e3a8a",
            color: "white",
            fontWeight: 600,
            fontSize: "0.9375rem",
            opacity: loading || !codeComplete ? 0.55 : 1,
            cursor: loading || !codeComplete ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Verifying…" : "Verify code"}
        </Button>

        {/* Resend row */}
        <div style={{ textAlign: "center" }}>
          {cooldown > 0 ? (
            <p style={{ fontSize: "0.875rem", color: "#9CA3AF", margin: 0 }}>
              Resend code in {cooldown}s
            </p>
          ) : (
            <button
              onClick={handleResend}
              disabled={resending}
              style={{
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "#2563EB",
                background: "transparent",
                border: "none",
                cursor: resending ? "not-allowed" : "pointer",
                opacity: resending ? 0.6 : 1,
              }}
            >
              {resending ? "Sending…" : "Resend code"}
            </button>
          )}
        </div>

        {/* Back link */}
        {onBack && (
          <div style={{ textAlign: "center" }}>
            <button
              onClick={onBack.onClick}
              style={{
                fontSize: "0.8125rem",
                color: "#9CA3AF",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              ← {onBack.label}
            </button>
          </div>
        )}

        {/* Having trouble section */}
        <div
          style={{
            paddingTop: "1.25rem",
            borderTop: "1px solid #F3F4F6",
            marginTop: "0.25rem",
          }}
        >
          <p
            style={{
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "#374151",
              margin: "0 0 0.625rem",
            }}
          >
            Having trouble receiving your code?
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <a
              href="https://wa.me/237679379134"
              target="_blank"
              rel="noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                borderRadius: 8,
                backgroundColor: "#F0FDF4",
                border: "1px solid #BBF7D0",
                textDecoration: "none",
                fontSize: "0.8125rem",
                color: "#15803D",
                fontWeight: 500,
              }}
            >
              <span style={{ fontSize: "1rem" }}>📱</span>
              WhatsApp / Call: +237 679 379 134
            </a>
            <a
              href="mailto:siscmr237@gmail.com"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                borderRadius: 8,
                backgroundColor: "#EFF6FF",
                border: "1px solid #BFDBFE",
                textDecoration: "none",
                fontSize: "0.8125rem",
                color: "#1D4ED8",
                fontWeight: 500,
              }}
            >
              <span style={{ fontSize: "1rem" }}>✉️</span>
              siscmr237@gmail.com
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
