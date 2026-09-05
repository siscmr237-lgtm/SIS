"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser, hasSession } from './session';

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

    // The TEACHER session specifically. A school admin signed in in another tab
    // of the same browser has their own, under its own keys, and it is neither
    // read nor disturbed here — see src/lib/session.ts.
    const token = getToken('teacher');
    if (!token) {
      // No teacher session. A school session in this browser means the person
      // belongs on the admin side, which is where they were sent back when the
      // two shared a key; anything else is a stranger, and gets the door.
      if (alive) router.replace(hasSession('school') ? '/' : '/teacher/login');
      return;
    }

    const user: any = getUser('teacher');

    // Anything that isn't explicitly a teacher goes to '/', the admin entry
    // point, which runs useAuthGate itself. Namespacing means the teacher keys
    // can no longer hold an admin, so this now only fires for a session
    // migrated off the old shared keys — and for those the admin gate is still
    // the right place to decide what happens.
    if (user?.actorType !== 'teacher') {
      if (alive) router.replace('/');
      return;
    }

    if (alive) setStatus('ready');

    return () => {
      alive = false;
    };
  }, [router]);

  return status;
}
