'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { PAYMENT_STATUS_COLORS, PAYMENT_STATUS_DOT_COLORS, normalisePaymentStatus, type PaymentStatus } from './PaymentStatus';
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

/**
 * The open/close animation.
 *
 * A <style> element rather than inline styles, and that is forced rather than
 * preferred: keyframes cannot be expressed in a style attribute, and
 * src/index.css is a frozen pre-compiled build. It is also what makes the
 * CLOSING half work at all — Radix keeps a closing element mounted until its
 * animationend fires, so a CSS *transition* would be discarded the instant
 * state flipped and the popover would still vanish abruptly. It has to be an
 * animation.
 *
 * Scoped to the data attribute below, so it cannot touch anything else.
 */
const BUBBLE_ANIMATION = `
@keyframes sis-fee-popover-in {
  from { opacity: 0; transform: scale(0.94); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes sis-fee-popover-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.94); }
}
.sis-fee-popover[data-state="open"] {
  animation: sis-fee-popover-in 150ms cubic-bezier(0.16, 1, 0.3, 1);
}
.sis-fee-popover[data-state="closed"] {
  animation: sis-fee-popover-out 150ms ease-in;
}
@media (prefers-reduced-motion: reduce) {
  .sis-fee-popover[data-state="open"],
  .sis-fee-popover[data-state="closed"] { animation-duration: 1ms; }
}
`;

export function StudentFeeStatusPopover({ status, autoShowWhen = false }: Props) {
  const s = normalisePaymentStatus(status);
  const [open, setOpen] = useState(false);
  /** Auto-show fires once per mount, so dismissing it stays dismissed. */
  const autoShown = useRef(false);

  /**
   * Whether this device has a real pointer.
   *
   * `(pointer: fine)` and not a width breakpoint: the question is whether the
   * user can hover, and a narrow desktop window still can while a wide tablet
   * still cannot. Touch devices report `coarse`, so they never get hover-to-open
   * and keep the tap behaviour this component was built around.
   *
   * Read in an effect rather than in useState's initialiser because this
   * renders on the server too, where matchMedia does not exist. Starting false
   * also means the touch behaviour is the one that survives hydration.
   */
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    setCanHover(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setCanHover(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  /**
   * Closing is deferred so the pointer can cross the gap between the dot and
   * the bubble without it shutting on the way. Entering either end cancels it.
   */
  const closeTimer = useRef<number | null>(null);
  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const hoverOpen = () => {
    cancelClose();
    setOpen(true);
  };
  const hoverClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };
  useEffect(() => cancelClose, []);

  /**
   * A pointer event only counts as hover if the device has a fine pointer AND
   * this particular event came from one. Both are checked because a hybrid
   * laptop satisfies `(pointer: fine)` and still delivers touch events.
   */
  const isHoverPointer = (e: ReactPointerEvent) => canHover && e.pointerType !== 'touch';

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
  // The dot alone takes the lighter 'Owing' gold; the border, heading and arrow
  // below stay the readable hue. See PAYMENT_STATUS_DOT_COLORS.
  const dotColor = PAYMENT_STATUS_DOT_COLORS[s];

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
          // Hover opens it on a pointer device; the click Radix already handles
          // keeps working everywhere, so touch is untouched.
          onPointerEnter={(e) => { if (isHoverPointer(e)) hoverOpen(); }}
          onPointerLeave={(e) => { if (isHoverPointer(e)) hoverClose(); }}
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
            backgroundColor: dotColor,
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
      {/* The fade, both directions.
          Radix marks the content [data-state="open"|"closed"], and an attribute
          selector is not something an inline style can express — hence a rule
          rather than a style prop. One scoped class, no Tailwind, nothing
          global.

          KEYFRAMES, NOT A TRANSITION, and that distinction is the whole thing.
          On the way in, Radix mounts this element already open, so a transition
          has no earlier value to move from and would snap straight to opacity 1
          with nothing to see. On the way OUT it matters even more: Radix's
          Presence holds a closing element in the DOM until its animationend
          fires, so an animation is what buys the exit its time on screen. A
          transition would be discarded the moment state flipped and the popover
          would disappear instantly — which is the snap this replaces.

          No forceMount, and deliberately not: that would leave a permanently
          mounted layer over the page, which is exactly wrong when any click is
          supposed to dismiss this. Presence handles the unmount by itself once
          the exit animation finishes.

          Outside the Portal on purpose: Portal passes its children through a
          Slot that takes exactly one element, so a second child there throws.
          A <style> applies document-wide once mounted, so where it sits makes
          no difference to whether the rule reaches the portalled content. */}
      <style>{BUBBLE_ANIMATION}</style>

      <Popover.Portal>
        <Popover.Content
          className="sis-fee-popover"
          side="bottom"
          // Centred on the dot rather than edge-aligned, because the arrow now
          // has to point AT the dot — a start-aligned bubble would leave its
          // arrow off to one side of the thing it describes.
          align="center"
          // Just the arrow's height. The bubble is attached to the dot now
          // rather than floating below it, so there is no gap left to cross.
          sideOffset={6}
          // Hover keeps it open while the pointer is over the bubble itself,
          // and starts the close when it leaves. Touch is unaffected.
          onPointerEnter={(e) => { if (isHoverPointer(e)) hoverOpen(); }}
          onPointerLeave={(e) => { if (isHoverPointer(e)) hoverClose(); }}
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
            // Sized to the words in it, not to a fixed slab. The old 280px was
            // a desktop measurement that a phone then had to live with: on a
            // 390px screen it was most of the width regardless of whether the
            // sentence needed it. max-content lets each state's own copy decide,
            // and the cap keeps a 16px gutter either side on the narrowest
            // screen, where the text wraps instead of overflowing.
            width: 'max-content',
            maxWidth: 'calc(100vw - 32px)',
            backgroundColor: '#FFFFFF',
            // A hairline all the way round. The 4px left edge was inherited from
            // the banner this replaced, where it ran the full width of the page
            // and read as a spine — on something this small it just looked like
            // a slab with a stripe.
            border: `1px solid ${color}`,
            borderRadius: 8,
            padding: '0.5rem 0.625rem',
            boxShadow: '0 6px 16px rgba(0, 0, 0, 0.12)',
            // Scale out of whichever corner the arrow ended up on, so the bubble
            // grows from the dot rather than from its own middle. Radix computes
            // this per placement, including after a collision flip.
            transformOrigin: 'var(--radix-popover-content-transform-origin)',
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
          <p className="text-sm text-gray-600" style={{ marginTop: '0.125rem' }}>{notice.detail}</p>
          {/* Filled in the state colour rather than the card's white, so it
              reads as the outline coming to a point. A white arrow would need a
              matching outline on its two visible edges and none on its base,
              which an SVG polygon cannot express without a second overlapping
              arrow — far more machinery than a 5px triangle deserves. */}
          <Popover.Arrow width={11} height={5} style={{ fill: color }} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
