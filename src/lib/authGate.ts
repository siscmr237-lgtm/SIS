"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { fetchRegistrationSnapshot, routeForSnapshot } from './registrationStatus';
import { getToken, getUser, hasSession } from './session';

export type AuthGateStatus = 'checking' | 'ready' | 'error';

/**
 * Where a visitor with no session is sent. Every gated route wants the login
 * door, so that is the default and no caller has to say so. The site root is
 * the one exception -- it hands a stranger /school/signup instead, because
 * somebody arriving at lewa.app having typed nothing after the domain is more
 * likely never to have had an account than to have forgotten they were signed
 * out. The rest of the gate is unchanged for them: only the no-token branch
 * reads this, so a teacher session, an unverified email, an unfinished setup
 * and a school still awaiting approval all still land where they always did.
 */
const SIGNED_OUT_DEFAULT = '/school/login';

export interface AuthGate {
  status: AuthGateStatus;
  /** Re-runs the whole check. Bound to the retry control on the error state. */
  retry: () => void;
}

// Re-verifies session/onboarding state on every mount. Every protected route
// calls this itself (via the (app) layout) rather than trusting whatever
// redirect happened at login time — a direct URL visit or a hard reload
// skips that entirely, so the check has to live where it can't be bypassed.
//
// It now also asks the SERVER where this school stands, instead of deciding
// from the copy of the user in localStorage. Approval is granted by the
// platform team while the school's token is still valid, so the token cannot
// be the authority on it: a cached answer would keep a school that was just
// approved stuck on the waiting page, and let a school that has not been
// approved into the dashboard for the rest of its idle window.
function useAuthGateInternal(signedOutDestination: string): AuthGate {
  const router = useRouter();
  const [status, setStatus] = useState<AuthGateStatus>('checking');
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setStatus('checking');
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      // The SCHOOL session specifically. A teacher signed in in another tab of
      // the same browser has their own, under its own keys, and it is neither
      // read nor disturbed here — see src/lib/session.ts.
      const token = getToken('school');
      if (!token) {
        // No school session. If this browser holds a teacher one, that is where
        // the person belongs and where they used to be sent when the two shared
        // a key — keep doing that rather than showing them a school door they
        // have no account for. Nothing is let in by this: /teacher runs the
        // teacher gate, which checks the teacher session itself.
        if (alive) router.replace(hasSession('teacher') ? '/teacher' : signedOutDestination);
        return;
      }

      const user: any = getUser('school');

      // A teacher session is a valid session — it just doesn't belong here.
      // Namespacing means the school keys can no longer hold a teacher, so this
      // now only fires for a session migrated from the old shared keys. Kept
      // because it costs nothing and the alternative is an admin-only request
      // made on a Staff actor's behalf, which would be refused and would bounce
      // a perfectly good teacher out of a session that is fine.
      if (user?.actorType === 'teacher') {
        if (alive) router.replace('/teacher');
        return;
      }

      // The cached emailVerified is still worth reading FIRST, but only as a
      // shortcut that can send someone to verify-email one round trip sooner.
      // It is never the thing that lets anybody IN — that decision is made
      // below, from the server's answer, and nothing else.
      if (user?.emailVerified === false) {
        if (alive) router.replace('/school/verify-email');
        return;
      }

      let snapshot;
      try {
        snapshot = await fetchRegistrationSnapshot();
      } catch (e: any) {
        if (!alive) return;

        // A dead session has already been handled inside the API client, which
        // clears the session and sends the browser to the door. Nothing to do
        // here but stop.
        if (e?.status === 401) return;

        // The endpoint does not exist on this server yet — an API that predates
        // the approval feature, i.e. the minutes between the two deploys. Fall
        // back to exactly the rule that was in force before it shipped, rather
        // than locking every school out of a product that was working a moment
        // ago. Narrow on purpose: a 404 from our own known path means "not
        // deployed", and nothing else here is allowed to fail open.
        if (e?.status === 404) {
          if (user?.School?.[0]?.onboardingCompleted === false) {
            router.replace('/school/onboarding');
            return;
          }
          setStatus('ready');
          return;
        }

        // Anything else — a network drop, a 503 from a database blip — is
        // UNRESOLVED, not permission. It must not fail open into the dashboard,
        // and it must not tear down a valid session either. Hold, and offer a
        // retry.
        setStatus('error');
        return;
      }

      if (!alive) return;

      const destination = routeForSnapshot(snapshot);
      if (destination) {
        router.replace(destination);
        return;
      }
      setStatus('ready');
    })();

    return () => {
      alive = false;
    };
  }, [router, attempt, signedOutDestination]);

  return { status, retry };
}

/**
 * The gate, in the shape its three callers already use: a bare status string.
 * `useAuthGateWithRetry` is the same check with the retry handle exposed, for
 * the one caller (the app shell) that renders the error state.
 */
export function useAuthGate(signedOutDestination = SIGNED_OUT_DEFAULT): AuthGateStatus {
  return useAuthGateInternal(signedOutDestination).status;
}

