"use client";

import { usePathname } from "next/navigation";
import { PAGE_FADE_CSS } from "./ui/motionCss";

/**
 * The fade-and-rise every school and teacher page arrives with: opacity 0 to 1
 * and 8px of travel, over 200ms, easing out.
 *
 * WRAPPED AROUND {children} IN THE TWO SHELL LAYOUTS, which is what makes this
 * one change rather than seventeen: the shells are the only common ancestor of
 * every page in their section, so nothing has to be added to a page file, and a
 * page added next week is animated the moment it is routed.
 *
 * A CLIENT COMPONENT, BECAUSE IT NEEDS THE PATHNAME. A CSS animation runs when
 * an element is INSERTED, and inserting is exactly what does not happen here: a
 * layout is not re-mounted as the user moves around inside it, so a wrapper
 * rendered once would animate on the first paint and then sit still for the rest
 * of the session -- every subsequent page would appear with no transition at
 * all. Keying the wrapper on the pathname gives React a different element per
 * URL, so it tears the old one out and inserts a new one, and the animation
 * restarts. That is the entire reason usePathname is here.
 *
 * The remount costs nothing that was not already being paid: the page component
 * under a changed pathname is a different component, so React was going to
 * mount a fresh subtree regardless. What it deliberately does NOT include is the
 * query string -- StudentProfile moves between its own tabs by rewriting
 * ?tab=..., and keying on that would flash the whole page on every tab click.
 *
 * A PLAIN <div>, with no layout of its own. It is a block-level box filling the
 * width of <main>, which is what every page's own root already was, and no page
 * in either section asks its parent for a height (nothing uses h-full), so
 * introducing a level here changes no layout. The 8px translate makes the
 * wrapper a containing block for fixed-position descendants for the 200ms it
 * runs -- brief, and no page positions anything fixed inside itself; the mobile
 * header and the drawer are siblings of <main>, above this.
 */
export function PageFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <style>{PAGE_FADE_CSS}</style>
      <div key={pathname} data-sis-page-fade="">
        {children}
      </div>
    </>
  );
}
