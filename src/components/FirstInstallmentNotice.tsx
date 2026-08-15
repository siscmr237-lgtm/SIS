'use client';

import { AlertTriangle } from 'lucide-react';

/**
 * Why the first installment is not met — which category is short, and by how
 * much.
 *
 * WHY THIS EXISTS. The commonest route to an unmet first installment is
 * genuinely baffling from the outside: a parent hands over a lump sum, it is
 * recorded without naming a category, allocation fills the oldest fee-linked
 * charge first — which is almost always Registration, since that is what a
 * student is billed at enrolment — and Tuition's percentage requirement quietly
 * fails. Every part of that is correct. The money is all present and correctly
 * recorded. What was missing was any way to see where it went, so the screen
 * said "not met" and left somebody to work it out.
 *
 * WHERE IT SITS, and why. On the student's FINANCE TAB, at the top. This state
 * was previously rendered nowhere at all, so there was no existing surface to
 * attach it to — it had to be chosen. Finance is where the money detail lives,
 * where Record Payment is, and where the fee banner used to sit before it moved
 * onto the status dot. Deliberately NOT on the fee-status popover: that explains
 * the four-state dot, which is paymentStatus, and the first installment is a
 * different question with a different answer. Merging them would make one
 * sentence do two jobs badly.
 *
 * NOTHING IS COMPUTED HERE. required, paid and shortBy are the server's, from
 * computeStudentFeesStatus, which is the same pass that decided the flag. A
 * second calculation on the client would eventually disagree with the flag it
 * is trying to explain.
 *
 * Inline styles: src/index.css is a pre-compiled Tailwind artifact, so a utility
 * class not already in it renders as nothing at all, silently.
 */

export interface Shortfall {
  feeKey: string;
  name: string | null;
  percent: number;
  charged: number;
  required: number;
  paid: number;
  shortBy: number;
}

const ORANGE = '#e0552e';

export function FirstInstallmentNotice({
  met,
  shortfalls,
}: {
  /** null means no rule is configured — different from a rule that is unmet. */
  met: boolean | null | undefined;
  shortfalls: Shortfall[] | undefined;
}) {
  // null is "this level has no first-installment rule", which is not a problem
  // and must not be reported as one. true needs no explanation.
  if (met !== false) return null;
  const rows = shortfalls ?? [];

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
            First installment not met
          </p>

          {rows.length === 0 ? (
            // The flag says unmet but nothing itemised it. Better to say that
            // plainly than to render a confident empty list.
            <p className="text-sm text-gray-600" style={{ marginTop: '0.25rem' }}>
              Part of the required first installment is still outstanding.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600" style={{ marginTop: '0.25rem' }}>
                {rows.length === 1
                  ? 'One fee is still short of its required share:'
                  : `${rows.length} fees are still short of their required share:`}
              </p>
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {rows.map((s) => (
                  <div
                    key={s.feeKey}
                    style={{
                      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                      gap: '0.75rem', flexWrap: 'wrap',
                    }}
                  >
                    <span className="text-sm" style={{ fontWeight: 500, minWidth: 0 }}>
                      {s.name ?? 'This fee'}
                    </span>
                    <span className="text-xs text-gray-600" style={{ whiteSpace: 'nowrap' }}>
                      {/* Spelled out rather than left as a bare shortfall: the
                          percentage is what makes the required figure make
                          sense, and the paid figure is what makes it clear the
                          money was received but landed elsewhere. */}
                      {s.percent}% of {s.charged.toLocaleString()} = {s.required.toLocaleString()} needed
                      {' · '}
                      {s.paid.toLocaleString()} paid
                      {' · '}
                      <strong style={{ color: ORANGE }}>{s.shortBy.toLocaleString()} FCFA short</strong>
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500" style={{ marginTop: '0.5rem' }}>
                A payment recorded without naming a fee is applied to the oldest charge first, so a
                lump sum can settle Registration before it reaches these. Record a payment against
                the fee itself to close the gap.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
