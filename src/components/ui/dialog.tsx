"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "./utils";

/**
 * The open and close animation for every dialog in the app: the backdrop fades,
 * the panel fades and scales from 0.96. The rules are OVERLAY_MOTION_CSS in
 * ./motionCss.ts, mounted once by app/layout.tsx -- that file explains why they
 * cannot live in a <style> element in here, and the short version is that
 * anything rendered beside DialogContent is unmounted by Radix the moment the
 * dialog starts closing, stylesheet included.
 *
 * WHY THE TAILWIND ANIMATION CLASSES CAME OFF THE TWO ELEMENTS BELOW. They were
 * real -- `data-[state=open]:animate-in` and its four companions ARE in the
 * frozen src/index.css -- and that was the problem: `animation` is a single
 * property, so those rules and these ones cannot both apply. Both selectors
 * score the same (one class plus one attribute), which leaves the winner decided
 * by which of the two stylesheets the browser happened to see last. Removing the
 * classes settles it instead of betting on it, and the timings asked for here
 * are not what those classes give anyway: they run a shared `ease` curve in both
 * directions, where the panel wants ease-out on the way in and ease-in on the
 * way out. `duration-200` went with them -- its only job was feeding those
 * animations their length.
 *
 * The `slide-in-from-*` classes went from the popovers and menus for the same
 * reason: all they did was set custom properties that the frozen build's `enter`
 * keyframes read, and those keyframes are no longer the ones running.
 *
 * IT DOES NOT TOUCH THE MOBILE HEIGHT CAP. That cap is three inline
 * declarations on DialogContent -- max-height, display: flex, flex-direction --
 * and inline styles outrank every stylesheet rule, so the animation cannot
 * reach them. It only ever sets `opacity`, `transform` and `animation`, none of
 * which is a flex or sizing property: a dialog whose middle child is the
 * nominated scroller still caps at the viewport and still scrolls that child,
 * mid-animation included. The one interaction worth naming is that `transform`
 * on the panel makes it a containing block for fixed-position descendants --
 * and there are none, because every popover and list inside a dialog is
 * portalled to the body precisely so it can escape this element's clipping.
 */

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn("fixed inset-0 z-50 bg-black/50", className)}
      {...props}
    />
  );
}

/**
 * EVERY dialog in this app is capped to the screen, right here on the element.
 *
 * WHY IT LIVES ON THE PRIMITIVE. This content is `position: fixed; top: 50%;
 * translate-y: -50%` with, by default, no max-height at all. That centring is
 * what turns "too tall" into "unusable": a dialog taller than the viewport is
 * pushed equally off the top AND the bottom, so the title goes above the screen
 * and the buttons below it, and Radix's modal has locked body scroll so neither
 * can be reached. Capping it anywhere other than on this element leaves some
 * caller able to miss the cap.
 *
 * WHY INLINE AND NOT A CLASS OR A STYLESHEET RULE. src/index.css is a frozen
 * pre-compiled Tailwind build, so a utility that is not already in it renders as
 * nothing, silently -- `max-w-md` was doing exactly that. And an inline style is
 * the one place that cannot fail to reach the element or lose a specificity
 * fight: it is what DevTools shows under element.style, which is where anyone
 * checking this will look.
 *
 * vh, not dvh. `dvh` would track the viewport more precisely while a phone's
 * address bar is showing, but an inline declaration has nowhere to fall back to
 * -- on a browser that does not know the unit the whole declaration is invalid
 * and max-height reverts to `none`, which is the bug itself. `vh` is understood
 * everywhere, so every browser gets a real cap.
 *
 * flex column, so a caller can hand the scrolling to ONE child: head and foot
 * `flex: 0 0 auto`, the middle `flex: 1 1 0; min-height: 0; overflow-y: auto`.
 * (`grid` is gone from the class list below because this replaces it; `gap-4`
 * still applies, and still spaces the children.)
 *
 * A caller's own `style` is spread last and therefore wins -- that is how the
 * tall dialogs set padding: 0 and their own maxWidth.
 */
function DialogContent({
  className,
  children,
  style,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "bg-background fixed top-[50%] left-[50%] z-50 w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg sm:max-w-lg",
          className,
        )}
        style={{
          maxHeight: "calc(100vh - 2rem)",
          display: "flex",
          flexDirection: "column",
          ...style,
        }}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4">
          <XIcon />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
