"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { readsInFlightCount } from "../lib/pageLoading";

/**
 * THE VEIL EVERY PAGE OPENS BEHIND.
 *
 * A centred spinner over a full-screen white field with "Loading Contents"
 * under it, shown from the moment a page starts opening until it has actually
 * finished opening -- meaning its data has landed, not merely that its
 * component mounted.
 *
 * MOUNTED ONCE, IN app/layout.tsx, which is the only ancestor common to the
 * marketing page, the school app, the teacher app, the admin console and the
 * login screens. That is what makes this one component rather than an addition
 * to five shells, and it is why a page added next week is covered the moment it
 * is routed -- the same argument PageFade.tsx makes for living in the shells
 * rather than in seventeen page files.
 *
 * WHY VISIBILITY IS DERIVED DURING RENDER AND NOT SET FROM AN EFFECT.
 * `visible` is `settledPath !== pathname`, computed on the way through render.
 * An effect runs AFTER React has committed and, on the default useEffect, after
 * the browser has had a chance to paint -- so showing the veil from one would
 * let a frame of the new, empty page through first, which is the exact flash
 * this exists to cover. Deriving it means the very render that carries the new
 * pathname already carries the veil, with no layout effect and no ordering to
 * get wrong.
 *
 * It also makes the server and the first client render agree by construction:
 * `settledPath` starts null, null is not equal to any pathname, so both sides
 * render the veil visible and hydration matches. A first visit is therefore
 * covered from the first paint, before React has run at all.
 *
 * NOT KEYED ON THE QUERY STRING, for the reason PageFade gives: StudentProfile
 * moves between its own tabs by rewriting ?tab=..., and treating that as a page
 * open would white out the screen on every tab click.
 *
 * WHY THERE IS NOT ONE TAILWIND CLASS BELOW. src/index.css is a frozen
 * pre-compiled Tailwind build -- a utility that is not already in it resolves to
 * nothing at all, silently, and half of what this needs (a keyframe, a
 * transition on `visibility`) is not expressible as a utility in any case. Same
 * arrangement as app/page.tsx and mobileDrawerCss.ts: ordinary CSS in one
 * block, every selector carrying a data attribute that nothing else in the app
 * uses.
 */

/**
 * How long the veil stays up at minimum.
 *
 * Two jobs, not one. The obvious one is that a page which fetches nothing --
 * a login form, the marketing page -- would otherwise flash the veil for a
 * single frame, which reads as a glitch rather than as loading. The
 * load-bearing one is that a page's fetches start in an effect, so for the
 * first moments after a navigation the in-flight count is legitimately zero and
 * the page has not asked for anything YET. Settling inside that window would
 * hide the veil just before the work it is meant to cover begins.
 */
const MIN_VISIBLE_MS = 400;

/**
 * How long the app has to stay idle before the page counts as open.
 *
 * Screens here fetch in waves -- Finance asks for settings, then for the ledger
 * the answer names. Without a quiet period the veil would lift in the gap
 * between two of them and drop again a frame later. 200ms is comfortably longer
 * than the pause between a resolved promise and the fetch its `then` starts,
 * and short enough not to be felt.
 */
const QUIET_MS = 200;

/**
 * The cap. Past this the veil comes down whatever the network is doing.
 *
 * A screen is never held hostage by this component: a request that hangs, a
 * backend that has stopped answering, a page that polls on a timer -- any of
 * them could otherwise keep the count above zero indefinitely. After eight
 * seconds the page's own loading and error states, which every screen already
 * has, are a far better thing to be looking at than a spinner that will never
 * stop.
 */
const MAX_VISIBLE_MS = 8000;

/** How often the settle condition is re-checked. */
const POLL_MS = 50;

const NAVY = "#0f2345";

/**
 * `visibility` is in both transitions on purpose, and with different timing in
 * each. Opacity alone would leave a fully transparent element lying across the
 * whole viewport eating every click; `visibility: hidden` takes it out of hit
 * testing and out of the accessibility tree, but toggled bare it would snap the
 * veil away instead of fading it. Delaying it by exactly the length of the
 * opacity fade on the way out, and zeroing the delay on the way in, gives a
 * fade that ends with the element genuinely gone.
 *
 * The veil appears instantly (`opacity 0s`) and leaves over 220ms. That
 * asymmetry is deliberate: arriving late defeats the point, and leaving
 * abruptly makes the page underneath look like it jumped.
 *
 * z-index 200 sits above everything the app positions -- the mobile header and
 * sidebar (z-30/z-40), dialogs and their overlays (z-50), the support button
 * (z-60) -- and below sonner's toasts, which run in the six figures. That order
 * is the one that stays honest: an error toast raised while a page is still
 * loading is exactly the message that must not be painted over.
 *
 * Opaque white rather than a translucent scrim, because there is no reason to
 * show a half-built page through it, and a backdrop blur is a per-frame GPU
 * cost on the mid-range Android phones this has to stay quick on.
 */
