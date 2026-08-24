/**
 * NOTE ON WHAT IS *NOT* HERE: there is no `icons` key, and the apple-touch-icon
 * is a plain <link> in the markup below instead.
 *
 * That is not a style preference. Next merges the file-convention icons -- our
 * app/icon.png, the browser tab logo -- into the document ONLY when this object
 * has no `icons` key at all (see the `if (!resolvedMetadata.icons)` guard in
 * next/dist/lib/metadata/resolve-metadata.js). Declaring `icons.apple` here to
 * add the iPhone icon therefore silently DELETES the favicon link: one icon
 * gained, another lost, with nothing to say so.
 */
export const metadata = {
  title: 'School Information System',
  description: 'SIS',
};

/**
 * Navy, matching the manifest's theme_color -- and it has to be stated in BOTH
 * places, which is the only reason this export exists. The manifest's copy
 * colours the installed app's title bar; this one colours the address bar of an
 * ordinary browser tab and the status bar on Android. Set in one place only,
 * the app is navy-chromed once installed and default-grey until then.
 *
 * Unlike `metadata.icons` above, adding a field here loses nothing: Next seeds
 * viewport resolution with width=device-width, initial-scale=1 and merges this
 * on top field by field, so the responsive viewport tag survives.
 */
export const viewport = {
  themeColor: '#0f2345',
};

import '../src/index.css';
import { Toaster } from '../src/components/ui/sonner';
import { SupportButton } from '../src/components/SupportButton';

/**
 * Neutralises the scrollbar compensation Radix's scroll lock applies to <body>,
 * WITHOUT touching the lock itself.
 *
 * WHAT THE LOCK DOES. Opening any dialog puts `overflow: hidden` on <body> via
 * react-remove-scroll-bar, which also removes the scrollbar. To stop the page
 * reflowing wider as it vanishes, the library adds a compensating
 * `margin-right` equal to the gap it measured. That part is a layout patch, not
 * an accessibility feature -- the lock proper (overflow: hidden,
 * overscroll-behavior, the focus trap, aria) is untouched by anything here.
 *
 * WHY IT IS NEUTRALISED. The gap it writes is
 *
 *   max(0, window.innerWidth - documentElement.clientWidth + bodyMarginRight)
 *
 * which folds the body's CURRENT margin-right back into its own answer. Any
 * state where that term is already non-zero, or where clientWidth is measured
 * against something other than the plain viewport, produces a compensation far
 * larger than a scrollbar -- and it lands on <body> with `!important`, shifting
 * and narrowing the whole page. Reserving the gutter permanently below removes
 * the need for the compensation entirely: with `scrollbar-gutter: stable` on
 * <html>, hiding the body scrollbar no longer reflows anything, so a margin
 * added to make up for the reflow can only ever be a bug.
 *
 * `html body[...]` is two elements plus an attribute, which outranks the
 * library's own `body[...]` rule, so this wins even though both are !important.
 * The custom property is zeroed for the same reason: the library hands it to
 * fixed-position children as `--removed-body-scroll-bar-size`.
 *
 * A stylesheet rule rather than an inline style because overriding another
 * package's !important declaration on an element this file does not render is
 * not something a style attribute can express.
 */
const SCROLL_LOCK_GUTTER_CSS = `
  html body[data-scroll-locked] {
    margin-right: 0 !important;
    --removed-body-scroll-bar-size: 0px;
  }
`;

/**
 * Registers the service worker in public/sw.js, which exists only to show the
 * offline page when a navigation fails with no connection. It caches no
 * application code and no data -- see the file itself, which is where the
 * reasoning for that lives.
 *
 * An inline script rather than a package or a client component: registration is
 * three lines of browser API that must run once per document, and wrapping it
 * in a component would mean shipping a client boundary in the root layout to do
 * something that needs no React at all.
 *
 * Deferred to `load` so registration never competes with the page it is on for
 * the first paint. The `.catch` is not optional: registration rejects outright
 * on an insecure origin or where a browser policy blocks workers, and without
 * it every such visit logs an unhandled rejection for a feature that is
 * supposed to be an enhancement.
 */
const SERVICE_WORKER_REGISTRATION = `
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* The gutter is always reserved, so the scrollbar appearing or disappearing
       never changes the layout width -- which is what makes the compensation
       above safe to drop. Inline, because it is one declaration on the one
       element this file owns, and src/index.css is a frozen build. */
    <html lang="en" style={{ scrollbarGutter: 'stable' }}>
      <body className="h-full">
        {/* The iPhone home screen icon, hoisted into <head> by React.
            iOS needs its own tag because it ignores the manifest's icons
            entirely -- adding a site to the home screen there looks for this
            and nothing else. Unlike the Android pair in app/manifest.ts it is a
            flattened, opaque image, because iOS composites transparency onto
            black; see scripts/generate-pwa-icons.mjs.

            Written out rather than declared in `metadata.icons` for the reason
            at the top of this file. The <link rel="manifest"> that goes with it
            needs no such care -- Next adds that one from app/manifest.ts. */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <style>{SCROLL_LOCK_GUTTER_CSS}</style>
        {children}
        {/* Moved off sonner's bottom-right default, which is now the support
            button's corner. Without this the two overlap on every toast. */}
        <Toaster position="top-right" />
        {/* A client component: it needs usePathname to know which page the user
            is on, both to hide itself on the two screens that carry their own
            support block and to tell support where the user was. This layout
            stays a server component. */}
        <SupportButton />
        {/* Last in the body so the document is parsed before this runs, and
            dangerouslySetInnerHTML because a string child of <script> is not
            what React renders it as. The content is a constant in this file --
            nothing from a request or a user reaches it. */}
        <script dangerouslySetInnerHTML={{ __html: SERVICE_WORKER_REGISTRATION }} />
      </body>
    </html>
  );
}
