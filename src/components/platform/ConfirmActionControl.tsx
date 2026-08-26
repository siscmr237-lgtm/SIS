"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A console button whose action is worth a second look: trigger, confirmation
 * dialog, in-flight state, and the error if it fails.
 *
 * Extracted when the second such action arrived. Approving a school and
 * sending one back to pending are the same interaction with different words on
 * it, and the alternative was a hundred and fifty duplicated lines of dialog
 * markup whose two copies would drift the first time anyone adjusted the
 * focus handling in one of them.
 *
 * Inline styles rather than the app's component library, matching the rest of
 * the console — none of these pages import from src/components/ui.
 */

/**
 * What the action does to the school on the other end of it. Only the colour
 * differs, but the distinction is the point: green for the button that opens
 * a school's access and amber for the one that closes it again, so a glance is
 * enough to tell which of the two a page is currently offering.
 *
 * Amber and not red for `withdraw`: that one is reversible and touches a single
 * status column, so dressing it as a deletion would cry wolf. Red is kept for
 * `destroy`, which is the case that has no way back — see the note on
 * `typeToConfirm` below, the affordance that comes with it.
 */
export type ConfirmTone = "grant" | "withdraw" | "destroy";

const TONES: Record<ConfirmTone, { base: string; busy: string }> = {
  grant: { base: "#15803D", busy: "#86C79E" },
  withdraw: { base: "#B45309", busy: "#DBB48B" },
  destroy: { base: "#B91C1C", busy: "#DCA0A0" },
};

export function ConfirmActionControl({
  label,
  tone,
  title,
  body,
  confirmLabel,
  busyLabel,
  errorFallback,
  typeToConfirm,
  onConfirm,
}: {
  /** The trigger's text. */
  label: string;
  tone: ConfirmTone;
  /** The dialog's heading — a question, ending in what it will do. */
  title: string;
  /** One line under it, for the consequence the heading does not carry. */
  body: string;
  confirmLabel: string;
  busyLabel: string;
  /** Shown when the thrown error carries no message of its own. */
  errorFallback: string;
  /**
   * A phrase the team member has to TYPE before the confirm button will work.
   *
   * Only for the actions that cannot be undone, and it is not decoration: a
   * confirmation dialog stops the accidental click but not the reflexive
   * second one, which is the whole failure mode for something irreversible.
   * Typing the school's name is the step that cannot be got through without
   * having read which school this is.
   *
   * Matched case-insensitively and ignoring surrounding space. The API asks the
   * same question strictly, so the caller sends the CANONICAL phrase rather
   * than what was typed here — see DeleteSchoolControl.tsx. That keeps this a
   * check on the person's attention while the server's stays a check on the
   * request, and stops the two arguing over capitals.
   *
   * Omit it, and the dialog is the plain two-button confirmation it has always
   * been.
   */
  typeToConfirm?: string;
  /** Resolves on success; the dialog closes. Throws to show the message. */
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const typedRef = useRef<HTMLInputElement | null>(null);
  const titleId = `confirm-${label.replace(/\W+/g, "-").toLowerCase()}`;
  const colour = TONES[tone];

  const armed = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.trim().toLowerCase();

  // Escape closes it, and something takes focus on open — a dialog that can
  // only be dismissed with the mouse is a trap for anyone working from the
  // keyboard. The field takes it when there is one, since it is the next thing
  // that has to happen; otherwise the confirm button does, as before. Not
  // registered while closed, so it cannot swallow an Escape meant for something
  // else on the page.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    if (typedRef.current) typedRef.current.focus();
    else confirmRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving]);

  const run = async () => {
    if (saving || !armed) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || errorFallback);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          // Cleared on every open, so a phrase typed and then cancelled is not
          // still sitting there arming the button next time.
          setTyped("");
          setOpen(true);
        }}
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          border: "none",
          background: colour.base,
          color: "white",
          fontSize: "0.8125rem",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </button>

      {/* Only while the dialog is shut. Inside it the same message is already
          shown above the buttons, and two copies of one failure reads as two
          failures. */}
      {error && !open && (
        <p style={{ fontSize: "0.8125rem", color: "#DC2626", margin: "8px 0 0" }}>{error}</p>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            background: "rgba(15,23,42,0.45)",
            display: "grid",
            placeItems: "center",
            padding: "1.25rem",
          }}
          onClick={() => {
            if (!saving) setOpen(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 400,
              background: "white",
              borderRadius: 14,
              padding: "22px 22px 18px",
              boxShadow: "0 10px 30px rgba(15,23,42,0.25)",
              textAlign: "left",
            }}
          >
            <h2
              id={titleId}
              style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#0F172A", margin: "0 0 8px", lineHeight: 1.45 }}
            >
              {title}
            </h2>
            <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: "0 0 18px", lineHeight: 1.5 }}>
              {body}
            </p>

            {typeToConfirm && (
              <label style={{ display: "block", margin: "0 0 18px" }}>
                <span style={{ fontSize: "0.75rem", color: "#64748B", display: "block", marginBottom: 5, lineHeight: 1.45 }}>
                  Type{" "}
                  <span style={{ color: "#0F172A", fontWeight: 600, overflowWrap: "anywhere" }}>
                    {typeToConfirm}
                  </span>{" "}
                  to confirm
                </span>
                <input
                  ref={typedRef}
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  disabled={saving}
                  // Nothing here is a name a browser should be helpfully filling
                  // in, and a suggestion dropdown over a delete confirmation is
                  // the last place for one.
                  autoComplete="off"
                  spellCheck={false}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: `1px solid ${armed ? "#94A3B8" : "#E2E8F0"}`,
                    fontSize: "0.8125rem",
                    color: "#0F172A",
                    background: saving ? "#F8FAFC" : "white",
                  }}
                />
              </label>
            )}

            {error && (
              <p style={{ fontSize: "0.8125rem", color: "#DC2626", margin: "0 0 12px" }}>{error}</p>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "1px solid #D1D5DB",
                  background: "white",
                  color: saving ? "#94A3B8" : "#0F172A",
                  fontSize: "0.8125rem",
                  cursor: saving ? "default" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                ref={confirmRef}
                onClick={run}
                disabled={saving || !armed}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "none",
                  // Greyed rather than tinted while the phrase is unmatched: the
                  // busy colour is a lighter version of the same hue, and using
                  // it here would read as "working" instead of "not yet".
                  background: !armed ? "#CBD5E1" : saving ? colour.busy : colour.base,
                  color: "white",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: saving || !armed ? "default" : "pointer",
                }}
              >
                {saving ? busyLabel : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
