/// <reference types="next" />
/// <reference types="node" />
//
// Both pulled in explicitly because tsconfig.json sets an explicit `types` array
// (`vite/client`) and an `include` list that covers neither next-env.d.ts nor
// app/ -- so no ambient declarations are loaded for this file unless it asks.
//
// `next` supplies the `next` key on RequestInit, declared in
// node_modules/next/types/global.d.ts, which is how the revalidate option below
// is typed. `node` supplies node:fs and node:path, which the build-time image
// detection uses. @types/node is installed but, because `types` is an explicit
// list, is not picked up automatically. Without these two lines `next build`
// fails type checking; do not edit tsconfig.json to fix it, because widening
// `types` or `include` changes resolution for the whole Vite-era src/ tree.
/**
 * THE PUBLIC FRONT DOOR.
 *
 * A plain server component, deliberately outside the (app) route group and
 * outside /school, /teacher and /admin. It calls no auth gate, imports no
 * sidebar and mounts no client boundary of its own, so what a visitor -- or a
 * crawler -- receives is the finished HTML of this file. That is the difference
 * between this page and every app page: theirs render behind a gate and arrive
 * empty.
 *
 * WHY THERE IS NOT ONE TAILWIND CLASS IN IT. src/index.css is a FROZEN
 * pre-compiled Tailwind build. A utility that is not already in that file does
 * not error -- it resolves to nothing at all, so the markup keeps its class
 * names and loses its layout, silently. Everything here is therefore written in
 * ordinary CSS in the one <style> block below, and every class name carries a
 * lewa-lp- prefix so none of it can reach, or be reached by, the app.
 *
 * For the same reason nothing is imported from src/components/ui: those
 * components are styled with the same frozen utilities.
 */
import fs from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import Image from "next/image";

import {
  SUPPORT_PHONE_DISPLAY,
  phoneSupportLink,
  whatsappLink,
} from "../src/lib/supportContact";
import { MobileMenu, type MenuLink } from "./_landing/MobileMenu";
import { Screenshots, type Shot, type ShotGroup } from "./_landing/Screenshots";

const OG_DESCRIPTION =
  "Lewa keeps students, fees, marks, attendance and payroll for your school in one system, on any phone or computer.";

export const metadata = {
  title: "Lewa — School management for Cameroonian schools",
  description: OG_DESCRIPTION,
  /**
   * No `images` key, deliberately. There is no open-graph asset in this repo,
   * and pointing og:image at something that does not exist is worse than
   * omitting it: a card with a broken image reads as a dead link, whereas a
   * card with no image reads as a normal one. Add the key when there is a real
   * 1200x630 to point it at.
   */
  openGraph: {
    title: "Lewa — School management for Cameroonian schools",
    description: OG_DESCRIPTION,
  },
};

/** Where the two doors are. Written once each so the copy cannot drift. */
const SIGNUP_PATH = "/school/signup";
const TEACHER_LOGIN_PATH = "/teacher/login";

type Stats = { schools: number; students: number } | null;

/**
 * Every class name is prefixed lewa-lp-, and every selector is a class or a
 * descendant of one. Nothing here can match an element the app renders, and no
 * app rule can reach in, which is what makes a page-scoped stylesheet safe to
 * mount from inside a component.
 *
 * The grid rules at the bottom are the only responsive logic on the page, and
 * they go the same way each time: three columns to one, two to one.
 *
 * As it happens this CSS also contains no quote, ampersand or angle bracket.
 * That is not load-bearing -- React treats <style> as a raw-text element and
 * passes its child through unescaped, which is verifiable on any page in this
 * app: BUTTON_PRESS_CSS ships [aria-disabled="true"] and it arrives with its
 * quotes intact. It is simply that nothing here needed one: the logo is an
 * <img> so the crop can be expressed in px, and the step numbers are real text
 * rather than generated content, both of which are better anyway.
 */
