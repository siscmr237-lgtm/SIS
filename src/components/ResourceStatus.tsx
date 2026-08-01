'use client';

import { useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Marks a section that is showing cached data while it refetches underneath.
 *
 * Deliberately quiet. The point of the swr policy is that the screen stays
 * readable and usable throughout, so this must read as a footnote, never as a
 * loading state — if it competes with the content for attention it has
 * defeated the caching it is reporting on.
 */
export function RevalidatingBadge({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-1.5 align-middle text-xs text-gray-400">
      <RefreshCw size={12} className="animate-spin" aria-hidden="true" />
      Updating
    </span>
  );
}

/**
 * Reports a fetch failure once per failure.
 *
 * The message distinguishes the two cases that look identical from the inside
 * but are very different to the person reading the screen: a background
 * revalidation that failed over data still on display, versus a first load
 * that came back with nothing. Saying "couldn't refresh" while a full table is
 * visible is honest; saying it over an empty one is not.
 *
 * Every caller shares one toast id, so a dropped connection that fails three
 * resources at once replaces a single toast instead of stacking three.
 */
export function useResourceError(error: Error | null, label: string, hasData: boolean) {
  const reported = useRef<Error | null>(null);

  useEffect(() => {
    if (!error) return;
    // Compared by identity: the hook hands back the same Error object until a
    // new failure replaces it, so this fires once per actual failure rather
    // than on every re-render while the error is still set.
    if (reported.current === error) return;
    reported.current = error;

    const offline = (error as Error & { code?: string }).code === 'NETWORK_ERROR';
    const message = offline
      ? hasData
        ? `Can't reach the server. Showing the ${label} last loaded.`
        : `Can't reach the server, so ${label} could not be loaded.`
      : hasData
        ? `Couldn't refresh ${label}. Showing the last loaded copy.`
        : `Couldn't load ${label}.`;

    toast.error(message, { id: 'sis-resource-error' });
  }, [error, label, hasData]);
}
