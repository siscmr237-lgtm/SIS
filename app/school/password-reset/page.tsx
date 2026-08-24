"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/**
 * Step 1 of two. Ask for an email, ask the backend to mail a link, and say the
 * same thing either way.
 *
 * This page used to take a phone number and walk the visitor through a 6-digit
 * code before letting them choose a password. The link in the email replaces
 * both of those steps: /school/reset-password is where the password is actually
 * set, and the token in that URL is what proves ownership of the mailbox.
 *
 * NOT the same flow as /school/verify-email, which still uses a code and is
 * untouched. That one verifies an address for somebody already signed in; this
 * one lets somebody who cannot sign in back in.
 */

const fieldRingStyle = (focused: boolean): React.CSSProperties => ({
  border: `1.5px solid ${focused ? "#2563EB" : "#D1D5DB"}`,
  boxShadow: focused ? "0 0 0 3px rgba(37,99,235,0.12)" : "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
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
          {/* A transparent-background PNG, so it carries no frame of its own --
              the panel's gradient behind it shows straight through. The width is
              capped rather than filled so the mark keeps roughly the footprint
              the illustration had, and no card changes height. */}
          <img
            src="/images/lewa-logo.png"
            alt="Lewa"
            style={{ width: "100%", maxWidth: 260, height: "auto" }}
          />
        </div>
        <div className="flex-1 bg-white flex flex-col justify-center p-6 md:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function PasswordResetPage() {
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await api.post("/password-reset/request", { email: email.trim() });
    } catch {
      // Swallowed on purpose, and this is the whole point of the flow.
      //
      // The endpoint answers 200 with one fixed message whether or not the
      // address belongs to an account. If it ever fails anyway — the network
      // dropped, the API is down — showing that failure here would still tell a
      // stranger nothing about the address, so there is nothing to gain by
      // distinguishing it, and a visitor who cannot log in does not need a
      // second thing to worry about. The confirmation below is deliberately
      // unconditional.
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  if (sent) {
    return (
      <Shell>
        <div className="text-center md:text-left">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#0F172A" }}>
            Check your email
          </h1>
          <p
            className="text-sm"
            style={{ color: "#6B7280", marginTop: "0.5rem", lineHeight: 1.6 }}
          >
            If that email is registered, you&apos;ll receive a reset link shortly.
          </p>
          <p
            className="text-sm"
            style={{ color: "#6B7280", marginTop: "1rem", lineHeight: 1.6 }}
          >
            The link works once and expires in an hour. If it does not arrive, check
            your spam folder before requesting another.
          </p>

          <div style={{ marginTop: "1.75rem", display: "flex", gap: "1.25rem" }}>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="text-sm font-medium"
              style={{
                color: "#2563EB",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              Use a different email
            </button>
            <a href="/school/login" className="text-sm font-medium" style={{ color: "#6B7280" }}>
              Back to login
            </a>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="text-center md:text-left" style={{ marginBottom: "1.75rem" }}>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#0F172A" }}>
          Reset your password
        </h1>
        <p className="text-sm" style={{ color: "#6B7280", marginTop: "0.375rem" }}>
          Enter the email address on your account and we&apos;ll send you a reset link.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <div>
          <label
            htmlFor="email"
            className="text-sm font-medium"
            style={{ display: "block", marginBottom: 6, color: "#374151" }}
          >
            Email Address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@school.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            required
            style={{
              display: "block",
              width: "100%",
              height: 44,
              padding: "0 1rem",
              borderRadius: 12,
              fontSize: "0.875rem",
              color: "#111827",
              backgroundColor: "white",
              outline: "none",
              ...fieldRingStyle(focused),
            }}
          />
        </div>

        <Button
          type="submit"
          disabled={loading || !email.trim()}
          className="w-full font-semibold"
          style={{
            height: 44,
            borderRadius: 12,
            backgroundColor: "#1e3a8a",
            color: "white",
            opacity: loading || !email.trim() ? 0.6 : 1,
          }}
        >
          {loading ? "Sending…" : "Send reset link"}
        </Button>

        <p className="text-center text-sm text-gray-500">
          <a href="/school/login" className="font-medium" style={{ color: "#2563EB" }}>
            ← Back to login
          </a>
        </p>
      </form>
    </Shell>
  );
}
