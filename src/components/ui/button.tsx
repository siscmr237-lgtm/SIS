"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";
import { BUTTON_RELEASE_MS } from "./buttonPressCss";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

/**
 * WHICH BUTTONS GET THE PRESS, and why four kinds of button do not.
 *
 * The rules themselves live in ./buttonPressCss.ts, mounted once by
 * app/layout.tsx, keyed on the `sis-press` class this adds. They are keyed on
 * the class and not on `data-slot` because a Radix asChild trigger overwrites
 * data-slot on the way through -- that file says more. All this decides is
 * whether to opt an instance in.
 *
 * `size="icon"` IS OUT. Those are 36px squares holding a 16px glyph -- the
 * Finance page's pagination arrows are the only ones in the app. Scaling a
 * square by 0.96 moves each edge less than a pixel, so the press does not read
 * as a press; what it does instead is nudge a centred glyph onto a half-pixel
 * and make it blur for the duration.
 *
 * `variant="link"` IS OUT. That variant renders as underlined text, not as a
 * surface. A run of text that lifts off the page and casts a shadow does not
 * look pressed, it looks broken.
 *
 * A DISABLED BUTTON IS OUT, twice over. The class is left off here so the DOM
 * says so, and every rule in buttonPressCss.ts is also written `:not(:disabled)`
 * -- because `disabled` is usually a piece of state (`submitting`), and the rule
 * is what keeps a button that goes disabled mid-transition from finishing its
 * lift.
 *
 * ICON-ONLY BUTTONS AT OTHER SIZES OPT OUT BY HAND, with `data-no-press`. There
 * is no way to know from here whether the children are a glyph or a word --
 * `children` may be any node, and inspecting it would be a guess that silently
 * changes behaviour when a caller adds a label. The five call sites in the app
 * today (the three row-delete bins in LevelFeesDialog, StudentFeeOverrideDialog
 * and Timetable, and the two ⋯ finance menus in StudentProfile and StaffProfile)
 * carry the attribute and say why.
 */
function pressEnabled(
  variant: VariantProps<typeof buttonVariants>["variant"],
  size: VariantProps<typeof buttonVariants>["size"],
  noPress: unknown,
  disabled: boolean | undefined,
): boolean {
  if (disabled) return false;
  if (noPress !== undefined && noPress !== false) return false;
  return size !== "icon" && variant !== "link";
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  onPointerUp,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  const press = pressEnabled(
    variant,
    size,
    (props as Record<string, unknown>)["data-no-press"],
    props.disabled,
  );

  /**
   * The release spring, as explained in buttonPressCss.ts: CSS cannot tell
   * "released" from "hovered" because both are the same destination state, so
   * the 150ms ease-out curve is selected by an attribute held for its duration.
   *
   * WRITTEN TO THE DOM RATHER THAN HELD IN STATE. useState here would re-render
   * on every mousedown and mouseup of every button in the app, twice per click,
   * to change one attribute on one element that React already has a handle on.
   * Two setAttribute calls cost nothing and skip React entirely.
   *
   * The timer is per component instance and is cleared on unmount, so a button
   * inside a dialog that is closed mid-click cannot write to a detached node.
   */
  const releaseTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
    },
    [],
  );

  const handlePointerUp = press
    ? (event: React.PointerEvent<HTMLButtonElement>) => {
        const el = event.currentTarget;
        el.setAttribute("data-press", "up");
        if (releaseTimer.current) clearTimeout(releaseTimer.current);
        releaseTimer.current = setTimeout(() => {
          releaseTimer.current = null;
          el.removeAttribute("data-press");
        }, BUTTON_RELEASE_MS);
        onPointerUp?.(event);
      }
    : onPointerUp;

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }), press && "sis-press")}
      onPointerUp={handlePointerUp}
      {...props}
    />
  );
}

export { Button, buttonVariants };
