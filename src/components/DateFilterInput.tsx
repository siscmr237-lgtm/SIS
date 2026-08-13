'use client';

import { Calendar } from 'lucide-react';
import { Input } from './ui/input';

/**
 * A date filter that wears a calendar instead of the browser's own arrow, and
 * that can actually shrink.
 *
 * TWO PROBLEMS, ONE COMPONENT.
 *
 * 1. The browser draws its own picker button inside a date input, and in Chrome
 *    that is a chevron — so a date field sitting in a row of real dropdowns says
 *    "pick from a list" when it means "pick a date". The native button is made
 *    transparent rather than removed, so it is still there and still clickable
 *    in the same place: tapping the calendar opens the real OS picker, with no
 *    showPicker() to feature-detect and no way to end up with a date field that
 *    cannot be opened at all.
 *
 * 2. A date input has an INTRINSIC minimum width — the widget has to fit
 *    dd/mm/yyyy — and grid and flex items default to `min-width: auto`, which
 *    means "never shrink below your content's minimum". Two of these in a
 *    two-column grid therefore refuse to fit a narrow phone, and the excess
 *    escapes every ancestor that is not itself a scroll container. minWidth 0
 *    below is what lets the column win that argument.
 *
 * Position is copied from SelectTrigger so a row of mixed filters lines up:
 * that trigger is `h-9 px-3` with its chevron as a 16px `size-4 opacity-50` at
 * the end of a `justify-between` row — 12px in from the right edge, centred on
 * 36px. Input is also `h-9 px-3`, so the same numbers put the calendar exactly
 * where the arrows beside it sit.
 *
 * The transparency needs a ::-webkit-calendar-picker-indicator rule, which an
 * inline style cannot express and src/index.css is frozen against — hence the
 * one scoped <style>. It is not Tailwind and touches nothing global.
 */
export function DateFilterInput({
  value,
  onChange,
  disabled,
  /** Extra styling for the field itself — the finance filters pass a pill radius. */
  style,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <style>{`
        .sis-date-filter::-webkit-calendar-picker-indicator {
          opacity: 0;
          cursor: pointer;
        }
        .sis-date-filter::-webkit-inner-spin-button { display: none; }
      `}</style>
      <Input
        className={['sis-date-filter', className].filter(Boolean).join(' ')}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          // Room for the icon, so a long value never runs underneath it.
          paddingRight: 34,
          // Overrides the intrinsic minimum described above. Without it the
          // field sets the floor for its whole column.
          minWidth: 0,
          width: '100%',
          ...style,
        }}
      />
      <Calendar
        size={16}
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: disabled ? 0.25 : 0.5,
          // Decorative: the invisible native button underneath takes the click.
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
