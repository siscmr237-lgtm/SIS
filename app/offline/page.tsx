export const metadata = {
  title: 'Offline — Lewa',
};

/**
 * What the service worker shows when a navigation fails and the network could
 * not be used at all.
 *
 * A server component with no data of its own, so it is rendered once at build
 * time into plain HTML. That matters more here than anywhere else in the app:
 * this page is served out of the cache to a device that may have no network, so
 * none of the application JavaScript can load. Anything that needed to hydrate
 * to become visible would be a blank screen. Everything below is in the HTML.
 *
 * No retry button for the same reason -- a button wired up by application code
 * would be a button that does nothing, on the one page guaranteed to be opened
 * without it. Reload is the browser's own control and it always works.
 *
 * Styles are inline throughout: src/index.css is a frozen build, and a page
 * that has to render correctly from cache with no stylesheet request is not a
 * page to hang on class names.
 */

/**
 * WHY THIS PAGE NO LONGER JUST SAYS "YOU'RE OFFLINE".
 *
 * The service worker shows this page when a navigation's fetch() REJECTS. A
 * device with no connection rejects -- and so does a perfectly connected device
 * whose ORIGIN is dead: DNS moved somewhere that answers nothing, a TLS
 * handshake reset, a host that stopped replying. From inside the worker those
 * are one indistinguishable event, so a page that asserts the first of them is
 * guessing, and it guesses wrong every single time the fault is ours.
 *
 * It guessed wrong for real. lewa.app was registered on 2026-08-20; ICANN gives
 * 15 days to verify the registrant's contact email, and on 2026-09-04 the
 * registrar answered the silence by repointing the domain's nameservers at
 * failed-whois-verification.namecheap.com. Every hostname under it -- the
 * landing page, /school, /teacher, /admin, and api.lewa.app -- then resolved to
 * a parking IP serving no HTTPS at all. All four apps went dark at once, and
 * every one of them sat there telling its users to go and check their own
 * connection. The domain was suspended; nothing on any screen said so.
 *
 * navigator.onLine settles it, in the single direction it can be trusted:
 * false means the device has no network interface, which no fault of ours can
 * fake. true means a connection exists and the failure happened at the far end,
 * so the message can stop blaming the reader and point at where the problem
 * actually is.
 */

/**
 * The three things this page can honestly say, and when.
 *
 * MESSAGE_UNKNOWN is the one written into the HTML, so it is what a reader sees
 * if the script below never runs. It therefore has to hold in BOTH worlds at
 * once -- which is exactly why it commits to neither cause. The other two are
 * only ever reached once navigator.onLine has actually been read.
 */
const MESSAGE_UNKNOWN =
  'Lewa can’t be reached. That may be your connection, or it may be us — please reload to try again.';
const MESSAGE_OFFLINE = 'You’re offline. Please check your connection and try again.';
const MESSAGE_UNREACHABLE =
  'Your connection is working — Lewa itself can’t be reached right now. Please reload in a moment.';

/**
 * Sharpens the message above from what is safe to what is true.
 *
 * AN INLINE SCRIPT IS NOT A CONTRADICTION of the note about application
 * JavaScript being unavailable here. That note is about Next's chunks, which
 * are network requests and genuinely cannot arrive. This is source text inside
 * the cached HTML: it is already on the device the moment the page is, and it
 * runs with the network as dead as it likes. That distinction is the whole
 * reason it is written out here rather than imported from anywhere.
 *
 * It replaces text that is ALREADY VISIBLE rather than filling something empty,
 * so the page still reads correctly with scripts blocked outright -- and it
 * sits directly after the paragraph, executing during parse, so the wording is
 * settled before the first paint instead of visibly changing after it.
 */
const DIAGNOSE_CONNECTION = `
  (function () {
    var el = document.getElementById('offline-message');
    // "'onLine' in navigator" is the feature check, not navigator.onLine
    // itself: a browser without the property yields undefined, which is falsy,
    // and would have every reader told they were offline on no evidence.
    if (!el || !('onLine' in navigator)) return;
    el.textContent = navigator.onLine
      ? ${JSON.stringify(MESSAGE_UNREACHABLE)}
      : ${JSON.stringify(MESSAGE_OFFLINE)};
  })();
`;

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

      {/* suppressHydrationWarning because the script below deliberately
          rewrites this text before React ever sees the DOM. The root layout
          mounts client components, so the document DOES hydrate on any visit
          where the app's JavaScript can load -- and without this, React finds
          text disagreeing with what it rendered and patches the corrected
          message back to the vague one. */}
      <p
        id="offline-message"
        suppressHydrationWarning
        style={{
          marginTop: '1.75rem',
          maxWidth: 340,
          fontSize: 16,
          lineHeight: 1.55,
          color: '#0F172A',
        }}
      >
        {MESSAGE_UNKNOWN}
      </p>
      <script dangerouslySetInnerHTML={{ __html: DIAGNOSE_CONNECTION }} />
    </div>
  );
}
