/**
 * The mobile navigation drawer's slide, shared by the admin shell and the
 * teacher shell so the two cannot drift apart.
 *
 * WHY THIS IS CSS RATHER THAN UTILITY CLASSES. The drawer used to sit off-screen
 * via `-translate-x-full`. Moving it to the right edge needs the mirror of that,
 * `translate-x-full` — and that class is NOT in src/index.css. The stylesheet is
 * a frozen pre-compiled build, so the class would have parsed, shipped, and done
 * nothing at all: the drawer would have sat permanently across the screen with
 * no error anywhere. Checked before writing rather than discovered afterwards.
 *
 * A transition rather than keyframes, because the drawer is always mounted and
 * only ever moves between two transforms — there is no enter/exit to animate,
 * just a value change, which is exactly what a transition is for.
 *
 * Scoped to data attributes, so none of it can reach anything else.
 */
export const MOBILE_DRAWER_CSS = `
  [data-sis-drawer] {
    transition: transform 300ms ease-in-out;
    /* Parked off the RIGHT edge, matching the button that opens it. */
    transform: translateX(100%);
    z-index: 65;
  }
  [data-sis-drawer][data-open="true"] { transform: translateX(0); }

  [data-sis-drawer-overlay] {
    background: rgba(0, 0, 0, 0.5);
    opacity: 0;
    /* Kept mounted so it can fade out with the drawer instead of vanishing the
       instant the state flips. pointer-events is what stops an invisible sheet
       swallowing taps while it is closed. */
    pointer-events: none;
    transition: opacity 300ms ease-in-out;
    z-index: 64;
  }
  [data-sis-drawer-overlay][data-open="true"] { opacity: 1; pointer-events: auto; }

  /* DESKTOP IS UNTOUCHED. From md up the sidebar is a static flex child, so the
     right/inset offsets stop applying by themselves — but a transform applies to
     a static element too, so it has to be cleared explicitly or the desktop
     sidebar would sit one full width off the side of the screen. */
  @media (min-width: 768px) {
    [data-sis-drawer] {
      transform: none;
      transition: none;
      z-index: auto;
    }
    [data-sis-drawer-overlay] { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-sis-drawer],
    [data-sis-drawer-overlay] { transition-duration: 1ms; }
  }
`;
