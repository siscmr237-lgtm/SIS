import { api } from './api';

/**
 * Where a school stands in signing up, and the one place that decides what
 * that means for where the school is allowed to be.
 *
 * The rule the whole feature turns on: THE STATUS IS READ FROM THE SERVER, on
 * every gate check, every time. It is not carried in the session token and the
 * localStorage copy of the user is never consulted for it. Approval is granted
 * by somebody else — the platform team, in a different browser — while the
 * school's own token is still perfectly valid and will stay valid for its whole
 * idle window. A cached answer is therefore wrong in both directions: it strands
 * a school that was just approved on the waiting page, and it lets a school
 * that has not been approved into a dashboard it should not see.
 */
export type RegistrationStatus = 'FAILED' | 'INCOMPLETE' | 'PENDING' | 'APPROVED';

export interface RegistrationSnapshot {
  registrationStatus: RegistrationStatus;
  onboardingCompleted: boolean;
  emailVerified: boolean;
  schoolName?: string;
}

export const PENDING_VERIFICATION_PATH = '/school/pending-verification';

/** The live read. One call, one row, no caching anywhere in the path. */
export async function fetchRegistrationSnapshot(): Promise<RegistrationSnapshot> {
  const res = (await api.get('/school/registration-status')) as RegistrationSnapshot;
  return res;
}

/**
 * Where this school belongs right now, or null if it belongs exactly where it
 * asked to be (an approved school, going about its business).
 *
 * Two orderings matter here and are deliberate:
 *
 * An unverified email wins over everything, whatever the status column says.
 * That is not only correctness, it is loop safety: /school/verify-email sends a
 * verified admin back out again, so routing a verified admin TO it on the
 * strength of a stale FAILED row would bounce the browser between the two
 * screens forever. A FAILED row on a verified email is instead treated as the
 * INCOMPLETE it is about to become — the server makes that same correction on
 * the next OTP verification, so the two agree.
 *
 * APPROVED wins over onboardingCompleted. A school cannot be approved without
 * having submitted its details, so the combination should not exist; if it ever
 * does, letting the school into the product it has been approved for is the
 * safe direction to be wrong in.
 */
export function routeForSnapshot(snap: RegistrationSnapshot): string | null {
  if (snap.emailVerified === false) return '/school/verify-email';

  switch (snap.registrationStatus) {
    case 'APPROVED':
      return null;
    case 'PENDING':
      return PENDING_VERIFICATION_PATH;
    case 'FAILED':
    case 'INCOMPLETE':
    default:
      return '/school/onboarding';
  }
}

/**
 * The same decision, made from a user object that has JUST come back from the
 * server — a login response, or the reply to an OTP verification.
 *
 * Allowed to skip the extra round trip precisely because that payload is not a
 * cache: it was produced by the server microseconds ago, in the same exchange
 * that established the session. Anything read out of localStorage on a later
 * page load is a different thing entirely and must go through
 * fetchRegistrationSnapshot instead.
 *
 * Falls back to the legacy onboardingCompleted rule when the payload carries no
 * status at all, which is what an API that predates this column returns.
 */
export function routeForFreshUser(user: any): string {
  if (user?.emailVerified === false) return '/school/verify-email';

  const school = user?.School?.[0];
  const status: RegistrationStatus | undefined = school?.registrationStatus;

  if (!status) {
    return school?.onboardingCompleted === false ? '/school/onboarding' : '/';
  }
  return routeForSnapshot({
    registrationStatus: status,
    onboardingCompleted: Boolean(school?.onboardingCompleted),
    emailVerified: user?.emailVerified !== false,
  }) ?? '/';
}
