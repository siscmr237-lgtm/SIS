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
 * a school's access and amber for the one that closes it again, so the two are
 * not one mis-aimed click apart on a page that shows them in the same place.
 *
 * Amber and not red: this is reversible and touches a single status column,
 * so dressing it as a deletion would cry wolf.
 */
export type ConfirmTone = "grant" | "withdraw";

const TONES: Record<ConfirmTone, { base: string; busy: string }> = {
  grant: { base: "#15803D", busy: "#86C79E" },
  withdraw: { base: "#B45309", busy: "#DBB48B" },
};

export function ConfirmActionControl({
  label,
  tone,
  title,
  body,
  confirmLabel,
  busyLabel,
  errorFallback,
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
  /** Resolves on success; the dialog closes. Throws to show the message. */
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const titleId = `confirm-${label.replace(/\W+/g, "-").toLowerCase()}`;
  const colour = TONES[tone];

  // Escape closes it, and the confirm button takes focus on open — a dialog
  // that can only be dismissed with the mouse is a trap for anyone working
  // from the keyboard. Not registered while closed, so it cannot swallow an
  // Escape meant for something else on the page.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    confirmRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving]);

  const run = async () => {
    if (saving) return;
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
                disabled={saving}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: saving ? colour.busy : colour.base,
                  color: "white",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: saving ? "default" : "pointer",
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
