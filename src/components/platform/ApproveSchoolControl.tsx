"use client";

import { useEffect, useRef, useState } from "react";
import { platformApi } from "@/lib/platformApi";

/**
 * Approving a school, from the console.
 *
 * Behind a confirmation because of what it does rather than because it is
 * destructive: it is the single act that opens a school's dashboard, there is
 * no matching unapprove anywhere, and the button sits on a page a team member
 * is otherwise only reading. A one-click grant on a read-only screen is the
 * kind of thing that gets pressed by accident exactly once.
 *
 * The dialog is built here in inline styles rather than pulled from the app's
 * component library, to match the rest of the console — none of these pages
 * import from src/components/ui.
 */
export function ApproveSchoolControl({
  schoolId,
  schoolName,
  onApproved,
}: {
  schoolId: number | string;
  schoolName: string;
  /** Called with the status the server reports after a successful approval. */
  onApproved: (status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

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

  const approve = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res: any = await platformApi.post(`/platform/schools/${schoolId}/approve`);
      setOpen(false);
      // The server is the authority on what the status now is, including the
      // case where somebody else approved it a moment earlier — it answers
      // with APPROVED either way, so the badge tells the truth regardless of
      // which of the two clicks this was.
      onApproved(res?.registrationStatus ?? "APPROVED");
    } catch (e: any) {
      setError(e?.message || "Could not approve this school.");
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
          background: "#15803D",
          color: "white",
          fontSize: "0.8125rem",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Approve School
      </button>

      {error && !open && (
        <p style={{ fontSize: "0.8125rem", color: "#DC2626", margin: "8px 0 0" }}>{error}</p>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="approve-school-title"
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
              id="approve-school-title"
              style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#0F172A", margin: "0 0 8px", lineHeight: 1.45 }}
            >
              Approve {schoolName}? This will give them access to their dashboard.
            </h2>
            <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: "0 0 18px", lineHeight: 1.5 }}>
              There is no undo for this from the console.
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
                onClick={approve}
                disabled={saving}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: saving ? "#86C79E" : "#15803D",
                  color: "white",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  cursor: saving ? "default" : "pointer",
                }}
              >
                {saving ? "Approving..." : "Approve"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
