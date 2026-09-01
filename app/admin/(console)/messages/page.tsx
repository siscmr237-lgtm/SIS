"use client";

import { useCallback, useEffect, useState } from "react";
import { getPlatformUser, platformApi } from "@/lib/platformApi";
import { ContentLoader } from "@/components/ContentLoader";

/**
 * The two-way WhatsApp inbox.
 *
 * WHAT THIS PAGE IS FOR. Parents reply to the messages the product sends them —
 * fee reminders, absence notices, payment confirmations — and until now every
 * one of those replies was discarded by Twilio before it reached anybody. This
 * is where they land, and where the team answers.
 *
 * MEMBERS READ, FOUNDERS REPLY. Answering "what did this parent say?" is support
 * work and a Member needs it. Sending a free-form WhatsApp message to a real
 * family from the school's own number, with no template and no approval step in
 * front of it, is the heaviest action in this console. Hiding the composer from
 * a Member is presentation only: POST /platform/messages/:phone/reply carries
 * requirePlatformFounder, so a Member calling the API directly is refused by the
 * server.
 *
 * THE 24-HOUR WINDOW IS EXPLAINED, NOT HIDDEN. WhatsApp only permits a free-form
 * reply within 24 hours of the parent's own last message. When that has passed
 * the composer stays on screen, disabled, with the reason written out — a reply
 * box that simply vanished would read as a bug, and nobody would learn the rule.
 * The server checks it again at send time regardless, because a thread can sit
 * open while the deadline passes.
 *
 * Inline styles throughout, matching the rest of the console — src/index.css is
 * a frozen pre-compiled artifact and a utility class not already in it renders
 * as nothing at all.
 */

interface Match {
  schoolId: number | null;
  schoolName: string | null;
  studentId: number | null;
  studentName: string | null;
  parentName: string | null;
}

interface Conversation {
  phone: string;
  displayPhone: string;
  matches: Match[];
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastMessageDirection: "inbound" | "outbound";
  unreadCount: number;
}

interface ThreadMessage {
  id: string;
  direction: "inbound" | "outbound";
  at: string;
  body: string;
  status: string | null;
  errorMessage: string | null;
  sentByName: string | null;
}

interface Thread {
  phone: string;
  displayPhone: string;
  matches: Match[];
  messages: ThreadMessage[];
  window: {
    open: boolean;
    reason: string | null;
    lastInboundAt: string | null;
    closesAt: string | null;
    hours: number;
  };
}

const NAVY = "#0f2345";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";

const card: React.CSSProperties = {
  background: "white",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
};

const field: React.CSSProperties = {
  width: "100%",
  padding: "9px 11px",
  borderRadius: 8,
  border: `1.5px solid #D1D5DB`,
  fontSize: "0.875rem",
  background: "white",
  fontFamily: "inherit",
  resize: "vertical",
};

