/// <reference types="next" />
//
// Required as the first line, for the same reason app/page.tsx carries it:
// tsconfig.json pins `types: ["vite/client"]` and its `include` list does not
// cover app/, so none of Next's ambient declarations resolve in this directory
// unless the file asks for them by name. Without it, the ImageResponse import
// and the route's exported `size`/`contentType` contract fail type checking.
// Do not remove it, and do not "fix" it by widening tsconfig.json -- that file
// governs resolution for the whole Vite-era src/ tree as well.
/**
 * THE LINK PREVIEW CARD.
 *
 * A file-convention route: Next renders this once at build time and serves the
 * result as a static PNG, then writes the og:image, og:image:width,
 * og:image:height and twitter:image tags into every page under app/ that does
 * not override them. Pasting a lewa.app link into WhatsApp, Slack or a tweet
 * gets this instead of a bare grey rectangle.
 *
 * WHY IT IS DRAWN RATHER THAN DESIGNED. There is no 1200x630 artwork in this
 * repo, and the alternative -- pointing og:image at a file that does not exist
 * -- is worse than having no card at all, because a card with a broken image
 * reads as a dead link. Drawing it here means the asset cannot drift from the
 * brand: the navy below is the same #1e3a8a the landing page is built on, and
 * it is regenerated from source on every build.
 *
 * WHAT THIS FILE MAY AND MAY NOT USE. ImageResponse renders through satori,
 * which implements a small subset of CSS: flexbox and nothing else. No grid, no
 * float, no `inset`, no shorthand `flex: 1` -- the longhand `flexGrow` below is
 * deliberate. Every element with more than one child must state `display:
 * flex` explicitly or satori throws rather than guessing.
 *
 * That restriction has NOTHING to do with the frozen src/index.css that governs
 * the rest of this app; it is satori's own. The practical consequence is the
 * same though: no utility classes, and nothing imported from src/. Every value
 * here is an inline style.
 *
 * THERE IS NO LOGO ON IT, AND THAT WAS CHECKED RATHER THAN ASSUMED.
 * public/images/lewa-mark.png was measured before being ruled out: its artwork
 * spans x 501-1498 by y 617-1383, which is 49.9% of the canvas width, 38.4% of
 * its height and 19.1% of its area -- so more than half the file is padding, and
 * placing it here would need a crop rather than a draw. It is also stored
 * without an alpha channel on a solid #ffffff ground, so on this navy it would
 * paint a white rectangle around itself. Cropping that back out in a CSS subset
 * this narrow is a lot of risk for a wordmark that reads perfectly well as type.
 * (lewa-logo.png is worse on both counts and is not a candidate.)
 */

import { ImageResponse } from "next/og";

/**
 * 1200x630 is the size every scraper crops to, and stating it here is what lets
 * Next emit og:image:width and og:image:height. Without those two, WhatsApp in
 * particular will often render the small square card instead of the wide one,
 * because it will not download the image just to measure it.
 */
export const size = { width: 1200, height: 630 };

export const contentType = "image/png";

/** Read out in place of the image by anything that cannot show it. */
export const alt = "Lewa — School management for Cameroonian schools";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          // The landing page's navy, not the #0f2345 in app/layout.tsx's
          // viewport export. That one is the browser chrome colour and is a
          // different, darker blue on purpose; matching it here would put the
          // card slightly out of step with the page it links to.
          backgroundColor: "#1e3a8a",
          color: "#ffffff",
          padding: "64px 80px",
        }}
      >
        {/* Takes all the height the footer does not, and centres its own
            contents in it -- which is what puts the wordmark and the line under
            it on the optical centre of the card. */}
        <div
          style={{
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* THE STROKE IS HOW THIS IS BOLD, BECAUSE fontWeight ALONE IS NOT.
              next/og ships exactly one face -- noto-sans-v27-latin-regular.ttf,
              in node_modules/next/dist/compiled/@vercel/og -- and satori does
              not synthesise weights it has not been given: it resolves to the
              nearest face it holds, which here is the only face it holds. So
              fontWeight: 700 renders identically to 400, which is what the
              first build of this card did.
              Drawing a 3px stroke in the fill colour thickens every letterform
              instead. Measured off the two PNGs, it puts 26.8% more ink in the
              wordmark -- about the step from regular to semibold, and enough for
              a wordmark to hold a 1200x630 card.
              The honest alternative was committing a bold TTF and registering
              it here, which is a binary asset and a second thing to keep in
              step, or fetching one at build time, which is a network dependency
              in the build. fontWeight stays on the element so that the day a
              bold face IS registered, this reads correctly and the stroke can
              simply be deleted. */}
          <div
            style={{
              fontSize: 152,
              fontWeight: 700,
              WebkitTextStrokeWidth: 3,
              WebkitTextStrokeColor: "#ffffff",
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}
          >
            Lewa
          </div>
          <div
            style={{
              marginTop: 32,
              fontSize: 44,
              lineHeight: 1.3,
              textAlign: "center",
              color: "rgba(255, 255, 255, 0.85)",
            }}
          >
            School management for Cameroonian schools
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            fontSize: 28,
            letterSpacing: "0.02em",
            color: "rgba(255, 255, 255, 0.55)",
          }}
        >
          lewa.app
        </div>
      </div>
    ),
    { ...size },
  );
}
