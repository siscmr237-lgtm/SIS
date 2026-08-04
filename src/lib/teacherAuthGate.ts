"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export type TeacherAuthGateStatus = 'checking' | 'ready';

// The teacher-side counterpart of useAuthGate (src/lib/authGate.ts), and it
// exists for the same reason: every protected route re-verifies on mount rather
// than trusting the redirect that happened at login, because a direct URL visit
// or a hard reload skips that redirect entirely.
//
// The two gates are deliberately mirror images — an admin landing on /teacher
// is sent to '/', a teacher landing on an admin page is sent to '/teacher' — so
// that neither actor can reach the other's section by typing a URL, and neither
// can end up bouncing between the two.
export function useTeacherAuthGate(): TeacherAuthGateStatus {
  const router = useRouter();
  const [status, setStatus] = useState<TeacherAuthGateStatus>('checking');

  useEffect(() => {
    let alive = true;
    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null;
      if (!token) throw new Error('no token');

      const userStr = window.localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;

      // Anything that isn't explicitly a teacher goes to '/', which is the
      // admin entry point and runs useAuthGate itself. A session with no stored
      // user, or one predating actorType, lands here too — that is correct:
      // those are admin sessions, and the admin gate is the right place to
      // decide what happens to them.
      if (user?.actorType !== 'teacher') {
        if (alive) router.replace('/');
        return;
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
