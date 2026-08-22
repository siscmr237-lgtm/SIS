'use client';

import type { CSSProperties } from 'react';

/**
 * How dialogs on the student profile are sized.
 *
 * WHY THIS EXISTS. shadcn's DialogContent is `position: fixed; top: 50%;
 * translate-y: -50%` with NO max-height and NO scroll container, and Radix's
 * modal locks body scroll while it is open. So the moment its content is taller
 * than the viewport it bleeds off the top AND the bottom at once, and neither
 * end can be reached -- the title cut off above the screen, the submit buttons
 * below it, nothing scrollable in between.
 *
 * AND WHY THE WIDTH IS HERE TOO. `className="max-w-md"` did nothing at all.
 * src/index.css is a frozen pre-compiled Tailwind build and `.max-w-md` was
 * never compiled into it, so the cap silently fell through to shadcn's own
 * `max-w-[calc(100%-2rem)] sm:max-w-lg` -- measured 512px, never the 448px
 * asked for. A utility that is not already in that file renders as nothing,
 * with no warning, which is why width is an inline style and not a class.
 *
 * ---------------------------------------------------------------------------
 * WHY THE HEIGHT CAP IS CSS AND NOT AN INLINE STYLE
 *
 * It used to be inline: `maxHeight: 'calc(100dvh - 2rem)'`. That verified clean
 * in headless Chrome and still broke on a real phone, because dvh is Chrome
 * 108+ / Safari 16.4+ / Firefox 101+ and an inline style has NOWHERE to fall
 * back to. On a browser that does not know the unit the whole declaration is
 * invalid, so max-height reverts to `none` -- and `none` is the original bug,
 * exactly: the dialog grows to its full content height with body scroll locked
 * and runs off both ends of the screen. A device too old for dvh got no cap at
 * all while the test browser reported everything fine.
 *
 * Two declarations in a stylesheet can do what one inline style cannot: vh
 * first as the floor, dvh layered on top only where it is understood. Everyone
 * gets a cap; modern browsers get the better one.
 *
 * dvh is worth having rather than settling for vh, because on a phone 100vh is
 * the LARGEST the viewport ever gets -- it deliberately ignores the browser's
 * own chrome -- so a vh-capped dialog is still taller than what you can see
 * while the address bar is showing, and taller again once the keyboard is up.
 * dvh tracks the viewport that actually exists right now.
 *
 * Specificity: `[data-slot="dialog-content"][data-dialog-frame]` is two
 * attribute selectors, which outranks any single utility class in the frozen
 * build, so none of shadcn's own classes can win these properties back.
 *
 * PORTALLED POPOVERS ARE UNAFFECTED by the overflow here. ThreePartDateInput's
 * month/day/year lists and Radix's Select both render through a Portal onto
 * document.body, so they are not descendants of this box and cannot be clipped
 * by it. Worth checking rather than assuming: it is the reason a date control
 * works at all inside a dialog that scrolls.
 */
const DIALOG_SIZING_CSS = [
  // The three-part frame: pinned head, scrolling middle, pinned foot.
  '[data-slot="dialog-content"][data-dialog-frame]{',
  '  display:flex;flex-direction:column;padding:0;gap:0;overflow:hidden;',
  '  max-height:calc(100vh - 2rem)}',
  '@supports (max-height: 100dvh){',
  '  [data-slot="dialog-content"][data-dialog-frame]{max-height:calc(100dvh - 2rem)}}',
  // Whole-dialog scroll, for a dialog with no separable middle.
  '[data-slot="dialog-content"][data-dialog-scroll]{',
  '  max-height:calc(100vh - 2rem);overflow-y:auto;overscroll-behavior:contain}',
  '@supports (max-height: 100dvh){',
  '  [data-slot="dialog-content"][data-dialog-scroll]{max-height:calc(100dvh - 2rem)}}',
  // Right padding clears the absolutely-positioned close button at top-4 right-4.
  '[data-dialog-head]{flex:0 0 auto;padding:1.25rem 3rem .75rem 1.25rem}',
  '[data-dialog-head] [data-slot="dialog-header"]{gap:.35rem}',
  /* min-height:0 is load-bearing. A flex item defaults to min-height:auto and
     refuses to shrink below its own content, so without it this box pushes the
     frame taller than the frame's own max-height and nothing scrolls at all. */
  '[data-dialog-body]{flex:1 1 auto;min-height:0;overflow-y:auto;',
  '  overscroll-behavior:contain;padding:0 1.25rem 1rem}',
  '[data-dialog-foot]{flex:0 0 auto;border-top:1px solid #E5E7EB;',
  '  padding:.875rem 1.25rem;background:#FFFFFF}',
].join('\n');

/**
 * The sizing rules, rendered by each dialog that uses them.
 *
 * Scoped this way rather than added to src/index.css because that file is a
 * frozen pre-compiled artifact. Two dialogs both rendering it is harmless --
 * the rules are identical and idempotent.
 */
export function DialogSizing() {
  return <style>{DIALOG_SIZING_CSS}</style>;
}

/**
 * The one thing that still has to be inline, because it carries a per-dialog
 * number. No unit-support hazard here: min() and calc() are both universal.
 */
export function dialogWidth(maxWidth: number): CSSProperties {
  return { maxWidth: `min(${maxWidth}px, calc(100vw - 2rem))` };
}

/**
 * The ordinary case, for the page's short dialogs: the whole dialog scrolls as
 * one, header and footer included. Nothing to restructure at the call site.
 *
 * Kept inline for these callers, and kept on vh, deliberately. An inline
 * max-height cannot carry a dvh fallback -- see the note above -- so vh is the
 * value that works in every browser. These dialogs are all short enough that
 * the difference between vh and dvh is slack rather than a cut-off button.
 * Reach for dialogFrame + data-dialog-* instead when a dialog is tall enough
 * that the distinction matters.
 */
export function dialogShell(maxWidth: number): CSSProperties {
  return {
    maxWidth: `min(${maxWidth}px, calc(100vw - 2rem))`,
    maxHeight: 'calc(100vh - 2rem)',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  };
}

/**
 * A dialog whose header and footer stay pinned while only its middle scrolls.
 *
 * Pair with DIALOG_BODY on the one child that should scroll. Superseded for new
 * work by DialogSizing + data-dialog-frame, which carries the dvh fallback;
 * this remains for the Edit Student dialog, which already has this shape.
 */
export function dialogFrame(maxWidth: number): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: `min(${maxWidth}px, calc(100vw - 2rem))`,
    maxHeight: 'calc(100vh - 2rem)',
    overflow: 'hidden',
  };
}

/** The scrolling middle of a dialogFrame. See the min-height note above. */
export const DIALOG_BODY: CSSProperties = {
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
};
