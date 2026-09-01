/**
 * The Messages inbox's pure formatting decisions, out of the component.
 *
 * WHY THESE LIVE HERE. Every function below is a decision about what a person
 * reads on screen — whose name a conversation is filed under, what an unmatched
 * number looks like, which two letters stand in for a school with no logo — and
 * each has a wrong answer that renders perfectly well. A number shown as a blank
 * instead of as itself, or a guardian with three children listed as three
 * people, is not a crash; it is a screen that looks finished and says something
 * false.
 *
 * Pulled out of app/admin/(console)/messages/page.tsx so they can be tested
 * without a browser, a DOM or a component renderer. They take strings and
 * return strings — no React, no hooks, no JSX — which is what lets the tests
 * beside this file run under plain `node --test` with nothing installed.
 *
 * The page still owns everything that draws. This file owns nothing that does.
 */

/** The subset of a match the labelling functions actually read. */
export interface MatchLike {
  schoolName: string | null;
  studentName: string | null;
  parentName: string | null;
}

/** "14:32" today, "28 Aug 14:32" otherwise. A full date on every row is noise. */
export function when(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  return d.toLocaleString("en-GB", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Just the clock, for a bubble that already sits under a date divider. */
export function clock(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * "Today", "Yesterday", or the date — the divider between days in a thread.
 *
 * Spelled out rather than shown as a bare date because the two most common
 * answers by far are the two that a date does not communicate at a glance.
 *
 * `now` is injectable for the same reason replyWindow's is on the server: a
 * function whose answer depends on what day it is cannot be tested at all if it
 * reads the clock itself.
 */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * Who a number belongs to, as one line. THE DESKTOP LIST'S LABEL.
 *
 * "Unmatched" is spelled HERE and not by the server, which returns an empty
 * list. A number nobody recognises is a real and useful state — a wrong number,
 * a stranger, or a parent whose number was never written down — so it is said
 * plainly rather than left blank or filtered out of the list.
 */
export function describeMatches(matches: MatchLike[]): { label: string; matched: boolean } {
  if (!matches.length) return { label: "Unmatched number", matched: false };
  const names = [...new Set(matches.map((m) => m.studentName).filter(Boolean))] as string[];
  const schools = [...new Set(matches.map((m) => m.schoolName).filter(Boolean))] as string[];
  const guardian = matches.find((m) => m.parentName)?.parentName;
  const who = names.length
    ? names.join(", ")
    : guardian || "Known guardian";
  return { label: schools.length ? `${who} · ${schools.join(", ")}` : who, matched: true };
}

/**
 * THE PARENT'S OWN NAME, for the chat list and the conversation header.
 *
 * Deliberately NOT describeMatches, which answers a different question. That one
 * names the CHILDREN and their school, which is what the desktop list needs
 * because it has a full row to say it in. A phone row has one line for a title,
 * next to an avatar, and the thing that belongs there is the person who wrote.
 *
 * Falls back to the raw number, plainly — the same handling as everywhere else
 * in this feature. A number nobody recognises is shown as itself rather than as
 * a blank or an apology.
 */
export function parentTitle(
  matches: MatchLike[],
  displayPhone: string,
): { title: string; matched: boolean } {
  const guardian = matches.find((m) => m.parentName)?.parentName;
  if (guardian) return { title: guardian, matched: true };
  // Matched, but the Parent row carries no name. The children are the most
  // useful thing left to call this conversation.
  const names = [...new Set(matches.map((m) => m.studentName).filter(Boolean))] as string[];
  if (names.length) return { title: names.join(", "), matched: true };
  return { title: displayPhone, matched: false };
}

/**
 * Up to two initials for the avatar placeholder.
 *
 * Letters only, so a phone number does not become "+2" — it has no initials,
 * and "#" says that more honestly than two digits pretending to be a monogram.
 */
export function initials(text: string): string {
  const words = text.trim().split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (!words.length) return "#";
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}
