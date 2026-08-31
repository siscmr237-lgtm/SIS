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
 * That is also why the design this page was rebuilt from could not simply be
 * dropped in. It arrived as a Vite project whose every rule was a Tailwind
 * utility compiled at dev time; here the same layout, spacing, type scale and
 * palette are transcribed by hand into the stylesheet below. The numbers are
 * the design's numbers -- 1280px container, 24px gutter, #0b1735 navy, #059669
 * green -- written as CSS rather than as class names.
 *
 * For the same reason nothing is imported from src/components/ui: those
 * components are styled with the same frozen utilities.
 *
 * lucide-react IS imported, and that is not a contradiction. It ships SVG path
 * data, not Tailwind classes, and this file is a server component -- the icons
 * are rendered to markup on the server and the library itself never reaches the
 * browser.
 */

import fs from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import Image from "next/image";
import { Plus_Jakarta_Sans } from "next/font/google";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  ClipboardList,
  Clock,
  DollarSign,
  Download,
  FileText,
  Globe,
  MessageCircle,
  Receipt,
  Settings,
  Shield,
  Users,
  Zap,
} from "lucide-react";
import {
  SUPPORT_PHONE_DISPLAY,
  phoneSupportLink,
  whatsappLink,
} from "../src/lib/supportContact";
import { LandingNav, type MenuLink } from "./_landing/LandingNav";
import { Screenshots, type Shot, type ShotGroup } from "./_landing/Screenshots";

/**
 * The design's typeface.
 *
 * next/font, not a <link> to fonts.googleapis.com: it downloads the faces at
 * BUILD time and serves them from our own origin, so a visitor's browser makes
 * no request to Google at all and there is no third-party round trip in front
 * of the first paint. It also emits a size-adjusted local fallback, which is
 * what stops the headline reflowing when the real face arrives.
 *
 * Exposed as a custom property rather than a className on <body> because the
 * app's own screens deliberately use system fonts -- this variable is set on the
 * landing page's root div and inherits no further than that.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--lewa-lp-font",
});

const OG_DESCRIPTION =
  "Lewa keeps students, fees, marks, attendance and payroll for your school in one system, on any phone or computer.";

export const metadata = {
  title: "Lewa — School management for Cameroonian schools",
  description: OG_DESCRIPTION,
  /**
   * STILL NO `images` KEY, AND STILL DELIBERATELY -- but the reason has changed.
   * It used to be that there was no open-graph asset at all. There is one now:
   * app/opengraph-image.tsx draws a 1200x630 card at build time, and the file
   * convention writes og:image, og:image:width and og:image:height into this
   * page for us, resolved against the metadataBase in app/layout.tsx.
   *
   * Naming it here would mean maintaining the URL and the dimensions by hand
   * beside a file that already knows both. An `images` key would also OVERRIDE
   * the generated one rather than adding to it, so a typo would silently cost
   * the card. Leave it absent; add one only to point somewhere the convention
   * cannot reach.
   */
  openGraph: {
    title: "Lewa — School management for Cameroonian schools",
    description: OG_DESCRIPTION,
  },
};

/**
 * Where the doors are. Written once each so the copy cannot drift.
 *
 * SIGN_IN_PATH is the one addition the redesign makes to this page's link set.
 * The page it replaced offered signup and the teacher door only -- a school
 * admin coming back to log in had to know /school/login by heart. The design
 * has a "Sign In" control in the header, so it now points somewhere real.
 * /admin/login stays unlinked, as it always has been: that door is for the
 * internal team and nothing on a marketing page should advertise it.
 */
const SIGNUP_PATH = "/school/signup";
const SIGN_IN_PATH = "/school/login";
const TEACHER_LOGIN_PATH = "/teacher/login";

/**
 * Every figure the stats band can show, and where each one comes from.
 *
 * `schools`, `students` and `staff` are read live from the API. `pdfs` is not a
 * number at all -- see PDFS_GENERATED below.
 */
type Stats = { schools: number; students: number; staff: number | null } | null;

/**
 * NOT A NUMBER, AND NOT PRETENDING TO BE ONE.
 *
 * The design this page was rebuilt from carried "10,000+ PDFs Generated" in the
 * stats band. Nothing anywhere counts that. Every PDF this product makes is
 * built in the visitor's own browser by src/utils/pdfGenerator.ts and handed
 * straight to the download; no request is made, no row is written, nothing is
 * incremented. The figure was invented by the design tool.
 *
 * So it is rendered as four zeroes -- a visible placeholder, obviously not a
 * measurement, which is the honest thing to put where a number we do not have
 * would go. If this ever needs to be a real figure, the counting has to happen
 * first, at the point the PDF is produced.
 */
const PDFS_GENERATED = "0000";

/**
 * THE WHOLE PAGE'S STYLESHEET, mounted once by the component at the bottom.
 *
 * Every class name is prefixed lewa-lp-, and every selector is a class or a
 * descendant of one. Nothing here can match an element the app renders, and no
 * app rule can reach in, which is what makes a page-scoped stylesheet safe to
 * mount from inside a component.
 *
 * HOW TO READ IT AGAINST THE DESIGN. The design was authored in Tailwind, so
 * its spacing is on Tailwind's 4px scale and its containers are Tailwind's
 * named widths. Those are written out here as the pixel values they compile to:
 * max-w-7xl is 1280px, max-w-6xl 1152px, max-w-5xl 1024px, max-w-3xl 768px,
 * px-6 is 24px, py-24 is 96px, gap-16 is 64px, rounded-2xl is 16px. The three
 * breakpoints are Tailwind's own -- sm 640px, md 768px, lg 1024px -- so a
 * "hidden md:flex" in the design becomes a rule in the 768px block below.
 *
 * React treats <style> as a raw-text element and passes its child through
 * unescaped, so the quotes and > in the selectors here arrive intact. That is
 * verifiable anywhere in this app: BUTTON_PRESS_CSS in the root layout ships
 * [aria-disabled="true"] and it reaches the browser unmangled.
 */
