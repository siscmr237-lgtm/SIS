"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, MoreVertical, X } from "lucide-react";
import { getPlatformUser, platformApi } from "@/lib/platformApi";
import { ContentLoader } from "@/components/ContentLoader";
import {
  clock,
  dayLabel,
  describeMatches,
  initials,
  parentTitle,
  when,
} from "@/lib/messagesFormat";

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
 * ────────────────────────────────────────────────────────────────────────────
 * TWO LAYOUTS, ONE PAGE, ONE SET OF STATE.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * The desktop layout is two panes side by side — list on the left, thread on the
 * right — and is UNCHANGED from the original build. On a phone that shape put
 * both panes on screen at once, stacked, with no way to get from one to the
 * other and no back control; so below 768px the page is a chat list that
 * navigates INTO a conversation, in the shape a phone messaging app has.
 *
 * The two forms are never both on screen, exactly as the console shell's header
 * and drawer are never both on screen (see (console)/layout.tsx, whose
 * breakpoint this matches). They render from THE SAME STATE — one conversations
 * array, one thread, one draft — so the two cannot disagree about what is
 * selected or what has been typed.
 *
 * Inline styles throughout, matching the rest of the console — src/index.css is
 * a frozen pre-compiled artifact and a utility class not already in it renders
 * as nothing at all. The breakpoint itself therefore has to be a REAL media
 * query in a <style> element, and `display` is deliberately absent from the
 * inline styles of the two elements it switches: an inline declaration outranks
 * a stylesheet and would pin the page to one layout at every width.
 */

interface Match {
  schoolId: number | null;
  schoolName: string | null;
  studentId: number | null;
  studentName: string | null;
  parentName: string | null;
}

/**
 * The school that last messaged this number BEFORE the reply being read — "the
 * school that prompted them to write".
 *
 * INFERRED, and the server says so. A parent's reply carries no reference to
 * what it answers, so the nearest prior send is evidence rather than fact. Null
 * is a real answer: the parent wrote in unprompted.
 */
interface PromptingSchool {
  schoolId: number;
  schoolName: string | null;
  sentAt: string;
  purpose: string;
  logoUrl: string | null;
}

interface ProfileSchool {
  schoolId: number;
  schoolName: string | null;
  childCount: number;
  parentNames: string[];
  logoUrl: string | null;
}

interface ParentProfile {
  phone: string;
  displayPhone: string;
  schools: ProfileSchool[];
  promptingSchool: PromptingSchool | null;
  /** Always true. See the detail sheet, which never renders without saying so. */
  inferred: boolean;
}