const LANDING_CSS = `
  .lewa-lp-page {
    background: #ffffff;
    color: #334155;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  /* 1100px of content with a 20px gutter either side. Every band on the page
     shares it, which is what keeps the left edge of the logo, the headline, the
     cards and the footer on one line. */
  .lewa-lp-wrap {
    max-width: 1100px;
    margin-left: auto;
    margin-right: auto;
    padding-left: 20px;
    padding-right: 20px;
  }

  .lewa-lp-page p,
  .lewa-lp-page h1,
  .lewa-lp-page h2,
  .lewa-lp-page h3 {
    margin: 0;
    /* So a long word cannot push the page wider than a 360px viewport. */
    overflow-wrap: break-word;
  }

  /* ---- HEADER ------------------------------------------------------------ */

  .lewa-lp-header {
    position: sticky;
    top: 0;
    z-index: 30;
    background: #ffffff;
    border-bottom: 1px solid rgba(30, 58, 138, 0.1);
  }

  .lewa-lp-headerbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 64px;
  }

  .lewa-lp-brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    /* A tap target in its own right, since it is a link home. */
    min-height: 44px;
  }

  /* THE LOGO IS A WINDOW ONTO THE ASSET, NOT THE WHOLE ASSET.
     public/images/lewa-logo.png is a 2000x2000 canvas on which the artwork
     occupies very little: the glyph sits at x 718-1281, y 637-1069, and the
     LEWA wordmark below it at y 1158-1239. Drawn whole at header size the glyph
     would come out about 9px across -- a smudge. So the tile below is 38px, the
     image inside it is scaled to 120px, and the offsets put the glyph in the
     middle of the tile with the wordmark pushed just past the bottom edge (it
     would be illegible at this size, and the word Lewa is already set beside it
     in type).
     The tile is filled with #eff8ff because that is the background colour of
     the asset itself -- measured, not guessed -- so the crop has no seam. */
  .lewa-lp-logobox {
    position: relative;
    display: block;
    flex: none;
    width: 38px;
    height: 38px;
    border-radius: 9px;
    overflow: hidden;
    background: #eff8ff;
  }

  .lewa-lp-logo {
    position: absolute;
    left: -41px;
    top: -31px;
    width: 120px;
    height: 120px;
    /* Tailwind preflight in the frozen index.css sets img { max-width: 100% },
       which would shrink this back into the tile and undo the crop. */
    max-width: none;
  }

  .lewa-lp-brandname {
    font-size: 19px;
    font-weight: 700;
    color: #1e3a8a;
    letter-spacing: -0.01em;
  }

  .lewa-lp-headernav {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* The in-page anchors. Their own class rather than .lewa-lp-textlink so the
     phone breakpoint can take these away without also taking away Teacher
     login, which is a different kind of link and leaves by a different route. */
  .lewa-lp-navlink {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 10px 12px;
    color: #334155;
    font-size: 15px;
    font-weight: 500;
    text-decoration: none;
  }

  .lewa-lp-navlink:hover {
    color: #1e3a8a;
  }

  /* ---- THE PHONE MENU ---------------------------------------------------- */

  /* Hidden here and shown in the phone block at the bottom, which is the same
     switch the desktop nav makes in the opposite direction: exactly one of the
     two is on screen at any width. */
  .lewa-lp-menubtn {
    display: none;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid rgba(30, 58, 138, 0.1);
    border-radius: 9px;
    background: #ffffff;
    color: #1e3a8a;
    cursor: pointer;
  }

  .lewa-lp-menuicon {
    width: 22px;
    height: 22px;
  }

  /* position: fixed, so the sheet covers the viewport rather than the header it
     is rendered inside. inset 0 plus its own background is the whole effect --
     there is no separate backdrop element to keep in step. */
  .lewa-lp-sheet {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 60;
    display: flex;
    flex-direction: column;
    padding: 12px 20px 28px;
    background: #ffffff;
    /* If the sheet is ever taller than a small phone in landscape, it scrolls
       itself rather than trapping the visitor with an unreachable button. */
    overflow-y: auto;
  }

  .lewa-lp-sheettop {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 52px;
  }

  .lewa-lp-sheetnav {
    display: flex;
    flex-direction: column;
    margin-top: 12px;
  }

  .lewa-lp-sheetlink {
    display: flex;
    align-items: center;
    min-height: 56px;
    border-bottom: 1px solid rgba(30, 58, 138, 0.1);
    color: #1e3a8a;
    font-size: 18px;
    font-weight: 600;
    text-decoration: none;
  }

  .lewa-lp-sheetcta {
    margin-top: 24px;
  }

  /* ---- BUTTONS AND LINKS ------------------------------------------------- */

  /* 44px tall, on every one of them. Anything a thumb has to find on a phone is
     at least that. */
  .lewa-lp-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 10px 20px;
    border-radius: 8px;
    border: 1px solid transparent;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.2;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
  }

  .lewa-lp-btn-filled {
    background: #1e3a8a;
    color: #ffffff;
  }

  .lewa-lp-btn-outline {
    background: #ffffff;
    color: #1e3a8a;
    border-color: #1e3a8a;
  }

  /* For the closing band, where the page is already navy and a navy button
     would disappear into it. */
  .lewa-lp-btn-invert {
    background: #ffffff;
    color: #1e3a8a;
  }

  .lewa-lp-btn-ghost {
    background: transparent;
    color: #ffffff;
    border-color: #ffffff;
  }

  .lewa-lp-textlink {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 10px;
    color: #1e3a8a;
    font-size: 15px;
    font-weight: 600;
    text-decoration: none;
  }

  /* The phone number, which now sits on the light contact band rather than on
     navy, so it takes the ordinary navy link colour with an underline to mark
     it as the one piece of body text that is clickable. */
  .lewa-lp-textlink-underlined {
    text-decoration: underline;
  }

  /* ---- HERO -------------------------------------------------------------- */

  .lewa-lp-hero {
    background: #ffffff;
    padding-top: 56px;
    padding-bottom: 64px;
  }

  /* TWO COLUMNS ONLY WHEN THERE IS SOMETHING IN THE SECOND ONE.
     This class is applied by the server component only when hero.png was found
     on disk at build time. With no image the hero keeps its original single
     block and there is no empty column, no reserved gap and no placeholder --
     the page looks exactly as it did before the image support existed. */
  .lewa-lp-herogrid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 48px;
    align-items: center;
  }

  .lewa-lp-heroshot {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 14px;
  }

  /* clamp rather than a breakpoint: the headline shrinks smoothly instead of
     stepping, and the 30px floor is what keeps it readable at 360px. */
  .lewa-lp-h1 {
    font-size: clamp(30px, 6vw, 52px);
    line-height: 1.1;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #1e3a8a;
    max-width: 18em;
  }

  .lewa-lp-lede {
    margin-top: 18px;
    max-width: 640px;
    font-size: 17px;
    line-height: 1.6;
    color: #334155;
  }

  .lewa-lp-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 30px;
  }

  /* ---- STATS BAND -------------------------------------------------------- */

  /* THE NAVY IS A BLOCK INSIDE THE PAGE, NOT A BAND ACROSS IT.
     The section itself is plain, and the colour is carried by the box below,
     which sits in the ordinary container -- so its left and right edges land
     exactly where every heading and paragraph on the page starts rather than
     running out to the window. Full-bleed again on phones, where a 20px margin
     either side of a coloured block only makes the screen feel narrower; the
     rule for that is in the phone block at the bottom. */
  .lewa-lp-stats {
    background: #ffffff;
    padding-top: 20px;
    padding-bottom: 20px;
  }

  .lewa-lp-statband {
    background: #1e3a8a;
    color: #ffffff;
    border-radius: 16px;
    padding: 44px 32px;
  }

  /* Two equal columns with the contents centred in each, so the gap between the
     pair and the space outside them read as one even rhythm across the block.
     It stays two columns at every width -- the phone block narrows the type
     rather than stacking these, because a single number per row turns a compact
     figure into a tall one. */
  .lewa-lp-statgrid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 28px;
    text-align: center;
  }

  .lewa-lp-statnum {
    font-size: clamp(38px, 8vw, 60px);
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.02em;
    color: #ffffff;
  }

  .lewa-lp-statlabel {
    margin-top: 10px;
    font-size: 15px;
    color: #eff8ff;
  }

  /* ---- FEATURES ---------------------------------------------------------- */

  .lewa-lp-features {
    background: #eff8ff;
    padding-top: 64px;
    padding-bottom: 64px;
  }

  .lewa-lp-h2 {
    font-size: clamp(24px, 4.4vw, 34px);
    line-height: 1.2;
    font-weight: 700;
    letter-spacing: -0.015em;
    color: #1e3a8a;
  }

  .lewa-lp-h2-onnavy {
    color: #ffffff;
  }

  .lewa-lp-sectionlede {
    margin-top: 12px;
    max-width: 620px;
    font-size: 16px;
    line-height: 1.6;
    color: #64748b;
  }

  /* Four across on a desktop, two on a tablet, one on a phone -- the two steps
     down are in the media queries at the bottom. Eight cards divide evenly by
     four and by two, so no row is ever left with a single orphan card in it. */
  .lewa-lp-cardgrid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 18px;
    margin-top: 36px;
  }

  .lewa-lp-card {
    background: #ffffff;
    border: 1px solid rgba(30, 58, 138, 0.1);
    border-radius: 12px;
    padding: 22px;
  }

  /* The icons are inline SVG written into the component, not files and not a
     package: eight line drawings are smaller as markup than as any request
     that would fetch them, and they inherit this colour through currentColor,
     so there is no second place where the palette is written down. */
  .lewa-lp-cardicon {
    display: block;
    width: 26px;
    height: 26px;
    margin-bottom: 14px;
    color: #1e3a8a;
  }

  .lewa-lp-cardtitle {
    font-size: 17px;
    font-weight: 700;
    color: #1e3a8a;
  }

  .lewa-lp-cardbody {
    margin-top: 8px;
    font-size: 15px;
    line-height: 1.6;
    color: #334155;
  }

  /* ---- HOW IT WORKS ------------------------------------------------------ */

  .lewa-lp-how {
    background: #ffffff;
    padding-top: 64px;
    padding-bottom: 64px;
  }

  .lewa-lp-stepgrid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 28px;
    margin-top: 36px;
  }

  .lewa-lp-stepnum {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    background: #1e3a8a;
    color: #ffffff;
    font-size: 17px;
    font-weight: 700;
  }

  .lewa-lp-steptitle {
    margin-top: 16px;
    font-size: 17px;
    font-weight: 700;
    color: #1e3a8a;
  }

  /* ---- SCREENSHOTS ------------------------------------------------------- */

  .lewa-lp-shots {
    background: #ffffff;
    padding-top: 64px;
    padding-bottom: 64px;
  }

  .lewa-lp-shotswrap {
    margin-top: 32px;
  }

  /* Two options in a pill, the selected one filled. The same shape as the
     light/dark switch this section is modelled on. */
  .lewa-lp-toggle {
    display: inline-flex;
    padding: 4px;
    border: 1px solid rgba(30, 58, 138, 0.1);
    border-radius: 999px;
    background: #eff8ff;
  }

  .lewa-lp-toggleopt {
    min-height: 44px;
    padding: 10px 22px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #1e3a8a;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }

  .lewa-lp-toggleopt-on {
    background: #1e3a8a;
    color: #ffffff;
  }

  .lewa-lp-shotstage {
    margin-top: 24px;
    padding: 20px;
    border: 1px solid rgba(30, 58, 138, 0.1);
    border-radius: 16px;
    background: #eff8ff;
    text-align: center;
  }

  .lewa-lp-shot {
    display: inline-block;
    width: auto;
    max-width: 100%;
    /* Tall phone screenshots and wide desktop ones share this stage, so the
       height is capped and the width follows, rather than the other way
       round -- otherwise a portrait screenshot would run off the page. */
    max-height: 560px;
    height: auto;
    border-radius: 10px;
  }

  .lewa-lp-shotnav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 18px;
    margin-top: 18px;
  }

  .lewa-lp-shotbtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid #1e3a8a;
    border-radius: 999px;
    background: #ffffff;
    color: #1e3a8a;
    cursor: pointer;
  }

  .lewa-lp-shotcount {
    min-width: 56px;
    font-size: 15px;
    font-weight: 600;
    color: #64748b;
    text-align: center;
  }

  /* ---- CONTACT ----------------------------------------------------------- */

  /* Light, not navy. The closing call to action below it is the navy band now,
     and two full-width navy slabs stacked on each other read as one very tall
     band with a seam in the middle rather than as two sections. */
  .lewa-lp-contactsec {
    background: #eff8ff;
    padding-top: 64px;
    padding-bottom: 64px;
  }

  .lewa-lp-contact {
    margin-top: 24px;
    font-size: 15px;
    line-height: 1.7;
    color: #334155;
  }

  /* ---- CLOSING BAND ------------------------------------------------------ */

  .lewa-lp-cta {
    background: #1e3a8a;
    color: #ffffff;
    padding-top: 64px;
    padding-bottom: 64px;
  }

  .lewa-lp-ctalede {
    margin-top: 14px;
    max-width: 620px;
    font-size: 17px;
    line-height: 1.6;
    color: #eff8ff;
  }

  /* ---- FOOTER ------------------------------------------------------------ */

  .lewa-lp-footer {
    background: #ffffff;
    border-top: 1px solid rgba(30, 58, 138, 0.1);
    padding-top: 24px;
    padding-bottom: 24px;
  }

  .lewa-lp-footerbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .lewa-lp-footermeta {
    font-size: 14px;
    color: #64748b;
  }

  .lewa-lp-footerbrand {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  /* ---- ANCHOR TARGETS ---------------------------------------------------- */

  /* The header is sticky, so a section scrolled to by its id would otherwise
     arrive with its heading underneath the header. scroll-margin-top on the
     targets themselves keeps that correction on the prefixed classes, rather
     than putting scroll-padding on the document. */
  .lewa-lp-features,
  .lewa-lp-shots,
  .lewa-lp-contactsec {
    scroll-margin-top: 76px;
  }

  /* THE ONE NON-PREFIXED SELECTOR ON THE PAGE, and the only way to get smooth
     scrolling in CSS: the property has to sit on the scrolling element, which
     is the document, not on any box inside it. It is scoped in practice by this
     stylesheet existing only on this route -- every link off this page is a
     plain anchor, so a full navigation tears the rule down with the page.
     Anyone who has asked their system not to animate is left alone. */
  @media (prefers-reduced-motion: no-preference) {
    html {
      scroll-behavior: smooth;
    }
  }

  /* ---- TABLETS ----------------------------------------------------------- */

  @media (max-width: 1024px) {
    .lewa-lp-cardgrid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    /* The hero image drops below the words before the cards drop to one column:
       at this width the two hero columns are already too narrow to read. */
    .lewa-lp-herogrid {
      grid-template-columns: minmax(0, 1fr);
      gap: 32px;
    }
  }

  /* ---- PHONES ------------------------------------------------------------ */

  @media (max-width: 720px) {
    /* Everything in the desktop header goes; the hamburger takes its place and
       the sheet it opens carries all of it, Teacher login and Get started
       included. */
    .lewa-lp-headerlink,
    .lewa-lp-navlink,
    .lewa-lp-headercta {
      display: none;
    }

    .lewa-lp-menubtn {
      display: inline-flex;
    }

    /* .lewa-lp-statgrid is deliberately NOT in this list. The two counts stay
       side by side on a phone -- they are four characters between them, and
       stacking them would make the shortest block on the page the tallest. */
    .lewa-lp-cardgrid,
    .lewa-lp-stepgrid {
      grid-template-columns: minmax(0, 1fr);
    }

    /* THE ONE FULL-BLEED BLOCK. The container is stripped of its width limit
       and its side padding just here, so the navy reaches both edges of the
       screen; the padding it loses is given back inside the band, which is
       where it belongs when the block is the full width of the display. */
    .lewa-lp-statwrap {
      max-width: none;
      padding-left: 0;
      padding-right: 0;
    }

    .lewa-lp-stats {
      padding-top: 0;
      padding-bottom: 0;
    }

    .lewa-lp-statband {
      border-radius: 0;
      padding: 34px 20px;
    }

    .lewa-lp-statgrid {
      gap: 14px;
    }

    /* Both labels have to sit on one line inside half a 360px screen.
       "Students managed" is the long one and this is what keeps it there. */
    .lewa-lp-statlabel {
      font-size: 14px;
    }

    /* Stacked and full width, rather than two half-width buttons squeezed side
       by side. */
    .lewa-lp-actions {
      flex-direction: column;
      align-items: stretch;
    }

    .lewa-lp-hero {
      padding-top: 40px;
      padding-bottom: 48px;
    }

    .lewa-lp-features,
    .lewa-lp-how,
    .lewa-lp-shots,
    .lewa-lp-contactsec,
    .lewa-lp-cta {
      padding-top: 48px;
      padding-bottom: 48px;
    }

    .lewa-lp-shotstage {
      padding: 12px;
    }

    .lewa-lp-shot {
      max-height: 420px;
    }

    /* Both options still have to fit one line at 360px. */
    .lewa-lp-toggleopt {
      padding: 10px 16px;
      font-size: 14px;
    }

    .lewa-lp-footerbar {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }
  }
`;

