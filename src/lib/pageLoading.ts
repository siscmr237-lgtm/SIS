/**
 * HOW THE APP KNOWS A PAGE HAS FINISHED OPENING.
 *
 * A single count of the READS currently in flight, incremented and decremented
 * by the two transports -- src/lib/api.ts for the school and teacher app,
 * src/lib/platformApi.ts for the admin console. Nothing else writes to it.
 *
 * WHY A MODULE-LEVEL COUNTER RATHER THAN STATE. The thing that has to observe
 * this is PageLoader, mounted once in the root layout; the things that move it
 * are fetch calls made from thirty-five different files, most of them inside
 * effects that know nothing about a loader. A context would mean every one of
 * those call sites taking a hook it has no other use for. A module variable is
 * read by the one component that cares and written by the two functions every
 * read already passes through, and it costs no re-render on the way.
 *
 * WHY READS ONLY. A POST that takes four seconds -- recording a payroll run,
 * generating a report card -- must never put a veil over the screen: the user
 * started it deliberately from a page that is already open, and the button they
 * pressed has its own pending state. Only GET is counted, so the loader can
 * measure "this page is still fetching what it needs to show" and nothing else.
 *
 * The count is deliberately NOT reset on navigation. A request from the page
 * being left behind is still a real request against the same connection, and
 * zeroing the count would let the next page's loader disappear while the wire
 * is still busy. Every increment has a matching decrement in a `finally`, so
 * the count returns to zero whether the request resolves or throws, and
 * PageLoader caps its own patience regardless.
 */

let readsInFlight = 0;

/** Called by a transport as a GET leaves. Always paired with {@link endRead}. */
export function beginRead(): void {
  readsInFlight += 1;
}

/** Called by a transport from a `finally`, so a thrown request still clears. */
export function endRead(): void {
  // Floored at zero so a stray extra call can never drive the count negative
  // and leave the loader believing the app is permanently idle.
  readsInFlight = Math.max(0, readsInFlight - 1);
}

/** How many reads are outstanding right now. */
export function readsInFlightCount(): number {
  return readsInFlight;
}

/**
 * True for the requests the loader waits on: a GET, which is how every screen
 * in this app asks for the data it paints. `init` omitted means GET, which is
 * what `api.get` and `platformApi.get` both send.
 */
export function isRead(init?: RequestInit): boolean {
  const method = init?.method;
  return method === undefined || method.toUpperCase() === 'GET';
}
