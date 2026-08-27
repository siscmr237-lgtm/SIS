"use client";

/**
 * The screenshot carousel, with a School admin / Teacher toggle.
 *
 * WHAT THIS COMPONENT DOES NOT DECIDE. It never looks for a file. The server
 * component has already checked the disk and handed it whatever exists, so an
 * empty group here means the image is genuinely not in public/images/lewa --
 * not that this component failed to find it. If nothing exists at all the page
 * does not render this component, so there is no "no screenshots yet" state to
 * design: the section is absent, heading and all.
 *
 * Like MobileMenu, it carries no CSS of its own -- every class is defined in
 * LANDING_CSS in app/page.tsx.
 */

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";

export type Shot = { src: string; width: number; height: number };
export type ShotGroup = { key: string; label: string; shots: Shot[] };

type Props = { groups: ShotGroup[] };

/** How far a finger has to travel before it counts as a swipe and not a tap. */
const SWIPE_THRESHOLD_PX = 40;

export function Screenshots({ groups }: Props) {
  // The server only sends groups that have images, and orders them so that
  // School admin comes first -- so the first entry is the default without this
  // component having to know which one that is.
  const [activeKey, setActiveKey] = useState(groups[0]?.key ?? "");
  const [index, setIndex] = useState(0);

  const active = groups.find((group) => group.key === activeKey) ?? groups[0];
  const count = active?.shots.length ?? 0;

  /**
   * Back to the first shot whenever the group changes. Without this, switching
   * from a six-shot group to a three-shot one while on shot five would index
   * past the end and render nothing.
   */
  const select = useCallback((key: string) => {
    setActiveKey(key);
    setIndex(0);
  }, []);

  // Wrapping rather than stopping at the ends: with three or six items, a
  // carousel that dead-ends just feels broken.
  const step = useCallback(
    (delta: number) => {
      setIndex((current) => (count === 0 ? 0 : (current + delta + count) % count));
    },
    [count],
  );

  // Left and right arrows, once the carousel itself has focus. Scoped to the
  // element rather than the document so the keys still belong to the page when
  // a visitor is somewhere else on it.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    }
  };

  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (event: ReactTouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event: ReactTouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) return;
    const end = event.changedTouches[0]?.clientX;
    if (typeof end !== "number") return;
    const travelled = end - start;
    if (Math.abs(travelled) < SWIPE_THRESHOLD_PX) return;
    // Dragging left moves forward, the way a stack of cards would.
    step(travelled < 0 ? 1 : -1);
  };

  // A group could in principle be emptied by a redeploy while a page sits open
  // in a tab. Cheap guard; nothing below assumes a shot exists.
  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [index, count]);

  if (!active || count === 0) return null;
  const shot = active.shots[index];

  return (
    <div className="lewa-lp-shotswrap">
      {/* One option is not a choice, so the toggle only appears when both
          groups actually have something to show. */}
      {groups.length > 1 ? (
        <div className="lewa-lp-toggle" role="tablist" aria-label="Screenshot set">
          {groups.map((group) => {
            const selected = group.key === active.key;
            return (
              <button
                key={group.key}
                type="button"
                role="tab"
                aria-selected={selected}
                className={
                  selected
                    ? "lewa-lp-toggleopt lewa-lp-toggleopt-on"
                    : "lewa-lp-toggleopt"
                }
                onClick={() => select(group.key)}
              >
                {group.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        className="lewa-lp-shotstage"
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={`${active.label} screenshots`}
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Image
          className="lewa-lp-shot"
          src={shot.src}
          alt={`${active.label} screenshot ${index + 1} of ${count}`}
          width={shot.width}
          height={shot.height}
          // Never below the fold on a phone, and it is the point of the
          // section, so it is worth fetching early rather than lazily.
          priority={index === 0}
        />
      </div>

      {/* Controls are hidden when there is only one image in the group -- a
          prev/next pair that returns to the same picture reads as broken. */}
      {count > 1 ? (
        <div className="lewa-lp-shotnav">
          <button
            type="button"
            className="lewa-lp-shotbtn"
            aria-label="Previous screenshot"
            onClick={() => step(-1)}
          >
            <Chevron direction="left" />
          </button>
          <p className="lewa-lp-shotcount" aria-live="polite">
            {index + 1} / {count}
          </p>
          <button
            type="button"
            className="lewa-lp-shotbtn"
            aria-label="Next screenshot"
            onClick={() => step(1)}
          >
            <Chevron direction="right" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {direction === "left" ? (
        <polyline points="15 5 8 12 15 19" />
      ) : (
        <polyline points="9 5 16 12 9 19" />
      )}
    </svg>
  );
}
