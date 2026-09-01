"use client";

import { useEffect, useState } from "react";
import { getPlatformUser, platformApi } from "@/lib/platformApi";
import { ContentLoader } from "@/components/ContentLoader";

/**
 * The reminder wording, edited without a deploy.
 *
 * WHAT THIS PAGE ACTUALLY CHANGES. Every push notification the product sends
 * reads its title and body from the ReminderConfig row this page edits, at the
 * moment it sends. So a change here is live on the next scheduled run — there is
 * no build, no release, and no code review between typing a sentence and it
 * arriving on every school's phones. That is the point of the feature and it is
 * also the reason the Edit and toggle controls are Founder-only.
 *
 * MEMBERS SEE EVERYTHING AND CHANGE NOTHING. A Member needs to be able to answer
 * "what did we send them?" during support, which is a read. Hiding the controls
 * is presentation only: PUT /platform/reminders/:key carries
 * requirePlatformFounder, so a Member who calls the API directly is refused by
 * the server.
 *
 * Inline styles throughout, matching the rest of the console — src/index.css is
 * a frozen pre-compiled artifact and a utility class not already in it renders
 * as nothing.
 */

interface Reminder {
  key: string;
  /** The readable name. Served by the API so it cannot drift from the key. */
  label: string;
  title: string;
  body: string;
  enabled: boolean;
  updatedAt: string;
}

const card: React.CSSProperties = {
  background: "white",
  border: "1px solid #E2E8F0",
  borderRadius: 12,
  padding: 18,
  marginBottom: 12,
};

const field: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 8,
  border: "1.5px solid #D1D5DB",
  fontSize: "0.875rem",
  marginTop: 5,
  background: "white",
  fontFamily: "inherit",
};

/**
 * The enable/disable switch.
 *
 * A real <button role="switch"> rather than a styled div: reachable by keyboard,
 * announces its own state through aria-checked, and needs no extra handler for
 * the space bar. Same construction as the school Settings toggle, for the same
 * reason — there is no compiled utility class to lean on.
 */
