'use client';

import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * The one-time ask: "enable notifications?".
 *
 * Mounted in both app shells — the school admin's and the teacher's — so that
 * whichever a person signs into is where they are offered it. It renders NOTHING
 * at all in every case except one: a browser that supports push, on a session
 * that has not yet been asked, and has not said "not now" in this tab.
 *
 * WHY A BANNER AND NOT A PROMPT ON LOAD. Calling Notification.requestPermission()
 * the moment the app opens is the single fastest way to have people press Block,
 * and Block is close to permanent — the browser stops asking, and there is no API
 * to un-block it. The user has to clear it out of site settings by hand, which
 * nobody does. So the browser's own dialog is only ever reached from a deliberate
 * click on Enable, when the person has been told what they are agreeing to.
 *
 * Inline styles throughout: src/index.css is a pre-compiled Tailwind artifact, so
 * a utility class that is not already in it renders as nothing, silently.
 */

/**
 * Suppressed for the rest of this browser session by "Not now".
 *
 * sessionStorage, not localStorage, and that is the difference between "not now"
 * and "never": it comes back on the next visit. A permanent dismissal would be a
 * third state to store and reason about, and the person who wants that already
 * has one — the browser's own Block.
 */
const DISMISSED_KEY = 'lewa_push_prompt_dismissed';

const BLUE = '#1E3A8A';

/**
 * The VAPID public key, base64url as the server generated it, converted to the
 * Uint8Array the subscribe call requires.
 *
 * The browser will not take the string. base64url differs from base64 in two
 * characters and in its padding, so both have to be repaired before atob, and
 * getting that wrong produces an InvalidCharacterError rather than a wrong key
 * — which at least fails loudly.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function PushNotificationSetup() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Every one of these is a reason there is nothing to offer, and each is a
    // real browser rather than a hypothetical one:
    //
    //   no serviceWorker / PushManager   any iOS Safari before 16.4, and every
    //                                    browser in a private window that
    //                                    disables workers
    //   no Notification                  same
    //   no VAPID key configured          a deployment that has not been given
    //                                    NEXT_PUBLIC_VAPID_PUBLIC_KEY — the
    //                                    subscribe call would fail, so do not
    //                                    offer it
    //   permission already decided       'granted' means they are subscribed
    //                                    (or will be, below); 'denied' means the
    //                                    browser will not ask again and a banner
    //                                    offering to try is a lie
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;

    if (Notification.permission === 'granted') {
      // ALREADY PERMITTED, BUT NOT NECESSARILY SUBSCRIBED ON THIS SERVER. A
      // browser keeps its permission across a re-install of the app, a cleared
      // database, and a rotated VAPID key — so a silent re-subscribe here is
      // what keeps a returning user actually receiving. It is not a prompt: the
      // permission already exists, nothing appears on screen, and the endpoint
      // upserts, so this cannot produce a duplicate.
      void subscribe({ silent: true });
      return;
    }
    if (Notification.permission === 'denied') return;

    try {
      if (window.sessionStorage.getItem(DISMISSED_KEY) === '1') return;
    } catch {
      // sessionStorage throws in some privacy modes. Showing the banner is the
      // safe side of that: the worst case is being asked again in a session
      // where the answer could not be remembered.
    }

    setShow(true);
    // subscribe is stable for the life of this component and deliberately not in
    // the dependency list — including it would re-run this effect on every
    // render and re-show a banner the user had just dismissed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function subscribe({ silent }: { silent?: boolean } = {}) {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;

    if (!silent) {
      setBusy(true);
      setError(null);
    }

    try {
      // The permission dialog. On a session that already granted it this
      // returns 'granted' without showing anything, which is what makes the
      // silent re-subscribe above possible.
      const permission = silent ? Notification.permission : await Notification.requestPermission();
      if (permission !== 'granted') {
        // Includes 'default', which is what a dismissed browser dialog gives.
        // The banner goes away either way: they have been asked, and asking
        // again in the same session is nagging.
        setShow(false);
        return;
      }

      // The worker is registered by the inline script in app/layout.tsx. `ready`
      // waits for it to be active rather than assuming it already is — on a
      // first-ever load this component can easily win that race.
      const registration = await navigator.serviceWorker.ready;

      // An existing subscription is REUSED rather than replaced. Calling
      // subscribe() again with a different applicationServerKey throws, and
      // re-subscribing needlessly would rotate the endpoint and orphan the row
      // the server already holds.
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          // Required, and required to be true, by every browser that implements
          // this: a subscription that could be used for silent background
          // messaging is not permitted.
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        }));

      // toJSON gives exactly { endpoint, keys: { p256dh, auth } }, which is the
      // shape POST /push/subscribe reads. The owning account and the school are
      // taken from the session on the server and are deliberately not sent.
      await api.post('/push/subscribe', subscription.toJSON());
      setShow(false);
    } catch (e: any) {
      if (silent) {
        // Nothing was on screen and nothing was asked for. A failure here is
        // worth a console line and no more — it must not put a banner in front
        // of someone who did not press anything.
        console.warn('push: silent re-subscribe failed —', e?.message);
        return;
      }
      setError('Could not enable notifications. Please try again.');
    } finally {
      if (!silent) setBusy(false);
    }
  }

  function dismiss() {
    try {
      window.sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Unwritable storage means it will be offered again next session, which
      // is a smaller problem than failing to close the banner.
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="status"
      style={{
        // In the flow at the top of the page rather than fixed over it. A fixed
        // bar would sit on top of the first row of whatever page it appeared on
        // — a table header, a form's first field — and this is not urgent
        // enough to cover anything.
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        margin: '0.75rem 1rem 0',
        padding: '0.75rem 1rem',
        border: '1px solid #BFDBFE',
        borderLeftWidth: 4,
        borderLeftColor: BLUE,
        borderRadius: 8,
        backgroundColor: '#EFF6FF',
      }}
    >
      <Bell size={18} style={{ color: BLUE, flexShrink: 0, marginTop: 2 }} aria-hidden="true" />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '0.875rem', color: '#1F2937', margin: 0 }}>
          Enable notifications to get reminders and alerts from Lewa.
        </p>

        {error ? (
          <p style={{ fontSize: '0.8125rem', color: '#B91C1C', margin: '0.4rem 0 0' }}>{error}</p>
        ) : null}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void subscribe()}
            disabled={busy}
            style={{
              backgroundColor: BLUE,
              color: 'white',
              border: 'none',
              borderRadius: 6,
              padding: '0.4rem 0.9rem',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Enabling...' : 'Enable'}
          </button>

          <button
            type="button"
            onClick={dismiss}
            disabled={busy}
            style={{
              backgroundColor: 'transparent',
              color: '#4B5563',
              border: '1px solid #D1D5DB',
              borderRadius: 6,
              padding: '0.4rem 0.9rem',
              fontSize: '0.8125rem',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Not now
          </button>
        </div>
      </div>

      {/* The same action as "Not now", in the place a banner's close control is
          expected to be. Both are offered because the corner X is what a lot of
          people reach for without reading the buttons. */}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#6B7280',
          cursor: 'pointer',
          padding: 2,
          flexShrink: 0,
          lineHeight: 0,
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