const PAGE_LOADER_CSS = `
  @keyframes sis-page-loader-spin {
    to { transform: rotate(360deg); }
  }
  [data-sis-page-loader] {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18px;
    background: #ffffff;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 220ms ease, visibility 0s linear 220ms;
  }
  [data-sis-page-loader][data-state="visible"] {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transition: opacity 0s, visibility 0s;
  }
  [data-sis-page-loader-spinner] {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 3px solid rgba(15, 35, 69, 0.15);
    border-top-color: ${NAVY};
    animation: sis-page-loader-spin 700ms linear infinite;
  }
  [data-sis-page-loader-text] {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    color: ${NAVY};
  }
  /* Slowed rather than stopped. The spin is the only thing on screen saying the
     app is still working; removing it would leave a motionless ring that reads
     as a page which has finished loading badly. */
  @media (prefers-reduced-motion: reduce) {
    [data-sis-page-loader-spinner] { animation-duration: 2400ms; }
  }
`;

/**
 * The one state this component cannot recover from on its own: no JavaScript,
 * so nothing ever settles the veil and it covers the site permanently.
 *
 * It matters for exactly one page. Every app screen is a client component and
 * is blank without JavaScript anyway, but app/page.tsx -- the public front door
 * -- is a server component that deliberately arrives as finished HTML, and
 * burying THAT behind a spinner that can never clear would be the one genuinely
 * destructive outcome here. Browsers that do run scripts treat the contents of
 * the element below as text and never apply it.
 */
const NO_SCRIPT_CSS = `
  [data-sis-page-loader] { display: none !important; }
`;

export function PageLoader() {
  const pathname = usePathname();

  // The pathname whose page has finished opening. Null until the first one
  // settles, which is what makes the veil visible on the very first render --
  // on the server as well as in the browser.
  const [settledPath, setSettledPath] = useState<string | null>(null);
  const visible = settledPath !== pathname;

  useEffect(() => {
    const openedAt = Date.now();
    // When the app last went idle, or null while a read is outstanding. Reset
    // to null by any new read, which is what makes the quiet period measure a
    // continuous gap rather than a total.
    let quietSince: number | null = null;

    // A poll rather than a subscription on the counter. The counter is written
    // from a `finally` inside two transport functions; having them notify
    // listeners would mean a subscriber set, an unsubscribe path, and a fetch
    // layer that knows what a loader is. Fifty milliseconds is below the
    // threshold at which any of this is perceivable, it runs for at most the
    // eight seconds of MAX_VISIBLE_MS, and it stops the moment the page settles.
    const timer = setInterval(() => {
      const now = Date.now();

      if (readsInFlightCount() > 0) {
        quietSince = null;
      } else if (quietSince === null) {
        quietSince = now;
      }

      const settled =
        now - openedAt >= MIN_VISIBLE_MS &&
        quietSince !== null &&
        now - quietSince >= QUIET_MS;

      if (settled || now - openedAt >= MAX_VISIBLE_MS) {
        clearInterval(timer);
        setSettledPath(pathname);
      }
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [pathname]);

  return (
    <>
      <style>{PAGE_LOADER_CSS}</style>
      <noscript>
        <style>{NO_SCRIPT_CSS}</style>
      </noscript>
      {/* role="status" with a polite live region, so a screen reader hears
          "Loading Contents" on arrival instead of silence. When the veil is
          hidden it carries `visibility: hidden`, which takes it out of the
          accessibility tree entirely -- so nothing announces a second time and
          nothing lingers in the tab order. */}
      <div
        data-sis-page-loader=""
        data-state={visible ? "visible" : "hidden"}
        role="status"
        aria-live="polite"
      >
        {/* aria-hidden: the ring is the visual half of a message the text
            underneath already carries in full. */}
        <div data-sis-page-loader-spinner="" aria-hidden="true" />
        <p data-sis-page-loader-text="">Loading Contents</p>
      </div>
    </>
  );
}
