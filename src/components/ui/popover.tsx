"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { cn } from "./utils";

/**
 * The fade-and-scale is OVERLAY_MOTION_CSS in ./motionCss.ts, mounted once by
 * app/layout.tsx -- it cannot be a <style> in here, because Popover.Portal is a
 * single <Presence> around React.Children.only and a second child there throws.
 *
 * The animation classes that were on the content below are gone for the reason
 * given in ./dialog.tsx: `animation` is one property, those rules and these ones
 * tie on specificity, and a tie is settled by which stylesheet the browser saw
 * last. Scaling the content is safe because Radix's popper puts its positioning
 * transform on the wrapper element around it, not on this one -- so the surface
 * grows about its own corner and stays anchored to its trigger. The `origin-`
 * class that survives is what makes that corner the one nearest the trigger
 * rather than the middle.
 */

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
