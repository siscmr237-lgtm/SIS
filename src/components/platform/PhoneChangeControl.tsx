"use client";

import { useEffect, useState } from "react";
import { platformApi } from "@/lib/platformApi";
import { PhoneInput, isValidPhone } from "@/components/PhoneInput";

/**
 * Changing a school admin's phone number, from the console.
 *
 * IT IS A LOGIN, NOT A CONTACT DETAIL. AdminUser.phoneNumber is what
 * /auth/login resolves the account by, so the old number stops working the
 * moment this saves and the new one starts. The dialog says so rather than
 * presenting it as an address-book edit, because a team member typing a digit
 * wrong here locks a customer out of their own school.
 *
 * NOT BUILT ON ConfirmActionControl, though it is the same shape of dialog.
 * That component is a confirmation — a fixed question and two buttons — and
 * fitting a form into it would have taken three separate extensions: a content
 * slot, a third `tone` for an action that neither grants nor withdraws school
 * access, and a second trigger style for the bordered button this needs in
 * order to sit beside "Change password". At that point a component of its own
 * is the smaller change. The dialog chrome deliberately matches, so the two
 * still look like one console.
 *
 * THE CURRENT NUMBER IS SHOWN, unlike the password control beside it, which
 * shows nothing. Not an inconsistency: a hash cannot be displayed, a phone
 * number can, and it is the thing a team member on a call needs to read back.
 */
export function PhoneChangeControl({
  adminId,
  adminName,
  currentPhone,
  onSaved,
}: {
  adminId: number | string;
  adminName: string;
  /** Shown read-only. May be a legacy bare national number. */
  currentPhone: string;
  /** Called with the number the server reports after a successful save. */
  onSaved: (phoneNumber: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(currentPhone || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  // Escape closes it, so the dialog is not a mouse-only trap.
  //
  // Unless the country list is open, in which case the Escape belongs to that:
  // Radix's own handler closes the popover, and without this guard the same key
  // press would close the dialog underneath it and throw the edit away. The
  // list is portalled to the body, so it is found by class rather than a ref.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || saving) return;
      if (document.querySelector(".sis-phone-list")) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving]);

  const start = () => {
    // Re-seeded on every open, so a cancelled edit is not still sitting in the
    // field the next time the dialog is opened.
    setPhone(currentPhone || "");
    setError(null);
    setDone(null);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    // The server checks this too. Checking here as well is what turns "that is
    // not a complete phone number" from a round trip into an immediate answer.
    if (!isValidPhone(phone)) {
      setError("Enter a complete phone number for the country selected.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res: any = await platformApi.put(`/platform/school-admins/${adminId}`, {
        phoneNumber: phone,
      });
      const saved = res?.phoneNumber ?? phone;
      onSaved(saved);
      setOpen(false);
      // `changed: false` is the server saying the number it already holds means
      // this one — an untouched dialog saved. Reporting a change there would be
      // a small lie about a login credential, which is no place for one.
      setDone(
        res?.changed === false
          ? `${adminName}'s phone number is unchanged.`
          : `${adminName} now signs in with ${saved}.`,
      );
    } catch (err: any) {
      setError(err?.message || "Could not change the phone number.");
    } finally {
      setSaving(false);
    }
  };

  // Matching PasswordResetControl's trigger exactly — the two buttons sit side
  // by side and must read as a pair, not as one button and something else.
  const btn: React.CSSProperties = {
    padding: "6px 11px", borderRadius: 7, fontSize: "0.78rem", cursor: "pointer",
    border: "1px solid #D1D5DB", background: "white", color: "#0F172A", whiteSpace: "nowrap",
  };

  return (
    <>
      <button type="button" onClick={start} style={btn}>
        Change phone number
      </button>

      {/* Only while the dialog is shut; inside it the same message already sits
          above the buttons, and two copies of one failure reads as two. */}
      {error && !open && (
        <p style={{ fontSize: "0.75rem", color: "#DC2626", margin: "7px 0 0", lineHeight: 1.45 }}>
          {error}
        </p>
      )}
      {done && (
        <p style={{ fontSize: "0.75rem", color: "#047857", margin: "7px 0 0", lineHeight: 1.45 }}>
          {done}
        </p>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`phone-dialog-${adminId}`}
          style={{
            position: "fixed", inset: 0,
            // Under PhoneInput's country list, which sits at 70 so it can clear
            // the app's own layers. A dialog above it would hide the picker.
            zIndex: 50,
            background: "rgba(15,23,42,0.45)",
            display: "grid", placeItems: "center", padding: "1.25rem",
          }}
          onClick={() => {
            if (!saving) setOpen(false);
          }}
        >
          <form
            onSubmit={submit}
            // The country list is portalled to the body but stays a React child
            // of this form, so its clicks bubble here and are stopped. Without
            // this, picking a country would dismiss the dialog.
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 400, background: "white", borderRadius: 14,
              padding: "22px 22px 18px", boxShadow: "0 10px 30px rgba(15,23,42,0.25)",
              textAlign: "left",
            }}
          >
            <h2
              id={`phone-dialog-${adminId}`}
              style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#0F172A", margin: "0 0 6px", lineHeight: 1.45 }}
            >
              Change {adminName}&apos;s phone number
            </h2>
            <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: "0 0 16px", lineHeight: 1.5 }}>
              This is the number they sign in with. The old one stops working as soon as this is saved.
            </p>

            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: "0.75rem", color: "#64748B", display: "block", marginBottom: 4 }}>
                Current number
              </span>
              {/* Read-only, for reference. A disabled input would look like a
                  field somebody forgot to enable; this is plainly a value. */}
              <div style={{
                fontSize: "0.8125rem", color: "#0F172A", background: "#F8FAFC",
                border: "1px solid #E2E8F0", borderRadius: 7, padding: "8px 10px",
                overflowWrap: "anywhere",
              }}>
                {currentPhone || "—"}
              </div>
            </div>

            <label style={{ display: "block", marginBottom: 16 }}>
              <span style={{ fontSize: "0.75rem", color: "#64748B", display: "block", marginBottom: 4 }}>
                New number
              </span>
              <PhoneInput
                value={phone}
                onChange={setPhone}
                disabled={saving}
                required
                radius={8}
                aria-label="New phone number"
              />
            </label>

            {error && (
              <p style={{ fontSize: "0.8125rem", color: "#DC2626", margin: "0 0 12px", lineHeight: 1.45 }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                style={{
                  padding: "8px 14px", borderRadius: 8, border: "1px solid #D1D5DB",
                  background: "white", color: saving ? "#94A3B8" : "#0F172A",
                  fontSize: "0.8125rem", cursor: saving ? "default" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "8px 14px", borderRadius: 8, border: "none",
                  background: saving ? "#94A3B8" : "#0F172A", color: "white",
                  fontSize: "0.8125rem", fontWeight: 600,
                  cursor: saving ? "default" : "pointer",
                }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
