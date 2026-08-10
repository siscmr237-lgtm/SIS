'use client';

import { Button } from './ui/button';
import { PAYMENT_STATUS_COLORS, type PaymentStatus } from './PaymentStatus';
import { ZERO_MARK_COLOR } from './MarkStatus';

/**
 * The banners at the top of a student's detail page — one per flag that needs
 * somebody to do something about it.
 *
 * Deliberately narrower than the dots next to their name. A dot is a statement of
 * fact and shows in every state, including the good ones; a banner is a call to
 * action, so a student who has paid in full gets a green dot and no banner. A
 * student with nothing outstanding and no zeros sees nothing here at all, which
 * is the point — an always-present notice area teaches people to ignore it.
 *
 * Colours are inline because src/index.css is a pre-compiled Tailwind build: a
 * utility class that is not already in it renders as nothing, silently. Each
 * banner takes its colour from the same map that drives the corresponding dot,
 * so the wording and the dot can never disagree about severity.
 */

/**
 * What each fee status means in words, and whether it is actionable at all.
 * 'Completed' is absent on purpose — nothing needs addressing, so no banner.
 */
const FEE_NOTICES: Partial<Record<PaymentStatus, { title: string; detail: string }>> = {
  'No Payment': {
    title: 'No payment recorded',
    detail: 'Nothing has been paid towards this student’s fees yet.',
  },
  Owing: {
    title: 'Outstanding fees owed',
    detail: 'Part of this student’s fees is still unpaid.',
  },
  Overpaid: {
    title: 'Overpaid — possible refund due',
    detail: 'More has been paid than this student was charged.',
  },
};

function Banner({
  color,
  background,
  title,
  detail,
  actionLabel,
  onAction,
}: {
  color: string;
  background: string;
  title: string;
  detail: string;
  /** Omitted when the banner already sits on the screen it would send you to. */
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      role="status"
      style={{
        border: `1px solid ${color}`,
        borderLeftWidth: 4,
        borderRadius: 6,
        backgroundColor: background,
        padding: '0.75rem 1rem',
        marginBottom: '0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 220 }}>
        <p className="text-sm" style={{ color, fontWeight: 600 }}>{title}</p>
        <p className="text-sm text-gray-600" style={{ marginTop: '0.25rem' }}>{detail}</p>
      </div>
      {actionLabel && onAction && (
        <Button variant="outline" onClick={onAction} style={{ borderColor: color, color }}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function StudentFlagNotices({
  paymentStatus,
  zeroMarkSubjects,
  onViewFinance,
  onViewMarks,
  show = 'all',
}: {
  paymentStatus: unknown;
  /** Subject names the student holds a zero in — one combined banner, not one each. */
  zeroMarkSubjects: string[] | undefined;
  onViewFinance: () => void;
  onViewMarks: () => void;
  /**
   * Which banners this instance renders. The fee banner lives at the BOTTOM of
   * the Finance tab rather than above the tabs — at the top it crowded out the
   * page it was describing — while the zero-mark banner stays up top where it
   * still has somewhere to send you. Hence two instances of this component
   * rather than one.
   */
  show?: 'all' | 'fees' | 'marks';
}) {
  const fee = typeof paymentStatus === 'string' ? FEE_NOTICES[paymentStatus as PaymentStatus] : undefined;
  const subjects = zeroMarkSubjects ?? [];
  const wantFee = show === 'all' || show === 'fees';
  const wantMarks = show === 'all' || show === 'marks';

  // Nothing actionable: render nothing at all, not an empty container, so the
  // page has no unexplained gap.
  if (!(wantFee && fee) && !(wantMarks && subjects.length)) return null;

  return (
    <div style={{ marginBottom: '0.5rem' }}>
      {wantFee && fee && (
        <Banner
          color={PAYMENT_STATUS_COLORS[paymentStatus as PaymentStatus]}
          background="#FEF7F5"
          title={fee.title}
          detail={fee.detail}
          // No "View fees" button when this is already sitting on the Finance
          // tab — it would only scroll you to where you are.
          actionLabel={show === 'fees' ? undefined : 'View fees'}
          onAction={show === 'fees' ? undefined : onViewFinance}
        />
      )}
      {wantMarks && subjects.length > 0 && (
        <Banner
          color={ZERO_MARK_COLOR}
          background="#FEF2F2"
          title={`Has a zero in: ${subjects.join(', ')}`}
          detail={
            subjects.length === 1
              ? 'A score of 0 is recorded in this subject.'
              : `A score of 0 is recorded in ${subjects.length} subjects.`
          }
          actionLabel="View marks"
          onAction={onViewMarks}
        />
      )}
    </div>
  );
}
