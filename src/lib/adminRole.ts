"use client";

/**
 * WHICH KIND OF ADMIN IS SIGNED IN — for presentation only.
 *
 * The server is the authority on every one of these rules. requireOwner guards
 * the Administrators routes, and src/utils/attribution.js guards every edit and
 * delete; nothing here can grant anything, and nothing here is trusted to. What
 * this file does is stop the app offering an action that is going to be refused.
 *
 * READ FROM THE STORED USER, which is what the login response wrote. Not from
 * GET /auth/me: that route is mounted above authMiddleware in the backend and
 * has no session to read, so it answers "Not found" for everybody. The role is
 * also a claim inside the token, and the token is re-issued from the live row on
 * every request — so a role change reaches this browser on its next sign-in,
 * which is soon enough for a menu item.
 */

export type AdminRole = "OWNER" | "ADMINISTRATOR";

/**
 * ANYTHING THAT IS NOT LITERALLY "ADMINISTRATOR" IS TREATED AS OWNER, and that
 * default is deliberate rather than lazy.
 *
 * Every session that existed before this feature stored `role: "admin"` — the
 * old free-text column — and every one of those accounts IS the school signup
 * account. Defaulting the unrecognised case to ADMINISTRATOR would take the
 * Administrators section away from every owner who happened to be signed in
 * when this shipped, until they logged in again. Defaulting to OWNER shows them
 * a section the server will happily serve them.
 *
 * The risk of the default running the other way is nil: an ADMINISTRATOR only
 * exists at all after this feature, so its stored role is always the real one.
 */
export function getAdminRole(): AdminRole {
  if (typeof window === "undefined") return "OWNER";
  try {
    const raw = window.localStorage.getItem("user");
    if (!raw) return "OWNER";
    const user = JSON.parse(raw);
    // actorType is checked too, for the same reason the backend guards check it:
    // a TEACHER session carries `role` as well, and there it is a free-text job
    // title. A staff member whose title is typed "Owner" must not read as one.
    if (user?.actorType === "teacher") return "ADMINISTRATOR";
    return user?.role === "ADMINISTRATOR" ? "ADMINISTRATOR" : "OWNER";
  } catch {
    return "OWNER";
  }
}

export function isOwner(): boolean {
  return getAdminRole() === "OWNER";
}

/**
 * The same answer as a hook, resolved AFTER mount.
 *
 * It starts as null rather than as a role, and callers render nothing
 * role-dependent until it settles. localStorage does not exist during the
 * server render, so returning "OWNER" on the first pass would flash the
 * Administrators section at an Administrator before hydration corrected it —
 * and a section that appears and then vanishes reads as a bug or, worse, as
 * something being taken away.
 */
import { useEffect, useState } from "react";

export function useAdminRole(): AdminRole | null {
  const [role, setRole] = useState<AdminRole | null>(null);
  useEffect(() => {
    setRole(getAdminRole());
  }, []);
  return role;
}
