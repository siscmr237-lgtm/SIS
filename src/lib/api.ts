import { describeHeldToken, recordAuthDiagnostic } from './authDiagnostic';

const runtimeApiUrl =
  (typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_API_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:4000/api';
const BASE_URL = runtimeApiUrl;

function clearSessionAndRedirect(genuineExpiry: boolean) {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem('auth_token');
  window.localStorage.removeItem('user');
  window.location.replace(genuineExpiry ? '/login?reason=expired' : '/login');
}

// The only /auth/ endpoints reachable with no session yet — every other /auth/
// route (otp/send-code, pending-email, otp/verify-signup, ...) requires the
// caller's own authenticated session, never a raw client-supplied identifier.
const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/signup'];

async function request(path: string, init?: RequestInit) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null;

  // Caller-supplied headers are merged in FIRST so that Authorization, set
  // below, always wins. Spreading `init` over the header object (or letting a
  // caller's `headers` key survive into the fetch options) would silently drop
  // the Authorization header, and the server reports a missing token as
  // SESSION_INVALID — i.e. a clobbered header is indistinguishable from a dead
  // session at the point we decide to log someone out. Keep Authorization last.
  const { headers: callerHeaders, ...restInit } = init ?? {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(callerHeaders as Record<string, string> | undefined),
  };

  const sentWithToken = Boolean(token) && !PUBLIC_AUTH_PATHS.includes(path);
  if (sentWithToken) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...restInit, headers });
  } catch {
    const err = new Error('Network error') as Error & { status: number; code: string };
    err.status = 0;
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  // Rolling idle session: every authenticated call that reaches the server
  // and gets handled comes back with a freshly-extended token. Pick it up
  // regardless of whether this particular call succeeded or failed on its
  // own merits (e.g. a validation 400 still means the session is alive).
  const refreshedToken = res.headers.get('x-refreshed-token');
  if (refreshedToken && typeof window !== 'undefined') {
    window.localStorage.setItem('auth_token', refreshedToken);
  }

  if (!res.ok) {
    const text = await res.text();
    let message = text || `Request failed: ${res.status}`;
    let code: string | undefined;
    try {
      const parsed = JSON.parse(text);
      if (parsed.error) message = String(parsed.error);
      if (parsed.code) code = String(parsed.code);
    } catch {}

    // A 401 only means a session genuinely died if the backend actually said
    // so (code === 'SESSION_INVALID') AND we believed we had a session to
    // begin with (sentWithToken). Any other failure — a transient server
    // error, a straggling no-token effect right after logout, a 401 some
    // future route returns for an unrelated reason — must never be treated
    // as proof the session expired. This is the same bug class as the prior
    // stale-post-logout-401 fix: don't let an unrelated failure masquerade
    // as "your session expired."
    if (res.status === 401 && !path.startsWith('/auth/') && code === 'SESSION_INVALID') {
      // TEMPORARY DIAGNOSTIC (see src/lib/authDiagnostic.ts) — capture what we
      // actually sent and what actually came back, before the session is torn
      // down and the evidence goes with it. `age`/`x-vercel-cache` are the
      // interesting ones: a cached response is what an intermediary serving a
      // stale 401 to an authenticated request would look like.
      recordAuthDiagnostic({
        source: 'api-401',
        reason: sentWithToken
          ? 'server rejected a token we were holding'
          : 'no token was attached to the request',
        path,
        status: res.status,
        code,
        message: message.slice(0, 200),
        sentAuthHeader: sentWithToken,
        cacheControl: res.headers.get('cache-control'),
        age: res.headers.get('age'),
        xVercelCache: res.headers.get('x-vercel-cache'),
        xVercelId: res.headers.get('x-vercel-id'),
        etag: res.headers.get('etag'),
        responseDate: res.headers.get('date'),
        refreshedTokenPresent: Boolean(refreshedToken),
        ...describeHeldToken(token),
      });
      clearSessionAndRedirect(sentWithToken);
    }

    const err = new Error(message) as Error & { status: number; code?: string };
    err.status = res.status;
    err.code = code;
    throw err;
  }

  const ct = res.headers.get('content-type');
  if (ct && ct.includes('application/json')) return res.json();
  return null;
}

export const api = {
  get: (path: string, init?: RequestInit) => request(path, init),
  post: (path: string, body: any) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path: string, body: any) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path: string, body: any) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string) => request(path, { method: 'DELETE' }),
};

export { BASE_URL };
