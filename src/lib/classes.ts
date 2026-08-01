"use client";

/**
 * Class-name helpers.
 *
 * There is deliberately NO hardcoded list of class levels here any more. Every
 * screen that offers a class to pick must read the school's own Class rows
 * (`GET /classes`, which the server scopes to the caller's schoolId) via
 * `useSchoolClassNames()` below. A flat literal cannot express either of the
 * two things that vary per school:
 *
 *   - school type — a DAYCARE_NURSERY school has no Class 1–6 at all;
 *   - sections — "Nursery 1" may exist as "Nursery 1 A" and "Nursery 1 B".
 *
 * The authoritative list of which LEVELS a school type may have lives in one
 * place, sis-backend/src/utils/classCatalog.js, exposed as
 * `GET /onboarding/class-catalog?schoolType=…`. Fetch that rather than
 * mirroring it here, so the two can never drift.
 */

import { api } from './api';
import { useCachedResource } from './SisCache';

/**
 * Separator between a level and its section letter, e.g. "Day Care" + " " + "A".
 * Kept in one place because the value is not cosmetic: class names are stored
 * as plain strings on Student.class and matched by exact text by rosters,
 * filters, report cards and ranking, so changing it means migrating both the
 * Class rows and every Student pointing at them.
 */
export const SECTION_SEPARATOR = ' ';

/** Name of the i-th section (0 -> "A") of a level. */
export function sectionName(level: string, index: number): string {
  return `${level}${SECTION_SEPARATOR}${String.fromCharCode(65 + index)}`;
}

export interface SchoolClass {
  id: number;
  name: string;
}

/**
 * This school's real classes. Shares the same cache entry as every other
 * section that loads them, and returns names only, sorted numerically-aware so
 * "Class 2 A" precedes "Class 10 A" and dropdown order is stable.
 */
export function useSchoolClassNames(): { classNames: string[]; loading: boolean } {
  const { data, loading } = useCachedResource<SchoolClass[]>('classes', () => api.get('/classes'));
  const classNames = (data ?? [])
    .map((c) => c.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return { classNames, loading };
}