const LANDING_CSS = `
  /* ---- PAGE, CONTAINERS, TYPE RESET -------------------------------------- */

  .lewa-lp-page {
    background: #ffffff;
    color: #334155;
    font-family: var(--lewa-lp-font), system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    /* The hero's decorative glows are pushed outside their own box before being
       clipped by it. This is the second line of defence, so nothing anywhere on
       the page can give the document a horizontal scrollbar. */
    overflow-x: hidden;
  }

  /* Four container widths, matching the four the design uses. Each carries the
     same 24px gutter, which is what keeps the left edge of the logo, the
     headline, the cards and the footer on one line. */
  .lewa-lp-wrap {
    max-width: 1280px;
    margin-left: auto;
    margin-right: auto;
    padding-left: 24px;
    padding-right: 24px;
  }

  .lewa-lp-wrap-6 { max-width: 1152px; }
  .lewa-lp-wrap-5 { max-width: 1024px; }
  .lewa-lp-wrap-3 { max-width: 768px; }

  .lewa-lp-page p,
  .lewa-lp-page h1,
  .lewa-lp-page h2,
  .lewa-lp-page h3,
  .lewa-lp-page ul {
    margin: 0;
    /* So a long word cannot push the page wider than a 360px viewport. */
    overflow-wrap: break-word;
  }

  .lewa-lp-page ul { padding: 0; list-style: none; }

  /* ---- SHARED SECTION FURNITURE ------------------------------------------ */

  /* py-24 on every band the design sets at that rhythm. */
  .lewa-lp-band { padding-top: 96px; padding-bottom: 96px; }
  .lewa-lp-band-light { background: #f4f7fe; }
  .lewa-lp-band-navy { background: #0b1735; }

  .lewa-lp-sectionhead { text-align: center; margin-bottom: 56px; }

  /* The small uppercase capsule above a section heading. Three of these on the
     page; each says what the section is, and none of them asserts a fact about
     the world, which is why they survived the content audit. */
  .lewa-lp-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid transparent;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    margin-bottom: 16px;
  }

  .lewa-lp-pill-navy { background: rgba(30, 58, 138, 0.08); color: #1e3a8a; }
  .lewa-lp-pill-green { background: rgba(5, 150, 105, 0.08); color: #059669; }
  .lewa-lp-pill-ongreen {
    background: rgba(5, 150, 105, 0.15);
    border-color: rgba(5, 150, 105, 0.3);
    color: #34d399;
  }

  .lewa-lp-h2 {
    font-size: 30px;
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: -0.025em;
    color: #0c1a3d;
  }

  .lewa-lp-h2-onnavy { color: #ffffff; }

  .lewa-lp-sectionlede {
    margin-top: 16px;
    margin-left: auto;
    margin-right: auto;
    max-width: 512px;
    color: #6b7fa3;
    font-size: 16px;
    line-height: 1.625;
  }

  /* ---- BUTTONS ------------------------------------------------------------ */

  /* 44px tall, on every one of them. Anything a thumb has to find on a phone is
     at least that -- which the design's own py-2.5 controls were not. */
  .lewa-lp-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 44px;
    padding: 12px 24px;
    border-radius: 12px;
    border: 1px solid transparent;
    font-family: inherit;
    font-size: 14px;
    font-weight: 700;
    line-height: 1.2;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    transition: background-color 0.2s, color 0.2s, transform 0.2s, box-shadow 0.2s;
  }

  .lewa-lp-btn-green {
    background: #059669;
    color: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .lewa-lp-btn-green:hover {
    background: #047857;
    transform: translateY(-2px);
    box-shadow: 0 20px 25px -5px rgba(5, 150, 105, 0.3);
  }

  /* The secondary on navy: an outline that borrows the background rather than
     painting over it. */
  .lewa-lp-btn-outline-light {
    border-color: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.75);
    background: transparent;
  }

  .lewa-lp-btn-outline-light:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
  }

  .lewa-lp-btn-outline-navy {
    border-color: #1e3a8a;
    color: #1e3a8a;
    background: #ffffff;
  }

  .lewa-lp-btn-outline-navy:hover { background: #eef2fd; }

  .lewa-lp-btn-block { width: 100%; }

  .lewa-lp-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .lewa-lp-actions-center { justify-content: center; }

  /* ---- HEADER ------------------------------------------------------------- */

  /* Fixed, not sticky: it starts life transparent over the navy hero, so it has
     to sit ON the hero rather than above it. The scrolled state is applied by
     app/_landing/LandingNav.tsx, which is the only thing on this page that
     needs to know how far down the visitor is. */
  .lewa-lp-nav {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 50;
    background: transparent;
    border-bottom: 1px solid transparent;
    transition: background-color 0.3s, border-color 0.3s, box-shadow 0.3s;
  }

  .lewa-lp-nav-scrolled {
    background: rgba(255, 255, 255, 0.95);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    border-bottom-color: #dce6f7;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .lewa-lp-navbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 16px;
    padding-bottom: 16px;
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
     public/images/lewa-mark.png is a 2000x2000 canvas carrying the mark alone,
     no wordmark. Every number below was measured off the file rather than
     guessed: the artwork occupies x 501-1498, y 617-1383 -- 998 by 767, and
     landscape, not square -- on a pure #ffffff ground, drawn in #1e3a8a, which
     is the same navy the rest of this page is set in.

     WHY THERE ARE NO OFFSETS HERE ANY MORE. The mark is centred in its canvas:
     its bounding box runs 501..1498 horizontally and 617..1383 vertically, both
     of which centre on exactly 1000. So centring the IMAGE in the window centres
     the MARK in the window, and the crop needs no hand-computed left/top that
     would have to be recalculated the next time the asset changes. Scale is the
     only number that matters: the mark is 998/2000 of the asset wide, so an
     image drawn at 100px puts the mark on screen at just under 50px across.

     The window is landscape because the mark is, and it is filled #ffffff to
     match the asset's own ground so the crop has no seam -- which also gives the
     navy mark something to sit on over the navy header, where it would otherwise
     be invisible. That white tile is the design's own answer to the same
     problem; it wrapped the logo in a light box for exactly this reason. */
  .lewa-lp-logobox {
    position: relative;
    display: block;
    flex: none;
    width: 58px;
    height: 44px;
    border-radius: 10px;
    overflow: hidden;
    background: #ffffff;
  }

  .lewa-lp-logo {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100px;
    height: 100px;
    /* Tailwind preflight in the frozen index.css sets img { max-width: 100% },
       which would shrink this back into the tile and undo the crop. */
    max-width: none;
  }

  .lewa-lp-brandname {
    font-size: 19px;
    font-weight: 800;
    letter-spacing: -0.01em;
    color: #ffffff;
    transition: color 0.3s;
  }

  .lewa-lp-nav-scrolled .lewa-lp-brandname { color: #1e3a8a; }

  .lewa-lp-navlinks {
    display: none;
    align-items: center;
    gap: 28px;
  }

  .lewa-lp-navlink {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: rgba(255, 255, 255, 0.75);
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    transition: color 0.2s;
  }

  .lewa-lp-navlink:hover { color: #ffffff; }
  .lewa-lp-nav-scrolled .lewa-lp-navlink { color: #4a6080; }
  .lewa-lp-nav-scrolled .lewa-lp-navlink:hover { color: #1e3a8a; }

  .lewa-lp-navctas {
    display: none;
    align-items: center;
    gap: 12px;
  }

  /* Sign in: a text control beside a filled one, which is how the design
     distinguishes "come back in" from "start here". */
  .lewa-lp-navsignin {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 4px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    transition: color 0.2s;
  }

  .lewa-lp-navsignin:hover { color: #ffffff; }
  .lewa-lp-nav-scrolled .lewa-lp-navsignin { color: #1e3a8a; }
  .lewa-lp-nav-scrolled .lewa-lp-navsignin:hover { color: #0c1a3d; }

  .lewa-lp-navcta { padding: 10px 20px; min-height: 42px; }

  /* ---- THE PHONE MENU ----------------------------------------------------- */

  /* Shown here and hidden in the 768px block below, which is the same switch the
     desktop nav makes in the opposite direction: exactly one of the two is on
     screen at any width. */
  .lewa-lp-menubtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
    color: #ffffff;
    cursor: pointer;
    transition: color 0.3s, border-color 0.3s, background-color 0.3s;
  }

  .lewa-lp-nav-scrolled .lewa-lp-menubtn {
    color: #0c1a3d;
    border-color: #dce6f7;
    background: #ffffff;
  }

  .lewa-lp-menuicon { width: 22px; height: 22px; }

  /* position: fixed, so the sheet covers the viewport. inset 0 plus its own
     background is the whole effect -- there is no separate backdrop element to
     keep in step.

     "FIXED TO THE VIEWPORT" IS A PROMISE THE HEADER COULD NOT KEEP, which is
     why LandingNav portals this element to <body> instead of rendering it where
     it sits in the markup. An ancestor with backdrop-filter, filter or transform
     becomes the containing block for its fixed descendants, and the scrolled
     header has backdrop-filter: blur(12px). Rendered inside it, this sheet
     resolved inset: 0 against the 76px header rather than the viewport: it
     collapsed to a strip, overflow-y hid the links, and taps went through to the
     page behind. At the top of the page, where the blur is not yet applied, the
     very same markup worked -- which is what made it look intermittent.

     z-index 80, not 60, because SupportButton in the root layout is 60 and comes
     later in the document. Two elements at 60 are resolved by document order, so
     the support button would paint over a sheet that is meant to cover
     everything. */
  .lewa-lp-sheet {
    /* Stated again because the sheet is portalled to <body> and so inherits
       from it, not from .lewa-lp-page. The variable comes with it on the class
       LandingNav copies across; the stack after it is the same fallback the
       page uses. */
    font-family: var(--lewa-lp-font), system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    color: #334155;
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 80;
    display: flex;
    flex-direction: column;
    padding: 12px 24px 32px;
    background: #ffffff;
    /* If the sheet is ever taller than a small phone in landscape, it scrolls
       itself rather than trapping the visitor with an unreachable button. */
    overflow-y: auto;
  }

  .lewa-lp-sheettop {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 56px;
  }

  /* The brand name is white in the header, because the header starts life on
     navy. The sheet is white, so the same element has to go navy inside it --
     and the sheet is portalled out of .lewa-lp-nav, so the scrolled-header rule
     that would otherwise do this cannot reach it. */
  .lewa-lp-sheet .lewa-lp-brandname { color: #1e3a8a; }

  .lewa-lp-sheet .lewa-lp-menubtn {
    color: #0c1a3d;
    border-color: #dce6f7;
    background: #ffffff;
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
    border-bottom: 1px solid #dce6f7;
    color: #1e3a8a;
    font-size: 18px;
    font-weight: 600;
    text-decoration: none;
  }

  .lewa-lp-sheetctas {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 24px;
  }

  /* ---- HERO --------------------------------------------------------------- */

  .lewa-lp-hero {
    position: relative;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    background: #0b1735;
    /* Holds the two glows and the wave, all of which are drawn outside this
       box's bounds on purpose. */
    overflow: hidden;
  }

  /* Two soft colour washes behind the content, both decorative and both
     pointer-events: none so neither can swallow a tap meant for a button. */
  .lewa-lp-glow {
    position: absolute;
    border-radius: 50%;
    filter: blur(64px);
    pointer-events: none;
  }

  .lewa-lp-glow-a {
    top: 0;
    right: 0;
    width: 700px;
    height: 700px;
    background: rgba(30, 58, 138, 0.25);
    transform: translate(25%, -33%);
  }

  .lewa-lp-glow-b {
    bottom: 0;
    left: 0;
    width: 500px;
    height: 500px;
    background: rgba(5, 150, 105, 0.12);
    transform: translate(-25%, 50%);
  }

  .lewa-lp-dots {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    opacity: 0.03;
    background-image: radial-gradient(circle, #fff 1px, transparent 1px);
    background-size: 32px 32px;
    pointer-events: none;
  }

  /* position: relative so the copy sits above the three decorative layers
     without any of them needing a z-index. */
  .lewa-lp-herogrid {
    position: relative;
    display: grid;
    grid-template-columns: 1fr;
    gap: 64px;
    align-items: center;
    padding-top: 144px;
    padding-bottom: 96px;
  }

  .lewa-lp-herobadge { margin-bottom: 28px; }

  /* The pulsing dot in the hero capsule. Reduced-motion is honoured at the
     bottom of this stylesheet, where the animation is switched off entirely. */
  .lewa-lp-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #34d399;
    animation: lewa-lp-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }

  @keyframes lewa-lp-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }

  .lewa-lp-h1 {
    font-size: 44px;
    font-weight: 800;
    line-height: 1.08;
    letter-spacing: -0.025em;
    color: #ffffff;
    margin-bottom: 24px;
  }

  .lewa-lp-h1-accent { color: #34d399; }

  .lewa-lp-herolede {
    max-width: 448px;
    margin-bottom: 40px;
    color: rgba(255, 255, 255, 0.55);
    font-size: 18px;
    line-height: 1.625;
  }

  /* ---- HERO: THE DASHBOARD ILLUSTRATION ----------------------------------- */

  /* AN ILLUSTRATION, NOT A SCREENSHOT, AND NOT A CLAIM.
     Everything inside it -- the three names, the counts, the bar widths -- came
     from the design and is kept at the owner's explicit instruction. None of it
     is read from the database and none of it describes a real school. If real
     screenshots are ever dropped into public/images/lewa, the section further
     down this page shows them, and that is where a visitor sees the product as
     it actually is. */
  .lewa-lp-mockcol {
    position: relative;
    display: flex;
    justify-content: center;
  }

  .lewa-lp-mock {
    position: relative;
    width: 100%;
    max-width: 480px;
  }

  .lewa-lp-mockpanel {
    background: #162348;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .lewa-lp-mockbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: #0f1b3a;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .lewa-lp-mockdotr { width: 10px; height: 10px; border-radius: 50%; flex: none; }

  .lewa-lp-mocktitle {
    margin-left: 12px;
    color: rgba(255, 255, 255, 0.25);
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lewa-lp-mockbody {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
  }

  .lewa-lp-kpirow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }

  .lewa-lp-kpi { background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 12px; }
  .lewa-lp-kpival { font-size: 20px; font-weight: 800; color: #ffffff; margin-bottom: 2px; }
  .lewa-lp-kpilabel { font-size: 10px; font-weight: 500; color: rgba(255, 255, 255, 0.35); }
  .lewa-lp-kpitrack {
    margin-top: 10px;
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
  }
  .lewa-lp-kpifill { height: 100%; border-radius: 999px; }

  .lewa-lp-mocklist { background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 16px; }

  .lewa-lp-mocklisthead {
    margin-bottom: 12px;
    color: rgba(255, 255, 255, 0.35);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .lewa-lp-mockrow {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .lewa-lp-mockrow:last-child { border-bottom: none; padding-bottom: 0; }

  .lewa-lp-mockbullet {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-top: 6px;
    flex: none;
  }

  .lewa-lp-mockname { color: rgba(255, 255, 255, 0.8); font-size: 12px; font-weight: 600; }
  .lewa-lp-mockaction { color: rgba(255, 255, 255, 0.3); font-size: 11px; }

  .lewa-lp-mockquick { display: flex; gap: 8px; }

  /* A <span>, not a <button>. It is part of a picture, and a real button here
     would be reachable by Tab and by a screen reader and would then do nothing.
     aria-hidden on the whole illustration keeps it out of the accessible tree;
     the alternative text for what it depicts is the headline beside it. */
  .lewa-lp-quick {
    flex: 1;
    padding: 8px 0;
    border-radius: 8px;
    background: rgba(5, 150, 105, 0.18);
    color: #34d399;
    font-size: 11px;
    font-weight: 700;
    text-align: center;
  }

  .lewa-lp-badge {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #ffffff;
    border: 1px solid #e8eef8;
    border-radius: 16px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
  }

  .lewa-lp-badge-bl { bottom: -16px; left: -20px; }
  .lewa-lp-badge-tr { top: -16px; right: -16px; }

  .lewa-lp-badgeicon {
    width: 36px;
    height: 36px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
  }

  .lewa-lp-badgetitle { font-size: 12px; font-weight: 700; color: #0c1a3d; white-space: nowrap; }
  .lewa-lp-badgesub { font-size: 11px; color: #9ca3af; white-space: nowrap; }

  .lewa-lp-badgecheck {
    width: 20px;
    height: 20px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 4px;
    border-radius: 50%;
    background: #059669;
    color: #ffffff;
  }

  /* The white curve the hero sits on, so the navy meets the stats band on a
     shape rather than a straight edge. preserveAspectRatio="none" on the svg
     lets it stretch to any width. */
  .lewa-lp-wave {
    position: absolute;
    bottom: -1px;
    left: 0;
    right: 0;
    line-height: 0;
    pointer-events: none;
  }

  .lewa-lp-wave svg { display: block; width: 100%; height: 64px; }

  /* ---- STATS BAND --------------------------------------------------------- */

  .lewa-lp-stats { padding-top: 64px; padding-bottom: 64px; background: #ffffff; }

  .lewa-lp-statgrid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 32px;
  }

  .lewa-lp-stat { text-align: center; }

  .lewa-lp-statnum {
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -0.025em;
    color: #0c1a3d;
    margin-bottom: 4px;
  }

  /* The placeholder figure, set apart from the three measured ones so it does
     not read as a count. See PDFS_GENERATED. */
  .lewa-lp-statnum-placeholder { color: #b9c6dd; }

  .lewa-lp-statlabel { font-size: 14px; font-weight: 500; color: #7a93bb; }

  /* ---- FEATURES ----------------------------------------------------------- */

  .lewa-lp-cardgrid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .lewa-lp-card {
    background: #ffffff;
    border: 1px solid #e4ecfa;
    border-radius: 16px;
    padding: 24px;
    transition: border-color 0.25s, box-shadow 0.25s;
  }

  .lewa-lp-card:hover {
    border-color: rgba(30, 58, 138, 0.4);
    box-shadow: 0 20px 25px -5px rgba(30, 58, 138, 0.08);
  }

  .lewa-lp-cardicon {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    border-radius: 12px;
    background: #eef2fd;
    color: #1e3a8a;
    transition: background-color 0.2s, color 0.2s;
  }

  .lewa-lp-card:hover .lewa-lp-cardicon { background: #1e3a8a; color: #ffffff; }

  .lewa-lp-cardtitle {
    font-size: 15px;
    font-weight: 700;
    color: #0c1a3d;
    margin-bottom: 8px;
  }

  .lewa-lp-cardbody { font-size: 13px; line-height: 1.625; color: #7a93bb; }

  /* ---- SCREENSHOTS -------------------------------------------------------- */

  /* Carried over unchanged from the page this one replaces, because the
     machinery behind it is unchanged: public/images/lewa is checked in empty,
     and dropping admin-1.png or teacher-1.png into it is all it takes to make
     this section appear. These are the class names app/_landing/Screenshots.tsx
     asks for; that component carries no CSS of its own. */
  .lewa-lp-shotswrap { margin-top: 32px; }

  .lewa-lp-toggle {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    margin-bottom: 20px;
    border-radius: 999px;
    background: #eef2fd;
  }

  .lewa-lp-toggleopt {
    min-height: 40px;
    padding: 8px 18px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: #4a6080;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .lewa-lp-toggleopt[aria-selected="true"] {
    background: #ffffff;
    color: #1e3a8a;
    box-shadow: 0 1px 2px rgba(12, 26, 61, 0.12);
  }

  .lewa-lp-shotstage {
    position: relative;
    border: 1px solid #e4ecfa;
    border-radius: 16px;
    background: #ffffff;
    overflow: hidden;
  }

  .lewa-lp-shot { display: block; width: 100%; height: auto; }

  .lewa-lp-shotnav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-top: 16px;
  }

  .lewa-lp-shotbtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid #dce6f7;
    border-radius: 10px;
    background: #ffffff;
    color: #1e3a8a;
    cursor: pointer;
  }

  .lewa-lp-shotbtn:hover { background: #eef2fd; }

  .lewa-lp-shotcount { font-size: 14px; font-weight: 600; color: #7a93bb; }

  /* ---- HOW IT WORKS ------------------------------------------------------- */

  .lewa-lp-stepgrid {
    position: relative;
    display: grid;
    grid-template-columns: 1fr;
    gap: 40px;
  }

  .lewa-lp-step { display: flex; flex-direction: column; align-items: center; text-align: center; }

  .lewa-lp-stepnum {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    margin-bottom: 24px;
    border-radius: 16px;
    background: linear-gradient(135deg, #1e3a8a, #0c1a3d);
    color: #ffffff;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 24px;
    font-weight: 800;
    box-shadow: 0 10px 15px -3px rgba(12, 26, 61, 0.25);
  }

  .lewa-lp-stepnum-green { background: linear-gradient(135deg, #059669, #047857); }

  .lewa-lp-steptitle { font-size: 18px; font-weight: 700; color: #0c1a3d; margin-bottom: 12px; }

  .lewa-lp-stepbody { max-width: 320px; font-size: 14px; line-height: 1.625; color: #7a93bb; }

  /* The hairline joining the three tiles. Hidden below the point at which the
     steps stop being a row, because a horizontal connector across a vertical
     stack joins nothing. */
  .lewa-lp-stepline { display: none; }

  /* ---- PDF SPOTLIGHT ------------------------------------------------------ */

  .lewa-lp-splitgrid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 64px;
    align-items: center;
  }

  .lewa-lp-h2-split { margin-bottom: 20px; }

  .lewa-lp-splitlede {
    margin-bottom: 32px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 16px;
    line-height: 1.625;
  }

  .lewa-lp-checklist { display: flex; flex-direction: column; gap: 12px; }

  .lewa-lp-checkitem {
    display: flex;
    align-items: center;
    gap: 12px;
    color: rgba(255, 255, 255, 0.65);
    font-size: 14px;
  }

  .lewa-lp-checkmark {
    width: 20px;
    height: 20px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(5, 150, 105, 0.2);
    color: #34d399;
  }

  /* ---- PDF SPOTLIGHT: THE REPORT CARD ILLUSTRATION ------------------------ */

  /* The same standing as the dashboard illustration above: kept from the design
     at the owner's instruction, describing no real student. */
  .lewa-lp-rc {
    background: #ffffff;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
  }

  .lewa-lp-rchead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 20px 24px;
    background: #1e3a8a;
  }

  .lewa-lp-rcheadleft { display: flex; align-items: center; gap: 12px; min-width: 0; }

  .lewa-lp-rcicon {
    width: 36px;
    height: 36px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.15);
    color: #ffffff;
  }

  .lewa-lp-rctitle { font-size: 14px; font-weight: 700; color: #ffffff; }
  .lewa-lp-rcsub { font-size: 12px; color: rgba(255, 255, 255, 0.45); }

  .lewa-lp-rcpdf {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
    padding: 6px 12px;
    border-radius: 8px;
    background: #059669;
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
  }

  .lewa-lp-rcstudent {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px 24px;
    border-bottom: 1px solid #f3f4f6;
  }

  /* White rather than tinted, because the mark's own ground is white and a
     tinted disc behind a white-cornered crop shows the seam. The ring is what
     keeps it reading as an avatar once the fill matches the card. */
  .lewa-lp-rcavatar {
    position: relative;
    width: 56px;
    height: 56px;
    flex: none;
    border-radius: 50%;
    border: 1px solid #e8eef8;
    background: #ffffff;
    overflow: hidden;
  }

  /* The same centred crop as the header lockup; only the scale differs. */
  .lewa-lp-rcavatar .lewa-lp-logo { width: 74px; height: 74px; }

  .lewa-lp-rcname { font-size: 16px; font-weight: 800; color: #0c1a3d; }
  .lewa-lp-rcmeta { margin-top: 2px; font-size: 14px; color: #9ca3af; }

  .lewa-lp-rcbody { padding: 20px 24px; }

  .lewa-lp-rcgrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 16px;
  }

  .lewa-lp-rccell {
    padding: 12px 6px;
    border: 1px solid #e8eef8;
    border-radius: 12px;
    background: #f8faff;
    text-align: center;
  }

  .lewa-lp-rcsubject { font-size: 10px; font-weight: 500; color: #7a93bb; margin-bottom: 6px; }
  .lewa-lp-rcscore { font-size: 14px; font-weight: 800; color: #0c1a3d; }
  .lewa-lp-rcgrade { margin-top: 2px; font-size: 11px; font-weight: 700; color: #059669; }

  .lewa-lp-rcavg {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border: 1px solid #bbf7d0;
    border-radius: 12px;
    background: #f0fdf4;
  }

  .lewa-lp-rcavglabel { font-size: 14px; color: #374151; }
  .lewa-lp-rcavgval { font-size: 14px; font-weight: 800; color: #059669; text-align: right; }

  /* ---- BENEFITS ----------------------------------------------------------- */

  .lewa-lp-benefitgrid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .lewa-lp-benefit {
    padding: 32px;
    border: 1px solid #e4ecfa;
    border-radius: 16px;
    background: #ffffff;
    transition: box-shadow 0.2s;
  }

  .lewa-lp-benefit:hover { box-shadow: 0 10px 15px -3px rgba(12, 26, 61, 0.1); }

  .lewa-lp-benefiticon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
    border-radius: 16px;
    background: #0c1a3d;
    color: #ffffff;
  }

  .lewa-lp-benefittitle { font-size: 20px; font-weight: 700; color: #0c1a3d; margin-bottom: 12px; }
  .lewa-lp-benefitbody { font-size: 14px; line-height: 1.625; color: #7a93bb; }

  /* The WhatsApp card, in WhatsApp's own colours -- which is the point of it
     being a different card rather than a fifth of the same one. */
  .lewa-lp-benefit-wa {
    position: relative;
    overflow: hidden;
    border-color: #064e45;
    background: #075e54;
  }

  .lewa-lp-benefit-wa:hover { box-shadow: 0 20px 25px -5px rgba(7, 94, 84, 0.3); }

  .lewa-lp-waglow {
    position: absolute;
    top: 0;
    right: 0;
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: rgba(37, 211, 102, 0.15);
    filter: blur(40px);
    pointer-events: none;
  }

  .lewa-lp-wainner { position: relative; }

  .lewa-lp-waicon {
    background: #25d366;
    box-shadow: 0 10px 15px -3px rgba(37, 211, 102, 0.3);
  }

  .lewa-lp-watitlerow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .lewa-lp-benefit-wa .lewa-lp-benefittitle { color: #ffffff; margin-bottom: 0; }
  .lewa-lp-benefit-wa .lewa-lp-benefitbody { color: rgba(255, 255, 255, 0.65); }

  .lewa-lp-watag {
    padding: 2px 8px;
    border: 1px solid rgba(37, 211, 102, 0.3);
    border-radius: 999px;
    background: rgba(37, 211, 102, 0.2);
    color: #25d366;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .lewa-lp-wachips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }

  .lewa-lp-wachip {
    padding: 4px 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.7);
    font-size: 11px;
    font-weight: 600;
  }

  /* ---- CONTACT ------------------------------------------------------------ */

  /* NOT IN THE DESIGN. The design's only "Contact" was a footer link pointing at
     "#", beside a Privacy and a Terms that pointed at the same nowhere. The page
     this one replaces had a real contact section carrying the support number, so
     it is kept -- and it is now what the nav's Contact link resolves to. */
  .lewa-lp-contactsec { padding-top: 96px; padding-bottom: 96px; background: #ffffff; }

  .lewa-lp-contactline { margin-top: 20px; font-size: 15px; color: #6b7fa3; }

  .lewa-lp-textlink { color: #1e3a8a; font-weight: 600; text-decoration: underline; }

  /* ---- CLOSING CTA -------------------------------------------------------- */

  .lewa-lp-ctacard {
    position: relative;
    overflow: hidden;
    padding: 48px 24px;
    border-radius: 24px;
    background: linear-gradient(135deg, #0b1735, #1a2f6a 55%, #0c2447);
    text-align: center;
  }

  .lewa-lp-ctaglow-a {
    position: absolute;
    top: 0;
    right: 0;
    width: 256px;
    height: 256px;
    border-radius: 50%;
    background: rgba(5, 150, 105, 0.1);
    filter: blur(64px);
    transform: translate(50%, -50%);
    pointer-events: none;
  }

  .lewa-lp-ctaglow-b {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 192px;
    height: 192px;
    border-radius: 50%;
    background: rgba(59, 130, 246, 0.08);
    filter: blur(40px);
    transform: translate(-50%, 50%);
    pointer-events: none;
  }

  .lewa-lp-ctainner { position: relative; }

  .lewa-lp-ctalede {
    max-width: 448px;
    margin: 16px auto 32px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 16px;
    line-height: 1.625;
  }

  /* ---- FOOTER ------------------------------------------------------------- */

  .lewa-lp-footer {
    padding-top: 48px;
    padding-bottom: 48px;
    background: #0b1735;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .lewa-lp-footerbar {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }

  .lewa-lp-footermeta {
    color: rgba(255, 255, 255, 0.35);
    font-size: 12px;
    text-align: center;
  }

  .lewa-lp-footerlinks {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: center;
    gap: 24px;
  }

  .lewa-lp-footerlink {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: rgba(255, 255, 255, 0.55);
    font-size: 12px;
    font-weight: 500;
    text-decoration: none;
  }

  .lewa-lp-footerlink:hover { color: #ffffff; }

  .lewa-lp-footerrule {
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.25);
    font-size: 12px;
    text-align: center;
  }

  /* ---- RESPONSIVE --------------------------------------------------------- */

  /* Tailwind's sm. Two-up for the things that were one-up, and the phone
     illustration gets its badges back at full size. */
  @media (min-width: 640px) {
    .lewa-lp-cardgrid { grid-template-columns: repeat(2, 1fr); }
    .lewa-lp-benefitgrid { grid-template-columns: repeat(2, 1fr); }
    .lewa-lp-ctacard { padding: 48px; }
  }

  /* Tailwind's md. THE HEADER SWAPS HERE: the hamburger goes and the desktop
     nav arrives, which is the one place on the page where two blocks have to
     agree exactly, or the header ends up with both or neither. */
  @media (min-width: 768px) {
    .lewa-lp-menubtn { display: none; }
    .lewa-lp-navlinks { display: flex; }
    .lewa-lp-navctas { display: flex; }

    .lewa-lp-h1 { font-size: 60px; }
    .lewa-lp-h2 { font-size: 36px; }

    .lewa-lp-statgrid { grid-template-columns: repeat(4, 1fr); }
    .lewa-lp-stepgrid { grid-template-columns: repeat(3, 1fr); }

    /* Drawn only now that the steps are actually side by side. It stops short of
       both outer tiles so it reads as a join between them, not a rule across
       the section. */
    .lewa-lp-stepline {
      display: block;
      position: absolute;
      top: 40px;
      left: calc(33.33% + 32px);
      right: calc(33.33% + 32px);
      height: 1px;
      background: linear-gradient(to right, rgba(30, 58, 138, 0.2), rgba(5, 150, 105, 0.5), rgba(30, 58, 138, 0.2));
    }

    .lewa-lp-footerbar { flex-direction: row; }
    .lewa-lp-footermeta { text-align: left; }
  }

  /* Tailwind's lg. The two big split layouts become two columns. */
  @media (min-width: 1024px) {
    .lewa-lp-herogrid { grid-template-columns: 1fr 1fr; }
    .lewa-lp-splitgrid { grid-template-columns: 1fr 1fr; }
    .lewa-lp-cardgrid { grid-template-columns: repeat(4, 1fr); }
    .lewa-lp-mockcol { justify-content: flex-end; }
  }

  /* Under a small phone the two floating badges are wider than the space either
     side of the panel, so they come in over it rather than hanging off it. */
  @media (max-width: 479px) {
    .lewa-lp-badge { padding: 10px 12px; gap: 8px; border-radius: 12px; }
    .lewa-lp-badge-bl { left: -8px; bottom: -14px; }
    .lewa-lp-badge-tr { right: -8px; top: -14px; }
    .lewa-lp-badgeicon { width: 30px; height: 30px; border-radius: 10px; }
    .lewa-lp-badgetitle { font-size: 11px; }
    .lewa-lp-badgesub { font-size: 10px; }
    .lewa-lp-h1 { font-size: 38px; }
    .lewa-lp-rcgrid { gap: 6px; }
    .lewa-lp-rcstudent, .lewa-lp-rchead, .lewa-lp-rcbody { padding-left: 16px; padding-right: 16px; }
  }

  /* The pulsing dot is decoration; anyone who has asked for less motion gets a
     steady one instead of no dot. */
  @media (prefers-reduced-motion: reduce) {
    .lewa-lp-pulse { animation: none; }
    .lewa-lp-btn { transition: none; }
    .lewa-lp-btn-green:hover { transform: none; }
  }
`;

