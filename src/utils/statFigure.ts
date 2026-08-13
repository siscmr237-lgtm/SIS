/**
 * How big a money figure can afford to be on a small card.
 *
 * Cards sit two or three to a row and never break onto a second row, so on a
 * phone the number gets very little width — about 93px in a two-up dashboard
 * tile, about 87px in a three-up finance card. A 7-digit "1,939,000" only just
 * fits at 1.25rem; an 8-digit "10,939,000" does not, and a school that has
 * collected ten million is not an unusual school.
 *
 * So the size steps down with length rather than the number being allowed to
 * break, truncate, or widen its column. Measured in CHARACTERS, because that is
 * what actually drives the width: the commas a thousands separator adds cost as
 * much room as the digits do.
 *
 * Shared by the dashboard tiles and the finance cards so the two can never
 * disagree about when a figure has become too long.
 */
export function statValueFontSize(text: string, opts?: { compact?: boolean }): string {
  const n = text.length;
  // `compact` is the three-up scale, one notch down throughout — the same
  // figure has roughly 6px less to live in and no icon beside it to borrow from.
  if (opts?.compact) {
    if (n <= 9) return '1rem';      // 1,939,000
    if (n <= 11) return '0.875rem'; // 10,939,000 · 100,939,000
    if (n <= 14) return '0.75rem';  // 1,000,939,000
    return '0.7rem';
  }
  if (n <= 9) return '1.25rem';
  if (n <= 11) return '1.05rem';
  if (n <= 14) return '0.9rem';
  return '0.8rem';                  // beyond that, something is very wrong anyway
}
