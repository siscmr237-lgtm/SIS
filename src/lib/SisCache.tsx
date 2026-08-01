'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * Hard staleness ceiling for cached entries. An entry older than this is
 * treated as absent: the section falls back to its loading state and refetches
 * rather than painting data from a tab that has been open since yesterday.
 */
export const SWR_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Every key the cache is allowed to hold.
 *
 * Reference data only. Anything financial or live — balances, the ledger,
 * transactions, expenses, per-student and per-staff finance, attendance, marks
 * during entry, class rankings, a rendered report card — is fetched with policy
 * 'fresh' and deliberately has no key here: a value that cannot be stored
 * cannot be served stale. Do not add one.
 */
export type CacheKey =
  | 'students'
  | 'staff'
  | 'work-records'
  | 'classes'
  | 'subjects'
  | 'settings'
  | 'charge-categories'
  | 'report-cards'
  | 'logo-url'
  | `timetable:${string}`
  | `class-subjects:${number}`
  | `class-subject-teachers:${number}`
  | `test-exams:${string}`
  | `subject-totals:${number}`
  // Which class levels a school TYPE may have. Keyed by the type itself, so a
  // school changing type reads a different entry rather than a stale one —
  // that is why no write event needs to clear it.
  | `class-catalog:${string}`;

/**
 * A key, or a trailing-`*` prefix pattern covering every parameterised key in
 * one family (all classes' subject lists, every class's timetable, ...).
 */
type KeyPattern =
  | CacheKey
  | 'class-subjects:*'
  | 'class-subject-teachers:*'
  | 'timetable:*'
  | 'test-exams:*'
  | 'subject-totals:*';

/**
 * Writes, named by what changed rather than by which screen made the call.
 * Mutation sites report one of these instead of naming keys directly, so the
 * consequences of a write live in one table (INVALIDATES, below) and a new
 * write site cannot quietly forget one the way the expense form did.
 */
export type WriteEvent =
  | 'student:write'
  | 'staff:write'
  | 'work-record:write'
  | 'class:write'
  | 'subject:write'
  | 'settings:write'
  | 'charge-category:write'
  | 'report-card:write'
  | 'timetable:write'
  | 'test-exam:write'
  | 'ledger:write'
  | 'expense:write';

/**
 * What each write invalidates.
 *
 * 'ledger:write' and 'expense:write' list nothing, and that is the fix rather
 * than an omission: no financial figure is cached anywhere, so a payment or an
 * expense has no stale copy to clear. They are declared so financial write
 * sites still route through this map, and so anyone tempted to start caching a
 * balance finds the place where they would have to justify it.
 */
const INVALIDATES: Record<WriteEvent, readonly KeyPattern[]> = {
  // A class list row carries its class teacher, so staff edits reach it.
  'student:write': ['students'],
  'staff:write': ['staff', 'classes', 'class-subject-teachers:*'],
  'work-record:write': ['work-records'],
  'class:write': [
    'classes',
    'class-subjects:*',
    'class-subject-teachers:*',
    'timetable:*',
    'test-exams:*',
    'subject-totals:*',
  ],
  'subject:write': [
    'subjects',
    'class-subjects:*',
    'class-subject-teachers:*',
    'subject-totals:*',
  ],
  'settings:write': ['settings', 'logo-url'],
  'charge-category:write': ['charge-categories'],
  'report-card:write': ['report-cards'],
  'timetable:write': ['timetable:*'],
  // Exam definitions and their per-subject totals — not the marks, which are
  // never cached.
  'test-exam:write': ['test-exams:*', 'subject-totals:*'],
  'ledger:write': [],
  'expense:write': [],
};

type Entry = { data: unknown; fetchedAt: number };

interface SisCacheContextValue {
  get: <T>(key: CacheKey, maxAgeMs?: number) => T | null;
  set: (key: CacheKey, data: unknown) => void;
  invalidate: (...patterns: KeyPattern[]) => void;
  /** Clear everything a write touches, per the INVALIDATES table. */
  invalidateOn: (event: WriteEvent) => void;
  /**
   * Run `fetcher`, storing the result under `key` and sharing one request
   * between concurrent callers. A null key means 'fresh': the result is
   * neither stored nor shared.
   */
  fetchThrough: <T>(key: CacheKey | null, fetcher: () => Promise<T>) => Promise<T>;
}

