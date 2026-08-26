"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getPlatformToken, platformLogin } from "@/lib/platformApi";
import { PasswordField } from "@/components/platform/PasswordField";

/**
 * The door. Login and nothing else.
 *
 * No signup link, because there is no signup route to link to. No
 * forgot-password link, because a public reset on this door would be a way to
 * take over an account that can see every school on the platform using only
 * access to a mailbox — a Founder resets a colleague's password from inside the
 * console instead.
 *
 * Styled inline rather than with Tailwind utilities: src/index.css is a frozen
 * pre-compiled build, so a class that is not already in it renders as nothing.
 */
export default function PlatformLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (getPlatformToken()) router.replace("/admin/schools");
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await platformLogin(email.trim(), password);
      router.replace("/admin/schools");
    } catch (err: any) {
      setError(err?.message || "Sign in failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const field: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: "1.5px solid #D1D5DB", fontSize: "0.9rem", marginTop: 6,
    background: "white", color: "#111827",
  };

  return (
    <div
      style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#F0F5F9", padding: 20,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "100%", maxWidth: 380, background: "white",
          borderRadius: 14, padding: "28px 24px",
          boxShadow: "0 4px 16px rgba(15, 23, 42, 0.06)",
        }}
      >
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#111827", margin: 0 }}>
            Team Console
          </h1>
          <p style={{ fontSize: "0.8125rem", color: "#6B7280", margin: "6px 0 0" }}>
            Internal access only.
          </p>
        </div>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#374151" }}>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={field}
            required
          />
        </label>

        <label style={{ display: "block", marginBottom: 18 }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#374151" }}>Password</span>
          <PasswordField
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={field}
            required
          />
        </label>

        {error && (
          <p style={{ fontSize: "0.8125rem", color: "#DC2626", marginBottom: 14, lineHeight: 1.4 }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 8, border: "none",
            background: submitting ? "#64748B" : "#0F172A", color: "white",
            fontSize: "0.9rem", fontWeight: 500,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