function Toggle({
  checked,
  disabled,
  busy,
  onChange,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled || busy}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        flexShrink: 0,
        width: 38,
        height: 22,
        borderRadius: 9999,
        border: "1px solid transparent",
        background: checked ? "#0F172A" : "#CBD5E1",
        cursor: disabled || busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
        transition: "background-color 160ms ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          width: 16,
          height: 16,
          borderRadius: 9999,
          background: "white",
          transform: checked ? "translateX(16px)" : "translateX(0)",
          transition: "transform 160ms ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

export default function RemindersPage() {
  const [rows, setRows] = useState<Reminder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Which reminder the dialog is editing, and the draft it holds. The draft is
  // separate from `rows` so that cancelling genuinely discards — editing the row
  // in place and restoring it on cancel is the same thing with an extra copy to
  // get wrong.
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * The role decides whether this page is read-only.
   *
   * Read from the stored session rather than fetched: the console layout has
   * already loaded /platform/me from the server before this page renders, so a
   * second round trip would only slow the page down. It is not a security
   * boundary either way — the API refuses a Member's write regardless — so a
   * tampered localStorage buys a disabled button becoming enabled and then a
   * 403.
   */
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    setCanEdit(getPlatformUser()?.role === "FOUNDER");
  }, []);

  const load = () => {
    platformApi
      .get("/platform/reminders")
      .then((data) => {
        setRows(data);
        setError(null);
      })
      .catch((e) => setError(e?.message || "Could not load the reminders."));
  };
  useEffect(load, []);

  /**
   * Flips one reminder on or off, immediately.
   *
   * Optimistic with a rollback: a switch that waits for a round trip before
   * moving reads as broken. Sends { enabled } alone — never the text — so that
   * toggling a card whose wording somebody else has just changed cannot
   * overwrite their edit with what this browser last saw.
   */
  const toggle = async (row: Reminder, next: boolean) => {
    setBusyKey(row.key);
    setRows((prev) => prev?.map((r) => (r.key === row.key ? { ...r, enabled: next } : r)) ?? prev);
    try {
      const updated = await platformApi.put(`/platform/reminders/${row.key}`, { enabled: next });
      setRows((prev) => prev?.map((r) => (r.key === row.key ? updated : r)) ?? prev);
    } catch (e: any) {
      setRows((prev) => prev?.map((r) => (r.key === row.key ? { ...r, enabled: !next } : r)) ?? prev);
      setError(e?.message || "Could not change that reminder.");
    } finally {
      setBusyKey(null);
    }
  };

  const openEdit = (row: Reminder) => {
    setEditing(row);
    setDraft({ title: row.title, body: row.body });
    setSaveError(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await platformApi.put(`/platform/reminders/${editing.key}`, {
        title: draft.title,
        body: draft.body,
      });
      setRows((prev) => prev?.map((r) => (r.key === updated.key ? updated : r)) ?? prev);
      setEditing(null);
    } catch (err: any) {
      // Kept in the dialog rather than closing it: the typed text is the thing
      // worth not losing, and a refusal is usually something to fix in place
      // (an empty body, a title over the limit).
      setSaveError(err?.message || "Could not save the reminder.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#0F172A", margin: "0 0 4px" }}>
          Reminders
        </h1>
        <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: 0 }}>
          The push notifications schools receive. Changes take effect on the next send — no deploy needed.
          {!canEdit && " Your account can view these but not change them."}
        </p>
      </div>

      {error && (
        <p style={{ fontSize: "0.875rem", color: "#DC2626", marginBottom: 12 }}>{error}</p>
      )}
      {!error && rows === null && <ContentLoader minHeight={200} />}

      {rows?.map((r) => (
        <div
          key={r.key}
          style={{
            ...card,
            // A disabled reminder is greyed out rather than hidden or moved: it
            // still has to be findable, and its position in the list is how
            // somebody recognises it.
            opacity: r.enabled ? 1 : 0.55,
            background: r.enabled ? "white" : "#F8FAFC",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#0F172A" }}>{r.label}</span>
                {!r.enabled && (
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: "#B45309",
                      background: "#FEF3C7",
                      border: "1px solid #FDE68A",
                      borderRadius: 999,
                      padding: "2px 8px",
                    }}
                  >
                    Disabled
                  </span>
                )}
              </div>

              {/* The stored title and body, exactly as they will be sent —
                  placeholders and all. Showing a preview with [N] filled in
                  would hide the one thing an editor needs to see. */}
              <p style={{ fontSize: "0.875rem", color: "#0F172A", margin: "10px 0 2px", fontWeight: 500 }}>
                {r.title}
              </p>
              <p style={{ fontSize: "0.8125rem", color: "#475569", margin: 0, lineHeight: 1.45 }}>
                {r.body}
              </p>

              <p style={{ fontSize: "0.7rem", color: "#94A3B8", margin: "10px 0 0" }}>
                {r.key}
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <Toggle
                checked={r.enabled}
                disabled={!canEdit}
                busy={busyKey === r.key}
                onChange={(next) => toggle(r, next)}
                label={`${r.label} enabled`}
              />
              <button
                type="button"
                onClick={() => openEdit(r)}
                disabled={!canEdit}
                style={{
                  background: "transparent",
                  border: "1px solid #CBD5E1",
                  borderRadius: 8,
                  padding: "6px 12px",
                  fontSize: "0.8125rem",
                  color: canEdit ? "#0F172A" : "#94A3B8",
                  cursor: canEdit ? "pointer" : "default",
                  whiteSpace: "nowrap",
                }}
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      ))}

      {editing && (
        <div
          onClick={() => !saving && setEditing(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.55)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={save}
            style={{ background: "white", borderRadius: 12, padding: 22, width: "100%", maxWidth: 460 }}
          >
            <h2 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 4px", color: "#0F172A" }}>
              {editing.label}
            </h2>
            <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: "0 0 16px" }}>{editing.key}</p>

            <label style={{ display: "block", marginBottom: 12 }}>
              <span style={{ fontSize: "0.8125rem", color: "#374151" }}>Title</span>
              <input
                style={field}
                value={draft.title}
                required
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>

            <label style={{ display: "block", marginBottom: 6 }}>
              <span style={{ fontSize: "0.8125rem", color: "#374151" }}>Body</span>
              <textarea
                style={{ ...field, minHeight: 96, resize: "vertical" }}
                value={draft.body}
                required
                maxLength={1000}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </label>

            {/* The placeholders are the one thing about this form that is not
                self-evident, and getting them wrong sends "[N] records" to a
                real person's phone. Stated next to the field that takes them. */}
            <p style={{ fontSize: "0.75rem", color: "#64748B", margin: "0 0 16px", lineHeight: 1.5 }}>
              [N] = count, [date] = the relevant date. They are replaced with real values when the
              notification is sent; leave them exactly as written.
            </p>

            {saveError && (
              <p style={{ fontSize: "0.8125rem", color: "#DC2626", margin: "0 0 12px" }}>{saveError}</p>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setEditing(null)}
                disabled={saving}
                style={{
                  background: "transparent",
                  border: "1px solid #CBD5E1",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: "0.8125rem",
                  color: "#0F172A",
                  cursor: saving ? "default" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: "#0F172A",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: "0.8125rem",
                  cursor: saving ? "default" : "pointer",
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
