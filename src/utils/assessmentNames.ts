/**
 * The names an assessment gets when the school does not type one.
 *
 * Naming is OPTIONAL wherever it is collected: a school setting up a term says
 * how many sequence tests and how many exams it runs, and may leave any of the
 * name boxes empty. What comes back has to read like something a person wrote,
 * because these strings are what a report card prints — so the fallback is a
 * real name ("2nd Sequence Test"), never a placeholder like "Test 2".
 *
 * SEQUENCE TESTS number within their TERM and ignore the exams entirely, so the
 * first test of Term 2 is "1st Sequence Test" again rather than "4th".
 *
 * EXAMS are named after the term they close, and whether the term holds one or
 * several changes the name of ALL of them:
 *
 *   Term 1, one exam      -> "1st Term Exam"
 *   Term 1, two exams     -> "1st Term Exam 1", "1st Term Exam 2"
 *   Term 2, three exams   -> "2nd Term Exam 1", "2nd Term Exam 2", "2nd Term Exam 3"
 *
 * That dependency on the count is why a term's defaults are resolved all at once
 * (resolveAssessmentNames) rather than one row at a time: adding a second exam
 * RENAMES the first, and a per-row helper cannot know that.
 *
 * MIRRORS sis-backend/src/utils/assessmentNames.js, and has to keep mirroring
 * it. This copy is what the dialog shows in the name placeholders before a save;
 * that copy is what the server actually writes. A school that sees one name in
 * the box and finds another on the report card has been lied to by the drift
 * between them.
 */

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 11 -> "11th", 21 -> "21st". */
export function ordinal(n: number): string {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  const abs = Math.abs(Math.trunc(num));
  // 11, 12 and 13 take "th" despite ending in 1, 2 and 3 — hence the mod-100
  // check before the mod-10 one.
  const tens = abs % 100;
  if (tens >= 11 && tens <= 13) return `${abs}th`;
  switch (abs % 10) {
    case 1: return `${abs}st`;
    case 2: return `${abs}nd`;
    case 3: return `${abs}rd`;
    default: return `${abs}th`;
  }
}

/**
 * The number in "Term 2", or null for anything not shaped like a term. Null is a
 * real answer rather than a failure: a school on a non-standard calendar can
 * hold a term string this does not parse, and the exam fallback has to cope.
 */
export function termNumberOf(term: string): number | null {
  const m = /(\d+)/.exec(String(term ?? ''));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The default name for the `index`-th (1-based) sequence test of a term. */
export function defaultSequenceTestName(index: number): string {
  return `${ordinal(index)} Sequence Test`;
}

/**
 * The default name for the `index`-th (1-based) exam of `term`, where the term
 * holds `count` exams in all. The count is what decides whether the name carries
 * a trailing number at all.
 */
export function defaultExamName(term: string, index: number, count: number): string {
  const termNo = termNumberOf(term);
  // An unparseable term keeps its own text rather than guessing a number, so
  // "Summer Session" yields "Summer Session Exam", not a wrong ordinal.
  const base = termNo ? `${ordinal(termNo)} Term Exam` : `${String(term ?? '').trim() || 'Term'} Exam`;
  return count > 1 ? `${base} ${index}` : base;
}

export type AssessmentType = 'TEST' | 'EXAM';

export interface AssessmentEntry {
  /** The row this entry edits, or null for one not yet created. */
  id?: number | null;
  /** What the school typed. Empty means "use the default". */
  name?: string;
}

export interface ResolvedAssessment {
  id: number | null;
  name: string;
  type: AssessmentType;
  order: number;
}

/**
 * Resolves a whole term's structure into named, ordered rows: every sequence
 * test first, then every exam, `order` running 1..n across the term.
 *
 * A blank or whitespace-only name is filled from the rules above. A name the
 * school DID type is passed through untouched, including one that happens to
 * look like a default.
 */
export function resolveAssessmentNames(
  term: string,
  tests: AssessmentEntry[],
  exams: AssessmentEntry[],
): ResolvedAssessment[] {
  const testList = Array.isArray(tests) ? tests : [];
  const examList = Array.isArray(exams) ? exams : [];
  const rows: ResolvedAssessment[] = [];

  testList.forEach((entry, i) => {
    const typed = String(entry?.name ?? '').trim();
    rows.push({
      id: entry?.id ?? null,
      name: typed || defaultSequenceTestName(i + 1),
      type: 'TEST',
      order: rows.length + 1,
    });
  });

  examList.forEach((entry, i) => {
    const typed = String(entry?.name ?? '').trim();
    rows.push({
      id: entry?.id ?? null,
      name: typed || defaultExamName(term, i + 1, examList.length),
      type: 'EXAM',
      order: rows.length + 1,
    });
  });

  return rows;
}

// Anchored, and matching the exact spacing the generators above emit, so a
// school's own "Sequence Test 2" or "Term 1 Exam" does not match.
const SEQUENCE_TEST_NAME_PATTERN = /^\d+(?:st|nd|rd|th) Sequence Test$/i;
const TERM_EXAM_NAME_PATTERN = /^\d+(?:st|nd|rd|th) Term Exam(?: \d+)?$/i;

/**
 * Whether this name is one the platform generated rather than one the school
 * typed. Nothing is stored to say which — a column claiming "this name was
 * generated" is one more thing that can disagree with the name itself — so they
 * are told apart by shape.
 *
 * The dialog uses it to decide whether to show a name in its box or leave the
 * box empty with the name as a placeholder. Leaving it empty is what keeps an
 * automatic name automatic: it goes on tracking the row's position instead of
 * freezing into a typed name the first time somebody opens the dialog and saves.
 */
export function isAutoAssessmentName(name: string, type: AssessmentType): boolean {
  const n = String(name ?? '').trim();
  return type === 'EXAM' ? TERM_EXAM_NAME_PATTERN.test(n) : SEQUENCE_TEST_NAME_PATTERN.test(n);
}
