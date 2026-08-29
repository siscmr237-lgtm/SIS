"use client";

/**
 * THE LANDING PAGE HEADER: the desktop nav, the hamburger, and the full-screen
 * sheet it opens.
 *
 * This is the ONLY client boundary the landing page mounts, and it exists for
 * the two things the page cannot do without JavaScript -- open and close a menu,
 * and know how far down the visitor has scrolled. app/page.tsx stays a server
 * component, so every word of the page is still in the HTML that leaves the
 * server; this adds a button and a class name to it.
 *
 * WHY THE SCROLL STATE IS HERE AND NOT IN CSS. The header begins transparent
 * over the navy hero and becomes an opaque white bar once the visitor moves.
 * A sticky element cannot tell whether it is stuck, and the sentinel-plus-
 * IntersectionObserver trick that fakes it is more machinery than one boolean.
 * So: one passive scroll listener, one piece of state, one class name.
 *
 * IT CARRIES NO CSS OF ITS OWN. Every class here is defined in LANDING_CSS in
 * app/page.tsx, which is mounted once by the page that renders this. Two style
 * blocks describing one header is how they drift apart, and a style block in a
 * component that unmounts is how a rule disappears mid-animation -- see
 * src/components/ui/motionCss.ts for where that has bitten this codebase
 * before.
 *
 * The button is hidden above 768px and the desktop nav is hidden below it, both
 * in that same stylesheet, so exactly one of the two is ever on screen.
 *
 * (This file replaces app/_landing/MobileMenu.tsx, which did the sheet alone.
 * The sheet's behaviour below -- Escape, the scroll hold, the focus return -- is
 * that component's, unchanged; it moved here because a header that is half
 * server-rendered and half client-rendered would have needed the scrolled class
 * in both halves.)
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type MenuLink = { href: string; label: string };

type Props = {
  /** The in-page anchors, already filtered: a section that is not being
   *  rendered does not appear here, so this never offers a dead link. */
  links: MenuLink[];
  signupPath: string;
  signInPath: string;
  teacherLoginPath: string;
  /** The brand lockup, rendered by the server component so the logo crop and
   *  the markup around it live in one place rather than two. */
  brand: ReactNode;
};

/** How far down before the header stops being transparent. */
const SCROLLED_AT_PX = 24;

export function LandingNav({
  links,
  signupPath,
  signInPath,
  teacherLoginPath,
  brand,
}: Props) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  /**
   * `passive: true` because this listener never calls preventDefault, and
   * saying so lets the browser scroll without waiting to find out.
   *
   * Read once on mount as well as on scroll: a visitor who reloads halfway down
   * the page, or arrives on a #features link, starts already scrolled, and a
   * transparent white-on-white header would be invisible until they moved.
   */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLLED_AT_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;

    /**
     * Escape closes it. Bound to the document rather than to the sheet because
     * the key has to work wherever focus happens to be, including on the body
     * if a tap landed on the backdrop.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);

    /**
     * Hold the page still behind the sheet. The previous value is captured and
     * put back rather than being cleared to a hardcoded default, so this cannot
     * strip an overflow the app set for its own reasons.
     *
     * Deliberately NOT the data-scroll-locked mechanism Radix uses -- the root
     * layout already neutralises that one's margin compensation, and borrowing
     * its attribute here would make this menu answer to a rule written for
     * dialogs. See the note in app/layout.tsx.
     */
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus moves into the sheet so the next Tab lands inside it and a screen
    // reader announces the thing that just opened.
    closeRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  /**
   * Focus goes back to the hamburger when the sheet closes, so a keyboard user
   * is returned to where they were instead of to the top of the document.
   * Skipped on the first render -- there is nothing to return from yet.
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <header
      className={scrolled ? "lewa-lp-nav lewa-lp-nav-scrolled" : "lewa-lp-nav"}
    >
      <div className="lewa-lp-wrap lewa-lp-navbar">
        {brand}

        {/* Hidden below 768px and replaced by the hamburger. The sheet carries
            the same links, so nothing in this nav is unreachable on a phone. */}
        <nav className="lewa-lp-navlinks">
          {links.map((link) => (
            <a className="lewa-lp-navlink" href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="lewa-lp-navctas">
          <a className="lewa-lp-navsignin" href={signInPath}>
            Sign In
          </a>
          <a
            className="lewa-lp-btn lewa-lp-btn-green lewa-lp-navcta"
            href={signupPath}
          >
            Get Started
          </a>
        </div>

        <button
          ref={triggerRef}
          type="button"
          className="lewa-lp-menubtn"
          aria-expanded={open}
          aria-controls="lewa-lp-mobile-menu"
          aria-label="Open menu"
          onClick={() => setOpen(true)}
        >
          {/* Three bars, drawn rather than typed: the hamburger character
              renders differently on every platform and is read aloud by screen
              readers. */}
          <svg
            className="lewa-lp-menuicon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <line x1="3.5" y1="7" x2="20.5" y2="7" />
            <line x1="3.5" y1="12" x2="20.5" y2="12" />
            <line x1="3.5" y1="17" x2="20.5" y2="17" />
          </svg>
        </button>
      </div>

      {open ? (
        <div
          id="lewa-lp-mobile-menu"
          className="lewa-lp-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="lewa-lp-sheettop">
            <span className="lewa-lp-sheetbrand">Lewa</span>
            <button
              ref={closeRef}
              type="button"
              className="lewa-lp-menubtn"
              aria-label="Close menu"
              onClick={close}
            >
              <svg
                className="lewa-lp-menuicon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                aria-hidden="true"
                focusable="false"
              >
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>

          <nav className="lewa-lp-sheetnav">
            {/* Closing on tap is what makes these work at all: the target is on
                this same page, so without it the sheet would stay over the
                section it just scrolled to. */}
            {links.map((link) => (
              <a
                key={link.href}
                className="lewa-lp-sheetlink"
                href={link.href}
                onClick={close}
              >
                {link.label}
              </a>
            ))}
            <a
              className="lewa-lp-sheetlink"
              href={teacherLoginPath}
              onClick={close}
            >
              Teacher login
            </a>
            <div className="lewa-lp-sheetctas">
              <a
                className="lewa-lp-btn lewa-lp-btn-outline-navy lewa-lp-btn-block"
                href={signInPath}
                onClick={close}
              >
                Sign In
              </a>
              <a
                className="lewa-lp-btn lewa-lp-btn-green lewa-lp-btn-block"
                href={signupPath}
                onClick={close}
              >
                Get Started
              </a>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
