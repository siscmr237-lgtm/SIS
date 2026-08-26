"use client";

import { useState } from "react";
import { platformApi } from "@/lib/platformApi";
import { PasswordField } from "./PasswordField";

/**
 * Setting a password on a school account, from the console.
 *
 * Shared by the staff list and the school detail page so the wording, the
 * confirm step and the "we cannot show you the old one" note cannot drift apart
 * between the two.
 *
 * There is deliberately no "show current password" anywhere, and no field that
 * could hold one. Passwords are stored as one-way bcrypt hashes; the stored
 * value cannot be turned back into a password, and no response from the API
 * carries it. The only possible operation is replacement. The eye toggle on the
 * field below reveals only what has just been typed into it, which is not the
 * same thing.
 */
export function PasswordResetControl({
  endpoint,
  mode,
  subjectName,
  onDone,
}: {
  /** e.g. `/platform/staff/12/password` */
  endpoint: string;
  /**
   * "reset"  — the account already has a login.
   * "create" — it has none, so this GRANTS access. Worded and logged
   *            differently on purpose; the server decides which happened and
   *            says so in its reply.
   */
  mode: "reset" | "create";
  subjectName: string;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const creating = mode === "create";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const res: any = await platformApi.put(endpoint, { newPassword: password });
      setPassword("");
      setOpen(false);
      setMessage({
        ok: true,
        text: res?.action === "login_created"
          ? `Login created for ${subjectName}. They can now sign in.`
          : `Password changed for ${subjectName}.`,
      });
      onDone?.();
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || "Could not set the password." });
    } finally {
      setSaving(false);
    }
  };

  const btn: React.CSSProperties = {
    padding: "6px 11px", borderRadius: 7, fontSize: "0.78rem", cursor: "pointer",
    border: "1px solid #D1D5DB", background: "white", color: "#0F172A", whiteSpace: "nowrap",
  };

  return (
    <div>
      {!open && (
        <button onClick={() => { setOpen(true); setMessage(null); }} style={btn}>
          {creating ? "Create login" : "Change password"}
        </button>
      )}

      {open && (
        <form onSubmit={submit} style={{ minWidth: 210 }}>
          {creating && (
            <p style={{ fontSize: "0.72rem", color: "#B45309", margin: "0 0 6px", lineHeight: 1.45, whiteSpace: "normal" }}>
              This account cannot sign in yet. Setting a password grants access.
            </p>
          )}
          <PasswordField
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            required
            style={{
              width: "100%", padding: "7px 10px", borderRadius: 7,
              border: "1.5px solid #D1D5DB", fontSize: "0.8125rem", background: "white",
            }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
            <button type="submit" disabled={saving}
              style={{ ...btn, background: "#0F172A", color: "white", border: "none" }}>
              {saving ? "Saving..." : creating ? "Create login" : "Set password"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setPassword(""); }} style={btn}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {message && (
        <p style={{
          fontSize: "0.75rem", marginTop: 7, marginBottom: 0, lineHeight: 1.45,
          whiteSpace: "normal", color: message.ok ? "#047857" : "#DC2626",
        }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
