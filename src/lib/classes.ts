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

/** A–Z, the most sections sectionName() can name. */
export const MAX_SECTIONS = 26;

/** A typed section count, held to the 1–26 range sectionName() can express. */
export function clampSectionCount(raw: string | number): number {
  const parsed = typeof raw === 'number' ? raw : parseInt(raw, 10);
  return Math.max(1, Math.min(MAX_SECTIONS, Number.isFinite(parsed) ? parsed : 1));
}

/**
 * The class names to create for a set of chosen levels: 2 sections of "Class 1"
 * becomes "Class 1 A"/"Class 1 B", while a single section stays the plain
 * "Class 1".
 *
 * Shared by onboarding and the Classes page's Add Class dialog. Both create the
 * same rows and both must name them identically — a second copy of this that
 * drifted by one space would produce classes that every roster, filter and
 * report card matched as different, since class names are stored as plain text
 * on Student.class.
 */
export function expandClassSections(
  levels: string[],
  sectionsByLevel: Record<string, number>,
): string[] {
  return levels.flatMap((level) => {
    const sections = sectionsByLevel[level] ?? 1;
    if (sections <= 1) return [level];
    return Array.from({ length: sections }, (_, i) => sectionName(level, i));
  });
}

/**
 * Whether a school already has a level — as a bare class, or as any section of
 * it. Mirrors classLevelOf in sis-backend/src/utils/classLevels.js: a section is
 * `<level> <single capital>`, and only that exact shape counts, so a hand-named
 * class that merely ends in a capital is not mistaken for a section of one.
 */
export function hasClassLevel(existingNames: string[], level: string): boolean {
  const prefix = `${level}${SECTION_SEPARATOR}`;
  return existingNames.some(
    (name) =>
      name === level ||
      (name.startsWith(prefix) && /^[A-Z]$/.test(name.slice(prefix.length))),
  );
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
