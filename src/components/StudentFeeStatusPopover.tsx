'use client';

import { useEffect, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { PAYMENT_STATUS_COLORS, normalisePaymentStatus, type PaymentStatus } from './PaymentStatus';
import { FEE_NOTICES } from './StudentFlagNotices';

/**
 * The fee-status dot on the student detail page, with its explanation attached.
 *
 * Replaces the banner that used to sit at the bottom of the Finance tab. The
 * banner said the right thing in the wrong place: you had to already be on the
 * Finance tab to read an explanation of a dot that is up beside the name.
 *
 * POPOVER, NOT TOOLTIP, and that is not a styling preference. Radix Tooltip
 * opens on hover, and hover does not exist on a phone — most of these users are
 * on phones, so a tooltip would simply never open for them.
 *
 * Used ONLY on the student detail page. The same dot appears on the students
 * list, the marks roster, class rankings, the finance table and report cards,
 * and those deliberately keep the plain PaymentStatusDot: a popover that
 * auto-opens on every row of a long list is a different thing entirely.
 *
 * Inline styles throughout. src/index.css is a pre-compiled Tailwind artifact,
 * so a utility class that is not already in it renders as nothing at all,
 * silently — which is also why this uses the Radix primitive directly rather
 * than src/components/ui/popover.tsx, whose Tailwind `w-72` and padding cannot
 * meet the width this needs anyway.
 */

/**
 * One line per state.
 *
 * Three of the four are the EXACT strings the banner used, taken from the
 * shared FEE_NOTICES rather than retyped, so they cannot drift.
 *
 * 'Completed' is the exception and is new copy, because the banner never had a
 * message for it — a banner is a call to action and a fully-paid student needed
 * no action, so that state deliberately had no wording anywhere in the app. A
 * popover you can tap does need something to say, so this is the one string here
 * that was written rather than found.
 */
const NOTICES: Record<PaymentStatus, { title: string; detail: string }> = {
  'No Payment': FEE_NOTICES['No Payment']!,
  Owing: FEE_NOTICES.Owing!,
  Overpaid: FEE_NOTICES.Overpaid!,
  Completed: {
    title: 'Fees fully paid',
    detail: 'This student’s fees are settled in full.',
  },
};

/**
 * The states that open by themselves. Owing and No Payment are the two somebody
 * has to do something about; Completed and Overpaid open only on tap.
 *
 * Auto-opening all four would put a popover on every student page every visit,
 * which is how people learn to dismiss a thing without reading it — and then it
 * no longer works for the two states that matter.
 */
const AUTO_SHOW: PaymentStatus[] = ['Owing', 'No Payment'];

/** The visible dot, unchanged from PaymentStatusDot. */
const DOT_SIZE = 7;
/** The invisible target around it. A 7px dot cannot be tapped on a phone. */
const HIT_AREA = 44;

interface Props {
  status: unknown;
  /**
   * Whether the moment this explains has arrived — the Finance tab being open.
   *
   * Auto-show used to fire as soon as the payment status loaded, which is on
   * initial page load, on whatever tab opens first. Since any click dismisses
   * the popover, the very click that took you to Finance closed it: it opened
   * and shut again before anybody got to the tab whose banner it replaced.
   *
   * So the trigger is the tab, not the data. Both conditions still have to hold
   * — a resolved status AND the right tab — so this can never open on a null and
   * flash the wrong state.
   */
  autoShowWhen?: boolean;
}

export function StudentFeeStatusPopover({ status, autoShowWhen = false }: Props) {
  const s = normalisePaymentStatus(status);
  const [open, setOpen] = useState(false);
  /** Auto-show fires once per mount, so dismissing it stays dismissed. */
  const autoShown = useRef(false);

  /**
   * Open when the status has ARRIVED and the Finance tab is showing.
   *
   * Not a false→true edge but "first time both are true", so arriving straight
   * on Finance via ?tab=finance works the same as clicking across to it.
   *
   * Latched once per mount: leaving Finance and coming back does not reopen it.
   * Somebody who dismissed this has read it, and re-popping on every visit to
   * the tab is how a notice becomes something people swat away unread.
   *
   * The click that switches to Finance cannot dismiss what this then opens.
   * useEffect runs after the click has finished dispatching, and Radix registers
   * its own outside-pointerdown listener on a setTimeout(0) after that — so by
   * the time anything is listening, that click is long over.
   */
  useEffect(() => {
    if (autoShown.current || !s || !autoShowWhen) return;
    autoShown.current = true;
    if (AUTO_SHOW.includes(s)) setOpen(true);
  }, [s, autoShowWhen]);

  // Same as the plain dot: nothing at all until the status is known. A grey or
  // guessed colour here would be a claim about this student's fees.
  if (!s) return null;

  const notice = NOTICES[s];
  const color = PAYMENT_STATUS_COLORS[s];

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {/* A real <button> rather than the <sup> the plain dot uses: it is
            interactive now, so it should be focusable and operable by keyboard
            without reinventing either. A button is phrasing content, so it is
            valid inside the <h1> this sits in. */}
        <button
          type="button"
          aria-label={`Fees: ${s}. Show details.`}
          style={{
            // Strip the button back to nothing...
            appearance: 'none',
            background: 'none',
            border: 0,
            padding: 0,
            margin: 0,
            font: 'inherit',
            // ...then reproduce the dot exactly as PaymentStatusDot draws it.
            display: 'inline-block',
            width: DOT_SIZE,
            height: DOT_SIZE,
            borderRadius: '50%',
            backgroundColor: color,
            marginLeft: 4,
            verticalAlign: 'super',
            flexShrink: 0,
            position: 'relative',
            cursor: 'pointer',
          }}
        >
          {/* The hit area. Transparent, centred on the dot, and outside the
              button's own box so the dot keeps its 7px look while the tappable
              target is 44px — the smallest a touch target should be. */}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: HIT_AREA,
              height: HIT_AREA,
              transform: 'translate(-50%, -50%)',
            }}
          />
        </button>
      </Popover.Trigger>

      {/* Portalled to <body>. This matters here rather than being a default:
          app/(app)/layout.tsx wraps the page in `overflow-hidden` and the
          scrolling <main> in `overflow-y-auto`, so a popover rendered in place
          would be clipped by both and simply never appear. */}
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={8}
          // Flips to the top by itself when the dot is near the bottom of the
          // viewport (avoidCollisions is on by default), and never comes within
          // 16px of any screen edge.
          collisionPadding={16}
          // Opened without taking focus, deliberately. It is an explanation, not
          // a task: yanking the caret out of whatever the admin was doing would
          // be worse than the banner it replaces. modal is left false, so there
          // is no focus trap either.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // Closes on a click anywhere. Radix already dismisses on any pointer
          // down OUTSIDE; this covers the inside, so there is nowhere on the
          // page you can click and have it stay open.
          onClick={() => setOpen(false)}
          style={{
            // 280 on anything roomy, and never wider than the viewport less a
            // 16px gutter either side. At 390px this resolves to 280.
            width: 'min(280px, calc(100vw - 32px))',
            backgroundColor: '#FFFFFF',
            // The banner's exact treatment: same colour per state, same thick
            // left edge. Nothing about the states is restyled.
            border: `1px solid ${color}`,
            borderLeftWidth: 4,
            borderRadius: 6,
            padding: '0.75rem 0.875rem',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
            // Above EVERYTHING this app stacks, checked rather than assumed:
            // mobile header z-30, sidebar overlay z-40, sidebar itself z-50,
            // support button z-60. This started at 50, which tied the sidebar
            // (leaving DOM order to decide) and sat flatly underneath the
            // support button. A popover that something else covers is the same
            // as no popover.
            zIndex: 70,
          }}
        >
          <p className="text-sm" style={{ color, fontWeight: 600 }}>{notice.title}</p>
          <p className="text-sm text-gray-600" style={{ marginTop: '0.25rem' }}>{notice.detail}</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
