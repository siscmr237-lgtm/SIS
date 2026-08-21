"use client";

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchRegistrationSnapshot, routeForSnapshot } from './registrationStatus';

export type AuthGateStatus = 'checking' | 'ready' | 'error';

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
function useAuthGateInternal(): AuthGate {
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
      let token: string | null = null;
      let user: any = null;
      try {
        token = typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null;
        if (!token) throw new Error('no token');

        const userStr = window.localStorage.getItem('user');
        user = userStr ? JSON.parse(userStr) : null;
      } catch {
        if (alive) router.replace('/school/login');
        return;
      }

      // A teacher session is a valid session — it just doesn't belong here.
      // Checked before anything else, and before any request goes out, because
      // the registration status is an admin-account question that a Staff actor
      // does not have: the endpoint below is admin-only and would refuse them,
      // bouncing a perfectly good teacher out of a session that is fine.
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
  }, [router, attempt]);

  return { status, retry };
}

/**
 * The gate, in the shape its three callers already use: a bare status string.
 * `useAuthGateWithRetry` is the same check with the retry handle exposed, for
 * the one caller (the app shell) that renders the error state.
 */
export function useAuthGate(): AuthGateStatus {
  return useAuthGateInternal().status;
}

export function useAuthGateWithRetry(): AuthGate {
  return useAuthGateInternal();
}
