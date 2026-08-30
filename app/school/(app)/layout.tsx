"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { SisCacheProvider } from "@/lib/SisCache";
import { Sidebar } from "@/components/Sidebar";
import { MOBILE_DRAWER_CSS } from "@/components/mobileDrawerCss";
import { PageFade } from "@/components/PageFade";
import { useAuthGateWithRetry, useRegistrationWatch } from "@/lib/authGate";
import { AuthGateError } from "@/components/AuthGateError";
import { ContentLoader } from "@/components/ContentLoader";
import { PushNotificationSetup } from "@/components/PushNotificationSetup";

// Shared shell for every internal section (Dashboard, Students, Staff, ...).
// Mounts fresh on every direct URL visit and every hard reload, so the auth
// gate below runs independently each time rather than relying on whatever
// redirect happened at login.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, retry } = useAuthGateWithRetry();
  // ...and because it does NOT remount as the admin moves around inside the
  // shell, the watch re-asks on every navigation. Approval can be withdrawn
  // mid-session, and the mount check alone would not notice until a reload.
  useRegistrationWatch();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // "error" means the gate could not reach an answer — a network drop, or the
  // API returning 503 on a database blip. It is NOT permission to continue: the
  // shell holds here rather than rendering a dashboard it has not been told
  // this school may see. The session is left intact, so a retry is all it takes
  // once the connection is back.
  if (status === "error") {
    return <AuthGateError onRetry={retry} />;
  }

  if (status !== "ready") {
    return <ContentLoader minHeight={"100vh"} />;
  }

  return (
    <SisCacheProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <style>{MOBILE_DRAWER_CSS}</style>
        {/* Title left, hamburger right — the button is the thing a thumb has to
            reach one-handed, and on a phone the top-right corner is the nearer
            of the two. justify-between puts them at the two ends; min-w-0 lets
            the title's truncate actually engage, and shrink-0 stops a long
            title squeezing the button. */}
        <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-blue-900 text-white flex items-center justify-between px-4 gap-3 shadow-md">
          <span className="font-medium text-sm truncate min-w-0">School Admin</span>
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
            aria-expanded={sidebarOpen}
            className="p-1 rounded hover:bg-blue-800 shrink-0"
          >
            <Menu size={22} />
          </button>
        </div>
        {/* Always mounted, faded by state. Conditionally rendering it meant it
            vanished the instant the drawer started sliding out, so the backdrop
            and the panel disagreed for the whole 300ms of the close. */}
        <div
          data-sis-drawer-overlay=""
          data-open={sidebarOpen ? 'true' : 'false'}
          aria-hidden="true"
          className="fixed inset-0 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        {/* min-w-0 is load-bearing, not decoration.
            A flex item defaults to `min-width: auto`, meaning "never shrink
            below your content's minimum". So one wide descendant — a date input
            with an intrinsic widget width, a table of nowrap cells — pushed this
            element wider than the screen. And because `overflow-y: auto` forces
            the other axis from `visible` to `auto` (CSS Overflow 3 §3.2), the
            excess did not get clipped: <main> quietly became a HORIZONTAL
            scroller, which is the blank space you could swipe into to the right
            of every page. min-w-0 lets it shrink to its share instead. */}
        <main className="flex-1 min-w-0 overflow-y-auto pt-14 md:pt-0">
          {/* The one-time "enable notifications?" offer.

              INSIDE <main>, above the page, rather than in the shell chrome: it
              scrolls away with the content instead of holding a strip of the
              viewport, which is what it deserves — it is an offer, not an alert.

              It renders null in every case but one (unsupported browser, already
              answered, dismissed this session), so this costs a mounted component
              and no layout on nearly every load. See PushNotificationSetup.tsx. */}
          <PushNotificationSetup />
          {/* Every page in this section fades and rises on arrival, from here
              rather than from seventeen page files. PageFade.tsx explains why it
              is keyed on the pathname — a layout is not re-mounted as the user
              moves around inside it, and a CSS animation only runs on insert. */}
          <PageFade>{children}</PageFade>
        </main>
      </div>
    </SisCacheProvider>
  );
}