interface Conversation {
  phone: string;
  displayPhone: string;
  matches: Match[];
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastMessageDirection: "inbound" | "outbound";
  unreadCount: number;
  promptingSchool: PromptingSchool | null;
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
  profile: ParentProfile;
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

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * The breakpoint, and the only thing that decides which layout is on screen.
 *
 * 768px, matching (console)/layout.tsx exactly: the width at which that shell
 * swaps its inline nav for a hamburger is the width at which this page stops
 * having room for two panes. Two different answers to "is this a phone?" on one
 * screen would be worse than either answer.
 *
 * Real media queries rather than Tailwind's `md:` variants, and `display` kept
 * out of the inline styles on [data-messages-desktop] and [data-messages-mobile]
 * — both for the reasons written out in the console shell. An inline
 * display:flex there would outrank this stylesheet and show both layouts at
 * every width.
 *
 * The mobile pane is a flex COLUMN with its own scrolling message area, so the
 * composer stays put at the bottom of the conversation while the bubbles scroll
 * — which is the behaviour that makes it read as a chat rather than as a long
 * page with a text box at the end of it.
 */
const MESSAGES_CSS = `
  [data-messages-desktop] { display: flex; }
  [data-messages-mobile] { display: none; }
  [data-messages-heading] { display: block; }

  @media (max-width: 767px) {
    [data-messages-desktop] { display: none; }
    [data-messages-mobile] { display: flex; }

    /* An open conversation takes the whole phone screen. The page title stays
       for the LIST, and for every width of the desktop layout, where the list
       is still on screen beside the thread and the title belongs to the page
       rather than to either pane. */
    [data-messages-heading][data-thread-open="true"] { display: none; }

    /* The standing explanation of the 24-hour rule is three lines of prose above
       a chat list on a phone, which is most of the first screen spent on a rule
       that only bites at the moment somebody tries to reply. It is NOT deleted:
       the composer still states it in full, in the server's own words, at the
       moment it applies — which is where it is actually read. The desktop list,
       which has the room, keeps it. */
    [data-messages-subtitle] { display: none; }
  }
`;

/**
 * The pure formatting decisions live in src/lib/messagesFormat.ts, not here.
 *
 * They are the ones with a wrong answer that renders perfectly well — a
 * guardian with three children listed as three people, an unmatched number
 * shown as a blank, a phone number turned into the initials "+2" — so they are
 * kept somewhere a test can reach them without a browser. See the tests beside
 * that file, which run under plain `node --test`.
 */

/**
 * The prompting school's logo, or a placeholder that is never a broken image.
 *
 * THREE STATES, NOT TWO. There is a URL and it loads; there is a URL and it
 * fails (an expired signature, a deleted object); and there is no URL at all —
 * a school with no logo saved, storage unconfigured, or no prompting school
 * because the parent wrote in unprompted. The last two are the ordinary cases
 * and both land on the same lettered chip, which is why the chip is the default
 * and the image is drawn over it only once it has loaded.
 *
 * `onError` flips to the placeholder rather than leaving the browser's own
 * broken-image glyph on a row in somebody's inbox.
 */
function Avatar({
  logoUrl,
  label,
  size,
  round,
}: {
  logoUrl: string | null;
  label: string;
  size: number;
  /** Circular instead of the default rounded square. The small marks beside a
   *  bubble are circles; the identity marks on a row are squircles. */
  round?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  // A new URL deserves a fresh attempt — the old failure was about the old one.
  useEffect(() => setFailed(false), [logoUrl]);

  const box: React.CSSProperties = {
    width: size,
    height: size,
    // A rounded SQUARE, matching the reference: a school's logo is artwork with
    // corners, and a circular crop cuts the ends off a wordmark. The circle is
    // kept for the small per-message marks, where there is nothing to crop.
    borderRadius: round ? "50%" : Math.round(size * 0.28),
    flexShrink: 0,
    objectFit: "cover",
    border: `1px solid ${BORDER}`,
    background: "#F1F5F9",
  };

  if (logoUrl && !failed) {
    return <img src={logoUrl} alt="" onError={() => setFailed(true)} style={box} />;
  }
  return (
    <div
      style={{
        ...box,
        display: "grid",
        placeItems: "center",
        color: NAVY,
        fontWeight: 700,
        fontSize: size <= 40 ? "0.8125rem" : "0.9375rem",
        letterSpacing: "0.02em",
      }}
      aria-hidden="true"
    >
      {initials(label)}
    </div>
  );
}

/**
 * The thread's messages as bubbles.
 *
 * Shared by both layouts so the two cannot drift on the thing that matters —
 * a send failure explained on the desktop and swallowed on a phone would be the
 * worst kind of difference between them.
 *
 * `compact` IS THE PHONE VIEW, AND IT IS THE ONLY THING THAT ADDS ANYTHING.
 * With it false this renders exactly what the desktop pane rendered before the
 * phone layout existed — no date dividers, a uniform corner radius, the full
 * "28 Aug 14:32" stamp on every bubble, and the spacing coming from the
 * parent's gap. That is deliberate: the desktop was not part of this change,
 * and a shared component that quietly restyled it would have made it one.
 *
 * The phone view adds the date dividers and drops the date from each stamp,
 * because a divider directly above a bubble makes repeating the date on it
 * noise; and it gives the outgoing side a squared-off bottom corner, which is
 * what makes a narrow column of bubbles read as a conversation with sides.
 */
function Bubbles({
  messages,
  compact,
  senderLabel,
  senderLogoUrl,
}: {
  messages: ThreadMessage[];
  compact?: boolean;
  /** Who the incoming side is, for the small mark beside their bubbles. */
  senderLabel?: string;
  senderLogoUrl?: string | null;
}) {
  return (
    <>
      {messages.map((m, i) => {
        const mine = m.direction === "outbound";
        const failed = mine && (m.status === "failed_to_send" || m.status === "failed" || m.status === "undelivered");
        // A divider whenever the day changes, and before the first message.
        const newDay = compact
          && (i === 0 || new Date(m.at).toDateString() !== new Date(messages[i - 1]!.at).toDateString());
        // The mark sits beside the FIRST bubble of a run, not every one. A
        // parent sending four lines in a row is one person speaking once, and a
        // column of four identical marks says nothing the first one did not.
        const startsRun = !mine && (i === 0 || messages[i - 1]!.direction !== "inbound" || newDay);
        return (
          <div key={m.id}>
            {newDay && (
              /* A label with a rule either side, as the reference has it —
                 rather than a chip, which sits ON the conversation instead of
                 dividing it. */
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 2px 10px" }}>
                <span style={{ flex: 1, height: 1, background: BORDER }} />
                <span style={{
                  fontSize: "0.625rem", fontWeight: 700, color: NAVY,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                }}>
                  {dayLabel(m.at)}
                </span>
                <span style={{ flex: 1, height: 1, background: BORDER }} />
              </div>
            )}
            <div style={{
              display: "flex",
              justifyContent: mine ? "flex-end" : "flex-start",
              // alignItems and gap are for the per-message mark, which only the
              // phone view draws. Left off the desktop entirely rather than set
              // to a value that happens to look the same: `stretch` is what that
              // pane has always used, and this component must not quietly
              // restyle it.
              ...(compact ? { alignItems: "flex-end" as const, gap: 7, marginBottom: 6 } : {}),
            }}>
              {/* The incoming side's mark. Reserved even when it is not drawn,
                  so the bubbles of one run keep a single left edge instead of
                  stepping in and out. */}
              {compact && !mine && (
                startsRun
                  ? <Avatar logoUrl={senderLogoUrl ?? null} label={senderLabel || "?"} size={26} round />
                  : <span style={{ width: 26, flexShrink: 0 }} aria-hidden="true" />
              )}
              <div style={{
                maxWidth: compact ? "82%" : "78%",
                background: mine ? (failed ? "#FEF2F2" : "#EFF6FF") : "#F8FAFC",
                border: `1px solid ${failed ? "#FCA5A5" : BORDER}`,
                borderRadius: 10,
                ...(compact
                  ? {
                    borderBottomRightRadius: mine ? 3 : 10,
                    borderBottomLeftRadius: mine ? 10 : 3,
                  }
                  : {}),
                padding: "8px 11px",
              }}>
                <div style={{
                  fontSize: "0.875rem", color: "#0F172A", whiteSpace: "pre-wrap",
                  ...(compact ? { wordBreak: "break-word" as const } : {}),
                }}>
                  {m.body || <span style={{ color: MUTED, fontStyle: "italic" }}>(no text — an image or sticker)</span>}
                </div>
                <div style={{ fontSize: "0.6875rem", color: MUTED, marginTop: 4 }}>
                  {compact ? clock(m.at) : when(m.at)}
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
          </div>
        );
      })}
    </>
  );
}

/**
 * The reply box. Shared by both layouts for the same reason the bubbles are:
 * the 24-hour rule and its explanation must read identically on both.
 */
function Composer({
  thread,
  canReply,
  draft,
  setDraft,
  sending,
  sendError,
  onSend,
}: {
  thread: Thread;
  canReply: boolean;
  draft: string;
  setDraft: (v: string) => void;
  sending: boolean;
  sendError: string | null;
  onSend: () => void;
}) {
  if (!canReply) {
    return (
      <p style={{ fontSize: "0.8125rem", color: MUTED, margin: 0 }}>
        Only a Founder can reply to a parent.
      </p>
    );
  }
  const blocked = !thread.window.open || sending || !draft.trim();
  return (
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
          onClick={onSend}
          disabled={blocked}
          style={{
            background: blocked ? "#CBD5E1" : NAVY,
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "8px 18px",
            fontSize: "0.875rem",
            fontWeight: 600,
            fontFamily: "inherit",
            cursor: blocked ? "not-allowed" : "pointer",
          }}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}

/**
 * WHAT WE THINK WE KNOW ABOUT THIS NUMBER, and how much of it is a guess.
 *
 * Every line in here is inferred from digits. Parent rows are scoped per school
 * — there is no cross-school identity record and no join to make — so "the same
 * parent at two schools" means "the same nine digits were typed into two
 * schools' records", which can be wrong in both directions: a recycled number
 * matches a family who no longer holds it, and a parent who gave two schools
 * two different numbers is two people as far as this panel is concerned.
 *
 * So the caveat is not a footnote in small print at the bottom; it is the first
 * thing in the sheet, before the claims it qualifies. Somebody about to act on
 * "this parent has two children at PHOS Academy" should read how that was
 * arrived at before they read the claim.
 *
 * TWO SCHOOLS ARE NEVER COLLAPSED INTO ONE. Each is its own row with its own
 * child count, in the order the server returned them and with nothing implying
 * one is the real one.
 */
function DetailSheet({ profile, onClose }: { profile: ParentProfile; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 60,
        background: "rgba(15, 35, 69, 0.45)",
        display: "flex", alignItems: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        // The sheet itself. Stops the click that would close it.
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "white",
          width: "100%",
          maxHeight: "82vh",
          overflowY: "auto",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: "18px 18px 26px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: NAVY, margin: 0 }}>Conversation details</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: MUTED, display: "flex" }}
          >
            <X size={20} />
          </button>
        </div>

        {/* The caveat, first and unconditional — including when there is nothing
            matched, because "we found nothing" is as much an inference as
            "we found two schools". */}
        <div style={{
          background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10,
          padding: "10px 12px", marginBottom: 16,
        }}>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#92400E", lineHeight: 1.55 }}>
            <strong>Inferred from the phone number.</strong> Parent records are kept per
            school and nothing links them across schools, so everything below is matched
            on digits alone — not a verified identity. It can be wrong if a number has
            changed hands, or if a parent gave two schools different numbers.
          </p>
        </div>

        <Row label="Phone number">
          <span style={{ fontFamily: mono, fontSize: "0.875rem", color: "#0F172A" }}>
            {profile.displayPhone}
          </span>
        </Row>

        <Row label={`Schools matched (${profile.schools.length})`}>
          {profile.schools.length === 0 ? (
            <span style={{ fontSize: "0.8125rem", color: MUTED, fontStyle: "italic" }}>
              No parent record at any school carries this number.
            </span>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {profile.schools.map((s) => (
                <div key={s.schoolId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar logoUrl={s.logoUrl} label={s.schoolName || "?"} size={34} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: NAVY }}>
                      {s.schoolName || `School #${s.schoolId}`}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: MUTED }}>
                      {s.childCount === 0
                        ? "No children on record"
                        : `${s.childCount} ${s.childCount === 1 ? "child" : "children"}`}
                      {s.parentNames.length > 1 && ` · on file as ${s.parentNames.join(", ")}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Row>

        <Row label="Prompted by">
          {profile.promptingSchool ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar
                logoUrl={profile.promptingSchool.logoUrl}
                label={profile.promptingSchool.schoolName || "?"}
                size={34}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: NAVY }}>
                  {profile.promptingSchool.schoolName || `School #${profile.promptingSchool.schoolId}`}
                </div>
                <div style={{ fontSize: "0.75rem", color: MUTED }}>
                  Last messaged them {when(profile.promptingSchool.sentAt)}
                </div>
              </div>
            </div>
          ) : (
            <span style={{ fontSize: "0.8125rem", color: MUTED, fontStyle: "italic" }}>
              No prior message. This parent wrote in unprompted.
            </span>
          )}
        </Row>
      </div>
    </div>
  );
}

/** One labelled block in the detail sheet. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: "0.6875rem", fontWeight: 700, color: MUTED,
        textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
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
  const [detailsOpen, setDetailsOpen] = useState(false);

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
    setDetailsOpen(false);
    platformApi
      .get(`/platform/messages/${encodeURIComponent(phone)}`)
      .then((data) => {
        setThread(data);
        // Opening a thread marks EVERY unread message in it read on the server —
        // one updateMany over the whole thread, not just the latest message — so
        // the list's unread badge is now stale in its entirety. Re-read rather
        // than patching it locally: the two must not be able to disagree, and a
        // badge decremented by one while the server cleared four would be
        // exactly that.
        loadList();
      })
      .catch((e) => setThreadError(e?.message || "Could not load this conversation."));
  }, [loadList]);

  /**
   * Back to the list, on the phone layout.
   *
   * Clears the selection rather than navigating, because the list and the
   * conversation are one page: there is no route to go back to, and pushing one
   * would put a history entry between the inbox and the console's own back
   * behaviour.
   */
  const closeThread = useCallback(() => {
    setSelected(null);
    setThread(null);
    setThreadError(null);
    setDetailsOpen(false);
  }, []);

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

  // The header of the phone conversation view, and the title of its list row,
  // come from the same place so a thread cannot be called one thing in the list
  // and another once it is open.
  const threadTitle = useMemo(
    () => (thread ? parentTitle(thread.matches, thread.displayPhone) : null),
    [thread],
  );

  if (error) {
    return (
      <div style={{ ...card, padding: 18, color: "#B91C1C" }}>{error}</div>
    );
  }
  if (!conversations) return <ContentLoader />;

  const empty = (
    <div style={{ ...card, padding: 24, textAlign: "center", color: MUTED }}>
      <p style={{ margin: 0, fontWeight: 600, color: NAVY }}>No conversations yet.</p>
      <p style={{ margin: "6px 0 0", fontSize: "0.875rem" }}>
        Replies from parents will appear here once the inbound webhook is registered
        in the Twilio Console.
      </p>
    </div>
  );

  return (
    <div>
      <style>{MESSAGES_CSS}</style>

      {/* The page heading. Hidden by CSS — never by unmounting — when a phone has
          a conversation open: a chat under a page title reads as a widget
          embedded in a document rather than as the thing being looked at, while
          on the desktop the list is still beside the thread and the title still
          belongs to the page. One element, two behaviours, so the two layouts
          cannot end up with different words in their heading. */}
      <div
        data-messages-heading
        data-thread-open={selected ? "true" : "false"}
        style={{ marginBottom: 16 }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: NAVY, margin: 0 }}>Messages</h1>
        <p data-messages-subtitle style={{ color: MUTED, fontSize: "0.875rem", marginTop: 4 }}>
          Replies from parents, and what we have said back. WhatsApp allows a free-form
          reply only within 24 hours of a parent&rsquo;s message.
        </p>
      </div>

      {conversations.length === 0 ? (
        empty
      ) : (
        <>
          {/* ══ DESKTOP — two panes, unchanged from the original build ══════ */}
          <div data-messages-desktop style={{ gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
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
                      fontFamily: mono,
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
                      fontFamily: mono,
                      fontSize: "0.75rem", color: MUTED,
                    }}>
                      {thread.displayPhone}
                    </div>
                  </div>

                  {/* gap, not a margin on each bubble — the original spacing,
                      kept exactly. Bubbles adds nothing of its own here. */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                    <Bubbles messages={thread.messages} />
                  </div>

                  {/* ── The composer ──────────────────────────────────────────
                      Present but DISABLED when the window has closed, with the
                      server's own sentence underneath. Removing it would leave
                      somebody wondering where the reply box went. */}
                  <Composer
                    thread={thread}
                    canReply={canReply}
                    draft={draft}
                    setDraft={setDraft}
                    sending={sending}
                    sendError={sendError}
                    onSend={send}
                  />
                </>
              )}
            </div>
          </div>

          {/* ══ MOBILE — a chat list that opens into a conversation ═════════ */}
          <div data-messages-mobile style={{ flexDirection: "column" }}>
            {!selected ? (
              /* ── The chat list ──────────────────────────────────────────── */
              <div style={{ ...card, overflow: "hidden" }}>
                {conversations.map((c, i) => {
                  const { title, matched } = parentTitle(c.matches, c.displayPhone);
                  const unread = c.unreadCount > 0;
                  return (
                    <button
                      key={c.phone}
                      type="button"
                      onClick={() => openThread(c.phone)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        width: "100%",
                        textAlign: "left",
                        padding: "12px 14px",
                        border: "none",
                        borderBottom: i === conversations.length - 1 ? "none" : `1px solid ${BORDER}`,
                        background: "white",
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {/* The prompting school's mark. Its own logo where there is
                          one, initials where there is not, and never a broken
                          image — see Avatar. */}
                      <Avatar
                        logoUrl={c.promptingSchool?.logoUrl ?? null}
                        label={c.promptingSchool?.schoolName || title}
                        size={44}
                      />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                          <span style={{
                            fontWeight: unread ? 700 : 600,
                            fontSize: "0.9375rem",
                            color: matched ? NAVY : MUTED,
                            fontStyle: matched ? "normal" : "italic",
                            // The name is what gets cut, never the timestamp.
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            ...(matched ? {} : { fontFamily: mono, fontSize: "0.875rem" }),
                          }}>
                            {title}
                          </span>
                          <span style={{ fontSize: "0.6875rem", color: MUTED, flexShrink: 0 }}>
                            {when(c.lastMessageAt)}
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                          {/* Two lines of preview, then an ellipsis. The full
                              text is one tap away, and a row that grew to fit a
                              long message would push the next conversation off
                              the screen. */}
                          <span style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: "0.8125rem",
                            color: unread ? "#334155" : MUTED,
                            fontWeight: unread ? 500 : 400,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            lineHeight: 1.35,
                            wordBreak: "break-word",
                          }}>
                            {c.lastMessageDirection === "outbound" && (
                              <span style={{ color: MUTED }}>You: </span>
                            )}
                            {c.lastMessagePreview || <span style={{ color: MUTED }}>(no text)</span>}
                          </span>

                          {unread && (
                            <span style={{
                              background: NAVY, color: "white", borderRadius: 999,
                              fontSize: "0.6875rem", fontWeight: 700,
                              minWidth: 20, height: 20, padding: "0 6px",
                              display: "grid", placeItems: "center", flexShrink: 0,
                            }}>
                              {c.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* ── The conversation ───────────────────────────────────────── */
              <div style={{ ...card, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: "70vh" }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderBottom: `1px solid ${BORDER}`,
                  background: "white",
                }}>
                  <button
                    type="button"
                    onClick={closeThread}
                    aria-label="Back to conversations"
                    style={{
                      background: "none", border: "none", padding: 4, margin: 0,
                      cursor: "pointer", color: NAVY, display: "flex", flexShrink: 0,
                    }}
                  >
                    <ArrowLeft size={22} />
                  </button>

                  <Avatar
                    logoUrl={thread?.profile?.promptingSchool?.logoUrl ?? null}
                    label={thread?.profile?.promptingSchool?.schoolName || threadTitle?.title || "?"}
                    size={38}
                  />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 700, fontSize: "0.9375rem",
                      color: threadTitle?.matched === false ? MUTED : NAVY,
                      fontStyle: threadTitle?.matched === false ? "italic" : "normal",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {threadTitle?.title ?? "…"}
                    </div>
                    {/* The number under the name, always — including when the
                        name IS the number, because a header that dropped it
                        would be the one place in this feature the raw number is
                        not on screen. */}
                    <div style={{ fontFamily: mono, fontSize: "0.75rem", color: MUTED }}>
                      {thread?.displayPhone ?? ""}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDetailsOpen(true)}
                    disabled={!thread}
                    aria-label="Conversation details"
                    style={{
                      background: "none", border: "none", padding: 4, margin: 0,
                      cursor: thread ? "pointer" : "default",
                      color: thread ? NAVY : "#CBD5E1", display: "flex", flexShrink: 0,
                    }}
                  >
                    <MoreVertical size={20} />
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
                  {threadError && (
                    <p style={{ color: "#B91C1C", margin: 0, fontSize: "0.875rem" }}>{threadError}</p>
                  )}
                  {!thread && !threadError && <ContentLoader />}
                  {thread && (
                    <Bubbles
                      messages={thread.messages}
                      compact
                      senderLabel={threadTitle?.title}
                      senderLogoUrl={thread.profile?.promptingSchool?.logoUrl ?? null}
                    />
                  )}
                </div>

                {thread && (
                  <div style={{ borderTop: `1px solid ${BORDER}`, padding: 12, background: "white" }}>
                    <Composer
                      thread={thread}
                      canReply={canReply}
                      draft={draft}
                      setDraft={setDraft}
                      sending={sending}
                      sendError={sendError}
                      onSend={send}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {detailsOpen && thread?.profile && (
        <DetailSheet profile={thread.profile} onClose={() => setDetailsOpen(false)} />
      )}
    </div>
  );
}
