/**
 * Shared academic calendar logic — the frontend mirror of
 * sis-backend/src/utils/academicTerm.js. This is the ONLY place the Sep1/
 * Dec31/Apr15/Jun30/Aug31 boundaries should be encoded on this side; every
 * component that needs "what term/year is it right now" or "what term/year
 * does this school report as current" must go through these functions.
 *
 * Calendar:
 *   Term 1  = Sep 1  – Dec 31
 *   Term 2  = Jan 1  – Apr 15
 *   Term 3  = Apr 16 – Jun 30
 *   Holiday = Jul 1  – Aug 31
 *
 * AN ACADEMIC YEAR RUNS SEPTEMBER THROUGH AUGUST, and the long July–August
 * holiday belongs to the year that has just FINISHED, not the one about to
 * start. So August 2026 is 2025/2026, Holiday — not 2026/2027.
 *
 * Note this is a change: Term 2 used to end on Mar 31, Term 3 ran Apr 1 – Jun 14,
 * and the holiday started on Jun 15.
 *
 * Year and term still move INDEPENDENTLY inside the Holiday window, which is
 * intended: a school may advance its year early during prep and will then show
 * the new year with no active term until 1 September.
 */

export type Term = 'Term 1' | 'Term 2' | 'Term 3';

/**
 * How a term is WRITTEN FOR THE USER. Display-only — the canonical stored
 * value stays 'Term 1'/'Term 2'/'Term 3' everywhere (database columns, query
 * params, <SelectItem value>, PDF filenames), because ledger entries, report
 * cards and test/exams are all filtered by exact string match on it. Only ever
 * pass a term through this at the point it's rendered, never before it's saved
 * or sent to the server.
 *
 * Use this at EVERY site that shows a term so the wording can't drift between
 * screens. Unrecognised values pass through unchanged, so a manually-typed
 * custom term in School Settings still displays as entered.
 */
const TERM_LABELS: Record<string, string> = {
  'Term 1': '1st Term',
  'Term 2': '2nd Term',
  'Term 3': '3rd Term',
};

export function formatTermLabel(term: string | null | undefined): string {
  if (!term) return 'Holiday';
  return TERM_LABELS[term] ?? term;
}

export interface TermAndYear {
  term: Term | null;
  academicYear: string;
}

export interface SchoolTermFields {
  academicYear: string;
  currentTerm: string;
  autoTermEnabled: boolean;
}

/**
 * Pure calendar computation. Returns the term (or null during the Holiday
 * window) and academic year label for the given date. Compute this live/on
 * every render — never stash the result in state that outlives the render it
 * was computed for, or it can silently go stale as the calendar crosses a
 * term boundary while the app stays open.
 */
export function getCurrentTermAndYear(date: Date = new Date()): TermAndYear {
  const month = date.getMonth(); // 0-indexed: 0 = Jan, 11 = Dec
  const day = date.getDate();
  const year = date.getFullYear();

  const isTerm1 = month >= 8; // Sep 1 – Dec 31
  const isTerm2 = (month >= 0 && month <= 2) || (month === 3 && day <= 15); // Jan 1 – Apr 15
  const isTerm3 = (month === 3 && day >= 16) || month === 4 || month === 5; // Apr 16 – Jun 30
  // Remaining window (Jul 1 – Aug 31) is Holiday.

  if (isTerm1) {
    return { term: 'Term 1', academicYear: `${year}/${year + 1}` };
  }
  if (isTerm2 || isTerm3) {
    return { term: isTerm2 ? 'Term 2' : 'Term 3', academicYear: `${year - 1}/${year}` };
  }
  // Holiday (Jul 1 – Aug 31) — the tail of the year that has just finished, so
  // it keeps that year's label and has no active term.
  return { term: null, academicYear: `${year - 1}/${year}` };
}

/**
 * The sentinel stored in `currentTerm` when a school is deliberately on
 * holiday, as opposed to auto-detection returning null for the same window.
 * A real string is needed because the term dropdown has to have a value to
 * select, and because "no row" and "Holiday" must not look identical.
 *
 * Nothing filters records by it — ledger entries, marks and report cards are
 * only ever tagged 'Term 1'/'Term 2'/'Term 3' — so it can never partition data
 * into a term that does not exist.
 */
export const HOLIDAY = 'Holiday';

/** Every value the Current Term dropdown offers, in calendar order. */
export const TERM_OPTIONS: { value: string; label: string }[] = [
  { value: 'Term 1', label: '1st Term' },
  { value: 'Term 2', label: '2nd Term' },
  { value: 'Term 3', label: '3rd Term' },
  { value: HOLIDAY, label: 'Holiday' },
];

/**
 * Resolves what a school should currently display: the live-computed value
 * when autoTermEnabled is on, or the manually stored values exactly as-is
 * otherwise. `term` may be null (Holiday, auto-enabled).
 */
export function resolveSchoolTerm(
  school: Partial<SchoolTermFields> | null | undefined,
  date: Date = new Date()
): TermAndYear {
  // The YEAR always comes from the school's stored active year — it is state that
  // advances through the manual → nudge → auto rollover, never recomputed from
  // today's date. Deriving it here would overrule a school that has chosen to
  // keep working in the old year through August, and would disagree with the
  // server. Mirrors resolveSchoolTerm in sis-backend/src/utils/academicTerm.js.
  //
  // The TERM is unchanged: computed live by date when autoTermEnabled, otherwise
  // the stored value.
  const academicYear = school?.academicYear ?? '';
  if (school?.autoTermEnabled) {
    return { academicYear, term: getCurrentTermAndYear(date).term };
  }
  return {
    academicYear,
    term: (school?.currentTerm as Term) ?? null,
  };
}

/**
 * Same as resolveSchoolTerm, but never returns a null term — for call sites
 * that structurally require a concrete value (e.g. a term filter's default
 * selection). Falls back to the most recently completed term (Term 3 of the
 * academic year just finished) during the Holiday window.
 */
export function resolveEffectiveSchoolTerm(
  school: Partial<SchoolTermFields> | null | undefined,
  date: Date = new Date()
): { term: Term; academicYear: string } {
  const resolved = resolveSchoolTerm(school, date);
  // HOLIDAY is treated exactly like the auto-detected null it stands for.
  // Callers here need something records can actually be filed or filtered
  // under, and nothing is ever tagged 'Holiday'.
  // Cast because `term` is typed Term|null, but a manually stored value is
  // whatever is in the column — HOLIDAY included. The cast documents that the
  // runtime type is wider than the declared one rather than hiding it.
  if (resolved.term && (resolved.term as string) !== HOLIDAY) {
    return { term: resolved.term, academicYear: resolved.academicYear };
  }
  return { term: 'Term 3', academicYear: resolved.academicYear };
}

/**
 * Reads the school's current academic year/term straight out of the locally
 * stored session (auto-resolved if the school has auto-detect on, exactly as
 * stored otherwise) — for defaulting a form's term/year fields. Callers can
 * still freely override either afterward.
 */
export function getDefaultTermFields(): { academicYear: string; term: string } {
  try {
    const userStr = typeof window !== 'undefined' ? window.localStorage.getItem('user') : null;
    const school = userStr ? JSON.parse(userStr)?.School?.[0] : null;
    return resolveEffectiveSchoolTerm(school);
  } catch {
    return { academicYear: '', term: '' };
  }
}
