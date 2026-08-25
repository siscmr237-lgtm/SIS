"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, LogOut, Menu, School, Settings, Users, X } from "lucide-react";
import { MOBILE_DRAWER_CSS } from "@/components/mobileDrawerCss";
import {
  clearPlatformSession,
  getPlatformToken,
  platformApi,
  type PlatformUser,
} from "@/lib/platformApi";

/**
 * The console's own shell. Not the school app's.
 *
 * (console) is a route group, so these pages still live at /admin/*. It
 * exists so that /admin/login — which is reached before any session — sits
 * outside this gate while sharing the prefix.
 *
 * Nothing from the school app is mounted here: no Sidebar, no SisCacheProvider,
 * and no SupportButton. The support button is separately excluded at its own
 * source too, because it is rendered from the root layout and would otherwise
 * float over this console offering a WhatsApp link to our own support line.
 *
 * The one thing borrowed from the school app is MOBILE_DRAWER_CSS — the slide
 * itself, so the console's phone menu and the school's cannot drift apart.
 */

/**
 * The Lewa mark, cropped out of the shared logo file.
 *
 * The art is an opaque #EFF8FF square whose ink occupies only the middle ~30%,
 * so an <img> at header size would render a mostly-empty light rectangle with a
 * mark of about 10px in it. Measured: the ink spans 28.2% x 30.2% of the file,
 * centred at 50.0% / 46.9%. Scaling the image to 260% of the box puts that ink
 * at ~78% of the box's height, and 45% is the vertical position that lands the
 * ink's own centre — which sits slightly above the file's — on the box's centre.
 *
 * A background rather than an <img> for the same reason the login pages use one
 * (see app/school/login/page.tsx): the field colour is baked into the art, so
 * the box repeats it underneath and a failed load leaves the same blue chip
 * rather than a broken-image glyph. That also makes it decorative as far as the
 * accessibility tree is concerned, hence role/aria-label rather than alt text.
 */
const LEWA_MARK: React.CSSProperties = {
  backgroundColor: "#EFF8FF",
  backgroundImage: "url('/images/lewa-logo.png')",
  backgroundSize: "260%",
  backgroundPosition: "50% 45%",
  backgroundRepeat: "no-repeat",
  borderRadius: 8,
  flexShrink: 0,
};

/**
 * Which form of the menu is on screen, by width.
 *
 * On a phone the header's inline nav and the name-plus-sign-out group ran out
 * of room and turned the header into a horizontal scroller. Below 768px they
 * are replaced by a hamburger and the drawer below; from 768px up the header is
 * exactly what it always was and the drawer is not in the document. The two
 * forms are never both on screen, so there is one menu, not two.
 *
 * Real media queries rather than Tailwind's `md:` variants because
 * src/index.css is a frozen pre-compiled build — a variant that is not already
 * in it parses, ships and does nothing. `display` is therefore also absent from
 * the inline styles on these elements: an inline declaration would outrank the
 * stylesheet and pin them to one form at every width.
 */
