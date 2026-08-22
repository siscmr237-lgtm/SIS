'use client';

import { Calendar } from 'lucide-react';

/**
 * A date filter that looks like the selects beside it.
 *
 * WHY THIS IS AN OVERLAY RATHER THAN A STYLED INPUT.
 *
 * A native <input type="date"> cannot be made to match a Radix SelectTrigger.
 * Its internal date text, its placeholder and its picker button are all UA
 * shadow DOM: the only handle a page gets is
 * ::-webkit-calendar-picker-indicator, that pseudo-element is WebKit/Blink only,
 * and hiding it does not reliably remove the control Chrome on Android draws —
 * which is what left these two fields wearing both a calendar AND a chevron
 * while the field itself read as blank.
 *
 * So the native control is not styled at all. It is made fully transparent and
 * laid over a box we do control:
 *
 *   1. a visible box, styled with the SAME utilities SelectTrigger uses, showing
 *      the date as DD/MM/YYYY;
 *   2. the lucide Calendar on the right, at the 12px inset the selects' chevrons
 *      sit at;
 *   3. the real <input type="date"> stretched over the whole thing at opacity 0.
 *
 * The input is still a real, focusable, keyboard-editable date field — it is
 * merely invisible. Tapping anywhere on the control opens the OS picker, because
 * opacity does not affect hit testing, and desktop typing still works. That also
 * settles the chevron for good: the browser's button is inside an element with
 * opacity 0, so there is nothing to hide with a vendor pseudo-element and
 * nothing that can come back on a browser that ignores it.
 *
 * PLACEHOLDER, NOT A VALUE. When `value` is empty the box shows TODAY in grey,
 * exactly as placeholder text. `value` itself stays '' and the caller's state is
 * untouched, so the filter is genuinely unset — nothing is sent to the API and
 * the transaction tables are not narrowed to a single day. The grey is the
 * signal that this is a hint rather than a selection.
 *
 * A form field is not a filter, though: an empty date there is something still
 * to be entered, not "no narrowing applied". Those callers pass `placeholder`
 * and get that wording in grey instead of today's date, so the field never
 * reads as already filled in.
 */

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. Empty for anything that isn't a full date. */
function toDisplayDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Today, in the same DD/MM/YYYY the field displays. */
function todayDisplayDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * `:focus-within` and the vendor pseudo-elements are the two things an inline
 * style cannot express, and src/index.css is frozen — hence one scoped block.
 *
 * The ::-webkit rules are belt-and-braces only. The opacity:0 on the input is
 * what actually removes the native button everywhere; these keep it gone if the
 * field is ever made visible again.
 */
const SCOPED_CSS = `
  .sis-date-native::-webkit-calendar-picker-indicator { opacity: 0; cursor: pointer; }
  .sis-date-native::-webkit-inner-spin-button,
  .sis-date-native::-webkit-clear-button { display: none; -webkit-appearance: none; }
  .sis-date-field:focus-within .sis-date-box {
    border-color: #0f2345;
    box-shadow: 0 0 0 3px rgba(15, 35, 69, 0.15);
  }
`;

export function DateFilterInput({
  value,
  onChange,
  disabled,
  /** Extra styling for the visible box — the finance filters pass a pill radius. */
  style,
  className,
  /** Grey hint shown while nothing is chosen. Defaults to today's date. */
  placeholder,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
}) {
  const shown = toDisplayDate(value);
  const isPlaceholder = shown === '';

  return (
    <div className="sis-date-field" style={{ position: 'relative', minWidth: 0 }}>
      <style>{SCOPED_CSS}</style>

      {/* The visible control. These are the utilities SelectTrigger itself uses
          — h-9, rounded-md, border, border-input, px-3, text-sm — so the text
          inside starts on exactly the same x as the text in the three selects
          and the box is exactly as tall. */}
      <div
        aria-hidden="true"
        className={[
          'sis-date-box',
          'border-input bg-input-background flex h-9 w-full items-center rounded-md border px-3 text-sm',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          // Clears the calendar so a full date never runs underneath it.
          paddingRight: 34,
          minWidth: 0,
          transition: 'color 150ms, box-shadow 150ms, border-color 150ms',
          ...(disabled ? { opacity: 0.5 } : {}),
          ...style,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            // Grey exactly like placeholder text while nothing is chosen.
            color: isPlaceholder ? '#9CA3AF' : '#111827',
          }}
        >
          {isPlaceholder ? (placeholder ?? todayDisplayDate()) : shown}
        </span>
      </div>

      {/* Painted after the box so it sits above it, and before the input so the
          input still takes every click. */}
      <Calendar
        size={16}
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: disabled ? 0.25 : 0.5,
          pointerEvents: 'none',
        }}
      />

      {/* The real field. Invisible, but present, focusable and editable — last
          in the DOM so it is on top and receives the tap. */}
      <input
        type="date"
        className="sis-date-native"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          padding: 0,
          border: 0,
          background: 'transparent',
          opacity: 0,
          WebkitAppearance: 'none',
          appearance: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          // A date input has an intrinsic minimum width — the widget must fit
          // dd/mm/yyyy — and as a grid item that minimum becomes the column's
          // floor. Zero here lets the column shrink on a narrow phone.
          minWidth: 0,
        }}
      />
    </div>
  );
}