/**
 * One 24x24 stroke drawing, shared by all eight cards so the weight, the cap
 * and the colour are decided once. Colour comes through currentColor from
 * .lewa-lp-cardicon, which is the only place the navy is written.
 *
 * aria-hidden because every icon sits directly above a heading that says the
 * same thing in words; announcing it would just be that heading twice.
 */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="lewa-lp-cardicon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const FEATURES: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "Students and classes",
    body: "Enrol students, organise them into classes and keep every record in one place.",
    icon: (
      <Icon>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19.5c0-3 2.5-4.8 5.5-4.8s5.5 1.8 5.5 4.8" />
        <path d="M16.5 6.2a3 3 0 0 1 0 5.6" />
        <path d="M18 14.9c1.7.6 2.9 2 2.9 4.1" />
      </Icon>
    ),
  },
  {
    title: "Fees and payments",
    body: "Set fees by level, record each payment and see at a glance who still owes what.",
    icon: (
      <Icon>
        <rect x="2.6" y="5.6" width="18.8" height="12.8" rx="2.4" />
        <circle cx="12" cy="12" r="2.6" />
        <path d="M6.2 12h.01M17.8 12h.01" />
      </Icon>
    ),
  },
  {
    title: "Marks and exams",
    body: "Enter marks for sequences, tests and exams, and let the averages work themselves out.",
    icon: (
      <Icon>
        <path d="M8 4.5h8a2 2 0 0 1 2 2v13a1 1 0 0 1-1.5.9L12 18l-4.5 2.4A1 1 0 0 1 6 19.5v-13a2 2 0 0 1 2-2Z" />
        <path d="M9.4 10.2l1.9 1.9 3.3-3.4" />
      </Icon>
    ),
  },
  {
    title: "Report cards",
    body: "Produce termly report cards with class ranks and averages, ready to print.",
    icon: (
      <Icon>
        <path d="M6 3.2h8.2L19 8v12.8H6Z" />
        <path d="M14 3.2V8h5" />
        <path d="M9 12.4h7M9 16h5" />
      </Icon>
    ),
  },
  {
    title: "Attendance",
    body: "Take attendance class by class and follow it across the whole term.",
    icon: (
      <Icon>
        <rect x="3.2" y="5" width="17.6" height="15.6" rx="2.4" />
        <path d="M3.2 9.6h17.6M8 3.2v3.4M16 3.2v3.4" />
        <path d="M9.2 14.6l2 2 3.6-3.8" />
      </Icon>
    ),
  },
  {
    title: "Timetable",
    body: "Lay out the week per class and per teacher, with no two lessons in one slot.",
    icon: (
      <Icon>
        <rect x="3.2" y="4.4" width="17.6" height="16.2" rx="2.4" />
        <path d="M3.2 9.6h17.6M9.4 9.6v11M15 9.6v11" />
      </Icon>
    ),
  },
  {
    title: "Staff and payroll",
    body: "Keep staff records, track who worked and prepare the salaries for the month.",
    icon: (
      <Icon>
        <rect x="2.8" y="6.6" width="18.4" height="13" rx="2.4" />
        <path d="M8.6 6.6V5.2a2 2 0 0 1 2-2h2.8a2 2 0 0 1 2 2v1.4" />
        <path d="M2.8 12.2h18.4M11.4 12.2v2.2h1.2v-2.2" />
      </Icon>
    ),
  },
  {
    title: "Teacher portal",
    body: "Teachers sign in to their own classes to enter marks and take attendance.",
    icon: (
      <Icon>
        <rect x="3" y="4.2" width="18" height="12" rx="2" />
        <path d="M12 16.2v4M8.4 20.4h7.2" />
        <path d="M8 11.6l2.4-2.6 2 2.1 1.8-2.3 2 2.6" />
      </Icon>
    ),
  },
];

