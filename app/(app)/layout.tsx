"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { SisCacheProvider } from "@/lib/SisCache";
import { Sidebar } from "@/components/Sidebar";
import { MOBILE_DRAWER_CSS } from "@/components/mobileDrawerCss";
import { useAuthGate } from "@/lib/authGate";

// Shared shell for every internal section (Dashboard, Students, Staff, ...).
// Mounts fresh on every direct URL visit and every hard reload, so the auth
// gate below runs independently each time rather than relying on whatever
// redirect happened at login.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const status = useAuthGate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (status !== "ready") {
    return <div className="p-6 text-sm text-gray-600">Loading...</div>;
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
          {children}
        </main>
      </div>
    </SisCacheProvider>
  );
}
