import {
  pathForRegistrationStatus,
  PENDING_VERIFICATION_PATH,
  TEACHER_SCHOOL_REVIEW_PATH,
} from './registrationRoutes';
import { clearSession, currentPortal, getToken, PORTAL_LOGIN_PATH, setToken } from './session';

const runtimeApiUrl =
  (typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_API_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ||
  'http://localhost:4000/api';
const BASE_URL = runtimeApiUrl;

/** See redirectForNotApproved. Reset by the page load that redirect causes. */
let notApprovedRedirectStarted = false;

function clearSessionAndRedirect(genuineExpiry: boolean) {
  if (typeof window === 'undefined') return;

  // Which door to send them back to, and — just as importantly — WHOSE session
  // to throw away. Both come from the portal this tab is in, not from the
  // stored user: the tab that made the failing call is the tab whose session
  // died, and it is the only one that may be signed out. A teacher signed in
  // in another tab keeps their session, which is the whole point of the split
  // in ./session.
  const portal = currentPortal();
  const door = PORTAL_LOGIN_PATH[portal];

  clearSession(portal);
  window.location.replace(genuineExpiry ? `${door}?reason=expired` : door);
}

/**
 * The school's account has stopped being usable mid-session: the platform team
 * sent it back to pending while somebody was signed in and working.
 *
 * The server is the only thing that can notice this. The client gate runs when
 * the app shell mounts, and the shell does not remount as a signed-in admin
 * moves around the dashboard — so before this existed, a school that had just
 * lost its approval kept reading and writing for as long as the tab stayed open.
 * The server now refuses every school call with SCHOOL_NOT_APPROVED, and this is
 * what turns that refusal into the screen the user should be looking at.
 *
 * THE SESSION IS LEFT ALONE. Nothing here clears the token: the login is fine,
 * it is the school's standing that changed, and the page they are being sent to
 * is one only a signed-in admin can read. Compare clearSessionAndRedirect above,
 * which is for the opposite case.
 *
 * A full location.replace rather than a router push, and that is the point: it
 * tears down every piece of in-flight dashboard state — open dialogs, half-typed
 * forms, cached lists, pending requests — instead of leaving a live app shell
 * sitting behind a redirect. "All actions stop" has to mean the app stops.
 *
 * Exported because one call does not come through request() below: postImage in
 * ./uploadImage builds its own fetch to send FormData, and has to be able to ask
 * for the same redirect.
 */
export function redirectForNotApproved(registrationStatus?: string) {
  if (typeof window === 'undefined') return;

  // A page load resets this, which is exactly the lifetime it needs: it is here
  // so that several calls in flight at once, all coming back refused together,
  // produce one navigation rather than one each.
  if (notApprovedRedirectStarted) return;

  // A teacher cannot be sent to the admin waiting page — that page forwards
  // teachers to /teacher, whose next call would be refused again, and the two
  // would bounce forever. Read from the portal this tab is in, the same way
  // clearSessionAndRedirect picks its door.
  const isTeacher = currentPortal() === 'teacher';

  // Whatever the payload does not name — including the 'APPROVED' that cannot
  // logically accompany this refusal — lands on the waiting page, which reads
  // the live status itself and forwards again if that is not where this school
  // belongs.
  const target = isTeacher
    ? TEACHER_SCHOOL_REVIEW_PATH
    : (pathForRegistrationStatus(registrationStatus) ?? PENDING_VERIFICATION_PATH);

  // Already there. The destination pages make calls of their own, and a page
  // navigating to itself would reload in a loop.
  if (window.location.pathname === target) return;

  notApprovedRedirectStarted = true;
  window.location.replace(target);
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
  // The administrator invite, for exactly the same reason as the teacher one
  // above: both are opened from an email link, and the invite token in the body
  // — not a session — is what authorises them. Leaving these off the list would
  // send whatever stale token this browser happens to hold along with a request
  // that is about to establish a DIFFERENT account's credentials.
  '/auth/admin/invite/verify',
  '/auth/admin/set-password',
];

async function request(path: string, init?: RequestInit) {
  // This tab's portal decides which of the two stored tokens is sent. A school
  // tab and a teacher tab running side by side each pick their own, so neither
  // can send the other's credentials — which is what used to happen when both
  // read one shared key.
  const portal = currentPortal();
  const token = getToken(portal);

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
  //
  // Written back into the SAME portal namespace the request read from, never
  // the shared key: a teacher call refreshing the school tab's token would be
  // a silent actor swap, and the server honours whatever claim the token
  // carries.
  const refreshedToken = res.headers.get('x-refreshed-token');
  if (refreshedToken) {
    setToken(refreshedToken, portal);
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

    // The school's approval was withdrawn underneath this session. Narrow on
    // both halves — the status AND the code — so no other 403 can ever navigate
    // the browser: requireAdmin, requireTeacher and requireSchoolActor all
    // answer 403 with code FORBIDDEN, and those are ordinary permission errors
    // for a caller to display, not a reason to leave the page.
    if (res.status === 403 && code === 'SCHOOL_NOT_APPROVED') {
      redirectForNotApproved(body?.registrationStatus);
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
