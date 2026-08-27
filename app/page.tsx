/// <reference types="next" />
//
// Pulled in explicitly because tsconfig.json sets an explicit `types` array
// (`vite/client`) and an `include` list that covers neither next-env.d.ts nor
// app/ -- so the ambient declarations Next ships are not loaded for this file.
// The one this page needs is the `next` key on RequestInit, declared in
// node_modules/next/types/global.d.ts, which is how the revalidate option below
// is typed. Without this line `next build` fails type checking on that option.
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
import {
  SUPPORT_PHONE_DISPLAY,
  phoneSupportLink,
  whatsappLink,
} from "../src/lib/supportContact";

export const metadata = {
  title: "Lewa — School management for Cameroonian schools",
  description:
    "Lewa keeps students, fees, marks, attendance and payroll for your school in one system, on any phone or computer.",
};

/** Where the two doors are. Written once each so the copy cannot drift. */
const SIGNUP_PATH = "/school/signup";
const TEACHER_LOGIN_PATH = "/teacher/login";

type Stats = { schools: number; students: number } | null;

/**
 * NO CSS IN THIS FILE CONTAINS A QUOTE, AN AMPERSAND, OR AN ANGLE BRACKET.
 *
 * React escapes the text children of every element, <style> included: a double
 * quote in this string would reach the browser as an HTML entity and take the
 * whole declaration down with it, with nothing to say so. So the logo is an
 * <img> element rather than a CSS background-image, the step numbers are real
 * text rather than generated content, and every selector here is a class or a
 * descendant of one -- no attribute selectors, no child combinators.
 *
 * The grid rules at the bottom are the only responsive logic on the page, and
 * they go the same way each time: three columns to one, two to one.
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

  .lewa-lp-textlink-onnavy {
    color: #ffffff;
    text-decoration: underline;
  }

  /* ---- HERO -------------------------------------------------------------- */

  .lewa-lp-hero {
    background: #ffffff;
    padding-top: 56px;
    padding-bottom: 64px;
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

  .lewa-lp-stats {
    background: #1e3a8a;
    color: #ffffff;
    padding-top: 44px;
    padding-bottom: 44px;
  }

  .lewa-lp-statgrid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 28px;
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

  .lewa-lp-cardgrid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
    margin-top: 36px;
  }

  .lewa-lp-card {
    background: #ffffff;
    border: 1px solid rgba(30, 58, 138, 0.1);
    border-radius: 12px;
    padding: 22px;
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

  .lewa-lp-contact {
    margin-top: 24px;
    font-size: 15px;
    line-height: 1.7;
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

  /* ---- PHONES ------------------------------------------------------------ */

  @media (max-width: 720px) {
    /* The one thing the header drops. The teacher door is not lost with it --
       it is a full-width button in the hero and a link in the footer, both of
       which a phone visitor reaches without a menu. */
    .lewa-lp-headerlink {
      display: none;
    }

    .lewa-lp-statgrid,
    .lewa-lp-cardgrid,
    .lewa-lp-stepgrid {
      grid-template-columns: minmax(0, 1fr);
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
    .lewa-lp-cta {
      padding-top: 48px;
      padding-bottom: 48px;
    }
  }
`;

const FEATURES = [
  {
    title: "Students and classes",
    body: "Enrol students, organise them into classes and keep every record in one place.",
  },
  {
    title: "Fees and payments",
    body: "Set fees by level, record each payment and see at a glance who still owes what.",
  },
  {
    title: "Marks and exams",
    body: "Enter marks for sequences, tests and exams, and let the averages work themselves out.",
  },
  {
    title: "Report cards",
    body: "Produce termly report cards with class ranks and averages, ready to print.",
  },
  {
    title: "Attendance",
    body: "Take attendance class by class and follow it across the whole term.",
  },
  {
    title: "Staff and payroll",
    body: "Keep staff records, track who worked and prepare the salaries for the month.",
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
          <nav className="lewa-lp-headernav">
            {/* Hidden on phones by the media query above; the hero and the
                footer carry the teacher door there instead. */}
            <a
              className="lewa-lp-textlink lewa-lp-headerlink"
              href={TEACHER_LOGIN_PATH}
            >
              Teacher login
            </a>
            <a className="lewa-lp-btn lewa-lp-btn-filled" href={SIGNUP_PATH}>
              Get started
            </a>
          </nav>
        </div>
      </header>

      <main>
        {/* ---- b. HERO ---------------------------------------------------- */}
        <section className="lewa-lp-hero">
          <div className="lewa-lp-wrap">
            <h1 className="lewa-lp-h1">Run your whole school from one place.</h1>
            <p className="lewa-lp-lede">
              Lewa keeps students, fees, marks, attendance and payroll in a single
              system built for Cameroonian schools, on any phone or computer.
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
        </section>

        {/* ---- c. STATS BAND ---------------------------------------------- */}
        {/* Omitted in full when the counts did not arrive. See loadStats. */}
        {stats !== null ? (
          <section className="lewa-lp-stats">
            <div className="lewa-lp-wrap lewa-lp-statgrid">
              <div>
                <div className="lewa-lp-statnum">{formatCount(stats.schools)}</div>
                <p className="lewa-lp-statlabel">Schools on Lewa</p>
              </div>
              <div>
                <div className="lewa-lp-statnum">
                  {formatCount(stats.students)}
                </div>
                <p className="lewa-lp-statlabel">Students managed</p>
              </div>
            </div>
          </section>
        ) : null}

        {/* ---- d. FEATURES ------------------------------------------------ */}
        <section className="lewa-lp-features">
          <div className="lewa-lp-wrap">
            <h2 className="lewa-lp-h2">Everything a school office runs on</h2>
            <p className="lewa-lp-sectionlede">
              Six parts of one system, so a payment recorded at the desk shows up
              on the fee balance, the dashboard and the report card without anyone
              copying it over.
            </p>
            <div className="lewa-lp-cardgrid">
              {FEATURES.map((feature) => (
                <div className="lewa-lp-card" key={feature.title}>
                  <h3 className="lewa-lp-cardtitle">{feature.title}</h3>
                  <p className="lewa-lp-cardbody">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

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

        {/* ---- f. CLOSING CTA AND CONTACT --------------------------------- */}
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
              {/* The same number the floating support button offers, read from
                  the one file that holds it -- src/lib/supportContact.ts -- so
                  there is never a second number to keep in step. */}
              <a
                className="lewa-lp-btn lewa-lp-btn-ghost"
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
                className="lewa-lp-textlink lewa-lp-textlink-onnavy"
                href={phoneSupportLink()}
              >
                {SUPPORT_PHONE_DISPLAY}
              </a>
            </p>
          </div>
        </section>
      </main>

      {/* ---- g. FOOTER ---------------------------------------------------- */}
      <footer className="lewa-lp-footer">
        <div className="lewa-lp-wrap lewa-lp-footerbar">
          <p className="lewa-lp-footermeta">
            Lewa &middot; {year} &middot; School management for Cameroonian schools
          </p>
          <a className="lewa-lp-textlink" href={TEACHER_LOGIN_PATH}>
            Teacher login
          </a>
        </div>
      </footer>
    </div>
  );
}
