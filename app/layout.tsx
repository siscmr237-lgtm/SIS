export const metadata = {
  title: 'School Information System',
  description: 'SIS',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* The gutter is always reserved, so the scrollbar appearing or disappearing
       never changes the layout width -- which is what makes the compensation
       above safe to drop. Inline, because it is one declaration on the one
       element this file owns, and src/index.css is a frozen build. */
    <html lang="en" style={{ scrollbarGutter: 'stable' }}>
      <body className="h-full">
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
      </body>
    </html>
  );
}
