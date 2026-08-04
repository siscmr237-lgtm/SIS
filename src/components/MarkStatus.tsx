'use client';

import { api } from '@/lib/api';
import { useCachedResource } from '@/lib/SisCache';

/**
 * The red "has a zero" dot, shown next to a student's name wherever the fees dot
 * is shown — and alongside it, not instead of it. A student can be both Owing
 * and holding a zero, and both facts have to be visible at once.
 *
 * The value is always the server's `hasZeroMark`, computed in
 * sis-backend/src/utils/zeroMarks.js. Nothing here re-derives it: the client
 * does not hold the marks, and a second implementation would drift.
 *
 * Red is required by the spec and has no brand-palette equivalent, so this is a
 * deliberate off-palette colour — the same #DC2626 the 'No Payment' fee status
 * already uses.
 *
 * Because that fee state is ALSO a red dot, the two are told apart by shape
 * rather than hue: the fees dot is a solid disc, this one is a ring. Side by
 * side they read as two different markers even for someone who cannot separate
 * the reds, and the title/aria-label spell out which is which.
 */

export const ZERO_MARK_COLOR = '#DC2626';

export function ZeroMarkDot({ hasZero }: { hasZero: unknown }) {
  // Anything other than a definite true renders nothing: a student whose marks
  // have not loaded must not be shown a marker that means "has a zero".
  if (hasZero !== true) return null;
  return (
    <sup
      title="Has a score of 0 in at least one assessment"
      aria-label="Has a score of 0 in at least one assessment"
      role="img"
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        // Ring, not disc — what distinguishes it from the fees dot. The border
        // eats the whole radius at this size, so the centre stays background.
        border: `2px solid ${ZERO_MARK_COLOR}`,
        backgroundColor: 'transparent',
        boxSizing: 'border-box',
        marginLeft: 3,
        verticalAlign: 'super',
        flexShrink: 0,
      }}
    />
  );
}

/**
 * Which students hold a zero, by student CODE — for the screens that show a name
 * but whose own rows carry no mark data (class rankings, marks entry, the
 * finance summary). Keyed by code, never by name, since two students can share
 * a name.
 */
export function useStudentsWithZeroMarks(): Set<string> {
  // The same cache entry the Students screen uses, so this costs no extra
  // request on any screen that has already loaded the roster.
  const { data } = useCachedResource<any[]>('students', () => api.get('/students'));
  const set = new Set<string>();
  for (const s of data ?? []) {
    // `id` is the student CODE in API responses (see utils/response.js).
    if (s?.hasZeroMark === true && s?.id) set.add(String(s.id));
  }
  return set;
}
