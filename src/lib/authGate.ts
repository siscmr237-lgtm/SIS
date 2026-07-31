"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { describeHeldToken, recordAuthDiagnostic } from './authDiagnostic';

export type AuthGateStatus = 'checking' | 'ready';

// Re-verifies session/onboarding state on every mount. Every protected route
// calls this itself (via the (app) layout) rather than trusting whatever
// redirect happened at login time — a direct URL visit or a hard reload
// skips that entirely, so the check has to live where it can't be bypassed.
export function useAuthGate(): AuthGateStatus {
  const router = useRouter();
  const [status, setStatus] = useState<AuthGateStatus>('checking');

  useEffect(() => {
    let alive = true;
    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null;
      if (!token) throw new Error('no token');

      const userStr = window.localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user?.emailVerified === false) {
          if (alive) router.replace('/verify-email');
          return;
        }
        if (user?.School?.[0]?.onboardingCompleted === false) {
          if (alive) router.replace('/onboarding');
          return;
        }
      }
      if (alive) setStatus('ready');
    } catch (e) {
      // TEMPORARY DIAGNOSTIC (see src/lib/authDiagnostic.ts). This branch is
      // the OTHER way a user lands back on /login, and it looks different to
      // them: no ?reason=expired, so no "session has expired" banner. Recording
      // it is what lets us tell the two apart from the device afterwards.
      let heldToken: string | null = null;
      try {
        heldToken = typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null;
      } catch {}
      recordAuthDiagnostic({
        source: 'auth-gate',
        reason: heldToken
          ? `gate threw while a token was present: ${String((e as Error)?.message || e).slice(0, 80)}`
          : 'no auth_token in localStorage at gate time',
        ...describeHeldToken(heldToken),
      });
      if (alive) router.replace('/login');
    }
    return () => {
      alive = false;
    };
  }, [router]);

  return status;
}
