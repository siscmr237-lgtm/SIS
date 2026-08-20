'use client';

/**
 * The console's own API client and session store.
 *
 * A SEPARATE BROWSER KEY from the school app's `auth_token`, deliberately. The
 * same person is both an internal team member and an admin on their own test
 * school, and both apps are served from one origin — so a shared key would mean
 * signing into one silently signs you out of the other, and worse, whichever
 * token happened to be in the box would be sent to whichever API was called.
 *
 * These constants are the boundary. Nothing here reads or writes `auth_token`,
 * and nothing in src/lib/api.ts reads or writes these.
 */
const PLATFORM_TOKEN_KEY = 'platform_auth_token';
const PLATFORM_USER_KEY = 'platform_user';

export const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export interface PlatformUser {
  id: number;
  name: string;
  email: string;
  phoneNumber?: string;
  role: 'FOUNDER' | 'MEMBER';
}

export function getPlatformToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(PLATFORM_TOKEN_KEY);
}

export function getPlatformUser(): PlatformUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PLATFORM_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setPlatformSession(token: string, user: PlatformUser) {
  window.localStorage.setItem(PLATFORM_TOKEN_KEY, token);
  window.localStorage.setItem(PLATFORM_USER_KEY, JSON.stringify(user));
}

/** Clears ONLY the console's keys — a school session in the same browser survives. */
export function clearPlatformSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PLATFORM_TOKEN_KEY);
  window.localStorage.removeItem(PLATFORM_USER_KEY);
}

export class PlatformApiError extends Error {
  status: number;
  code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path: string, init?: RequestInit) {
  const token = getPlatformToken();
  const { headers: callerHeaders, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(callerHeaders as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...rest, headers });
  } catch {
    throw new PlatformApiError('Could not reach the server. Check your connection.', 0, 'NETWORK_ERROR');
  }

  // The rolling session: the API re-issues a token on every authenticated
  // request. Stored under the console's key, never the school app's.
  const refreshed = res.headers.get('X-Refreshed-Token');
  if (refreshed && typeof window !== 'undefined') {
    window.localStorage.setItem(PLATFORM_TOKEN_KEY, refreshed);
  }

  if (res.status === 204) return null;

  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }

  if (!res.ok) {
    const code = body?.code ?? null;
    // Only a dead session sends you back to the door. A 403 means the session
    // is fine and the action was refused — bouncing to login there would hide
    // the refusal behind a redirect and look like a bug.
    if (res.status === 401 && code === 'SESSION_INVALID' && typeof window !== 'undefined') {
      clearPlatformSession();
      window.location.replace('/platform/login');
    }
    throw new PlatformApiError(body?.error || `Request failed (${res.status})`, res.status, code);
  }

  return body;
}

export const platformApi = {
  get: (path: string) => request(path),
  post: (path: string, body?: unknown) =>
    request(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: (path: string, body?: unknown) =>
    request(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
};

/** Login is the one call that must NOT send an existing token. */
export async function platformLogin(email: string, password: string) {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/platform/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new PlatformApiError('Could not reach the server. Check your connection.', 0, 'NETWORK_ERROR');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new PlatformApiError(body?.error || 'Sign in failed.', res.status, body?.code ?? null);
  }
  setPlatformSession(body.token, body.user);
  return body.user as PlatformUser;
}
