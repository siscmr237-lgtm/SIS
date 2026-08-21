const runtimeApiUrl =
  (typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_API_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:4000/api';
const BASE_URL = runtimeApiUrl;

function clearSessionAndRedirect(genuineExpiry: boolean) {
  if (typeof window === 'undefined') return;

  // Which door to send them back to. Read BEFORE the clear below, because the
  // 'user' entry being removed is the only thing here that knows whose session
  // just died — this function is shared by both actor types and its arguments
  // say nothing about who the caller is.
  //
  // The admin door is the fallback for anything unreadable or unrecognised: a
  // session predating actorType is an admin session, and /login forwards a
  // teacher to /teacher anyway, so guessing wrong that way self-corrects.
  let door = '/login';
  try {
    const raw = window.localStorage.getItem('user');
    if (raw && JSON.parse(raw)?.actorType === 'teacher') door = '/teacher/login';
  } catch { /* unparseable: keep the admin door */ }

  window.localStorage.removeItem('auth_token');
  window.localStorage.removeItem('user');
  window.location.replace(genuineExpiry ? `${door}?reason=expired` : door);
}

// The only /auth/ endpoints reachable with no session yet — every other /auth/
// route (otp/send-code, pending-email, otp/verify-signup, ...) requires the
// caller's own authenticated session, never a raw client-supplied identifier.
//
// The two teacher-invite routes belong here for the same reason as login: they
// are opened from an email link, and the invite token in the body — not a
// session — is what authorizes them. A stale admin token left in this browser
// must not ride along on a request that is about to establish a DIFFERENT
// actor's credentials.
const PUBLIC_AUTH_PATHS = [
  '/auth/login',
  '/auth/signup',
  '/auth/teacher/invite/verify',
  '/auth/teacher/set-password',
];

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
    let body: any;
    try {
      const parsed = JSON.parse(text);
      body = parsed;
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
      clearSessionAndRedirect(sentWithToken);
    }

    // The parsed body rides along on the error: some failures are structured
    // rather than fatal (e.g. a partial create reporting which items did and
    // did not succeed), and callers need those details to say something useful
    // instead of a generic message.
    const err = new Error(message) as Error & { status: number; code?: string; body?: any };
    err.status = res.status;
    err.code = code;
    err.body = body;
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
