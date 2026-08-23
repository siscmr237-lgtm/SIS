'use client';

import { AlertTriangle } from 'lucide-react';

/**
 * States, without elaborating, that the first installment has not been paid.
 *
 * WHERE IT SITS, and why. On the student's FINANCE TAB, at the top. Finance is
 * where the money detail lives and where Record Payment is, so the flag sits
 * beside the actions that answer it. Deliberately NOT on the fee-status
 * popover: that explains the four-state dot, which is paymentStatus, and the
 * first installment is a different question.
 *
 * IT SAYS ONLY THAT. The card used to itemise which fee was short and by how
 * much, and to explain that an unnamed payment allocates to the oldest charge
 * first. That breakdown was removed; the card is now the flag alone. Nothing
 * here is computed — `met` is the server's, from computeStudentFeesStatus.
 *
 * Inline styles: src/index.css is a pre-compiled Tailwind artifact, so a utility
 * class not already in it renders as nothing at all, silently.
 */

const ORANGE = '#e0552e';

export function FirstInstallmentNotice({
  met,
}: {
  /** null means no rule is configured — different from a rule that is unmet. */
  met: boolean | null | undefined;
}) {
  // null is "this level has no first-installment rule", which is not a problem
  // and must not be reported as one. true needs no explanation.
  if (met !== false) return null;

  return (
    <div
      role="status"
      style={{
        border: `1px solid ${ORANGE}`,
        borderLeftWidth: 4,
        borderRadius: 6,
        backgroundColor: '#FDF3EF',
        padding: '0.75rem 1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
        <AlertTriangle size={16} style={{ color: ORANGE, flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="text-sm" style={{ color: ORANGE, fontWeight: 600 }}>
            First installment not paid
          </p>
        </div>
      </div>
    </div>
  );
}