const noopContext: SisCacheContextValue = {
  get: () => null,
  set: () => {},
  invalidate: () => {},
  invalidateOn: () => {},
  fetchThrough: (_key, fetcher) => fetcher(),
};

const SisCacheContext = createContext<SisCacheContextValue>(noopContext);

export function SisCacheProvider({ children }: { children: React.ReactNode }) {
  const store = useRef(new Map<string, Entry>());
  const inflight = useRef(new Map<string, Promise<unknown>>());
  // Bumped whenever a key is invalidated. A request that started before the
  // bump describes the pre-write world, so its result is dropped rather than
  // written back — otherwise a slow GET issued just before a save would
  // reinstate exactly the data the save was meant to replace.
  const epochs = useRef(new Map<string, number>());

  const epochOf = useCallback((key: string) => epochs.current.get(key) ?? 0, []);

  const get = useCallback(
    <T,>(key: CacheKey, maxAgeMs: number = SWR_MAX_AGE_MS): T | null => {
      const entry = store.current.get(key);
      if (!entry) return null;
      if (Number.isFinite(maxAgeMs) && Date.now() - entry.fetchedAt > maxAgeMs) {
        store.current.delete(key);
        return null;
      }
      return entry.data as T;
    },
    [],
  );

  const set = useCallback((key: CacheKey, data: unknown) => {
    store.current.set(key, { data, fetchedAt: Date.now() });
  }, []);

  const forget = useCallback(
    (key: string) => {
      store.current.delete(key);
      inflight.current.delete(key);
      epochs.current.set(key, epochOf(key) + 1);
    },
    [epochOf],
  );

  const invalidate = useCallback(
    (...patterns: KeyPattern[]) => {
      for (const pattern of patterns) {
        if (!pattern.endsWith('*')) {
          forget(pattern);
          continue;
        }
        const prefix = pattern.slice(0, -1);
        // Bump the pattern itself too, so a request in flight under a key that
        // is not in the store yet still gets dropped when it lands.
        for (const key of Array.from(
          new Set([...store.current.keys(), ...inflight.current.keys()]),
        )) {
          if (key.startsWith(prefix)) forget(key);
        }
      }
    },
    [forget],
  );

  const invalidateOn = useCallback(
    (event: WriteEvent) => {
      const patterns = INVALIDATES[event];
      if (patterns.length) invalidate(...patterns);
    },
    [invalidate],
  );

  const fetchThrough = useCallback(
    <T,>(key: CacheKey | null, fetcher: () => Promise<T>): Promise<T> => {
      // 'fresh': straight to the network, nothing stored, nothing shared.
      if (!key) return fetcher();

      const existing = inflight.current.get(key) as Promise<T> | undefined;
      if (existing) return existing;

      const startEpoch = epochOf(key);
      const pending = (async () => {
        const data = await fetcher();
        if (epochOf(key) === startEpoch) {
          store.current.set(key, { data, fetchedAt: Date.now() });
        }
        return data;
      })();

      inflight.current.set(key, pending);
      const cleanup = () => {
        if (inflight.current.get(key) === pending) inflight.current.delete(key);
      };
      pending.then(cleanup, cleanup);
      return pending;
    },
    [epochOf],
  );

  const value = useMemo(
    () => ({ get, set, invalidate, invalidateOn, fetchThrough }),
    [get, set, invalidate, invalidateOn, fetchThrough],
  );

  return <SisCacheContext.Provider value={value}>{children}</SisCacheContext.Provider>;
}

export const useSisCache = () => useContext(SisCacheContext);

/**
 * 'swr'   — paint the cached value immediately (if it is under the staleness
 *           ceiling), refetch in the background, and swap in the result only
 *           if it actually differs. Reference data only.
 * 'fresh' — always hit the network, never read or write the cache. The section
 *           keeps its loading state. Required for anything financial or live.
 */
