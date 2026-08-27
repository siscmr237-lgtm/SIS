/**
 * The press feel for every shared Button: a small lift under the cursor, a snap
 * down on the click, and a spring back on release.
 *
 * MOUNTED ONCE, IN app/layout.tsx. There are ~150 <Button>s in this app and a
 * <style> element inside the component would be ~150 copies of this text in the
 * DOM of a page like Finance. Duplicate rules are inert, but the bytes are not,
 * and the phones this has to stay quick on are the reason for the whole budget.
 * The root layout already mounts SCROLL_LOCK_GUTTER_CSS for the same reason --
 * rules that have to reach elements that file does not itself render.
 *
 * WHY THE CLASS IS NAMED TWICE IN EVERY SELECTOR. Two reasons, and both are
 * load-bearing.
 *
 * Specificity is the first. src/index.css is a frozen Tailwind build whose
 * utilities are single classes, so `.transition-all` -- which buttonVariants
 * puts on every button -- scores (0,1,0), and a single `.sis-press` would tie
 * with it and lose or win on whichever order the browser happened to receive the
 * two stylesheets in. `.sis-press.sis-press` is the same element, matched twice,
 * for (0,2,0): it wins on specificity, so nothing here depends on document
 * order.
 *
 * The second is why this is not anchored on `[data-slot="button"]` instead,
 * which would have scored the same and read better. Radix's Slot hands its own
 * props to its child, and Button spreads `...props` AFTER its own attributes --
 * so every Button rendered through `<DialogTrigger asChild>`,
 * `<DialogClose asChild>` or any other asChild trigger comes out of the DOM as
 * `data-slot="dialog-trigger"`. That is 34 buttons in this app, most of them the
 * Cancel and Open buttons on the dialogs, and an attribute selector silently
 * skipped every one of them. The class is set by Button itself and cannot be
 * overwritten by a parent, so it is the thing worth matching on.
 *
 * THE COLOUR PROPERTIES ARE IN THE TRANSITION LISTS ON PURPOSE. `transition` is
 * a shorthand, so naming only transform and box-shadow would reset
 * transition-property from `all` back to those two and make every variant's
 * `hover:bg-primary/90` snap instantly. They are listed so the existing colour
 * fade survives.
 *
 * NOTHING DISABLED ANIMATES. buttonVariants already sets
 * `disabled:pointer-events-none`, so :hover and :active cannot fire on a
 * disabled button at all -- but `:not(:disabled)` is written out anyway,
 * because it is also what excludes the aria-disabled buttons that stay
 * clickable in order to explain themselves.
 */

/** Everything the lift is, minus the timing. */
const LIFT = 'transform: translateY(-1px); box-shadow: 0 3px 8px rgba(15, 35, 69, 0.18);';

/**
 * The absence of a shadow, written as a transparent one rather than as `none`.
 * `none` and a shadow list are interpolable, but only by Chrome's reading of the
 * shadow as zero-sized and transparent -- spelling that out means the fade of
 * the shadow on press is animating between two shadows of the same shape, which
 * is the case every engine handles identically.
 */
const NO_LIFT = 'box-shadow: 0 0 0 rgba(15, 35, 69, 0);';

export const BUTTON_PRESS_CSS = `
  /* Rest, and the curve a button returns on. */
  .sis-press.sis-press {
    ${NO_LIFT}
    transition: transform 150ms ease-out, box-shadow 150ms ease-out,
                background-color 150ms ease, color 150ms ease, border-color 150ms ease;
  }

  /* HOVER IS FOR POINTERS ONLY. On a touchscreen :hover latches after a tap and
     leaves the button lifted until something else is touched, so the lift would
     read as "still pressed". Phones get the press below and nothing else. */
  @media (hover: hover) and (pointer: fine) {
    .sis-press.sis-press:hover:not(:disabled):not([aria-disabled="true"]) {
      ${LIFT}
      transition: transform 120ms ease, box-shadow 120ms ease,
                  background-color 120ms ease, color 120ms ease, border-color 120ms ease;
    }
  }

  /* THE PRESS. :active rather than a mousedown handler, so this is one rule
     instead of state on 150 components -- and so it also covers a finger on a
     touchscreen and the Space/Enter activation of a focused button, neither of
     which sends a mouse event. Listed after the hover rule at equal
     specificity, which is what lets it flatten the lift it is replacing. */
  .sis-press.sis-press:active:not(:disabled):not([aria-disabled="true"]) {
    transform: translateY(0) scale(0.96);
    ${NO_LIFT}
    transition: transform 80ms ease-in, box-shadow 80ms ease-in;
  }

  /* THE RELEASE. A transition is chosen by the state being moved TO, and the
     state a release moves to is "hovered" -- whose rule above is the 120ms one.
     So the 150ms ease-out spring cannot be expressed in CSS alone: Button
     stamps data-press="up" for the length of the spring and clears it, and this
     rule outranks the hover rule (six subclass selectors to five) for exactly
     that window. It sets no transform, so the button still springs back to
     whatever hover or rest says -- only the curve it takes is different. */
  .sis-press.sis-press[data-press="up"]:not(:disabled):not([aria-disabled="true"]):not(:active) {
    transition: transform 150ms ease-out, box-shadow 150ms ease-out,
                background-color 150ms ease, color 150ms ease, border-color 150ms ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .sis-press.sis-press,
    .sis-press.sis-press:hover:not(:disabled),
    .sis-press.sis-press:active:not(:disabled) {
      transform: none;
      ${NO_LIFT}
      transition-duration: 1ms;
    }
  }
`;

/** How long data-press="up" is held. Matches the 150ms release above. */
export const BUTTON_RELEASE_MS = 150;