export function useAuthGateWithRetry(signedOutDestination = SIGNED_OUT_DEFAULT): AuthGate {
  return useAuthGateInternal(signedOutDestination);
}

/**
 * Watches, while the app shell is already open, for this school losing its
 * approval underneath it — and gets it out of the app the moment that happens.
 *
 * The gate above runs when the shell MOUNTS, and the shell does not remount as a
 * signed-in admin moves between Students, Finance and the rest: those are
 * client-side navigations under one layout. So a school sent back to pending ten
 * minutes into a session was never asked about again, and carried on clicking
 * around a dashboard it was no longer entitled to until something happened to
 * reload the page.
 *
 * THE SERVER IS THE AUTHORITY, not this hook. Every school call is refused with
 * SCHOOL_NOT_APPROVED (requireApprovedSchool, in the backend), so nothing this
 * school clicks can actually take effect whatever the screen is still showing.
 * What this adds is speed and honesty: it moves them off the dashboard on the
 * click itself, rather than leaving them looking at a live-seeming page until
 * one of its requests happens to come back refused — and it covers the page that
 * paints entirely from the SWR cache and makes no request at all.
 *
 * THREE TRIGGERS, all of them real user activity:
 *
 *   Navigation. Every menu click re-asks. This is the one the shell's own mount
 *   check cannot do.
 *
 *   Any pointer press anywhere in the app. Capture phase on the document, so no
 *   handler can stop it from being seen, and pointerdown rather than click so it
 *   starts a few frames earlier. This is what makes an ordinary click — opening
 *   a dialog, ticking a box — enough to end the session's access, instead of
 *   only the clicks that save something.
 *
 *   The tab coming back to the front, for the dashboard left open in a
 *   background tab while the platform team sent the school back.
 *
 * Deliberately absent: any timer. A poll would keep asking on behalf of a school
 * that is not there, and every authenticated call comes back with a refreshed
 * token — so a heartbeat would silently make the rolling idle timeout in
 * src/auth.js infinite. Activity is the trigger precisely because activity is
 * what that timeout is already measuring.
 *
 * Deliberately NOT a status the shell renders on. Setting a 'checking' state
 * here would blank the screen and unmount the children — losing scroll, form
 * state and open dialogs — on every navigation and every click, to answer a
 * question that is 'yes' for every school but the rare one being sent back. And
 * a failed check changes nothing: a network drop or a 503 is unresolved, not
 * permission withdrawn, so the previous answer stands. Nothing is let IN by this
 * hook, which is what makes failing quiet safe.
 */

/**
 * How long one answer is allowed to serve for. A person clicking through a
 * dashboard generates a burst of presses; this is what turns that into one
 * request rather than one per click, and it is short enough that "the click
 * after the revert" is always a fresh read.
 */
const CHECK_THROTTLE_MS = 2500;

export function useRegistrationWatch(): void {
  const pathname = usePathname();

  // Set in the effect BODY, not just cleared in its cleanup. React runs mount →
  // unmount → mount in development, so a ref that is only ever set to false by
  // the cleanup stays false for the rest of the session and silently disables
  // everything below it. (That is not hypothetical: it is what this hook did
  // when it was first written.)
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const lastCheckAt = useRef(0);

  /**
   * One checker for all three triggers, so they cannot drift into answering the
   * same question differently.
   *
   * The exit is window.location.replace, not router.replace, and that is the
   * point: it tears the whole application down — in-flight requests, open
   * dialogs, half-typed forms, every cached list — rather than leaving a live
   * app shell sitting behind a route change. Losing access should mean the app
   * closes, which is also exactly what src/lib/api.ts does when the server
   * refuses a call for the same reason.
   */
  const check = useCallback(async (throttled: boolean) => {
    const now = Date.now();
    if (throttled && now - lastCheckAt.current < CHECK_THROTTLE_MS) return;
    lastCheckAt.current = now;

    let snapshot;
    try {
      snapshot = await fetchRegistrationSnapshot();
    } catch {
      // Unresolved, not denied. See the note above.
      return;
    }
    if (!live.current) return;

    const destination = routeForSnapshot(snapshot);
    if (!destination) return;
    if (window.location.pathname === destination) return;
    window.location.replace(destination);
  }, []);

  // TRIGGER ONE: navigation.
  //
  // The first run is the mount itself, which the gate above has already covered
  // with the same call — skipping it keeps one navigation to one request.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      lastCheckAt.current = Date.now();
      return;
    }
    void check(false);
  }, [pathname, check]);

  // TRIGGER TWO: any pointer press. TRIGGER THREE: the tab becoming visible.
  //
  // Both throttled, and sharing one throttle window on purpose: refocusing a tab
  // and immediately clicking in it is one arrival, not two.
  useEffect(() => {
    const onInteraction = () => {
      void check(true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void check(true);
    };

    document.addEventListener('pointerdown', onInteraction, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('pointerdown', onInteraction, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [check]);
}