/* ---- CONTENT --------------------------------------------------------------
 *
 * EVERY CLAIM BELOW WAS CHECKED AGAINST THE PRODUCT BEFORE IT WAS WRITTEN HERE.
 * The design this page was rebuilt from was generated, and a generator will
 * write a plausible sentence about a feature that does not exist as readily as
 * one about a feature that does. So each of the eight cards was matched to a
 * real route under app/school, each of the six documents to a real exported
 * function in src/utils/pdfGenerator.ts, and each WhatsApp message type to a
 * real route in the API. Two of the design's claims did not survive that check;
 * both are noted where they were changed.
 */

const FEATURES: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "Fees Management",
    body: "Track payments, generate invoices, manage outstanding balances per student.",
    icon: <DollarSign size={19} aria-hidden="true" />,
  },
  {
    title: "Report Cards",
    body: "Print-ready report cards in pedagogic format with subject averages and rankings.",
    icon: <FileText size={19} aria-hidden="true" />,
  },
  {
    title: "Student Records",
    body: "Complete student profiles with academic history, enrollment, and matricule numbers.",
    icon: <Users size={19} aria-hidden="true" />,
  },
  {
    title: "Staff Management",
    body: "Staff profiles, record of work logs, and performance documentation.",
    icon: <ClipboardList size={19} aria-hidden="true" />,
  },
  {
    title: "Attendance Tracking",
    body: "Daily attendance registers for students and staff with exportable sheets.",
    icon: <Calendar size={19} aria-hidden="true" />,
  },
  {
    title: "Expense Invoices",
    body: "Log school expenses and generate itemized PDF expense invoices.",
    icon: <Receipt size={19} aria-hidden="true" />,
  },
  {
    title: "Timetable",
    body: "Build and export class timetables as formatted printable PDFs.",
    icon: <Clock size={19} aria-hidden="true" />,
  },
  {
    title: "School Settings",
    body: "Customize name, logo, colors, subjects per class, and matricule format.",
    icon: <Settings size={19} aria-hidden="true" />,
  },
];