const CONSOLE_SHELL_CSS = `
  [data-console-desktop] { display: flex; }
  [data-console-menu-button] { display: none; }

  @media (max-width: 767px) {
    [data-console-desktop] { display: none; }
    [data-console-menu-button] { display: inline-flex; }
  }

  /* The school's drawer becomes the static desktop sidebar at md+, which is why
     MOBILE_DRAWER_CSS clears its transform there. This console has no sidebar
     for it to become, so that same rule would un-park it and leave it sitting
     across the desktop header. Taken out of the document instead.

     Its column layout has to live here rather than in the style attribute for
     the same reason as the two rules above: an inline display:flex outranks a
     stylesheet, so the drawer would have ignored the display:none below and
     shown up on every desktop page. (No backticks in this comment — it is
     inside a template literal, and one would end the string early.) */
  [data-console-drawer] { display: flex; flex-direction: column; }

  @media (min-width: 768px) {
    [data-console-drawer] { display: none; }
  }
`;

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<PlatformUser | null>(null);
  const [status, setStatus] = useState<"checking" | "ready">("checking");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!getPlatformToken()) {
      router.replace("/admin/login");
      return;
    }
    // The server is the authority on who this is, and on the role. A role read
    // from localStorage would let anyone hand themselves a menu they cannot
    // actually use — harmless on its own, but it must not be what the UI trusts.
    platformApi
      .get("/platform/me")
      .then((user: any) => {
        setMe(user);
        setStatus("ready");
      })
      .catch(() => {
        clearPlatformSession();
        router.replace("/admin/login");
      });
  }, [router]);

  // Every link in the drawer closes it on click, but the Back button moves the
  // route without one. Closing on the path itself covers both.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Escape closes it, as the backdrop does. Bound only while it is open, so the
  // console is not listening for keys it has no use for the rest of the time.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (status !== "ready" || !me) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0F172A", color: "#94A3B8" }}>
        Loading...
      </div>
    );
  }

  const signOut = () => {
    // Clears the console keys only. A school session in this same browser is
    // left exactly as it was.
    clearPlatformSession();
    router.replace("/admin/login");
  };

  // Administrators is Founder-only. Hiding it is a courtesy; the API refuses a
  // Member outright, so a Member who types the URL still gets nothing.
  //
  // The icons ride along here but only the drawer draws them — the desktop
  // header nav is a row of text links and stays one.
  const nav = [
    // First, and the console's landing page — see app/admin/page.tsx. It is
    // the only entry here that shows the platform as a whole rather than one
    // school or one account.
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/schools", label: "Schools", icon: School },
    ...(me.role === "FOUNDER" ? [{ href: "/admin/administrators", label: "Administrators", icon: Users }] : []),
    // The route stays /admin/account; this is only what the team reads.
    { href: "/admin/account", label: "Settings", icon: Settings },
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", display: "flex", flexDirection: "column" }}>
      <style>{MOBILE_DRAWER_CSS}</style>
      <style>{CONSOLE_SHELL_CSS}</style>

      <header
        style={{
          background: "#0F172A", color: "white", padding: "0 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          height: 56, gap: 16, flexWrap: "nowrap",
          // Stays put while the page scrolls.
          //
          // STICKY rather than FIXED, deliberately. Sticky keeps the header's 56px
          // in the flow, so nothing below has to be padded down to compensate and
          // no content can end up starting underneath it. Fixed would take the
          // header out of flow and push the first row of every page up under it.
          //
          // 30 sits below the 50 the Administrators modal overlay uses, so a
          // dialog still covers the header instead of it punching through.
          position: "sticky", top: 0, zIndex: 30,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <span role="img" aria-label="Lewa" style={{ ...LEWA_MARK, width: 36, height: 36 }} />
          <span style={{ fontWeight: 600, fontSize: "0.9rem", whiteSpace: "nowrap" }}>Team Console</span>
          <nav data-console-desktop="" style={{ gap: 4, overflowX: "auto" }}>
            {nav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    padding: "6px 10px", borderRadius: 7, fontSize: "0.8125rem",
                    whiteSpace: "nowrap",
                    color: active ? "white" : "#94A3B8",
                    background: active ? "#1E293B" : "transparent",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div data-console-desktop="" style={{ alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: "0.75rem", color: "#94A3B8", whiteSpace: "nowrap" }}>
            {me.name} · {me.role === "FOUNDER" ? "Founder" : "Member"}
          </span>
          <button
            onClick={signOut}
            style={{
              background: "transparent", border: "1px solid #334155", color: "#CBD5E1",
              borderRadius: 7, padding: "5px 10px", fontSize: "0.75rem", cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>

        {/* Top-right, matching the school shell: the corner a thumb reaches
            one-handed, and the corner the drawer slides out from. */}
        <button
          data-console-menu-button=""
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          style={{
            alignItems: "center", justifyContent: "center",
            background: "transparent", border: "none", color: "white",
            padding: 4, borderRadius: 7, cursor: "pointer", flexShrink: 0,
          }}
        >
          <Menu size={22} />
        </button>
      </header>

      {/* Always mounted, faded by state — rendering it conditionally would drop
          the backdrop the instant the drawer started sliding out, leaving the
          two disagreeing for the whole 300ms of the close. */}
      <div
        data-sis-drawer-overlay=""
        data-open={menuOpen ? "true" : "false"}
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0 }}
      />

      <aside
        data-sis-drawer=""
        data-console-drawer=""
        data-open={menuOpen ? "true" : "false"}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: 264,
          background: "#0F172A", color: "white",
          borderLeft: "1px solid #1E293B",
          // display/flex-direction are in CONSOLE_SHELL_CSS, not here — see the
          // note there. They must stay overridable by the md+ rule that hides
          // this panel on desktop.
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px 10px 16px", borderBottom: "1px solid #1E293B",
            minHeight: 56,
          }}
        >
          <span role="img" aria-label="Lewa" style={{ ...LEWA_MARK, width: 32, height: 32 }} />
          {/* minWidth 0 is load-bearing: a flex item defaults to min-width auto,
              so without it a long name refuses to shrink and pushes the close
              button off the panel instead of ellipsing. */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              title={me.name}
              style={{
                fontSize: "0.8125rem", fontWeight: 600,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {me.name}
            </div>
            <div style={{ fontSize: "0.72rem", color: "#94A3B8" }}>
              {me.role === "FOUNDER" ? "Founder" : "Member"}
            </div>
          </div>
          <button
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            style={{
              display: "inline-flex", alignItems: "center",
              background: "transparent", border: "none", color: "#94A3B8",
              padding: 4, borderRadius: 7, cursor: "pointer", flexShrink: 0,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* The nominated scroller. flex:1 with minHeight 0 is what keeps a long
            list inside this element instead of growing the panel and pushing
            Sign Out off the bottom of the screen. */}
        <nav style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 12 }}>
          {nav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 8, marginBottom: 4,
                  fontSize: "0.875rem",
                  color: active ? "white" : "#CBD5E1",
                  background: active ? "#1E293B" : "transparent",
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Last, and fenced off: signing out is not one of the destinations
            above it, and it is the one item here that Back cannot undo. */}
        <div style={{ padding: 12, borderTop: "1px solid #1E293B" }}>
          <button
            onClick={signOut}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12,
              padding: "10px 12px", borderRadius: 8,
              background: "transparent", border: "none", color: "#CBD5E1",
              fontSize: "0.875rem", textAlign: "left", cursor: "pointer",
            }}
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, padding: 20, overflowX: "auto" }}>{children}</main>
    </div>
  );
}
