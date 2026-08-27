/**
 * Where each registration status belongs. One table, no imports, no I/O.
 *
 * Split out of registrationStatus.ts for one narrow reason: src/lib/api.ts has
 * to make this same decision the moment the server refuses a call with
 * SCHOOL_NOT_APPROVED, and registrationStatus.ts imports api.ts in order to do
 * its own fetching. A module that imports nothing lets both sides read the same
 * table instead of each keeping a copy that can drift apart — and the drift
 * that matters here is a school being sent to a screen its own gate then bounces
 * it out of, which is a redirect loop rather than a cosmetic bug.
 */

export type RegistrationStatus = 'FAILED' | 'INCOMPLETE' | 'PENDING' | 'APPROVED';

export const PENDING_VERIFICATION_PATH = '/school/pending-verification';
export const ONBOARDING_PATH = '/school/onboarding';
export const VERIFY_EMAIL_PATH = '/school/verify-email';

/**
 * Where an admin who is cleared to use the product actually goes.
 *
 * THIS MUST NOT BE '/'. It was, everywhere, until the site root became the
 * public marketing page. Before that, '/' was a gate of its own: a client
 * component that ran the auth check and forwarded to the dashboard, so
 * "send them to /" and "send them to the app" were the same instruction and
 * nobody had to say which they meant. The moment the root started rendering
 * marketing copy, every one of those redirects quietly signed an admin in and
 * dropped them on the landing page.
 *
 * Naming the destination is the fix. /school/dashboard sits inside the (app)
 * route group, whose layout runs useAuthGateWithRetry and useRegistrationWatch
 * on mount — the same live, server-read check the old root did — so nothing
 * that depended on '/' re-running the gate has lost anything by being pointed
 * here instead.
 */
export const SCHOOL_HOME_PATH = '/school/dashboard';

/**
 * The teacher-side equivalent of the waiting page.
 *
 * A teacher gets refused for their school's status just as an admin does, but
 * cannot be sent to the admin waiting page: that page bounces teachers to
 * /teacher, and /teacher would send them straight back into the portal whose
 * next call gets refused again — a loop. This page is the terminus instead. It
 * makes no API calls, so nothing on it can be refused.
 */
export const TEACHER_SCHOOL_REVIEW_PATH = '/teacher/school-under-review';

/**
 * The one place that turns a status into a destination, or null for "this school
 * belongs exactly where it is".
 *
 * Anything unrecognised — including a status column this build has never heard
 * of — falls to the onboarding form rather than to null. Failing towards a
 * screen the school can act on beats failing open into the dashboard.
 */
export function pathForRegistrationStatus(
  status: RegistrationStatus | string | null | undefined,
): string | null {
  switch (status) {
    case 'APPROVED':
      return null;
    case 'PENDING':
      return PENDING_VERIFICATION_PATH;
    case 'FAILED':
    case 'INCOMPLETE':
    default:
      return ONBOARDING_PATH;
  }
}
