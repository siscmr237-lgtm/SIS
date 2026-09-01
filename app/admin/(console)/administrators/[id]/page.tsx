"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { platformApi } from "@/lib/platformApi";
import { PasswordField } from "@/components/platform/PasswordField";
import { PasswordHints } from "@/components/PasswordHints";
import { ContentLoader } from "@/components/ContentLoader";

/**
 * One administrator's details, with a password reset.
 *
 * Founder-only, enforced by the API on every call here. The "last Founder"
 * protection is likewise server-side: this page simply shows whatever refusal
 * comes back, so disabling the button would be a convenience rather than the
 * guarantee.
 */
interface Admin {
  id: number;
  name: string;
  email: string;
  phoneNumber: string;
  role: "FOUNDER" | "MEMBER";
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

const label: React.CSSProperties = { fontSize: "0.75rem", color: "#64748B", display: "block" };
const value: React.CSSProperties = { fontSize: "0.875rem", color: "#0F172A", marginTop: 2 };
const field: React.CSSProperties = {
  width: "100%", padding: "9px 11px", borderRadius: 8,
  border: "1.5px solid #D1D5DB", fontSize: "0.875rem", marginTop: 5, background: "white",
};
const card: React.CSSProperties = {
  background: "white", border: "1px solid #E2E8F0", borderRadius: 12,
  padding: 18, marginBottom: 16,
};

export default function AdministratorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");

  const [admin, setAdmin] = useState<Admin | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [pwMessage, setPwMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  const [roleMessage, setRoleMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingRole, setSavingRole] = useState(false);

  const load = () => {
    platformApi
      .get(`/platform/admins/${id}`)
      .then(setAdmin)
      .catch((e) => setError(e?.message || "Could not load this administrator."));
  };
  useEffect(() => { if (id) load(); }, [id]);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPw) return;
    setSavingPw(true);
    setPwMessage(null);
    try {
      await platformApi.put(`/platform/admins/${id}/password`, { newPassword });
      setNewPassword("");
      setPwMessage({ ok: true, text: "Password updated." });
    } catch (err: any) {
      setPwMessage({ ok: false, text: err?.message || "Could not change the password." });
    } finally {
      setSavingPw(false);
    }
  };

  const update = async (patch: Record<string, unknown>) => {
    if (savingRole) return;
    setSavingRole(true);
    setRoleMessage(null);
    try {
      const updated = await platformApi.put(`/platform/admins/${id}`, patch);
      setAdmin(updated);
      setRoleMessage({ ok: true, text: "Saved." });
    } catch (err: any) {
      // The last-Founder refusal arrives here, from the server.
      setRoleMessage({ ok: false, text: err?.message || "Could not save." });
    } finally {
      setSavingRole(false);
    }
  };

  if (error) return <p style={{ fontSize: "0.875rem", color: "#DC2626" }}>{error}</p>;
  // The name in the heading below is the administrator's, so it cannot be
  // shown yet; the way back always can.
  if (!admin) {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <button
          onClick={() => router.push("/admin/administrators")}
          style={{ background: "none", border: "none", color: "#64748B", fontSize: "0.8125rem", cursor: "pointer", padding: 0, marginBottom: 12 }}
        >
          ← Administrators
        </button>
        <ContentLoader minHeight={220} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <button
        onClick={() => router.push("/admin/administrators")}
        style={{ background: "none", border: "none", color: "#64748B", fontSize: "0.8125rem", cursor: "pointer", padding: 0, marginBottom: 12 }}
      >
        ← Administrators
      </button>

      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#0F172A", margin: "0 0 18px" }}>{admin.name}</h1>

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          <div><span style={label}>Email</span><div style={{ ...value, overflowWrap: "anywhere" }}>{admin.email}</div></div>
          <div><span style={label}>Phone</span><div style={value}>{admin.phoneNumber}</div></div>
          <div><span style={label}>Team role</span><div style={value}>{admin.role === "FOUNDER" ? "Founder" : "Member"}</div></div>
          <div><span style={label}>Status</span><div style={value}>{admin.isActive ? "Active" : "Disabled"}</div></div>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 12px", color: "#0F172A" }}>Team role</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => update({ role: admin.role === "FOUNDER" ? "MEMBER" : "FOUNDER" })}
            disabled={savingRole}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #D1D5DB", background: "white", fontSize: "0.8125rem", cursor: "pointer" }}
          >
            {admin.role === "FOUNDER" ? "Demote to Member" : "Promote to Founder"}
          </button>
          <button
            onClick={() => update({ isActive: !admin.isActive })}
            disabled={savingRole}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #D1D5DB", background: "white", fontSize: "0.8125rem", cursor: "pointer" }}
          >
            {admin.isActive ? "Disable account" : "Enable account"}
          </button>
        </div>
        {roleMessage && (
          <p style={{ fontSize: "0.8125rem", marginTop: 10, marginBottom: 0, lineHeight: 1.4, color: roleMessage.ok ? "#047857" : "#DC2626" }}>
            {roleMessage.text}
          </p>
        )}
      </div>

      <form onSubmit={changePassword} style={card}>
        <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 12px", color: "#0F172A" }}>
          Change password
        </h2>
        <label style={{ display: "block" }}>
          <span style={{ fontSize: "0.8125rem", color: "#374151" }}>New password</span>
          <PasswordField
            style={field}
            autoComplete="new-password"
            placeholder="Min 5 chars, upper + lower + symbol"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <PasswordHints password={newPassword} />
        </label>
        {pwMessage && (
          <p style={{ fontSize: "0.8125rem", marginTop: 10, marginBottom: 0, lineHeight: 1.4, color: pwMessage.ok ? "#047857" : "#DC2626" }}>
            {pwMessage.text}
          </p>
        )}
        <button
          type="submit"
          disabled={savingPw}
          style={{ marginTop: 14, padding: "8px 14px", borderRadius: 8, border: "none", background: "#0F172A", color: "white", fontSize: "0.8125rem", cursor: "pointer" }}
        >
          {savingPw ? "Saving..." : "Set password"}
        </button>
      </form>
    </div>
  );
}
