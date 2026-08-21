"use client";

import { useEffect, useState } from "react";
import { platformApi, type PlatformUser } from "@/lib/platformApi";

/**
 * Your own account. Available to EVERY platform user whatever their role — a
 * Member cannot reach Administrators at all, so without this page they would
 * have no way to change their own password.
 *
 * Requires the current password, unlike a Founder resetting somebody else's: a
 * borrowed session left open on a desk must not be able to lock its owner out.
 */
export default function AccountPage() {
  const [me, setMe] = useState<PlatformUser | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    platformApi.get("/platform/me").then(setMe).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await platformApi.put("/platform/me/password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setMessage({ ok: true, text: "Password updated." });
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || "Could not change your password." });
    } finally {
      setSaving(false);
    }
  };

  const field: React.CSSProperties = {
    width: "100%", padding: "9px 11px", borderRadius: 8,
    border: "1.5px solid #D1D5DB", fontSize: "0.875rem", marginTop: 5, background: "white",
  };
  const card: React.CSSProperties = {
    background: "white", border: "1px solid #E2E8F0", borderRadius: 12, padding: 18, marginBottom: 16,
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#0F172A", margin: "0 0 18px" }}>My Account</h1>

      {me && (
        <div style={card}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
            <div>
              <span style={{ fontSize: "0.75rem", color: "#64748B", display: "block" }}>Name</span>
              <div style={{ fontSize: "0.875rem", color: "#0F172A", marginTop: 2 }}>{me.name}</div>
            </div>
            <div>
              <span style={{ fontSize: "0.75rem", color: "#64748B", display: "block" }}>Team role</span>
              <div style={{ fontSize: "0.875rem", color: "#0F172A", marginTop: 2 }}>
                {me.role === "FOUNDER" ? "Founder" : "Member"}
              </div>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <span style={{ fontSize: "0.75rem", color: "#64748B", display: "block" }}>Email</span>
              <div style={{ fontSize: "0.875rem", color: "#0F172A", marginTop: 2, overflowWrap: "anywhere" }}>{me.email}</div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={submit} style={card}>
        <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 12px", color: "#0F172A" }}>
          Change my password
        </h2>

        <label style={{ display: "block", marginBottom: 12 }}>
          <span style={{ fontSize: "0.8125rem", color: "#374151" }}>Current password</span>
          <input style={field} type="password" autoComplete="current-password" required
            value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </label>

        <label style={{ display: "block" }}>
          <span style={{ fontSize: "0.8125rem", color: "#374151" }}>New password</span>
          <input style={field} type="password" autoComplete="new-password" required
            value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <span style={{ fontSize: "0.72rem", color: "#94A3B8", display: "block", marginTop: 5, lineHeight: 1.45 }}>
            At least 12 characters with an uppercase, a lowercase, a digit and a symbol. No runs like "abcd"
            and nothing containing your name or email.
          </span>
        </label>

        {message && (
          <p style={{ fontSize: "0.8125rem", marginTop: 10, marginBottom: 0, lineHeight: 1.4, color: message.ok ? "#047857" : "#DC2626" }}>
            {message.text}
          </p>
        )}

        <button type="submit" disabled={saving}
          style={{ marginTop: 14, padding: "8px 14px", borderRadius: 8, border: "none", background: "#0F172A", color: "white", fontSize: "0.8125rem", cursor: "pointer" }}>
          {saving ? "Saving..." : "Change password"}
        </button>
      </form>
    </div>
  );
}
