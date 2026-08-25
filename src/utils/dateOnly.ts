/**
 * The 'YYYY-MM-DD' front of an API date, with any time part dropped.
 *
 * Prisma stores a DateTime column that only ever receives a date-only string as
 * midnight UTC, so it comes back as '2026-08-24T00:00:00.000Z' and anything that
 * printed the raw field showed a timestamp nobody entered. Slicing at the 'T' is
 * deliberate rather than parsing and reformatting: a Date read in the viewer's
 * zone rolls back a day anywhere behind UTC, so the honest answer is the date
 * that was actually recorded, taken straight off the string.
 *
 * A value with no time part is already what this returns, so it is safe on both
 * shapes — which matters because the same record reaches these screens from a
 * fresh fetch and from a form the user just filled in.
 */
export function dateOnly(value: string | null | undefined): string {
  if (!value) return '';
  return String(value).split('T')[0];
}

/**
 * Today as 'YYYY-MM-DD', read off the local calendar rather than the ISO
 * string.
 *
 * new Date().toISOString().split('T')[0] is the older idiom in this codebase and
 * it is wrong for the hour either side of midnight: a school an hour ahead of
 * UTC recording at 00:30 would be offered yesterday as the default. The three
 * local parts give the date the person is actually having.
 */
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
