"use client";

/**
 * The phone header: a hamburger, and the full-screen sheet it opens.
 *
 * This is the ONLY client boundary the landing page mounts, and it exists for
 * the one thing the page cannot do without JavaScript -- open and close a menu.
 * app/page.tsx stays a server component, so every word of the page is still in
 * the HTML that leaves the server; this adds a button to it.
 *
 * IT CARRIES NO CSS OF ITS OWN. Every class here is defined in LANDING_CSS in
 * app/page.tsx, which is mounted once by the page that renders this. Two style
 * blocks describing one header is how they drift apart, and a style block in a
 * component that unmounts is how a rule disappears mid-animation -- see
 * src/components/ui/motionCss.ts for where that has bitten this codebase
 * before.
 *
 * The button is hidden above 720px and the desktop nav is hidden below it, both
 * in that same stylesheet, so exactly one of the two is ever on screen.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type MenuLink = { href: string; label: string };

type Props = {
  /** The in-page anchors, already filtered: a section that is not being
   *  rendered does not appear here, so this never offers a dead link. */
  links: MenuLink[];
  signupPath: string;
  teacherLoginPath: string;
};

export function MobileMenu({ links, signupPath, teacherLoginPath }: Props) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

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
    <>
      <button
        ref={triggerRef}
        type="button"
        className="lewa-lp-menubtn"
        aria-expanded={open}
        aria-controls="lewa-lp-mobile-menu"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        {/* Three bars, drawn rather than typed: the hamburger character renders
            differently on every platform and is read aloud by screen readers. */}
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

      {open ? (
        <div
          id="lewa-lp-mobile-menu"
          className="lewa-lp-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="lewa-lp-sheettop">
            <span className="lewa-lp-brandname">Lewa</span>
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
            <a
              className="lewa-lp-btn lewa-lp-btn-filled lewa-lp-sheetcta"
              href={signupPath}
              onClick={close}
            >
              Get started
            </a>
          </nav>
        </div>
      ) : null}
    </>
  );
}