const STEPS = [
  {
    title: "Create your school account",
    body: "Sign up with your school details and send them in for approval.",
  },
  {
    title: "Add your classes and students",
    body: "Set up your levels and classes, then enrol your students into them.",
  },
  {
    title: "Start recording fees, marks and attendance",
    body: "Everything you enter feeds the dashboard, the fee balances and the report cards.",
  },
];

/* ---- BUILD-TIME IMAGE DETECTION ------------------------------------------
 *
 * public/images/lewa/ is checked in empty, on purpose. Nobody has to edit this
 * file to add artwork: drop hero.png, admin-1.png .. admin-6.png or
 * teacher-1.png .. teacher-3.png into that folder and the next build picks them
 * up. Take them away again and the page returns to exactly what it renders
 * today.
 *
 * The check runs at build time, not per request -- this page is statically
 * generated, so what fs sees during `next build` is what ships. That is the
 * point: nothing is ever rendered pointing at a file that is not there, so
 * there is no broken-image icon and no reserved empty box to fall back to.
 */

const LEWA_IMAGE_DIR = path.join(process.cwd(), "public", "images", "lewa");

/**
 * The intrinsic size, read straight out of the file.
 *
 * next/image needs width and height, and a conditional file cannot be a static
 * import -- that is the one form that would supply them automatically. Reading
 * the PNG header instead means whatever gets dropped in is measured rather than
 * assumed, so an image of any proportion is laid out correctly without anyone
 * editing a number in here to match it.
 *
 * A PNG opens with an 8-byte signature and then IHDR, whose width and height
 * are the two big-endian uint32s at offsets 16 and 20. Anything that is not a
 * PNG, or is too short to hold that, returns null -- and a null size means the
 * image is skipped entirely rather than rendered at a guessed size.
 */
