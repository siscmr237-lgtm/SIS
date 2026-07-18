'use client';

import { createContext, useCallback, useContext, useMemo, useRef } from 'react';

interface SisCacheContextValue {
  get: <T>(key: string) => T | null;
  set: (key: string, data: unknown) => void;
  invalidate: (...keys: string[]) => void;
}

const SisCacheContext = createContext<SisCacheContextValue>({
  get: () => null,
  set: () => {},
  invalidate: () => {},
});

export function SisCacheProvider({ children }: { children: React.ReactNode }) {
  const store = useRef(new Map<string, unknown>());

  const get = useCallback(<T,>(key: string): T | null =>
    store.current.has(key) ? (store.current.get(key) as T) : null
  , []);

  const set = useCallback((key: string, data: unknown) => {
    store.current.set(key, data);
  }, []);

  const invalidate = useCallback((...keys: string[]) => {
    for (const k of keys) store.current.delete(k);
  }, []);

  const value = useMemo(() => ({ get, set, invalidate }), [get, set, invalidate]);

  return <SisCacheContext.Provider value={value}>{children}</SisCacheContext.Provider>;
}

export const useSisCache = () => useContext(SisCacheContext);
