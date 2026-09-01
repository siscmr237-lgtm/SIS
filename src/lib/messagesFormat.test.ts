import test from "node:test";
import assert from "node:assert";

import {
  when,
  clock,
  dayLabel,
  describeMatches,
  parentTitle,
  initials,
  type MatchLike,
} from "./messagesFormat.ts";

/**
 * The first tests in this repo, and deliberately the cheapest kind.
 *
 * They run under `node --test` with nothing installed: Node strips the types and
 * executes the file. No jsdom, no component renderer, no test framework in
 * package.json — which is why the functions under test were pulled out of the
 * page in the first place. A React component test would have needed all three
 * and would mostly have asserted that React renders what it was given.
 *
 * What is worth pinning down here is the labelling, because every wrong answer
 * it can give is a wrong answer that RENDERS FINE: a guardian with three
 * children listed as three people, an unmatched number shown as an empty
 * string, a phone number turned into the initials "+2". None of those throw.
 * Dates are checked against an injected `now` rather than the real clock, so the
 * suite does not start failing at midnight.
 */

const m = (over: Partial<MatchLike> = {}): MatchLike => ({
  schoolName: "Excellence Nursery & Primary School",
  studentName: "Ayuk Ndip",
  parentName: "Mrs Ndip",
  ...over,
});

const NOW = new Date("2026-09-01T14:00:00Z");

// ---------------------------------------------------------------------------
// Who a conversation is filed under
// ---------------------------------------------------------------------------

test("the phone list is titled with the guardian, not the children", () => {
  // The desktop row has space to name the children and their school. A phone
  // row has one line beside an avatar, and the person who wrote belongs in it.
  assert.deepStrictEqual(parentTitle([m()], "+237679379134"), {
    title: "Mrs Ndip",
    matched: true,
  });
});

test("one guardian with three children is titled once, not three times", () => {
  const title = parentTitle(
    [m({ studentName: "Ayuk Ndip" }), m({ studentName: "Bih Ndip" }), m({ studentName: "Che Ndip" })],
    "+237679379134",
  );
  assert.strictEqual(title.title, "Mrs Ndip");
});

test("a matched guardian with no name on file falls back to the children", () => {
  const title = parentTitle(
    [m({ parentName: null, studentName: "Ayuk Ndip" }), m({ parentName: null, studentName: "Bih Ndip" })],
    "+237679379134",
  );
  assert.deepStrictEqual(title, { title: "Ayuk Ndip, Bih Ndip", matched: true });
});

test("an unmatched number is titled with the number itself, plainly", () => {
  // Not blank, not "Unknown", not filtered out of the list.
  assert.deepStrictEqual(parentTitle([], "+237600000000"), {
    title: "+237600000000",
    matched: false,
  });
});

test("the desktop label still names the children and the school", () => {
  // Unchanged behaviour, pinned so the extraction cannot have altered it.
  assert.deepStrictEqual(describeMatches([m()]), {
    label: "Ayuk Ndip · Excellence Nursery & Primary School",
    matched: true,
  });
});

test("the desktop label says \"Unmatched number\" for nobody", () => {
  assert.deepStrictEqual(describeMatches([]), { label: "Unmatched number", matched: false });
});

test("the desktop label names both schools when a number reaches two", () => {
  const label = describeMatches([
    m({ schoolName: "Excellence Nursery & Primary School", studentName: "Ayuk Ndip" }),
    m({ schoolName: "PHOS ACADEMY", studentName: "Bih Tanyi" }),
  ]);
  assert.ok(label.label.includes("Excellence Nursery & Primary School"));
  assert.ok(label.label.includes("PHOS ACADEMY"));
});

test("a match with only a guardian, no student and no school, still reads as somebody", () => {
  assert.deepStrictEqual(describeMatches([{ schoolName: null, studentName: null, parentName: "Mrs Ndip" }]), {
    label: "Mrs Ndip",
    matched: true,
  });
});

// ---------------------------------------------------------------------------
// The avatar placeholder
// ---------------------------------------------------------------------------

test("initials are the first letters of the first two words", () => {
  assert.strictEqual(initials("PHOS ACADEMY"), "PA");
  assert.strictEqual(initials("Brilliant kids nursery and primary school"), "BK");
  assert.strictEqual(initials("Mrs Ndip"), "MN");
});

test("a one-word name gives one initial", () => {
  assert.strictEqual(initials("Excellence"), "E");
});

test("a phone number has no initials, and says so rather than inventing two", () => {
  // "+2" would look like a monogram and mean nothing.
  assert.strictEqual(initials("+237600000000"), "#");
  assert.strictEqual(initials("   "), "#");
  assert.strictEqual(initials(""), "#");
});

test("punctuation and extra spacing do not become initials", () => {
  assert.strictEqual(initials("  Excellence   &   Primary  "), "EP");
});

// ---------------------------------------------------------------------------
// Times and dates
// ---------------------------------------------------------------------------

test("a timestamp from today is just the clock", () => {
  const t = when("2026-09-01T09:05:00Z", NOW);
  assert.match(t, /^\d{2}:\d{2}$/);
});

test("a timestamp from another day carries the date", () => {
  const t = when("2026-08-28T09:05:00Z", NOW);
  assert.ok(t.includes("Aug"), t);
});

test("no timestamp is an empty string, not \"Invalid Date\"", () => {
  assert.strictEqual(when(null, NOW), "");
});

test("clock is always just the time", () => {
  assert.match(clock("2026-08-28T09:05:00Z"), /^\d{2}:\d{2}$/);
});

test("the date divider says Today and Yesterday in words", () => {
  assert.strictEqual(dayLabel("2026-09-01T09:00:00Z", NOW), "Today");
  assert.strictEqual(dayLabel("2026-08-31T09:00:00Z", NOW), "Yesterday");
});

test("an older date in this year is named without the year", () => {
  assert.strictEqual(dayLabel("2026-08-14T09:00:00Z", NOW), "14 August");
});

test("a date in another year carries the year", () => {
  assert.strictEqual(dayLabel("2025-12-14T09:00:00Z", NOW), "14 December 2025");
});

test("the first of the month does not read as yesterday", () => {
  // setDate(0) rolls back across the month boundary. The bug this guards is a
  // divider saying "Yesterday" above a message from five weeks ago.
  const firstOfSeptember = new Date("2026-09-01T14:00:00Z");
  assert.strictEqual(dayLabel("2026-08-31T09:00:00Z", firstOfSeptember), "Yesterday");
  assert.strictEqual(dayLabel("2026-08-01T09:00:00Z", firstOfSeptember), "1 August");
});