function readPngSize(file: string): { width: number; height: number } | null {
  try {
    const head = Buffer.alloc(24);
    const handle = fs.openSync(file, "r");
    let read = 0;
    try {
      read = fs.readSync(handle, head, 0, 24, 0);
    } finally {
      fs.closeSync(handle);
    }
    if (read < 24) return null;
    if (head.readUInt32BE(0) !== 0x89504e47) return null; // not a PNG
    const width = head.readUInt32BE(16);
    const height = head.readUInt32BE(20);
    if (width < 1 || height < 1) return null;
    return { width, height };
  } catch {
    return null;
  }
}

/** One named file in public/images/lewa, or null if it is not usable. */
function findShot(name: string): Shot | null {
  const file = path.join(LEWA_IMAGE_DIR, name);
  if (!fs.existsSync(file)) return null;
  const size = readPngSize(file);
  if (!size) return null;
  return { src: `/images/lewa/${name}`, width: size.width, height: size.height };
}

/**
 * admin-1..admin-6, or teacher-1..teacher-3.
 *
 * Gaps are skipped rather than treated as the end of the run, so dropping in
 * admin-1 and admin-4 alone gives a two-shot carousel instead of a one-shot
 * one. Numbering the files is not something a person should have to get right.
 */
function findSeries(prefix: string, count: number): Shot[] {
  const found: Shot[] = [];
  for (let n = 1; n <= count; n += 1) {
    const shot = findShot(`${prefix}-${n}.png`);
    if (shot) found.push(shot);
  }
  return found;
}

