/**
 * Shared school-abbreviation algorithm and format rules — the frontend mirror of
 * sis-backend/src/utils/schoolAbbreviation.js. This is the ONLY place they
 * should be encoded on this side; used for the suggestion prefilled on the
 * signup form and for the inline check on School Settings.
 *
 * MUST STAY IDENTICAL TO THE BACKEND. The server validates every write, so a
 * drift here does not let a bad value through — it does something more annoying:
 * it shows the person at the screen a green field and then a red error from the
 * API, or refuses something the server would have accepted. Both halves changed
 * together when the range moved to 2–10; if you change one, change the other.
 *
 * THE ABBREVIATION IS THE RECEIPT PREFIX. It used to be a cosmetic label for
 * places the full school name will not fit. Receipts now read "CNPS001", so it
 * is part of a number a parent quotes down a phone line — hence uppercase
 * letters and digits only, with nothing in it that can be misheard as
 * punctuation or lost to a trailing space.
 */
const STOP_WORDS = new Set(['of', 'and', 'with', 'the', '&']);

/**
 * How long an AUTO-DERIVED suggestion may be. Six, because a name like "City of
 * God Bilingual Nursery and Primary School Buea" produces initials long enough
 * to overflow the Dashboard header on mobile.
 *
 * DELIBERATELY SMALLER than the maximum a person may type. The cap on the
 * derivation is a matter of taste about a default; the cap on the field is what
 * the database and the receipt format accept. One school has hand-set
 * "CIGBINAPS" — nine characters — and that is theirs to keep.
 */
export const MAX_ABBREVIATION_LENGTH = 6;

/** What the FIELD accepts, whoever typed it. Mirrors the backend exactly. */
export const ABBREVIATION_MIN_LENGTH = 2;
export const ABBREVIATION_MAX_LENGTH = 10;

/**
 * Uppercase and trim rather than reject. Someone typing "cnps" means CNPS, and
 * case is the one thing that can be corrected without guessing at intent.
 * Everything else — a space, a hyphen — is refused, because "C N P S" and
 * "CN-PS" are genuinely different answers about what goes on the receipt.
 */
export function normalizeSchoolAbbreviation(value: string): string {
  return String(value ?? '').trim().toUpperCase();
}

/** Null when acceptable, otherwise the sentence to show. Normalize first. */
export function validateSchoolAbbreviation(value: string): string | null {
  const v = normalizeSchoolAbbreviation(value);
  if (!v) {
    return 'A school abbreviation is required — it is the prefix on every receipt number.';
  }
  if (!/^[A-Z0-9]+$/.test(v)) {
    return 'A school abbreviation may contain only letters and digits — no spaces, punctuation or symbols.';
  }
  if (v.length < ABBREVIATION_MIN_LENGTH || v.length > ABBREVIATION_MAX_LENGTH) {
    return `A school abbreviation must be between ${ABBREVIATION_MIN_LENGTH} and ${ABBREVIATION_MAX_LENGTH} characters.`;
  }
  return null;
}

/**
 * A SUGGESTION derived from the school name, not an answer.
 *
 * Word-initials with the stop words dropped, truncated to
 * MAX_ABBREVIATION_LENGTH. Two guarantees, both so a suggestion is never
 * something the field would then refuse:
 *
 *   - Only alphanumerics — the first LETTER OR DIGIT of each word, so
 *     "(New) Hope Academy" suggests "NHA" rather than "(HA".
 *   - At least two characters — a one-word name ("Excellence") yields a single
 *     initial, so it falls back to the first three alphanumerics: "EXC".
 *
 * Returns '' only when the name has fewer than two usable characters, in which
 * case there is nothing honest to suggest and the form must ask.
 */
export function computeSchoolAbbreviation(name: string): string {
  const initials = String(name || '')
    .trim()
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word.toLowerCase()))
    .map((word) => (word.toUpperCase().match(/[A-Z0-9]/) || [''])[0])
    .join('')
    .slice(0, MAX_ABBREVIATION_LENGTH);
  if (initials.length >= ABBREVIATION_MIN_LENGTH) return initials;

  const letters = String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (letters.length < ABBREVIATION_MIN_LENGTH) return '';
  return letters.slice(0, 3);
}