export type CachePolicy = 'swr' | 'fresh';

export interface CachedResource<T> {
  data: T | null;
  /** Nothing to paint yet — show the loading state. */
  loading: boolean;
  /** Painting cached data while a background refetch is in flight. */
  revalidating: boolean;
  error: Error | null;
  /** Drop the cached copy and refetch. Call after a write to this resource. */
  refresh: () => Promise<void>;
}

interface Snapshot<T> {
  identity: string;
  data: T | null;
  loading: boolean;
  revalidating: boolean;
  error: Error | null;
}

/**
 * Cheap structural comparison, so a background revalidation that returns
 * unchanged data causes no re-render and no visible flicker. Falls back to
 * "assume changed" on anything JSON cannot represent.
 */
function unchanged(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * The one way sections load data.
 *
 * @param key    Where to store the result, or null to store nothing. Must be
 *               null for financial and live data.
 * @param deps   Values that identify *which* data is wanted (a class, a term).
 *               Changing one refetches; the fetcher itself is not a dependency.
 */
export function useCachedResource<T>(
  key: CacheKey | null,
  fetcher: () => Promise<T>,
  options: { policy?: CachePolicy; enabled?: boolean; deps?: readonly unknown[] } = {},
): CachedResource<T> {
  const { policy = 'swr', enabled = true, deps = [] } = options;
  const cache = useSisCache();

  // Read fresh on every call without making the fetcher an effect dependency —
  // callers build it inline, so it is a new function on every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // 'fresh' resources are keyless as far as the store is concerned, so even a
  // key passed by mistake cannot cause a financial value to be read or written.
  const storeKey = policy === 'swr' ? key : null;

  // Compared by value, not by reference, so callers can pass a fresh array
  // literal every render without retriggering anything.
  let depsToken: string;
  try {
    depsToken = JSON.stringify(deps);
  } catch {
    depsToken = String(deps);
  }
  const identity = `${policy}|${key ?? ''}|${enabled}|${depsToken}`;

  const seed = useCallback((): Snapshot<T> => {
    const cached = enabled && storeKey ? cache.get<T>(storeKey) : null;
    return {
      identity,
      data: cached,
      loading: enabled && cached === null,
      revalidating: enabled && cached !== null,
      error: null,
    };
  }, [cache, enabled, storeKey, identity]);

  const [snapshot, setSnapshot] = useState<Snapshot<T>>(seed);

  // Re-seed during render when the identity changes, so switching class or
  // term paints that selection's cached data on the same commit instead of
  // flashing the previous selection's rows.
  if (snapshot.identity !== identity) setSnapshot(seed());

  // Guards against a slow response for a previous identity landing after a
  // newer one and overwriting it.
  const runRef = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) return;
    const run = ++runRef.current;
    try {
      const fresh = await cache.fetchThrough(storeKey, () => fetcherRef.current());
      if (run !== runRef.current) return;
      setSnapshot(prev => {
        if (prev.identity !== identity) return prev;
        const settled = { loading: false, revalidating: false, error: null };
        if (prev.data !== null && unchanged(prev.data, fresh)) return { ...prev, ...settled };
        return { ...prev, ...settled, data: fresh };
      });
    } catch (e) {
      if (run !== runRef.current) return;
      // A failed background revalidation keeps the painted data and surfaces
      // the error alongside it, rather than blanking a working screen.
      setSnapshot(prev =>
        prev.identity === identity
          ? { ...prev, loading: false, revalidating: false, error: e as Error }
          : prev,
      );
    }
  }, [cache, enabled, storeKey, identity]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    return () => { runRef.current++; };
  }, [load, enabled]);

  const refresh = useCallback(async () => {
    if (storeKey) cache.invalidate(storeKey);
    await load();
  }, [cache, storeKey, load]);

  return {
    data: snapshot.data,
    loading: snapshot.loading,
    revalidating: snapshot.revalidating,
    error: snapshot.error,
    refresh,
  };
}
