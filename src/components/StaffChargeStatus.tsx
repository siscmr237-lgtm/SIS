'use client';

import { api } from '@/lib/api';
import { useCachedResource } from '@/lib/SisCache';
import { Staff } from '../types';

/**
 * The red dot beside a staff member's name: they owe the school something that
 * has not been settled yet.
 *
 * The figure is ALWAYS the server's `outstandingCharges` — charge amounts less
 * whatever has been netted off them at payroll, computed by
 * withOutstandingCharges() in sis-backend/src/routes/staff.js. Nothing here
 * recalculates it. A dot that disagreed with the payroll dialog about whether a
 * debt was cleared would be worse than no dot at all, and there is only one way
 * a staff charge is ever settled — netting against payroll — so there is only
 * one place that arithmetic belongs.
 *
 * Colour is inline rather than a utility class because src/index.css is a
 * pre-compiled Tailwind build: a class that happens not to be in it renders as
 * nothing at all, silently. Same reason PaymentStatus.tsx and MarkStatus.tsx
 * style their indicators inline.
 */

/** Red has no equivalent in the brand palette; this is the same red the fee
 *  'No Payment' state uses, so the two dots read as one visual language. */
export const STAFF_CHARGE_COLOR = '#DC2626';

export function StaffChargeDot({ outstanding }: { outstanding: unknown }) {
  const amount = typeof outstanding === 'number' ? outstanding : 0;
  // Renders nothing when there is nothing owed. A staff member whose figure has
  // not loaded yet must not be shown a dot that means "owes money".
  if (!(amount > 0)) return null;
  const label = `Owes ${amount.toLocaleString()} FCFA in unsettled charges`;
  return (
    <sup
      title={label}
      aria-label={label}
      role="img"
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        backgroundColor: STAFF_CHARGE_COLOR,
        marginLeft: 4,
        verticalAlign: 'super',
        flexShrink: 0,
      }}
    />
  );
}

/**
 * Outstanding charges by staff CODE, for screens that show a staff name but
 * whose own data does not carry the figure. Reads the same cached roster the
 * Staff screen uses, so it costs no extra request there — and because
 * 'ledger:write' invalidates that roster, a fine raised or netted off payroll
 * moves every dot on screen rather than leaving a stale one behind.
 */
export function useStaffOutstandingCharges(): Map<string, number> {
  const { data } = useCachedResource<Staff[]>('staff', () => api.get('/staff'));
  const map = new Map<string, number>();
  for (const s of data ?? []) {
    const amount = Number(s?.outstandingCharges);
    if (s?.code && Number.isFinite(amount) && amount > 0) map.set(String(s.code), amount);
  }
  return map;
}