/**
 * Reads the two public counts, and is allowed to fail.
 *
 * This page is the front door: it has to render whether or not the API answers.
 * So every path out of here that is not a clean pair of numbers returns null,
 * and null means the stats band is not rendered at all -- a page with one band
 * fewer, never a page with a blank space or an error in it.
 *
 * FOUR SECONDS, enforced by AbortController rather than by hope. fetch has no
 * timeout of its own, so without this a hung API would hold the render open for
 * as long as the platform allows.
 *
 * `schools === 0` is treated as a failure on purpose. Zero is a real answer the
 * endpoint can give -- a fresh database, or a replica that has not caught up --
 * and "0 schools on Lewa" is worse on a marketing page than no band at all.
 */
async function loadStats(): Promise<Stats> {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/public/stats`, {
      signal: controller.signal,
      // Re-fetched at most once every five minutes, matching the cache the
      // endpoint keeps on its own side.
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;

    const data: unknown = await res.json();
    const schools = readCount(data, "schools");
    const students = readCount(data, "students");
    if (schools === null || students === null) return null;
    if (schools === 0) return null;

    return { schools, students };
  } catch {
    // A timeout, a refused connection, a body that is not JSON, or the nulls the
    // endpoint returns from its own failure path. All the same answer here:
    // render the page without the band.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** One key off the response, only if it is genuinely a non-negative integer. */
function readCount(data: unknown, key: string): number | null {
  if (typeof data !== "object" || data === null) return null;
  const value = (data as Record<string, unknown>)[key];
  if (typeof value !== "number") return null;
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

/**
 * Thousands separators, with the locale stated rather than left to the machine.
 * An unqualified toLocaleString reads the server's default locale, which is not
 * the visitor's -- so the number rendered into the HTML and the number React
 * would render on the client can disagree, which is a hydration mismatch.
 */
function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export default async function LewaLandingPage() {
  const stats = await loadStats();
  const year = new Date().getFullYear();

  const hero = findShot("hero.png");

  /**
   * School admin first, so the carousel's default is the first entry and the
   * component never has to know which key that is. A group with no images is
   * not pushed at all, which is what makes both the toggle option and -- when
   * neither group has anything -- the entire section disappear.
   */
  const shotGroups: ShotGroup[] = [];
  const adminShots = findSeries("admin", 6);
  const teacherShots = findSeries("teacher", 3);
  if (adminShots.length > 0) {
    shotGroups.push({ key: "admin", label: "School admin", shots: adminShots });
  }
  if (teacherShots.length > 0) {
    shotGroups.push({ key: "teacher", label: "Teacher", shots: teacherShots });
  }
  const hasShots = shotGroups.length > 0;

  /**
   * Built once and used by both headers. The Screenshots anchor is only in the
   * list when that section is actually on the page, so neither the desktop nav
   * nor the phone sheet can offer a link to a heading that is not there.
   */
  const navLinks: MenuLink[] = [
    { href: "#features", label: "Features" },
    ...(hasShots ? [{ href: "#screenshots", label: "Screenshots" }] : []),
    { href: "#contact", label: "Contact" },
  ];

  return (
    <div className="lewa-lp-page">
      <style>{LANDING_CSS}</style>

      {/* ---- a. HEADER ---------------------------------------------------- */}
      <header className="lewa-lp-header">
        <div className="lewa-lp-wrap lewa-lp-headerbar">
          <a className="lewa-lp-brand" href="/">
            {/* alt is empty on purpose: the word Lewa sits beside it inside the
                same link, so a description here would have a screen reader say
                the name twice. Sized entirely in CSS -- see .lewa-lp-logobox. */}
            <span className="lewa-lp-logobox">
              <img
                className="lewa-lp-logo"
                src="/images/lewa-logo.png"
                alt=""
                width={2000}
                height={2000}
              />
            </span>
            <span className="lewa-lp-brandname">Lewa</span>
          </a>
          {/* Everything in here is hidden below 720px and replaced by the
              hamburger, which is the last child and the only one that shows
              there. The sheet it opens carries the same links, so nothing in
              this nav is unreachable on a phone. */}
          <nav className="lewa-lp-headernav">
            {navLinks.map((link) => (
              <a className="lewa-lp-navlink" href={link.href} key={link.href}>
                {link.label}
              </a>
            ))}
            <a
              className="lewa-lp-textlink lewa-lp-headerlink"
              href={TEACHER_LOGIN_PATH}
            >
              Teacher login
            </a>
            <a
              className="lewa-lp-btn lewa-lp-btn-filled lewa-lp-headercta"
              href={SIGNUP_PATH}
            >
              Get started
            </a>
            <MobileMenu
              links={navLinks}
              signupPath={SIGNUP_PATH}
              teacherLoginPath={TEACHER_LOGIN_PATH}
            />
          </nav>
        </div>
      </header>

      <main>
        {/* ---- b. HERO ---------------------------------------------------- */}
        <section className="lewa-lp-hero">
          {/* The second column only exists when there is an image to put in it.
              With public/images/lewa empty this is the plain container it has
              always been, so the hero keeps its full width and there is no gap
              where a picture would have gone. */}
          <div
            className={
              hero ? "lewa-lp-wrap lewa-lp-herogrid" : "lewa-lp-wrap"
            }
          >
            <div>
              <h1 className="lewa-lp-h1">
                Run your whole school from one place.
              </h1>
              <p className="lewa-lp-lede">
                Lewa keeps students, fees, marks, attendance and payroll in a
                single system built for Cameroonian schools, on any phone or
                computer.
              </p>
              <div className="lewa-lp-actions">
                <a className="lewa-lp-btn lewa-lp-btn-filled" href={SIGNUP_PATH}>
                  Get your school account
                </a>
                <a
                  className="lewa-lp-btn lewa-lp-btn-outline"
                  href={TEACHER_LOGIN_PATH}
                >
                  Teacher login
                </a>
              </div>
            </div>
            {hero ? (
              <Image
                className="lewa-lp-heroshot"
                src={hero.src}
                alt="Lewa on screen"
                width={hero.width}
                height={hero.height}
                // The largest thing above the fold, so it is fetched with the
                // page rather than after it.
                priority
              />
            ) : null}
          </div>
        </section>

        {/* ---- c. STATS BAND ---------------------------------------------- */}
        {/* Omitted in full when the counts did not arrive. See loadStats. */}
        {stats !== null ? (
          <section className="lewa-lp-stats">
            <div className="lewa-lp-wrap lewa-lp-statwrap">
              <div className="lewa-lp-statband">
                <div className="lewa-lp-statgrid">
                  <div>
                    <div className="lewa-lp-statnum">
                      {formatCount(stats.schools)}
                    </div>
                    <p className="lewa-lp-statlabel">Schools on Lewa</p>
                  </div>
                  <div>
                    <div className="lewa-lp-statnum">
                      {formatCount(stats.students)}
                    </div>
                    <p className="lewa-lp-statlabel">Students managed</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {/* ---- d. FEATURES ------------------------------------------------ */}
        <section className="lewa-lp-features" id="features">
          <div className="lewa-lp-wrap">
            <h2 className="lewa-lp-h2">Everything a school office runs on</h2>
            <p className="lewa-lp-sectionlede">
              Eight parts of one system, so a payment recorded at the desk shows
              up on the fee balance, the dashboard and the report card without
              anyone copying it over.
            </p>
            <div className="lewa-lp-cardgrid">
              {FEATURES.map((feature) => (
                <div className="lewa-lp-card" key={feature.title}>
                  {feature.icon}
                  <h3 className="lewa-lp-cardtitle">{feature.title}</h3>
                  <p className="lewa-lp-cardbody">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- SCREENSHOTS ------------------------------------------------ */}
        {/* Absent in full -- heading, lede, carousel and all -- until somebody
            puts a PNG in public/images/lewa. An empty section with a heading
            over it would be worse than no section, because it would read as
            something that failed to load. */}
        {hasShots ? (
          <section className="lewa-lp-shots" id="screenshots">
            <div className="lewa-lp-wrap">
              <h2 className="lewa-lp-h2">See it before you sign up</h2>
              <p className="lewa-lp-sectionlede">
                The same screens your office and your teachers will use every
                day.
              </p>
              <Screenshots groups={shotGroups} />
            </div>
          </section>
        ) : null}

        {/* ---- e. HOW IT WORKS -------------------------------------------- */}
        <section className="lewa-lp-how">
          <div className="lewa-lp-wrap">
            <h2 className="lewa-lp-h2">How it works</h2>
            <div className="lewa-lp-stepgrid">
              {STEPS.map((step, index) => (
                <div key={step.title}>
                  <div className="lewa-lp-stepnum">{index + 1}</div>
                  <h3 className="lewa-lp-steptitle">{step.title}</h3>
                  <p className="lewa-lp-cardbody">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- f. CONTACT -------------------------------------------------- */}
        {/* On #eff8ff rather than navy, which it used to be. The closing band
            below is now the navy one, and two navy bands touching read as one
            very tall band with a seam rather than as two sections. */}
        <section className="lewa-lp-contactsec" id="contact">
          <div className="lewa-lp-wrap">
            <h2 className="lewa-lp-h2">Questions first?</h2>
            <p className="lewa-lp-sectionlede">
              Tell us about your school and we will tell you whether Lewa fits,
              before you sign up for anything.
            </p>
            <div className="lewa-lp-actions">
              {/* The same number the floating support button offers, read from
                  the one file that holds it -- src/lib/supportContact.ts -- so
                  there is never a second number to keep in step. */}
              <a
                className="lewa-lp-btn lewa-lp-btn-filled"
                href={whatsappLink()}
                target="_blank"
                rel="noreferrer noopener"
              >
                Chat on WhatsApp
              </a>
            </div>
            <p className="lewa-lp-contact">
              Or call us on{" "}
              <a
                className="lewa-lp-textlink lewa-lp-textlink-underlined"
                href={phoneSupportLink()}
              >
                {SUPPORT_PHONE_DISPLAY}
              </a>
            </p>
          </div>
        </section>

        {/* ---- g. CLOSING CTA --------------------------------------------- */}
        {/* The last thing before the footer, and the same pair of doors the
            hero opens with -- someone who has read the whole page should not
            have to scroll back up to act on it. */}
        <section className="lewa-lp-cta">
          <div className="lewa-lp-wrap">
            <h2 className="lewa-lp-h2 lewa-lp-h2-onnavy">
              Get your school on Lewa
            </h2>
            <p className="lewa-lp-ctalede">
              Create the account today and start with your classes and students.
              We will help you get the first term in.
            </p>
            <div className="lewa-lp-actions">
              <a className="lewa-lp-btn lewa-lp-btn-invert" href={SIGNUP_PATH}>
                Get your school account
              </a>
              <a
                className="lewa-lp-btn lewa-lp-btn-ghost"
                href={TEACHER_LOGIN_PATH}
              >
                Teacher login
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ---- h. FOOTER ---------------------------------------------------- */}
      <footer className="lewa-lp-footer">
        <div className="lewa-lp-wrap lewa-lp-footerbar">
          {/* The identical lockup the header uses -- same .lewa-lp-brand, same
              .lewa-lp-logobox crop, same markup. The crop is measured from the
              asset and written down once in the stylesheet; there is no second
              copy of those offsets to get wrong. */}
          <div className="lewa-lp-footerbrand">
            <a className="lewa-lp-brand" href="/">
              <span className="lewa-lp-logobox">
                <img
                  className="lewa-lp-logo"
                  src="/images/lewa-logo.png"
                  alt=""
                  width={2000}
                  height={2000}
                />
              </span>
              <span className="lewa-lp-brandname">Lewa</span>
            </a>
          </div>
          <p className="lewa-lp-footermeta">
            &copy; {year} Lewa &middot; School management for Cameroonian schools
          </p>
          <a className="lewa-lp-textlink" href={TEACHER_LOGIN_PATH}>
            Teacher login
          </a>
        </div>
      </footer>
    </div>
  );
}
