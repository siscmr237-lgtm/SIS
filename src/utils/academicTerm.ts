/**
 * Shared academic calendar logic — the frontend mirror of
 * sis-backend/src/utils/academicTerm.js. This is the ONLY place the Aug15/
 * Dec31/Mar31/Jun14/Aug14 boundaries should be encoded on this side; every
 * component that needs "what term/year is it right now" or "what term/year
 * does this school report as current" must go through these functions.
 *
 * Calendar:
 *   Term 1  = Aug 15 – Dec 31
 *   Term 2  = Jan 1  – Mar 31
 *   Term 3  = Apr 1  – Jun 14
 *   Holiday = Jun 15 – Aug 14 (no active term)
 *
 * Academic year labels span two calendar years (e.g. "2026/2027" starts when
 * Term 1 begins in Aug 2026 and runs through Term 3 in Jun 2027).
 */

export type Term = 'Term 1' | 'Term 2' | 'Term 3';

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

  const isTerm1 = (month === 7 && day >= 15) || month >= 8; // Aug 15 – Dec 31
  const isTerm2 = month >= 0 && month <= 2; // Jan 1 – Mar 31
  const isTerm3 = month === 3 || month === 4 || (month === 5 && day <= 14); // Apr 1 – Jun 14

  if (isTerm1) {
    return { term: 'Term 1', academicYear: `${year}/${year + 1}` };
  }
  if (isTerm2 || isTerm3) {
    return { term: isTerm2 ? 'Term 2' : 'Term 3', academicYear: `${year - 1}/${year}` };
  }
  // Holiday (Jun 15 – Aug 14) — keep displaying the just-completed academic year.
  return { term: null, academicYear: `${year - 1}/${year}` };
}

/**
 * Resolves what a school should currently display: the live-computed value
 * when autoTermEnabled is on, or the manually stored values exactly as-is
 * otherwise. `term` may be null (Holiday, auto-enabled).
 */
export function resolveSchoolTerm(
  school: Partial<SchoolTermFields> | null | undefined,
  date: Date = new Date()
): TermAndYear {
  if (school?.autoTermEnabled) {
    return getCurrentTermAndYear(date);
  }
  return {
    academicYear: school?.academicYear ?? '',
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
  if (resolved.term) return { term: resolved.term, academicYear: resolved.academicYear };
  return { term: 'Term 3', academicYear: resolved.academicYear };
}
