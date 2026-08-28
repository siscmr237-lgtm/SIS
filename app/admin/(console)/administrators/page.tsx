"use client";

import { PhoneInput } from "@/components/PhoneInput";

import Link from "next/link";
import { useEffect, useState } from "react";
import { platformApi } from "@/lib/platformApi";
import { PasswordField } from "@/components/platform/PasswordField";
import { PasswordHints } from "@/components/PasswordHints";
import { ContentLoader } from "@/components/ContentLoader";

/**
 * Founder-only. The menu entry is hidden from a Member, but that is presentation
 * only: GET /platform/admins carries requirePlatformFounder, so a Member who
 * types this URL gets a 403 and the empty state below rather than a list.
 */
interface AdminRow {
  id: number;
  name: string;
  email: string;
  phoneNumber: string;
  role: "FOUNDER" | "MEMBER";
  isActive: boolean;
}

const ROLE_LABEL = { FOUNDER: "Founder", MEMBER: "Member" } as const;

export default function AdministratorsPage() {
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({ name: "", phoneNumber: "", email: "", password: "", role: "MEMBER" });
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    platformApi
      .get("/platform/admins")
      .then(setRows)
      .catch((e) => setError(e?.message || "Could not load team accounts."));
  };
  useEffect(load, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setCreateError(null);
    try {
      await platformApi.post("/platform/admins", form);
      setShowCreate(false);
      setForm({ name: "", phoneNumber: "", email: "", password: "", role: "MEMBER" });
      load();
    } catch (err: any) {
      setCreateError(err?.message || "Could not create the account.");
    } finally {
      setSaving(false);
    }
  };

  const th: React.CSSProperties = {
    textAlign: "left", padding: "10px 14px", fontSize: "0.75rem",
    textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748B",
    borderBottom: "1px solid #E2E8F0", whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "12px 14px", fontSize: "0.875rem", color: "#0F172A",
    borderBottom: "1px solid #F1F5F9", whiteSpace: "nowrap",
  };
  const field: React.CSSProperties = {
    width: "100%", padding: "9px 11px", borderRadius: 8,
    border: "1.5px solid #D1D5DB", fontSize: "0.875rem", marginTop: 5, background: "white",
  };

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#0F172A", margin: "0 0 4px" }}>
            Administrators
          </h1>
          <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: 0 }}>Internal team accounts.</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError(null); }}
          style={{
            background: "#0F172A", color: "white", border: "none", borderRadius: 8,
            padding: "8px 14px", fontSize: "0.8125rem", cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          Add administrator
        </button>
      </div>

      {error && <p style={{ fontSize: "0.875rem", color: "#DC2626" }}>{error}</p>}
      {!error && rows === null && <ContentLoader minHeight={200} />}

      {rows && (
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #E2E8F0", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Team role</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td style={td}>
                    <Link href={`/admin/administrators/${a.id}`} style={{ color: "#1D4ED8", textDecoration: "none" }}>
                      {a.name}
                    </Link>
                    {!a.isActive && (
                      <span style={{ marginLeft: 8, fontSize: "0.7rem", color: "#B45309" }}>disabled</span>
                    )}
                  </td>
                  <td style={td}>{ROLE_LABEL[a.role]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div
          onClick={() => setShowCreate(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)",
            display: "grid", placeItems: "center", padding: 16, zIndex: 50,
          }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={create}
            style={{ background: "white", borderRadius: 12, padding: 22, width: "100%", maxWidth: 400 }}
          >
            <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 16px", color: "#0F172A" }}>
              New administrator
            </h2>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ fontSize: "0.8125rem", color: "#374151" }}>Name</span>
              <input style={field} value={form.name} required
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ fontSize: "0.8125rem", color: "#374151" }}>Phone number</span>
              <PhoneInput value={form.phoneNumber} onChange={(v) => setForm({ ...form, phoneNumber: v })} required radius={8} />
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ fontSize: "0.8125rem", color: "#374151" }}>Email</span>
              <input style={field} type="email" value={form.email} required
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ fontSize: "0.8125rem", color: "#374151" }}>Password</span>
              <PasswordField style={field} value={form.password} required autoComplete="new-password"
                placeholder="Min 5 chars, upper + lower + symbol"
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <PasswordHints password={form.password} />
            </label>

            <label style={{ display: "block", marginBottom: 16 }}>
              <span style={{ fontSize: "0.8125rem", color: "#374151" }}>Team role</span>
              <select style={field} value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="MEMBER">Member</option>
                <option value="FOUNDER">Founder</option>
              </select>
            </label>

            {createError && (
              <p style={{ fontSize: "0.8125rem", color: "#DC2626", marginBottom: 12, lineHeight: 1.4 }}>{createError}</p>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowCreate(false)}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #D1D5DB", background: "white", fontSize: "0.8125rem", cursor: "pointer" }}>
                Cancel
              </button>
              <button type="submit" disabled={saving}
                style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#0F172A", color: "white", fontSize: "0.8125rem", cursor: "pointer" }}>
                {saving ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
