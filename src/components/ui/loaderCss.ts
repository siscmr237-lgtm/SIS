/**
 * The in-place loader: a spinner centred in whatever region is still waiting on
 * the database, with "Loading Contents" under it.
 *
 * WHAT REPLACED WHAT. This app briefly covered the whole viewport while a page
 * opened. That hid the parts of the screen that were never waiting on anything
 * -- the menu, the page title, the search box, the table's own headings -- and
 * so made a fast page look slow and a slow one look broken. Everything that is
 * already known at render time now paints immediately, and only the areas whose
 * contents come from the server carry one of these.
 *
 * MOUNTED ONCE, IN app/layout.tsx, for the reason buttonPressCss.ts gives: a
 * page like Finance has several loading regions at once, and a <style> inside
 * the component would put a copy of this text in the DOM for each of them.
 * Duplicate rules are inert, but the bytes are not.
 *
 * WHY CSS TEXT RATHER THAN CLASSES. src/index.css is a frozen pre-compiled
 * Tailwind build -- a utility that is not already in it resolves to nothing at
 * all, silently -- and a keyframe cannot be written as a utility or as an
 * inline style in any case. Same arrangement as motionCss.ts and
 * mobileDrawerCss.ts.
 */
export const CONTENT_LOADER_CSS = `
  @keyframes sis-loader-spin {
    to { transform: rotate(360deg); }
  }
  /* Centres on both axes and fills the width it is given, so the spinner lands
     in the middle of the region it stands in rather than in the middle of the
     screen. min-height gives it somewhere to be centred VERTICALLY: dropped
     into an empty table body or an empty card, the region's natural height is
     whatever this element is, and without a floor the "centre" would be a few
     pixels tall. Overridable inline per region -- see ContentLoader.tsx. */
  [data-sis-loader] {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    width: 100%;
    min-height: 180px;
    padding: 32px 16px;
    box-sizing: border-box;
  }
  [data-sis-loader-spinner] {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 3px solid rgba(15, 35, 69, 0.15);
    border-top-color: #0f2345;
    animation: sis-loader-spin 700ms linear infinite;
  }
  [data-sis-loader-text] {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    color: #0f2345;
  }
  /* The figure-sized variant: the same ring, inline, with no label beside it.
     inline-block rather than flex so it sits on the text baseline of the line
     it replaces, and the border scales down to 2px -- 3px on a 22px ring reads
     as a solid disc rather than a spinner. Its size comes from the element's
     own style attribute, since it is chosen per call site. */
  [data-sis-loader-inline] {
    display: inline-block;
    border-radius: 50%;
    border: 2px solid rgba(15, 35, 69, 0.15);
    border-top-color: #0f2345;
    animation: sis-loader-spin 700ms linear infinite;
    vertical-align: middle;
  }
  /* Slowed rather than stopped. The spin is the only thing here saying the app
     is still working; a motionless ring reads as a region that has finished
     loading badly. Stopping it would also leave no way to tell this apart from
     an empty result. */
  @media (prefers-reduced-motion: reduce) {
    [data-sis-loader-spinner] { animation-duration: 2400ms; }
  }
`;
