/**
 * The app's motion vocabulary, in one file so the dialogs, the popovers, the
 * dropdowns, the buttons and the tables cannot drift apart.
 *
 * WHY THIS IS CSS TEXT RATHER THAN CLASSES. src/index.css is a frozen
 * pre-compiled Tailwind build: a utility that is not already in it parses,
 * ships, and does nothing at all -- silently. Everything below is either a
 * keyframe (which no style attribute can express) or a rule keyed on a state
 * Radix publishes as a data attribute, or on :hover / :active. None of those
 * three can be written inline either, so they are rules in a component-scoped
 * <style> element, which is the same arrangement PhoneInput, StudentProfile and
 * mobileDrawerCss already use.
 *
 * WHY KEYFRAMES AND NOT TRANSITIONS FOR THE OPEN/CLOSE ANIMATIONS. Radix's
 * Presence keeps a closing element mounted only until its `animationend` (or
 * `transitionend`) fires. A transition on a property that is not actually
 * changing at the moment `data-state` flips never fires an event, so the
 * element is torn out instead of fading. A keyframe animation always runs, so
 * `animation-name` changing from the in- to the out- pair is what makes the
 * CLOSE animation play at all rather than being discarded -- which is the half
 * of this that usually breaks. Same reasoning, same timings as the "Custom
 * fees" bubble in StudentProfile.tsx, which already worked this way.
 *
 * BUDGET. Everything here lands between 80ms and 200ms. That is deliberate:
 * these run on a mid-range Android phone, and only `opacity`, `transform` and
 * `box-shadow` are animated, all of which the compositor can handle without a
 * layout pass.
 */

/**
 * Shared by every overlay surface. Defined once and included wherever a rule
 * below is used -- duplicate identical @keyframes blocks are inert, and asking
 * each calling file to also mount a keyframes provider is the kind of setup
 * step that gets forgotten on the seventh caller.
 */
const POP_KEYFRAMES = `
  @keyframes sis-pop-in {
    from { opacity: 0; transform: scale(0.96); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes sis-pop-out {
    from { opacity: 1; transform: scale(1); }
    to   { opacity: 0; transform: scale(0.96); }
  }
  @keyframes sis-veil-in  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes sis-veil-out { from { opacity: 1; } to { opacity: 0; } }
`;

/**
 * Fade-and-scale for one Radix surface, addressed by whatever selector its
 * component gives it.
 *
 * `ease-out` opening and `ease-in` closing, because those are the curves that
 * read as "arriving" and "leaving" -- an easing that decelerates into place on
 * the way in and accelerates away on the way out.
 *
 * A NOTE ON `transform`. Every surface this is applied to is safe to scale:
 *
 *  - Radix's popper puts its positioning transform on the wrapper element
 *    ([data-radix-popper-content-wrapper]), not on the content, so scaling the
 *    content cannot move it off its anchor.
 *  - The dialog is centred with the `translate` PROPERTY (index.css compiles
 *    `translate-x-[-50%]` to `translate: var(--tw-translate-x) ...`), which is
 *    a separate property from `transform` and is applied before it. So the
 *    scale composes with the centring instead of replacing it -- the dialog
 *    grows about its own middle and stays centred throughout.
 *
 * The reduced-motion branch shortens rather than removes the animation: Radix
 * is waiting for `animationend` to unmount the element, and an animation that
 * does not run never sends one, which would leave closed dialogs in the DOM.
 */
export function popMotionCss(selector: string): string {
  return `${POP_KEYFRAMES}
  ${selector}[data-state="open"]   { animation: sis-pop-in 150ms ease-out; }
  ${selector}[data-state="closed"] { animation: sis-pop-out 150ms ease-in; }
  @media (prefers-reduced-motion: reduce) {
    ${selector}[data-state="open"],
    ${selector}[data-state="closed"] { animation-duration: 1ms; }
  }`;
}

/**
 * Opacity only, for the dialog's backdrop. The element already carries
 * `bg-black/50`, so fading it from 0 to 1 is what "fades in to 50% black" means
 * here -- animating the colour itself would need a second declaration to fight
 * with the class that sets it.
 *
 * No scale: a scaled full-screen backdrop pulls its own edges inside the
 * viewport and shows a bright rim around the page for the duration.
 */
