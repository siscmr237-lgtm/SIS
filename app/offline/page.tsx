export const metadata = {
  title: 'Offline — Lewa',
};

/**
 * What the service worker shows when a navigation fails with no connection.
 *
 * A server component with no data of its own, so it is rendered once at build
 * time into plain HTML. That matters more here than anywhere else in the app:
 * this page is served out of the cache to a device with no network, where none
 * of the application JavaScript can load. Anything that needed to hydrate to
 * become visible would be a blank screen. Everything below is in the HTML.
 *
 * No retry button for the same reason -- a button that needs JavaScript to do
 * anything would be a button that does nothing, on the one page guaranteed to
 * be opened without it. Reload is the browser's own control and it always
 * works.
 *
 * Styles are inline throughout: src/index.css is a frozen build, and a page
 * that has to render correctly from cache with no stylesheet request is not a
 * page to hang on class names.
 */

/**
 * Hides the root layout's support button on this page.
 *
 * There is already a route entry for /offline in SupportButton's own
 * ROUTES_WITHOUT_SUPPORT, and it is not enough on its own. The service worker
 * serves this page's cached HTML in answer to whatever URL was asked for, so a
 * phone with no signal opening /school/dashboard gets this page while the
 * address stays /school/dashboard. The button reads the route with
 * usePathname(), sees /school/dashboard, and renders -- and it renders as soon
 * as the browser has enough cached JavaScript to hydrate, which makes it appear
 * on some offline visits and not others. Inconsistent chrome is worse than
 * either answer.
 *
 * CSS rather than more route logic because CSS needs no JavaScript at all: this
 * holds whether the page hydrates or not, under any URL. The attribute it keys
 * on is declared for this purpose in SupportButton.
 */
const HIDE_SUPPORT_BUTTON_CSS = `[data-support-button] { display: none !important; }`;

export default function OfflinePage() {
  return (
    <div
      style={{
        // 100vh, not 100dvh: this page is not scrollable and gains nothing from
        // the dynamic unit, and dvh written inline has no fallback for a
        // browser that does not know it.
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        // The logo's OWN background colour, not the #f0f5f9 the auth screens
        // use. The logo PNG is opaque, so any other value draws a visible pale
        // square around the mark -- two near-whites a shade apart, which reads
        // as a rendering fault rather than a choice. Close enough to the auth
        // screens that arriving here does not look like a different site.
        backgroundColor: '#eff8ff',
        textAlign: 'center',
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <style>{HIDE_SUPPORT_BUTTON_CSS}</style>

      {/* Cached by the service worker alongside this page -- see public/sw.js.
          Width and height are set so the text below does not jump as the image
          decodes. */}
      <img
        src="/images/lewa-logo.png"
        alt="Lewa"
        width={200}
        height={200}
        style={{ width: '100%', maxWidth: 200, height: 'auto' }}
      />

      <p
        style={{
          marginTop: '1.75rem',
          maxWidth: 340,
          fontSize: 16,
          lineHeight: 1.55,
          color: '#0F172A',
        }}
      >
        You&rsquo;re offline. Please check your connection and try again.
      </p>
    </div>
  );
}