/** "14:32" today, "28 Aug 14:32" otherwise. A full date on every row is noise. */
function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return d.toLocaleString("en-GB", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Who a number belongs to, as one line.
 *
 * "Unmatched" is spelled HERE and not by the server, which returns an empty
 * list. A number nobody recognises is a real and useful state — a wrong number,
 * a stranger, or a parent whose number was never written down — so it is said
 * plainly rather than left blank or filtered out of the list.
 */
function describeMatches(matches: Match[]): { label: string; matched: boolean } {
  if (!matches.length) return { label: "Unmatched number", matched: false };
  const names = [...new Set(matches.map((m) => m.studentName).filter(Boolean))] as string[];
  const schools = [...new Set(matches.map((m) => m.schoolName).filter(Boolean))] as string[];
  const guardian = matches.find((m) => m.parentName)?.parentName;
  const who = names.length
    ? names.join(", ")
    : guardian || "Known guardian";
  return { label: schools.length ? `${who} · ${schools.join(", ")}` : who, matched: true };
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Founder-only composer. Read once on mount, the same way the Reminders page
  // decides whether to show its Edit controls.
  const [canReply, setCanReply] = useState(false);
  useEffect(() => {
    setCanReply(getPlatformUser()?.role === "FOUNDER");
  }, []);

  const loadList = useCallback(() => {
    platformApi
      .get("/platform/messages")
      .then((data) => {
        setConversations(data.conversations);
        setError(null);
      })
      .catch((e) => setError(e?.message || "Could not load the inbox."));
  }, []);
  useEffect(loadList, [loadList]);

  const openThread = useCallback((phone: string) => {
    setSelected(phone);
    setThread(null);
    setThreadError(null);
    setSendError(null);
    setDraft("");
    platformApi
      .get(`/platform/messages/${encodeURIComponent(phone)}`)
      .then((data) => {
        setThread(data);
        // Opening a thread marks it read on the server, so the list's unread
        // badge is now stale. Re-read rather than patching it locally: the two
        // must not be able to disagree.
        loadList();
      })
      .catch((e) => setThreadError(e?.message || "Could not load this conversation."));
  }, [loadList]);

  const send = async () => {
    if (!thread || sending) return;
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setSendError(null);
    try {
      await platformApi.post(`/platform/messages/${encodeURIComponent(thread.phone)}/reply`, { body });
      setDraft("");
      // Re-read rather than appending locally. The reply's status comes from
      // Twilio and can already be a failure by the time this resolves, and a
      // message optimistically drawn as sent that never left would be the worst
      // possible thing for this screen to show.
      openThread(thread.phone);
    } catch (e: any) {
      // Includes WINDOW_CLOSED (the deadline passed while this thread was open)
      // and SEND_FAILED (Twilio refused it). Both carry a sentence from the
      // server; neither is swallowed.
      setSendError(e?.message || "Could not send the reply.");
      // Re-read so a failed outbound row appears in the thread with its error.
      openThread(thread.phone);
    } finally {
      setSending(false);
    }
  };

  if (error) {
    return (
      <div style={{ ...card, padding: 18, color: "#B91C1C" }}>{error}</div>
    );
  }
  if (!conversations) return <ContentLoader />;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: NAVY, margin: 0 }}>Messages</h1>
        <p style={{ color: MUTED, fontSize: "0.875rem", marginTop: 4 }}>
          Replies from parents, and what we have said back. WhatsApp allows a free-form
          reply only within 24 hours of a parent&rsquo;s message.
        </p>
      </div>

      {conversations.length === 0 ? (
        <div style={{ ...card, padding: 24, textAlign: "center", color: MUTED }}>
          <p style={{ margin: 0, fontWeight: 600, color: NAVY }}>No conversations yet.</p>
          <p style={{ margin: "6px 0 0", fontSize: "0.875rem" }}>
            Replies from parents will appear here once the inbound webhook is registered
            in the Twilio Console.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* ── The conversation list ─────────────────────────────────────── */}
          <div style={{ ...card, flex: "1 1 320px", minWidth: 300, maxWidth: 420, overflow: "hidden" }}>
            {conversations.map((c) => {
              const { label, matched } = describeMatches(c.matches);
              const active = c.phone === selected;
              return (
                <button
                  key={c.phone}
                  type="button"
                  onClick={() => openThread(c.phone)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 14px",
                    border: "none",
                    borderBottom: `1px solid ${BORDER}`,
                    background: active ? "#F1F5F9" : "white",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{
                      fontWeight: 600,
                      fontSize: "0.875rem",
                      color: matched ? NAVY : MUTED,
                      fontStyle: matched ? "normal" : "italic",
                    }}>
                      {label}
                    </span>
                    {c.unreadCount > 0 && (
                      <span style={{
                        background: NAVY, color: "white", borderRadius: 999,
                        fontSize: "0.6875rem", fontWeight: 700, padding: "1px 7px", flexShrink: 0,
                      }}>
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: "0.75rem", color: MUTED, marginTop: 2,
                  }}>
                    {c.displayPhone}
                  </div>
                  <div style={{
                    fontSize: "0.8125rem", color: "#334155", marginTop: 4,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {c.lastMessageDirection === "outbound" && (
                      <span style={{ color: MUTED }}>You: </span>
                    )}
                    {c.lastMessagePreview || <span style={{ color: MUTED }}>(no text)</span>}
                  </div>
                  <div style={{ fontSize: "0.6875rem", color: MUTED, marginTop: 3 }}>
                    {when(c.lastMessageAt)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── The thread ────────────────────────────────────────────────── */}
          <div style={{ ...card, flex: "2 1 420px", minWidth: 320, padding: 16 }}>
            {!selected && (
              <p style={{ color: MUTED, margin: 0, fontSize: "0.875rem" }}>
                Choose a conversation to read it.
              </p>
            )}
            {selected && threadError && (
              <p style={{ color: "#B91C1C", margin: 0, fontSize: "0.875rem" }}>{threadError}</p>
            )}
            {selected && !thread && !threadError && <ContentLoader />}

            {thread && (
              <>
                <div style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 10, marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, color: NAVY }}>
                    {describeMatches(thread.matches).label}
                  </div>
                  <div style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: "0.75rem", color: MUTED,
                  }}>
                    {thread.displayPhone}
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {thread.messages.map((m) => {
                    const mine = m.direction === "outbound";
                    const failed = mine && (m.status === "failed_to_send" || m.status === "failed" || m.status === "undelivered");
                    return (
                      <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                        <div style={{
                          maxWidth: "78%",
                          background: mine ? (failed ? "#FEF2F2" : "#EFF6FF") : "#F8FAFC",
                          border: `1px solid ${failed ? "#FCA5A5" : BORDER}`,
                          borderRadius: 10,
                          padding: "8px 11px",
                        }}>
                          <div style={{ fontSize: "0.875rem", color: "#0F172A", whiteSpace: "pre-wrap" }}>
                            {m.body || <span style={{ color: MUTED, fontStyle: "italic" }}>(no text — an image or sticker)</span>}
                          </div>
                          <div style={{ fontSize: "0.6875rem", color: MUTED, marginTop: 4 }}>
                            {when(m.at)}
                            {mine && m.sentByName ? ` · ${m.sentByName}` : ""}
                            {mine && m.status ? ` · ${m.status}` : ""}
                          </div>
                          {/* Shown, never swallowed. A reply that did not arrive
                              has to say so on the message itself. */}
                          {failed && m.errorMessage && (
                            <div style={{ fontSize: "0.6875rem", color: "#B91C1C", marginTop: 3 }}>
                              {m.errorMessage}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ── The composer ──────────────────────────────────────────
                    Present but DISABLED when the window has closed, with the
                    server's own sentence underneath. Removing it would leave
                    somebody wondering where the reply box went. */}
                {!canReply ? (
                  <p style={{ fontSize: "0.8125rem", color: MUTED, margin: 0 }}>
                    Only a Founder can reply to a parent.
                  </p>
                ) : (
                  <div>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      disabled={!thread.window.open || sending}
                      rows={3}
                      placeholder={thread.window.open ? "Write a reply…" : "The 24-hour reply window has closed."}
                      style={{
                        ...field,
                        background: thread.window.open ? "white" : "#F8FAFC",
                        color: thread.window.open ? "#0F172A" : MUTED,
                        cursor: thread.window.open ? "text" : "not-allowed",
                      }}
                    />
                    {!thread.window.open && (
                      <p style={{ fontSize: "0.75rem", color: "#92400E", background: "#FFFBEB",
                        border: "1px solid #FDE68A", borderRadius: 8, padding: "8px 10px", marginTop: 8 }}>
                        {thread.window.reason}
                      </p>
                    )}
                    {sendError && (
                      <p style={{ fontSize: "0.75rem", color: "#B91C1C", marginTop: 8 }}>{sendError}</p>
                    )}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={send}
                        disabled={!thread.window.open || sending || !draft.trim()}
                        style={{
                          background: !thread.window.open || sending || !draft.trim() ? "#CBD5E1" : NAVY,
                          color: "white",
                          border: "none",
                          borderRadius: 8,
                          padding: "8px 18px",
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          fontFamily: "inherit",
                          cursor: !thread.window.open || sending || !draft.trim() ? "not-allowed" : "pointer",
                        }}
                      >
                        {sending ? "Sending…" : "Send"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