export function veilMotionCss(selector: string): string {
  return `${POP_KEYFRAMES}
  ${selector}[data-state="open"]   { animation: sis-veil-in 150ms ease-out; }
  ${selector}[data-state="closed"] { animation: sis-veil-out 150ms ease-in; }
  @media (prefers-reduced-motion: reduce) {
    ${selector}[data-state="open"],
    ${selector}[data-state="closed"] { animation-duration: 1ms; }
  }`;
}

/**
 * Rows appearing as a table's data arrives.
 *
 * OPACITY ONLY, no translate. A `tr` is transformable, but a table row that
 * slides also drags the cell borders it shares with its neighbours, which on a
 * bordered table reads as the whole grid twitching. A fade needs no layout and
 * no border repaint.
 *
 * `both` as the fill mode is load-bearing: the stagger below is an
 * `animation-delay`, and without a backwards fill every row is painted fully
 * opaque during its own delay and then blinks to transparent when the animation
 * finally starts.
 *
 * A row animates when it MOUNTS, which is exactly "when the data loads and the
 * rows appear" -- and, because the rows are keyed by record id, it also means a
 * newly added record fades in on its own while the rows around it sit still.
 */
export const TABLE_ROW_MOTION_CSS = `
  @keyframes sis-row-in { from { opacity: 0; } to { opacity: 1; } }
  [data-sis-row] { animation: sis-row-in 180ms ease-out both; }
  @media (prefers-reduced-motion: reduce) {
    [data-sis-row] { animation-duration: 1ms; animation-delay: 0ms !important; }
  }
`;

/**
 * The per-row stagger, as an inline style because a delay that differs per row
 * is a VALUE, not a state, and there is no way to write 500 of them as rules.
 *
 * CAPPED AT THE TENTH ROW. 30ms each is a pleasant cascade over a screenful and
 * an unusable wait over a roster: row 200 would be held back by six seconds,
 * and a school with 800 students would watch the table fill for half a minute.
 * Past the tenth row every row shares row ten's delay, so the visible part of a
 * long list still cascades and the rest arrives with it.
 */
export function rowStaggerStyle(index: number): { animationDelay: string } {
  return { animationDelay: `${Math.min(index, 9) * 30}ms` };
}

/**
 * Every open/close rule for the four shared Radix surfaces, in one block.
 *
 * MOUNTED ONCE, IN app/layout.tsx, AND NOT BY THE COMPONENTS THEMSELVES. This
 * placement is the whole reason the close animation works, so it is worth being
 * precise about.
 *
 * Radix's Portal wraps EACH of its children in its own <Presence> keyed on the
 * open state (React.Children.map(...) => <Presence present={context.open}>, in
 * @radix-ui/react-dialog). A <style> element rendered next to DialogContent is
 * therefore a Presence child too -- and, having no animation of its own, it is
 * torn out the instant `open` flips to false. It would take the closing panel's
 * only `animation` declaration with it, so Presence would then measure
 * `animationName: none` on the panel, conclude nothing is animating, and unmount
 * it immediately. The exit animation would never be seen. A stylesheet that must
 * outlive the elements it animates cannot be mounted inside the thing that is
 * being unmounted, and the document is the only scope that is reliably longer
 * lived than any dialog.
 *
 * (Radix's Popover.Portal is stricter still: it is a single Presence around
 * React.Children.only, so a second child there is not a subtle bug but a throw.)
 *
 * The components below keep no animation classes of their own -- see
 * src/components/ui/dialog.tsx for why they had to come off.
 */
export const OVERLAY_MOTION_CSS = `
${veilMotionCss('[data-slot="dialog-overlay"]')}
${popMotionCss('[data-slot="dialog-content"]')}
${popMotionCss('[data-slot="popover-content"]')}
${popMotionCss('[data-slot="dropdown-menu-content"]')}
${popMotionCss('[data-slot="dropdown-menu-sub-content"]')}
`;

/**
 * The page transition for the school and teacher shells. Applied by
 * src/components/PageFade.tsx, which is where the remount that restarts it is
 * explained.
 */
export const PAGE_FADE_CSS = `
  @keyframes sis-page-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: none; }
  }
  [data-sis-page-fade] { animation: sis-page-in 200ms ease-out both; }
  @media (prefers-reduced-motion: reduce) {
    [data-sis-page-fade] { animation-duration: 1ms; }
  }
`;
