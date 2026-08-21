// Shared by both login doors: app/login/page.tsx (school admins) and
// app/teacher/login/page.tsx (teachers).
//
// It lives here rather than being copied into each page because the wording is
// the part most likely to drift, and one rule governs all of it: nothing may
// name a phone number specifically. POST /auth/login matches an identifier
// against an admin phone, an admin email, then a teacher email or phone — so a
// teacher who signed in with their email must not be told their "phone number"
// was wrong, and neither must an admin who used theirs.
export function mapLoginError(err: any): string {
  if (err?.status === 0 || err?.code === 'NETWORK_ERROR') {
    return 'Unable to connect to the server. Please try again in a moment.';
  }
  switch (err?.code) {
    case 'PHONE_NOT_FOUND': return 'No account linked to those details.';
    case 'INVALID_CREDENTIALS': return 'Invalid login details or password.';
    case 'ACCOUNT_CLOSED': return 'This account has been closed. Contact support if this was a mistake.';
    case 'MISSING_FIELDS': return 'Please enter your phone number or email, and your password.';
    case 'SERVER_ERROR': return 'Something went wrong on our end. Please try again shortly.';
    default:
      if (err?.status >= 500) return 'Something went wrong on our end. Please try again shortly.';
      return 'Something went wrong on our end. Please try again shortly.';
  }
}
