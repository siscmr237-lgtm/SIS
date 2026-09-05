/**
 * One browser, two portals, two independent sessions.
 *
 * The school app and the teacher app are served from the same origin, and
 * localStorage is per-origin — so while both wrote their token under the single
 * key `auth_token` and their account under `user`, signing into one silently
 * overwrote the other. The visible symptom was the school tab appearing to log
 * itself out: the school gate re-read `user`, found `actorType === 'teacher'`
 * left there by the other tab, and forwarded the school admin to /teacher.
 *
 * The same person genuinely is both — a proprietor who also teaches, a head
 * checking what their staff can see — so this is an ordinary thing to want.
 *
 * The fix is the one the platform console already made for itself (see
 * platformApi.ts, which has kept `platform_auth_token` separate from day one):
 * give each portal its own keys. Three namespaces now live side by side and
 * none of them can see the others.
 *
 * WHICH PORTAL AM I? Read from the URL, because the URL is the only thing that
 * differs between the two tabs — everything under /teacher is the teacher
 * portal, everything else that uses this module is the school one. That makes
 * the answer per-TAB, which is exactly the granularity the bug needs: the two
 * tabs ask the same question and get different answers at the same instant.
 * Nothing is stored to remember it, so there is no third piece of state that
 * can fall out of step with the other two.
 *
 * WHAT THIS DOES NOT FIX: two accounts of the SAME kind — two schools, or two
 * teachers — in two tabs. Those share a namespace, and the second login still
 * replaces the first. Separating those would mean moving the session out of
 * localStorage altogether (sessionStorage is per-tab but dies with the tab, and
 * takes "stay signed in" with it). Out of scope here.
 */

export type Portal = 'school' | 'teacher';

const KEYS: Record<Portal, { token: string; user: string }> = {
  school: { token: 'sis_school_auth_token', user: 'sis_school_user' },
  teacher: { token: 'sis_teacher_auth_token', user: 'sis_teacher_user' },
};

/** The keys both portals used to share. Read once, at migration, then removed. */
const LEGACY_TOKEN_KEY = 'auth_token';
const LEGACY_USER_KEY = 'user';

/** Where a signed-out visitor to each portal is sent. */
export const PORTAL_LOGIN_PATH: Record<Portal, string> = {
  school: '/school/login',
  teacher: '/teacher/login',
};

/**
 * Every localStorage access in this file goes through these two. Storage throws
 * outright in some privacy modes — and any browser configured to block site
 * data — and a session helper that throws would take down the gate calling it.
 * No session is the correct answer in that case, so that is what a failure
 * returns.
 */
function read(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (typeof window === 'undefined') return;
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the session simply does not persist */
  }
}

/**
 * Which portal owns this path.
 *
 * /teacher and everything under it is the teacher portal. Everything else is
 * the school one, INCLUDING the site root and any path this module has never
 * heard of — the school app is the larger surface and the safer default, and a
 * school token offered to a teacher endpoint is refused by the server rather
 * than honoured (authMiddleware resolves the actor from the token's own claim,
 * never from what the caller asked for).
 *
 * The platform console at /admin is deliberately not in this map: it has its
 * own client and its own keys in platformApi.ts, and nothing there calls here.
 */
export function portalForPath(pathname: string): Portal {
  return pathname === '/teacher' || pathname.startsWith('/teacher/') ? 'teacher' : 'school';
}

export function currentPortal(): Portal {
  if (typeof window === 'undefined') return 'school';
  return portalForPath(window.location.pathname);
}

/**
 * Moves a session written under the old shared keys into the namespace it
 * belongs to, so that shipping this does not sign out everybody who is signed
 * in right now.
 *
 * The stored user says which portal it was: actorType 'teacher' means the
 * teacher app, and anything else — including a session predating actorType,
 * which is always an admin — means the school app. That is the same rule
 * clearSessionAndRedirect in api.ts has always used to pick its door.
 *
 * Runs at most once per page load, and never overwrites a namespaced session
 * that is already there: a browser that has signed in since the deploy holds
 * the fresher token, and a leftover legacy entry must not replace it.
 */
let migrationDone = false;

function migrateLegacySession() {
  if (migrationDone) return;
  migrationDone = true;
  if (typeof window === 'undefined') return;

  const token = read(LEGACY_TOKEN_KEY);
  const rawUser = read(LEGACY_USER_KEY);
  if (!token && !rawUser) return;

  let portal: Portal = 'school';
  try {
    if (rawUser && JSON.parse(rawUser)?.actorType === 'teacher') portal = 'teacher';
  } catch {
    /* unparseable: treat as the school case, which the gate self-corrects */
  }

  const keys = KEYS[portal];
  if (token && !read(keys.token)) write(keys.token, token);
  if (rawUser && !read(keys.user)) write(keys.user, rawUser);

  write(LEGACY_TOKEN_KEY, null);
  write(LEGACY_USER_KEY, null);
}

export function getToken(portal: Portal = currentPortal()): string | null {
  migrateLegacySession();
  return read(KEYS[portal].token);
}

/** The stored account, parsed. Null for absent, unset and unparseable alike. */
export function getUser<T = any>(portal: Portal = currentPortal()): T | null {
  migrateLegacySession();
  const raw = read(KEYS[portal].user);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: unknown, portal: Portal = currentPortal()) {
  migrateLegacySession();
  write(KEYS[portal].token, token);
  write(KEYS[portal].user, JSON.stringify(user));
}

/** The rolling-session refresh: a new token for the same account. */
export function setToken(token: string, portal: Portal = currentPortal()) {
  migrateLegacySession();
  write(KEYS[portal].token, token);
}

/** Re-caches the account after something about it changed (name, logo, term). */
export function setUser(user: unknown, portal: Portal = currentPortal()) {
  migrateLegacySession();
  write(KEYS[portal].user, JSON.stringify(user));
}

/**
 * Signs out of ONE portal. The other portal's session in the same browser is
 * untouched, which is the whole point — and is why no caller may go back to
 * localStorage.clear(), which took both down with it.
 */
export function clearSession(portal: Portal = currentPortal()) {
  migrationDone = true; // nothing to migrate into a session being thrown away
  write(KEYS[portal].token, null);
  write(KEYS[portal].user, null);
  // A legacy entry left behind by an older tab would otherwise be migrated back
  // in on the next read, and look like the sign-out never happened.
  write(LEGACY_TOKEN_KEY, null);
  write(LEGACY_USER_KEY, null);
}

/** True when the named portal has a session in this browser. Picks a door. */
export function hasSession(portal: Portal): boolean {
  return Boolean(getToken(portal));
}
