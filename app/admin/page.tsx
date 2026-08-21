"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getPlatformToken } from "@/lib/platformApi";

/**
 * /admin — the team console's bare root, which until now was a 404. Note that
 * next.config.mjs already sends the old /platform here, so this is where a
 * stale bookmark from before the rename lands.
 *
 * A client page for the same reason as app/school/page.tsx: the console's token
 * is in localStorage, and a next.config redirect runs on the server where it
 * cannot be read.
 *
 * Presence of a token is the whole check here, which is the same thing
 * app/admin/login/page.tsx does before bouncing an already-signed-in visitor to
 * /admin/schools. It deliberately does NOT call /platform/me first: the
 * (console) layout wrapping /admin/schools does exactly that on mount and
 * clears the session and returns here on failure, so a token that turns out to
 * be stale still ends up at /admin/login — one hop later, with no duplicated
 * round-trip and no second copy of the gate to keep in step.
 */
export default function AdminIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getPlatformToken() ? "/admin/schools" : "/admin/login");
  }, [router]);

  // The login door's colours rather than the console's: the visitor who
  // actually pauses here is the one arriving without a token, and they are on
  // their way to /admin/login.
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#F0F5F9",
        color: "#64748B",
        fontSize: "0.875rem",
      }}
    >
      Loading...
    </div>
  );
}
