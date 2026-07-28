/**
 * Shared school-abbreviation algorithm — the frontend mirror of
 * sis-backend/src/utils/schoolAbbreviation.js. This is the ONLY place it
 * should be encoded on this side; used for the instant preview shown when
 * the Settings page's auto-generate toggle is switched back on, before the
 * save round-trip confirms the authoritative, server-computed value.
 *
 * Splits the name on whitespace, drops a fixed set of stop words
 * (case-insensitive), then takes the uppercased first letter of each
 * remaining word.
 */
const STOP_WORDS = new Set(['of', 'and', 'with', 'the', '&']);

export function computeSchoolAbbreviation(name: string): string {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word.toLowerCase()))
    .map((word) => word[0].toUpperCase())
    .join('');
}
