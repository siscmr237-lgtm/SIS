'use client';

import { api } from '@/lib/api';
import { useCachedResource } from '@/lib/SisCache';

/**
 * Payment status, shown the same way everywhere.
 *
 * The value itself is ALWAYS the server's `paymentStatus` — computed live from
 * the ledger in sis-backend/src/utils/feesStatus.js. Nothing here recalculates
 * it: a second implementation on the client would drift the moment the fee rules
 * changed, and the four states already depend on class-level fee config the
 * frontend does not have.
 *
 * Colours are inline rather than utility classes because src/index.css is a
 * pre-compiled Tailwind build — an arbitrary `text-purple-600` that happens not
 * to be in it renders as nothing at all, silently. One map drives both the dot
 * and the word so they can never disagree.
 */

export type PaymentStatus = 'No Payment' | 'Owing' | 'Completed' | 'Overpaid';

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  // Red has no equivalent in the brand palette; the other three are the
  // palette's Burnt Orange, Forest Green and Purple.
  'No Payment': '#DC2626',
  Owing: '#E0552E',
  Completed: '#05603D',
  Overpaid: '#8C52FF',
};

/**
 * The same statuses, as a DOT draws them.
 *
 * 'Owing' — paid something, but not all of it — is the palette's Gold here
 * rather than the Burnt Orange the word uses. Beside 'No Payment' the two reds
 * read as one state at 7px, which is the one distinction the dot exists to make;
 * gold separates them at a glance, and a part-payment being the milder thing is
 * what the lighter colour says.
 *
 * Dot-only on purpose. The word in the Fees column, the popover's heading and
 * the fee banner's title are TEXT, and gold on white is barely legible — those
 * keep the darker hue. This is the ONE difference between the two maps, and it
 * is about rendering, never about which status a student is in.
 */
export const PAYMENT_STATUS_DOT_COLORS: Record<PaymentStatus, string> = {
  ...PAYMENT_STATUS_COLORS,
  Owing: '#E6C482',
};

const KNOWN: PaymentStatus[] = ['No Payment', 'Owing', 'Completed', 'Overpaid'];

/**
 * The server's string, or null when it is anything else — including undefined,
 * which is what "not loaded yet" looks like. Exported so anything keying on the
 * status uses this one definition; a second copy would eventually disagree about
 * what counts as loaded.
 */
export function normalisePaymentStatus(status: unknown): PaymentStatus | null {
  return typeof status === 'string' && (KNOWN as string[]).includes(status)
    ? (status as PaymentStatus)
    : null;
}

const normalise = normalisePaymentStatus;

/**
 * The dot that sits after a student's name, as a superscript.
 *
 * Renders nothing when the status is unknown — a student whose status has not
 * loaded yet must not be shown a colour that means something specific. The
 * title/aria-label carry the meaning for anyone not distinguishing the hues.
 */
export function PaymentStatusDot({ status }: { status: unknown }) {
  const s = normalise(status);
  if (!s) return null;
  return (
    <sup
      title={`Fees: ${s}`}
      aria-label={`Fees: ${s}`}
      role="img"
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        backgroundColor: PAYMENT_STATUS_DOT_COLORS[s],
        marginLeft: 4,
        verticalAlign: 'super',
        flexShrink: 0,
      }}
    />
  );
}

/** The status as a coloured word — used by the Students table's Fees column. */
export function PaymentStatusLabel({ status }: { status: unknown }) {
  const s = normalise(status);
  if (!s) return <span style={{ color: '#9CA3AF' }}>—</span>;
  return (
    <span style={{ color: PAYMENT_STATUS_COLORS[s], fontWeight: 500, whiteSpace: 'nowrap' }}>
      {s}
    </span>
  );
}

/**
 * A student's name with its status dot, for the many screens that show a name
 * but whose own data has no payment status attached (class rankings, marks entry,
 * the finance summary). Those look the status up by student CODE from the shared
 * students list, which already carries it — by code, never by name, since two
 * students can share a name.
 */
export function useStudentPaymentStatuses(): Map<string, PaymentStatus> {
  // Same cache entry the Students screen uses, so this adds no extra request on
  // any screen that has already loaded the roster.
  const { data } = useCachedResource<any[]>('students', () => api.get('/students'));
  const map = new Map<string, PaymentStatus>();
  for (const s of data ?? []) {
    const status = normalise(s?.paymentStatus);
    // `id` is the student CODE in API responses (see utils/response.js).
    if (status && s?.id) map.set(String(s.id), status);
  }
  return map;
}
