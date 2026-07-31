"use client";

/**
 * ============================================================================
 * TEMPORARY DIAGNOSTIC — remove once the "Session expired" regression is
 * confirmed. Tracking note: added 2026-07-31 while investigating logins that
 * bounce straight back to /login on navigation.
 * ============================================================================
 *
 * Records why the app sent someone back to /login, so the real cause can be
 * read off the affected device instead of guessed at. Every entry is written
 * to localStorage BEFORE the redirect happens and deliberately under a key
 * that the session teardown does not clear (it removes only `auth_token` and
 * `user`), so it survives both the redirect and the subsequent re-login.
 *
 * Read it back either from the panel rendered on the login page, or from the
 * console via `window.__sisAuthDiagnostics`.
 *
 * Deliberately NOT stored: the token itself. A short fingerprint of its
 * signature is enough to tell whether two requests carried the same token,
 * without persisting a live credential anywhere it wasn't already.
 */

export const AUTH_DIAG_KEY = 'sis_auth_diagnostic';
const MAX_ENTRIES = 8;

export type AuthDiagnosticSource = 'api-401' | 'auth-gate' | 'logout';

export interface AuthDiagnosticEntry {
  at: string;
  source: AuthDiagnosticSource;
  /** Why we gave up on the session, in one short phrase. */
  reason: string;

  // --- request that triggered it (api-401 only) ---
  path?: string;
  status?: number;
  code?: string;
  message?: string;
  /** Did WE attach an Authorization header to this request? */
  sentAuthHeader?: boolean;

  // --- what we were holding at the time ---
  tokenPresent?: boolean;
  tokenLength?: number;
  /** Last 6 chars of the JWT signature — correlation only, not a credential. */
  tokenSig6?: string;
  tokenIat?: number;
  tokenExp?: number;
  /** Seconds until the token's own exp, per the DEVICE clock. Negative = the
   *  device believes it already lapsed. Large disagreement with the server
   *  points at clock skew rather than a real expiry. */
  tokenExpiresInSec?: number;

  // --- cache evidence ---
  // The point of these: `age` > 0 or an `xVercelCache` HIT means the response
  // came out of a cache rather than from the app, which is what a shared
  // intermediary serving a stale 401 would look like.
  cacheControl?: string | null;
  age?: string | null;
  xVercelCache?: string | null;
  xVercelId?: string | null;
  etag?: string | null;
  responseDate?: string | null;
  refreshedTokenPresent?: boolean;

  // --- device context ---
  ua?: string;
  viewport?: string;
  online?: boolean;
  deviceNow?: number;
}

function decodeJwtPayload(token: string): { iat?: number; exp?: number } | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** Everything about the token we hold right now, in diagnostic-safe form. */
export function describeHeldToken(token: string | null): Partial<AuthDiagnosticEntry> {
  if (!token) return { tokenPresent: false };
  const payload = decodeJwtPayload(token);
  const nowSec = Math.floor(Date.now() / 1000);
  const sig = token.split('.')[2] || '';
  return {
    tokenPresent: true,
    tokenLength: token.length,
    tokenSig6: sig.slice(-6),
    tokenIat: payload?.iat,
    tokenExp: payload?.exp,
    tokenExpiresInSec: payload?.exp != null ? payload.exp - nowSec : undefined,
  };
}

export function recordAuthDiagnostic(entry: Partial<AuthDiagnosticEntry> & { source: AuthDiagnosticSource; reason: string }): void {
  if (typeof window === 'undefined') return;
  try {
    const full: AuthDiagnosticEntry = {
      at: new Date().toISOString(),
      ua: navigator.userAgent,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      online: navigator.onLine,
      deviceNow: Math.floor(Date.now() / 1000),
      ...entry,
    };
    const existing = readAuthDiagnostics();
    const next = [...existing, full].slice(-MAX_ENTRIES);
    window.localStorage.setItem(AUTH_DIAG_KEY, JSON.stringify(next));
    (window as any).__sisAuthDiagnostics = next;
    // Also emit to the console so remote debugging picks it up without any UI.
    console.warn('[SIS auth diagnostic]', full);
  } catch {
    // A diagnostic must never be the reason something breaks.
  }
}

export function readAuthDiagnostics(): AuthDiagnosticEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(AUTH_DIAG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearAuthDiagnostics(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(AUTH_DIAG_KEY);
    (window as any).__sisAuthDiagnostics = [];
  } catch {}
}
