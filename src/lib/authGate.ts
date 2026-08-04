"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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
        // A teacher session is a valid session — it just doesn't belong here.
        // Checked before anything else because emailVerified and
        // School[0].onboardingCompleted are admin-account fields that a Staff
        // actor simply does not carry; reading them first would bounce a
        // perfectly good teacher into /verify-email or /onboarding.
        if (user?.actorType === 'teacher') {
          if (alive) router.replace('/teacher');
          return;
        }
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
    } catch {
      if (alive) router.replace('/login');
    }
    return () => {
      alive = false;
    };
  }, [router]);

  return status;
}