const STEPS = [
  {
    num: "01",
    title: "Create Your School Account",
    body: "Register and configure your school: name, logo, academic year, and class structure.",
  },
  {
    num: "02",
    title: "Load Your Data",
    body: "Add students, enroll staff, set fee structures, and build your timetable with an intuitive interface.",
  },
  {
    num: "03",
    title: "Manage & Export",
    body: "Run daily operations and generate professional PDF documents for any school record instantly.",
  },
];

/**
 * All six exist. In order: generateTransactionInvoice, generateReportCard,
 * generateClassAttendanceSheet / generateStudentAttendanceSheet,
 * generateTimetable, generateExpenseInvoice, generateWorkRecord -- every one an
 * export of src/utils/pdfGenerator.ts.
 */
const PDF_DOCUMENTS = [
  "School fees invoices per student",
  "Pedagogic-format report cards",
  "Attendance sheets for staff & students",
  "Class timetable exports",
  "Expense tracking invoices",
  "Staff record of work documents",
];

const BENEFITS: {
  title: string;
  body: string;
  icon: ReactNode;
  whatsapp?: boolean;
  chips?: string[];
  tag?: string;
}[] = [
  {
    title: "Built for Cameroon",
    body: "FCFA currency, Cameroonian name formats, local academic year structure — designed for how your school actually operates.",
    icon: <Shield size={21} aria-hidden="true" />,
  },
  {
    /**
     * CORRECTED. The design listed "Fee reminders, Report card alerts,
     * Announcements, Staff notices". Only the first of those four is real. What
     * the API can actually send, one route each, is a fee reminder
     * (routes/whatsappFeeReminder.js), an absence notice
     * (routes/whatsappAbsence.js) and a payment confirmation
     * (routes/whatsappPaymentConfirmation.js). There is no announcement
     * broadcast, no report card alert and no staff notice, so those three are
     * gone and the real third one is in.
     */
    title: "WhatsApp Communication",
    body: "Send fee reminders, absence notices and payment confirmations straight to parents on WhatsApp — from inside the platform, with no copying of numbers.",
    icon: <MessageCircle size={22} aria-hidden="true" />,
    whatsapp: true,
    tag: "via WhatsApp",
    chips: ["Fee reminders", "Absence notices", "Payment confirmations"],
  },
  {
    title: "Everything in Seconds",
    body: "Generate any document on the spot. Search any student record as you type. Fast, responsive, and always to hand.",
    icon: <Zap size={21} aria-hidden="true" />,
  },
  {
    /**
     * CORRECTED. The design said "PC-First Design — optimized for desktop staff
     * use", which is not what this product is: it ships a web app manifest, a
     * full set of installable icons and a service worker, and every screen in it
     * is built to a phone width. Claiming the opposite on the front door would
     * be the first thing a visitor disproved by opening the page on a phone.
     */
    title: "The office PC, or a phone",
    body: "Full sidebar navigation on the school computer, and the same screens on a phone — it installs to the home screen like an app.",
    icon: <Globe size={21} aria-hidden="true" />,
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
 *
 * hero.png has one extra job in this design. The hero's right-hand column is
 * otherwise a drawn illustration of a dashboard; if a real screenshot is
 * present it takes that slot instead, because a photograph of the product beats
 * a drawing of it every time.
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
 * Reads the public counts, and is allowed to fail.
 *
 * This page is the front door: it has to render whether or not the API answers.
 * So every path out of here that is not a usable set of numbers returns null,
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
 *
 * `staff` IS ALLOWED TO BE MISSING, and the other two are not. It was added to
 * /public/stats for this redesign, so a deployment where the web app is ahead of
 * the API will answer without it. That case drops one tile from the band rather
 * than the whole band, which is the difference between a stat this build knows
 * about and a stat this build depends on.
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

    return { schools, students, staff: readCount(data, "staff") };
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

/** The brand lockup, identical in the header, the sheet and the footer. */
function BrandMark({ href = "/" }: { href?: string }) {
  return (
    <a className="lewa-lp-brand" href={href}>
      {/* alt is empty on purpose: the word Lewa sits beside it inside the same
          link, so a description here would have a screen reader say the name
          twice. Sized entirely in CSS -- see .lewa-lp-logobox. */}
      <span className="lewa-lp-logobox">
        <img
          className="lewa-lp-logo"
          src="/images/lewa-mark.png"
          alt=""
          width={2000}
          height={2000}
        />
      </span>
      <span className="lewa-lp-brandname">Lewa</span>
    </a>
  );
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
    { href: "#how-it-works", label: "How It Works" },
    { href: "#benefits", label: "Benefits" },
    { href: "#contact", label: "Contact" },
  ];

  /**
   * The band's tiles, assembled rather than written out, so a stat the API did
   * not send simply is not there. Three of these are counts; the fourth is a
   * placeholder and says so in its own class. See PDFS_GENERATED.
   */
  const statTiles = stats
    ? [
        { value: formatCount(stats.schools), label: "Schools Enrolled", placeholder: false },
        { value: formatCount(stats.students), label: "Students Managed", placeholder: false },
        ...(stats.staff !== null
          ? [{ value: formatCount(stats.staff), label: "Staff Records", placeholder: false }]
          : []),
        { value: PDFS_GENERATED, label: "PDFs Generated", placeholder: true },
      ]
    : [];

  return (
    <div className={`lewa-lp-page ${jakarta.variable}`}>
      <style>{LANDING_CSS}</style>

      {/* ---- a. HEADER ---------------------------------------------------- */}
      {/* The page's only client boundary. It owns the scrolled state and the
          phone sheet; every word it renders is passed in from here, so the
          markup is still decided by this server component. */}
      <LandingNav
        links={navLinks}
        signupPath={SIGNUP_PATH}
        signInPath={SIGN_IN_PATH}
        teacherLoginPath={TEACHER_LOGIN_PATH}
        brand={<BrandMark />}
        fontClassName={jakarta.variable}
      />

      <main>
        {/* ---- b. HERO ---------------------------------------------------- */}
        <section className="lewa-lp-hero">
          {/* Three decorative layers, none of which is in the accessible tree
              and none of which can intercept a tap. */}
          <div className="lewa-lp-glow lewa-lp-glow-a" aria-hidden="true" />
          <div className="lewa-lp-glow lewa-lp-glow-b" aria-hidden="true" />
          <div className="lewa-lp-dots" aria-hidden="true" />

          <div className="lewa-lp-wrap lewa-lp-herogrid">
            <div>
              <span className="lewa-lp-pill lewa-lp-pill-ongreen lewa-lp-herobadge">
                <span className="lewa-lp-pulse" aria-hidden="true" />
                Designed for Cameroon Schools
              </span>
              <h1 className="lewa-lp-h1">
                Complete School
                <br />
                <span className="lewa-lp-h1-accent">Management</span>
                <br />
                System
              </h1>
              <p className="lewa-lp-herolede">
                Fees, report cards, attendance, staff records, and PDF generation
                — all in one platform built for nursery and primary schools.
              </p>
              {/* The design put a "Start Free Trial" and a "View Demo" here.
                  There is no trial in this product -- no billing, no
                  subscription, nothing in the schema -- and no demo to view, so
                  neither survived. What replaces them is the pair of doors this
                  page has always opened with. */}
              <div className="lewa-lp-actions">
                <a className="lewa-lp-btn lewa-lp-btn-green" href={SIGNUP_PATH}>
                  Get your school account
                  <ArrowRight size={17} aria-hidden="true" />
                </a>
                <a
                  className="lewa-lp-btn lewa-lp-btn-outline-light"
                  href={TEACHER_LOGIN_PATH}
                >
                  Teacher login
                </a>
              </div>
            </div>

            {/* A real screenshot if one has been dropped in; otherwise the
                design's drawn dashboard. */}
            {hero ? (
              <div className="lewa-lp-mockcol">
                <div className="lewa-lp-mock">
                  <Image
                    className="lewa-lp-shot"
                    src={hero.src}
                    alt="Lewa on screen"
                    width={hero.width}
                    height={hero.height}
                    // The largest thing above the fold, so it is fetched with
                    // the page rather than after it.
                    priority
                  />
                </div>
              </div>
            ) : (
              <div className="lewa-lp-mockcol" aria-hidden="true">
                <div className="lewa-lp-mock">
                  <div className="lewa-lp-mockpanel">
                    <div className="lewa-lp-mockbar">
                      <span className="lewa-lp-mockdotr" style={{ background: "rgba(248,113,113,0.6)" }} />
                      <span className="lewa-lp-mockdotr" style={{ background: "rgba(250,204,21,0.6)" }} />
                      <span className="lewa-lp-mockdotr" style={{ background: "rgba(74,222,128,0.6)" }} />
                      <span className="lewa-lp-mocktitle">Lewa — Dashboard</span>
                    </div>
                    <div className="lewa-lp-mockbody">
                      <div className="lewa-lp-kpirow">
                        {[
                          { label: "Students", value: "248", pct: 78, color: "#3b82f6" },
                          { label: "Staff", value: "32", pct: 55, color: "#059669" },
                          { label: "Fees Due", value: "18", pct: 30, color: "#f59e0b" },
                        ].map((tile) => (
                          <div className="lewa-lp-kpi" key={tile.label}>
                            <div className="lewa-lp-kpival">{tile.value}</div>
                            <div className="lewa-lp-kpilabel">{tile.label}</div>
                            <div className="lewa-lp-kpitrack">
                              <div
                                className="lewa-lp-kpifill"
                                style={{ width: `${tile.pct}%`, background: tile.color }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="lewa-lp-mocklist">
                        <div className="lewa-lp-mocklisthead">Recent Activity</div>
                        {[
                          { name: "MBARGA Jean Paul", action: "Fee payment — 25,000 FCFA", color: "#059669" },
                          { name: "EKWA Marie Claire", action: "Report card generated", color: "#3b82f6" },
                          { name: "NKOMO Thomas", action: "Absent — noted", color: "#f59e0b" },
                        ].map((row) => (
                          <div className="lewa-lp-mockrow" key={row.name}>
                            <span className="lewa-lp-mockbullet" style={{ background: row.color }} />
                            <div>
                              <div className="lewa-lp-mockname">{row.name}</div>
                              <div className="lewa-lp-mockaction">{row.action}</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="lewa-lp-mockquick">
                        {["Generate PDF", "Attendance", "Add Student"].map((label) => (
                          <span className="lewa-lp-quick" key={label}>
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="lewa-lp-badge lewa-lp-badge-bl">
                    <span
                      className="lewa-lp-badgeicon"
                      style={{ background: "rgba(5,150,105,0.1)", color: "#059669" }}
                    >
                      <FileText size={17} />
                    </span>
                    <span>
                      <span className="lewa-lp-badgetitle" style={{ display: "block" }}>
                        PDF Generated
                      </span>
                      <span className="lewa-lp-badgesub">Report Card · CM2A</span>
                    </span>
                    <span className="lewa-lp-badgecheck">
                      <Check size={11} strokeWidth={3} />
                    </span>
                  </div>

                  <div className="lewa-lp-badge lewa-lp-badge-tr">
                    <span
                      className="lewa-lp-badgeicon"
                      style={{ background: "rgba(30,58,138,0.1)", color: "#1e3a8a" }}
                    >
                      <Users size={16} />
                    </span>
                    <span>
                      <span className="lewa-lp-badgetitle" style={{ display: "block" }}>
                        248 Students
                      </span>
                      <span className="lewa-lp-badgesub">Enrolled 2024–25</span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lewa-lp-wave" aria-hidden="true">
            <svg viewBox="0 0 1440 64" fill="none" preserveAspectRatio="none">
              <path
                d="M0 64L1440 64L1440 24C1200 56 960 8 720 32C480 56 240 8 0 24L0 64Z"
                fill="#ffffff"
              />
            </svg>
          </div>
        </section>

        {/* ---- c. STATS BAND ---------------------------------------------- */}
        {/* Omitted in full when the counts did not arrive. See loadStats. */}
        {statTiles.length > 0 ? (
          <section className="lewa-lp-stats">
            <div className="lewa-lp-wrap lewa-lp-wrap-5">
              <div className="lewa-lp-statgrid">
                {statTiles.map((tile) => (
                  <div className="lewa-lp-stat" key={tile.label}>
                    <div
                      className={
                        tile.placeholder
                          ? "lewa-lp-statnum lewa-lp-statnum-placeholder"
                          : "lewa-lp-statnum"
                      }
                    >
                      {tile.value}
                    </div>
                    <p className="lewa-lp-statlabel">{tile.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* ---- d. FEATURES ------------------------------------------------ */}
        <section className="lewa-lp-band lewa-lp-band-light" id="features">
          <div className="lewa-lp-wrap">
            <div className="lewa-lp-sectionhead">
              <span className="lewa-lp-pill lewa-lp-pill-navy">All Modules Included</span>
              <h2 className="lewa-lp-h2">One Platform for Everything</h2>
              <p className="lewa-lp-sectionlede">
                No more spreadsheets or scattered paper records. Lewa gives you
                every management tool your school needs in one clean interface.
              </p>
            </div>
            <div className="lewa-lp-cardgrid">
              {FEATURES.map((feature) => (
                <div className="lewa-lp-card" key={feature.title}>
                  <span className="lewa-lp-cardicon">{feature.icon}</span>
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
          <section className="lewa-lp-band" id="screenshots">
            <div className="lewa-lp-wrap">
              <div className="lewa-lp-sectionhead">
                <h2 className="lewa-lp-h2">See it before you sign up</h2>
                <p className="lewa-lp-sectionlede">
                  The same screens your office and your teachers will use every
                  day.
                </p>
              </div>
              <Screenshots groups={shotGroups} />
            </div>
          </section>
        ) : null}

        {/* ---- e. HOW IT WORKS -------------------------------------------- */}
        <section className="lewa-lp-band" id="how-it-works">
          <div className="lewa-lp-wrap lewa-lp-wrap-6">
            <div className="lewa-lp-sectionhead">
              <span className="lewa-lp-pill lewa-lp-pill-green">Simple Setup</span>
              <h2 className="lewa-lp-h2">Up and Running in Minutes</h2>
            </div>
            <div className="lewa-lp-stepgrid">
              <span className="lewa-lp-stepline" aria-hidden="true" />
              {STEPS.map((step, index) => (
                <div className="lewa-lp-step" key={step.num}>
                  <div
                    className={
                      index === 1
                        ? "lewa-lp-stepnum lewa-lp-stepnum-green"
                        : "lewa-lp-stepnum"
                    }
                    aria-hidden="true"
                  >
                    {step.num}
                  </div>
                  <h3 className="lewa-lp-steptitle">{step.title}</h3>
                  <p className="lewa-lp-stepbody">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- f. PDF SPOTLIGHT ------------------------------------------- */}
        <section className="lewa-lp-band lewa-lp-band-navy">
          <div className="lewa-lp-wrap lewa-lp-splitgrid">
            <div>
              <span className="lewa-lp-pill lewa-lp-pill-ongreen">PDF Generation</span>
              <h2 className="lewa-lp-h2 lewa-lp-h2-onnavy lewa-lp-h2-split">
                Professional Documents,
                <br />
                <span className="lewa-lp-h1-accent">Ready to Print</span>
              </h2>
              <p className="lewa-lp-splitlede">
                Every major school document is a single click away — formatted,
                professional, and ready to hand to parents or file in your
                records.
              </p>
              <ul className="lewa-lp-checklist">
                {PDF_DOCUMENTS.map((item) => (
                  <li className="lewa-lp-checkitem" key={item}>
                    <span className="lewa-lp-checkmark" aria-hidden="true">
                      <Check size={11} strokeWidth={3} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* An illustration of a report card, on the same footing as the
                hero's dashboard: kept from the design, describing no real
                student, and out of the accessible tree. */}
            <div aria-hidden="true">
              <div className="lewa-lp-rc">
                <div className="lewa-lp-rchead">
                  <div className="lewa-lp-rcheadleft">
                    <span className="lewa-lp-rcicon">
                      <BookOpen size={16} />
                    </span>
                    <div>
                      <div className="lewa-lp-rctitle">School Report Card</div>
                      <div className="lewa-lp-rcsub">
                        Academic Year 2024–2025 · Term 2
                      </div>
                    </div>
                  </div>
                  <span className="lewa-lp-rcpdf">
                    <Download size={11} />
                    PDF
                  </span>
                </div>

                <div className="lewa-lp-rcstudent">
                  <span className="lewa-lp-rcavatar">
                    <img
                      className="lewa-lp-logo"
                      src="/images/lewa-mark.png"
                      alt=""
                      width={2000}
                      height={2000}
                    />
                  </span>
                  <div>
                    <div className="lewa-lp-rcname">MBARGA Jean Paul</div>
                    <div className="lewa-lp-rcmeta">Class: CM2A · Mat: NN-2025-0142</div>
                  </div>
                </div>

                <div className="lewa-lp-rcbody">
                  <div className="lewa-lp-rcgrid">
                    {[
                      { sub: "Mathematics", score: "18/20", grade: "A" },
                      { sub: "French", score: "15/20", grade: "B+" },
                      { sub: "English", score: "16/20", grade: "B+" },
                      { sub: "Sciences", score: "17/20", grade: "A−" },
                      { sub: "History", score: "14/20", grade: "B" },
                      { sub: "Arts & Craft", score: "19/20", grade: "A+" },
                    ].map((cell) => (
                      <div className="lewa-lp-rccell" key={cell.sub}>
                        <div className="lewa-lp-rcsubject">{cell.sub}</div>
                        <div className="lewa-lp-rcscore">{cell.score}</div>
                        <div className="lewa-lp-rcgrade">{cell.grade}</div>
                      </div>
                    ))}
                  </div>
                  <div className="lewa-lp-rcavg">
                    <span className="lewa-lp-rcavglabel">Class Average</span>
                    <span className="lewa-lp-rcavgval">16.5 / 20 — Excellent</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---- g. BENEFITS ------------------------------------------------ */}
        <section className="lewa-lp-band lewa-lp-band-light" id="benefits">
          <div className="lewa-lp-wrap">
            <div className="lewa-lp-sectionhead">
              <h2 className="lewa-lp-h2">Why Schools Choose Lewa</h2>
            </div>
            <div className="lewa-lp-benefitgrid">
              {BENEFITS.map((benefit) =>
                benefit.whatsapp ? (
                  <div className="lewa-lp-benefit lewa-lp-benefit-wa" key={benefit.title}>
                    <span className="lewa-lp-waglow" aria-hidden="true" />
                    <div className="lewa-lp-wainner">
                      <span className="lewa-lp-benefiticon lewa-lp-waicon">
                        {benefit.icon}
                      </span>
                      <div className="lewa-lp-watitlerow">
                        <h3 className="lewa-lp-benefittitle">{benefit.title}</h3>
                        {benefit.tag ? (
                          <span className="lewa-lp-watag">{benefit.tag}</span>
                        ) : null}
                      </div>
                      <p className="lewa-lp-benefitbody">{benefit.body}</p>
                      {benefit.chips ? (
                        <div className="lewa-lp-wachips">
                          {benefit.chips.map((chip) => (
                            <span className="lewa-lp-wachip" key={chip}>
                              {chip}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="lewa-lp-benefit" key={benefit.title}>
                    <span className="lewa-lp-benefiticon">{benefit.icon}</span>
                    <h3 className="lewa-lp-benefittitle">{benefit.title}</h3>
                    <p className="lewa-lp-benefitbody">{benefit.body}</p>
                  </div>
                ),
              )}
            </div>
          </div>
        </section>

        {/* ---- h. CONTACT -------------------------------------------------- */}
        <section className="lewa-lp-contactsec" id="contact">
          <div className="lewa-lp-wrap lewa-lp-wrap-3">
            <div className="lewa-lp-sectionhead" style={{ marginBottom: 32 }}>
              <h2 className="lewa-lp-h2">Questions first?</h2>
              <p className="lewa-lp-sectionlede">
                Tell us about your school and we will tell you whether Lewa fits,
                before you sign up for anything.
              </p>
            </div>
            <div className="lewa-lp-actions lewa-lp-actions-center">
              {/* The same number the floating support button offers, read from
                  the one file that holds it -- src/lib/supportContact.ts -- so
                  there is never a second number to keep in step. */}
              <a
                className="lewa-lp-btn lewa-lp-btn-green"
                href={whatsappLink()}
                target="_blank"
                rel="noreferrer noopener"
              >
                <MessageCircle size={17} aria-hidden="true" />
                Chat on WhatsApp
              </a>
            </div>
            <p className="lewa-lp-contactline" style={{ textAlign: "center" }}>
              Or call us on{" "}
              <a className="lewa-lp-textlink" href={phoneSupportLink()}>
                {SUPPORT_PHONE_DISPLAY}
              </a>
            </p>
          </div>
        </section>

        {/* ---- i. CLOSING CTA --------------------------------------------- */}
        {/* The design had an "Free 30-Day Trial" award badge at the top of this
            card and a "No credit card · No setup fees · Cancel anytime" line
            under the button. This product has no billing of any kind, so all of
            it is gone rather than restated. */}
        <section className="lewa-lp-band" style={{ paddingTop: 0 }}>
          <div className="lewa-lp-wrap lewa-lp-wrap-3">
            <div className="lewa-lp-ctacard">
              <span className="lewa-lp-ctaglow-a" aria-hidden="true" />
              <span className="lewa-lp-ctaglow-b" aria-hidden="true" />
              <div className="lewa-lp-ctainner">
                <h2 className="lewa-lp-h2 lewa-lp-h2-onnavy">
                  Ready to Modernize
                  <br />
                  Your School?
                </h2>
                <p className="lewa-lp-ctalede">
                  Create the account today and start with your classes and
                  students. We will help you get the first term in.
                </p>
                <div className="lewa-lp-actions lewa-lp-actions-center">
                  <a className="lewa-lp-btn lewa-lp-btn-green" href={SIGNUP_PATH}>
                    Get your school account
                    <ArrowRight size={19} aria-hidden="true" />
                  </a>
                  <a
                    className="lewa-lp-btn lewa-lp-btn-outline-light"
                    href={TEACHER_LOGIN_PATH}
                  >
                    Teacher login
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ---- j. FOOTER ---------------------------------------------------- */}
      {/* The design's footer offered Privacy, Terms and Contact, all three
          pointing at "#", and put a domain name beside them. None of those
          pages exists and the domain is not something this repo knows, so what
          is here instead is three links that go somewhere real. */}
      <footer className="lewa-lp-footer">
        <div className="lewa-lp-wrap">
          <div className="lewa-lp-footerbar">
            <BrandMark />
            <p className="lewa-lp-footermeta">
              School management for nursery and primary schools in Cameroon
            </p>
            <div className="lewa-lp-footerlinks">
              <a className="lewa-lp-footerlink" href={SIGN_IN_PATH}>
                School sign in
              </a>
              <a className="lewa-lp-footerlink" href={TEACHER_LOGIN_PATH}>
                Teacher login
              </a>
              <a
                className="lewa-lp-footerlink"
                href={whatsappLink()}
                target="_blank"
                rel="noreferrer noopener"
              >
                WhatsApp
              </a>
            </div>
          </div>
          <div className="lewa-lp-footerrule">
            &copy; {year} Lewa. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
