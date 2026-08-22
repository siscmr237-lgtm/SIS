import type { CSSProperties } from 'react';

/**
 * How every dialog on the student profile is sized.
 *
 * WHY THIS EXISTS. shadcn's DialogContent is `position: fixed; top: 50%;
 * translate-y: -50%` with NO max-height and NO scroll container, and Radix's
 * modal locks body scroll while it is open. So the moment its content is taller
 * than the viewport it bleeds off the top AND the bottom at once, and neither
 * end can be reached — the title is cut off above the screen and the submit
 * buttons sit below it, with nothing scrollable in between. Record Payment
 * (458px tall) and the group-settlement dialog (443-543px) were the two tallest
 * on the page, so they broke first: on a phone in landscape, and in portrait the
 * instant the on-screen keyboard opens and takes ~250px of viewport height.
 *
 * AND WHY THE WIDTH IS HERE TOO. `className="max-w-md"` did nothing at all.
 * src/index.css is a frozen pre-compiled Tailwind build and `.max-w-md` was
 * never compiled into it, so the cap silently fell through to shadcn's own
 * `max-w-[calc(100%-2rem)] sm:max-w-lg` — measured 512px, never the 448px
 * asked for. A utility that is not already in that file renders as nothing, with
 * no warning, which is exactly why this is an inline style and not a class.
 * StudentFeeOverrideDialog and ReportCardTermDialog already pass inline maxWidth
 * for the same reason; this just gives the reason a name.
 *
 * dvh, NOT vh. On a phone `vh` is the tallest the viewport ever gets — it
 * ignores the browser's own chrome — so a vh-capped dialog is still cut off by
 * the address bar. dvh tracks the viewport that actually exists right now,
 * including when the keyboard is up.
 *
 * PORTALLED POPOVERS ARE UNAFFECTED by the overflow here. ThreePartDateInput's
 * month/day/year lists and Radix's Select both render through a Portal onto
 * document.body, so they are not descendants of this box and cannot be clipped
 * by it. That was worth checking rather than assuming: it is the reason a date
 * control works inside a scrolling dialog at all.
 */

/**
 * The ordinary case: the whole dialog scrolls as one.
 *
 * Nothing to restructure at the call site — the header and footer scroll with
 * the content, which is the right trade for a short form. Use dialogFrame below
 * when the footer needs to stay put.
 */
export function dialogShell(maxWidth: number): CSSProperties {
  return {
    maxWidth: `min(${maxWidth}px, calc(100vw - 2rem))`,
    maxHeight: 'calc(100dvh - 2rem)',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  };
}

/**
 * A dialog whose header and footer stay pinned while only its middle scrolls —
 * for content long enough that losing sight of the submit button matters.
 *
 * Pair it with DIALOG_BODY on the one child that should scroll.
 */
export function dialogFrame(maxWidth: number): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: `min(${maxWidth}px, calc(100vw - 2rem))`,
    maxHeight: 'calc(100dvh - 2rem)',
    overflow: 'hidden',
  };
}

/**
 * The scrolling middle of a dialogFrame.
 *
 * `minHeight: 0` is load-bearing. A flex item defaults to `min-height: auto` and
 * refuses to shrink below its own content, so without it this box pushes the
 * frame taller than the frame's own max-height and nothing scrolls anywhere.
 */
export const DIALOG_BODY: CSSProperties = {
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
};
