"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Headset, Phone, X } from "lucide-react";
import {
  SUPPORT_PHONE_DISPLAY,
  phoneSupportLink,
  whatsappSupportLink,
} from "../lib/supportContact";

const NAVY = "#0f2345";
const GOLD = "#e6c482";

/**
 * Routes that already offer support of their own, so a second affordance would
 * just be clutter: both OTP screens render the "Having trouble receiving your
 * code?" block inside OtpVerifyScreen.
 *
 * Everything else gets the button — including /login, /signup, /onboarding and
 * /teacher/set-password. Someone who cannot get through the front door is
 * exactly who needs to reach support, and those pages had nothing before.
 */
const ROUTES_WITH_THEIR_OWN_SUPPORT = ["/verify-email", "/password-reset"];

/**
 * Routes that get NO button at all — a different question from the list above,
 * which is about pages that already offer support another way.
 *
 * /admin is the internal team console. This button offers a WhatsApp link to
 * our own support line, so on those pages it would be us offering to help
 * ourselves. Excluded here, at the source, because the button is rendered from
 * the root layout and so reaches every route including the console's own shell.
 */
const ROUTES_WITHOUT_SUPPORT = ["/admin"];

/**
 * Matches the route itself and anything nested under it, but never a route that
 * merely starts with the same letters — `/password-reset-help` is a different
 * page from `/password-reset` and would keep the button.
 */
function matchesRoute(pathname: string | null, routes: string[]): boolean {
  if (!pathname) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  return routes.some((route) => path === route || path.startsWith(`${route}/`));
}

function hasOwnSupport(pathname: string | null): boolean {
  return matchesRoute(pathname, ROUTES_WITH_THEIR_OWN_SUPPORT);
}

function suppressesSupport(pathname: string | null): boolean {
  return matchesRoute(pathname, ROUTES_WITHOUT_SUPPORT);
}

/**
 * lucide-react ships no WhatsApp glyph (its brand icons were removed), and the
 * brief rules out new packages — so the mark is inlined here as the one piece of
 * SVG in the file. It is the recognisable logo rather than a generic speech
 * bubble because recognition is the whole reason a user reaches for it.
 */
function WhatsAppIcon({ size = 18, color = "#FFFFFF" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/**
 * The floating "Contact Support" button, mounted once in the root layout.
 *
 * Every style here is an inline style object. This project has no Tailwind
 * build — tailwindcss, postcss and autoprefixer are absent from package.json
 * and src/index.css is a frozen pre-compiled file — so a className written here
 * would parse fine, ship fine, and do absolutely nothing.
 */
export function SupportButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Closing on navigation matters because this component never unmounts: it
  // lives in the root layout, so without this the panel would follow the user
  // to the next page still open.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const node = containerRef.current;
      if (node && e.target instanceof Node && !node.contains(e.target)) setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  if (hasOwnSupport(pathname) || suppressesSupport(pathname)) return null;

  const rowBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    padding: "0.625rem 0.75rem",
    borderRadius: 10,
    textDecoration: "none",
    fontSize: "0.8125rem",
    fontWeight: 600,
    lineHeight: 1.3,
  };

  const iconBadge: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 8,
    flexShrink: 0,
  };

  return (
    // A layout-neutral wrapper: it has no size of its own, and exists only so a
    // single ref covers both fixed children for the click-outside check.
    <div ref={containerRef}>
      {open && (
        <div
          role="dialog"
          aria-label="Contact support"
          style={{
            position: "fixed",
            bottom: "5.5rem",
            right: "1.25rem",
            width: 272,
            maxWidth: "calc(100vw - 2.5rem)",
            backgroundColor: "#FFFFFF",
            borderRadius: 14,
            border: "1px solid #E5E7EB",
            boxShadow: "0 12px 32px rgba(15, 35, 69, 0.18)",
            overflow: "hidden",
            // Above the (app) layout's mobile header (z-30) and its sidebar
            // overlay (z-40), so the panel is never half-buried.
            zIndex: 60,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.5rem",
              padding: "0.75rem 0.875rem",
              backgroundColor: NAVY,
            }}
          >
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: GOLD }}>
              Need help?
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close support panel"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 26,
                height: 26,
                padding: 0,
                borderRadius: 6,
                border: "none",
                backgroundColor: "transparent",
                color: "#FFFFFF",
                cursor: "pointer",
              }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ padding: "0.875rem" }}>
            <p
              style={{
                margin: "0 0 0.75rem",
                fontSize: "0.75rem",
                lineHeight: 1.45,
                color: "#6B7280",
              }}
            >
              Message or call us and we&apos;ll help you out.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <a
                href={whatsappSupportLink(pathname ?? "")}
                target="_blank"
                rel="noreferrer"
                onClick={() => setOpen(false)}
                style={{
                  ...rowBase,
                  backgroundColor: "#F0FDF4",
                  border: "1px solid #BBF7D0",
                  color: "#15803D",
                }}
              >
                <span style={{ ...iconBadge, backgroundColor: "#25D366" }}>
                  <WhatsAppIcon />
                </span>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span>WhatsApp</span>
                  <span style={{ fontSize: "0.6875rem", fontWeight: 500, opacity: 0.85 }}>
                    {SUPPORT_PHONE_DISPLAY}
                  </span>
                </span>
              </a>

              {/* No target="_blank": a tel: URL is handed to the OS dialler, and
                  opening a tab for it leaves an empty one behind on desktop. */}
              <a
                href={phoneSupportLink()}
                onClick={() => setOpen(false)}
                style={{
                  ...rowBase,
                  backgroundColor: "#F8FAFC",
                  border: "1px solid #E2E8F0",
                  color: NAVY,
                }}
              >
                <span style={{ ...iconBadge, backgroundColor: NAVY }}>
                  <Phone size={17} color={GOLD} />
                </span>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span>Call us</span>
                  <span style={{ fontSize: "0.6875rem", fontWeight: 500, opacity: 0.75 }}>
                    {SUPPORT_PHONE_DISPLAY}
                  </span>
                </span>
              </a>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support panel" : "Contact support"}
        aria-expanded={open}
        style={{
          position: "fixed",
          bottom: "1.25rem",
          right: "1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 54,
          height: 54,
          padding: 0,
          borderRadius: 999,
          border: `2px solid ${GOLD}`,
          backgroundColor: NAVY,
          color: GOLD,
          cursor: "pointer",
          boxShadow: "0 6px 18px rgba(15, 35, 69, 0.3)",
          zIndex: 60,
        }}
      >
        {open ? <X size={22} /> : <Headset size={22} />}
      </button>
    </div>
  );
}
