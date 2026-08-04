'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * The school's academic-year state, and the one dropdown every screen uses.
 *
 * The active year is server state, advanced by the manual → nudge → auto flow in
 * sis-backend/src/utils/academicYear.js. Nothing here computes a year from the
 * date: a school that chooses to keep working in the old year through August must
 * see the old year, and a locally-derived value would overrule that.
 *
 * Fetching status is also the APP-LOAD half of the rollover — the endpoint runs
 * the same advanceYearIfDue() the cron runs, so a cron that never fired
 * self-corrects as soon as somebody opens the app.
 */

export interface AcademicYearStatus {
  activeYear: string;
  firstYear: string;
  targetYear: string;
  years: string[];
  /** Persistent and non-dismissible: shown from 1 August until they advance. */
  nudgeDue: boolean;
  nudgeYear: string | null;
  /** One-time and dismissible: set by an automatic advance. */
  autoAdvancedYear: string | null;
}

/**
 * Keeps the localStorage school copy (written at LOGIN) in step with the real
 * active year.
 *
 * The Dashboard header and the Sidebar both read that cached copy, so without
 * this an advance — manual or automatic — would leave the two most visible places
 * showing the previous year until the next sign-in.
 */
function syncCachedSchoolYear(activeYear: string | undefined) {
  if (!activeYear || typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem('user');
    if (!raw) return;
    const user = JSON.parse(raw);
    const school = user?.School?.[0];
    if (!school || school.academicYear === activeYear) return;
    school.academicYear = activeYear;
    window.localStorage.setItem('user', JSON.stringify(user));
  } catch {
    // A cache that cannot be updated is not worth failing a page load over.
  }
}

export function useAcademicYear() {
  const [status, setStatus] = useState<AcademicYearStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r: any = await api.get('/academic-year/status');
      setStatus(r);
      syncCachedSchoolYear(r?.activeYear);
      setError(null);
    } catch (e: any) {
      // A flaky database must not block the page; the year simply is not
      // advanced on this visit and the next one, or the cron, will do it.
      setError(e?.message || 'Could not read the academic year.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const advance = useCallback(async () => {
    const r: any = await api.post('/academic-year/advance', {});
    await load();
    return r;
  }, [load]);

  const acknowledge = useCallback(async () => {
    await api.post('/academic-year/acknowledge', {});
    await load();
  }, [load]);

  return { status, loading, error, refresh: load, advance, acknowledge };
}

/**
 * The academic-year picker, used everywhere a year is chosen.
 *
 * Always a dropdown of the school's real years — first year through active year —
 * never a free-text field: a typo like "2026-2027" or "2026/2028" would silently
 * partition data into a year that does not exist, and every year-tagged row is
 * matched by exact string.
 */
export function AcademicYearSelect({
  value,
  onChange,
  years,
  includeAll = false,
  allLabel = 'All Years',
  disabled = false,
  className,
  style,
}: {
  value: string;
  onChange: (year: string) => void;
  years: string[];
  /** Adds an "all" option, for filters that legitimately span years. */
  includeAll?: boolean;
  allLabel?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  // Never render an empty list: without this the trigger looks broken while the
  // status request is still in flight.
  const options = years.length ? years : value ? [value] : [];
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className} style={style}>
        <SelectValue placeholder={options.length ? 'Select year' : 'Loading years...'} />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="all">{allLabel}</SelectItem>}
        {options.map(y => (
          <SelectItem key={y} value={y}>{y}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
