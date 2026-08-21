"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
 */
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<PlatformUser | null>(null);
  const [status, setStatus] = useState<"checking" | "ready">("checking");

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
  const nav = [
    { href: "/admin/schools", label: "Schools" },
    ...(me.role === "FOUNDER" ? [{ href: "/admin/administrators", label: "Administrators" }] : []),
    { href: "/admin/account", label: "My Account" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", display: "flex", flexDirection: "column" }}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 18, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: "0.9rem", whiteSpace: "nowrap" }}>Team Console</span>
          <nav style={{ display: "flex", gap: 4, overflowX: "auto" }}>
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
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
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
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
      </header>

      <main style={{ flex: 1, minWidth: 0, padding: 20, overflowX: "auto" }}>{children}</main>
    </div>
  );
}
