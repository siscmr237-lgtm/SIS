'use client';

import { useEffect, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';

/**
 * A date as three dropdowns — Month | Day | Year — inside one bordered box.
 *
 * WHY NOT A DATE INPUT. Every date in this app used to be a native
 * <input type="date"> — nineteen of them, some bare and some under a
 * transparent overlay that tried to dress one up as a styled box. Its text, its
 * placeholder and its picker button are all UA shadow DOM, so it cannot be made
 * to match the selects beside it, it renders in the OS locale rather than the
 * one format this app shows, and on Android it draws a control that survives
 * every attempt to hide it. The overlay approach is what this replaced, and it
 * only ever hid the problem: the real input was still there, invisible, and a
 * screen reader and a keyboard both still met it.
 *
 * Three ordinary dropdowns ask for the same three facts plainly, and they look
 * the same on every device because nothing in them belongs to the browser.
 *
 * THIS IS THE ONLY DATE CONTROL IN THE APP. Every dialog field and every
 * From/To filter uses it. If a date needs picking somewhere new, use this — do
 * not reach for <input type="date"> again.
 *
 * ONE BORDER, THREE CELLS, exactly as PhoneInput is one border around a picker
 * and a field. That is what keeps this the same height, the same radius and the
 * same total width as the control it replaces, so no caller's layout moves. The
 * cells are flex: 1 1 0, so they are equal thirds of whatever width the caller
 * gives — down to a filter column a third this wide.
 *
 * THE VALUE IS 'YYYY-MM-DD', OR NULL. Null is what an incomplete date means —
 * any one of the three still unchosen — and it is deliberately not '' or a
 * half-built string: there is no such thing as a partial date, and a caller
 * that sent one to the API would be sending something the API cannot read.
 * Every caller in this app stores '' for "no date", so they map with `?? ''` at
 * the call site; the component itself never invents that empty string.
 *
 * FEBRUARY IS ALWAYS 29 DAYS. Not a leap-year calculation, on purpose: the day
 * list is a convenience for picking, not the validator. The backend validates
 * on save, and 29 costs one impossible option in three years out of four, while
 * a leap-year rule costs a whole class of off-by-one bugs in a dropdown.
 *
 * SWITCHING MONTH CLEARS AN IMPOSSIBLE DAY rather than silently moving it. If
 * 31 is chosen and the month becomes April, the day empties and the value goes
 * null. Clamping to 30 instead would quietly turn what the user picked into
 * something they did not pick, with no way for them to notice; an empty box
 * they have to fill is the honest version.
 *
 * STYLING is inline plus one component-scoped <style>, because src/index.css is
 * a pre-compiled artifact — a utility class not already in it renders as
 * nothing — and hover, focus-within and the selected row cannot be expressed
 * inline at all. Same arrangement PhoneInput uses, and the same border colour
 * and geometry, so the two controls read as one family.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Earliest year offered. Old enough for any parent's date of birth. */
const FIRST_YEAR = 1980;

/**
 * Days in a month, 1-indexed.
 *
 * Index 0 is the "no month chosen yet" case and is 31 — the widest list, so
 * picking a day before a month never hides a legal option. Choosing the month
 * afterwards re-checks it.
 */
const DAYS_IN_MONTH = [31, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Newest first, and two years ahead so a future enrolment can be recorded. */
function yearOptions(): number[] {
  const last = new Date().getFullYear() + 2;
  const out: number[] = [];
  for (let y = last; y >= FIRST_YEAR; y--) out.push(y);
  return out;
}

interface DateParts {
  month: number | null;
  day: number | null;
  year: number | null;
}

const EMPTY_PARTS: DateParts = { month: null, day: null, year: null };

/**
 * Read an incoming value into the three parts.
 *
 * Tolerant of a trailing time, because that is what the API returns for a date
 * column — '2019-04-08T00:00:00.000Z'. Two callers already strip it themselves
 * before storing; doing it here as well means the one that forgets shows the
 * date rather than three empty boxes.
 */
function parseDate(value: string | null | undefined): DateParts {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!m) return EMPTY_PARTS;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return EMPTY_PARTS;

  return { month, day, year };
}

/** The three parts in the API's format, or null while any of them is missing. */
function formatDate(parts: DateParts): string | null {
  const { month, day, year } = parts;
  if (month === null || day === null || year === null) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return year + '-' + pad(month) + '-' + pad(day);
}

/** '', undefined and a malformed string all mean the same thing: no date. */
function normalise(value: string | null | undefined): string | null {
  return formatDate(parseDate(value));
}

const DATE_CSS = [
  '.sis-tpd-box{display:flex;align-items:stretch;min-width:0;width:100%;overflow:hidden;',
  '  border-style:solid;border-color:#D1D5DB;background:#FFFFFF;',
  '  transition:border-color .15s,box-shadow .15s}',
  '.sis-tpd-box:focus-within{border-color:#0f2345;box-shadow:0 0 0 3px rgba(15,35,69,.15)}',
  '.sis-tpd-box[data-disabled="true"]{background:#F9FAFB;opacity:.6}',
  '.sis-tpd-cell{display:flex;align-items:center;justify-content:space-between;gap:4px;',
  '  flex:1 1 0;min-width:0;border:none;border-right:1px solid #E5E7EB;background:transparent;',
  '  font-size:.8125rem;color:#111827;padding:0 8px;cursor:pointer;font-family:inherit;',
  '  text-align:left}',
  '.sis-tpd-cell:last-child{border-right:none}',
  '.sis-tpd-cell:hover:not(:disabled){background:#F3F4F6}',
  '.sis-tpd-cell:disabled{cursor:not-allowed}',
  '.sis-tpd-cell:focus-visible{outline:2px solid #0f2345;outline-offset:-2px}',
  '.sis-tpd-cell[data-empty="true"]{color:#9CA3AF}',
  '.sis-tpd-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
  '.sis-tpd-list{margin:0;padding:4px;list-style:none;background:#FFFFFF;',
  '  border:1px solid #E5E7EB;border-radius:10px;box-shadow:0 10px 28px rgba(15,35,69,.18);',
  '  max-height:260px;overflow-y:auto;overscroll-behavior:contain}',
  '.sis-tpd-opt{display:block;width:100%;padding:7px 10px;border:none;border-radius:6px;',
  '  border-left:3px solid transparent;background:transparent;font-size:.875rem;color:#111827;',
  '  text-align:left;cursor:pointer;font-family:inherit}',
  '.sis-tpd-opt:hover{background:#F3F4F6}',
  '.sis-tpd-opt[aria-selected="true"]{background:#0f2345;color:#FFFFFF;border-left-color:#e6c482}',
  '.sis-tpd-opt[aria-selected="true"]:hover{background:#0f2345}',
].join('\n');

/** One cell of the three: a trigger, and its portalled list of options. */
function DatePart({
  label,
  shown,
  options,
  selected,
  onSelect,
  disabled,
  ariaLabel,
  minListWidth,
}: {
  label: string;
  shown: string | null;
  options: { value: number; label: string }[];
  selected: number | null;
  onSelect: (v: number) => void;
  disabled?: boolean;
  ariaLabel: string;
  minListWidth: number;
}) {
  const [open, setOpen] = useState(false);

  const choose = (v: number) => {
    onSelect(v);
    setOpen(false);
  };

  /**
   * Up and down step through the options without opening the list, which is how
   * the country picker in PhoneInput behaves. From nothing, either key starts at
   * the first option rather than doing nothing at all.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (!options.length) return;

    const at = options.findIndex((o) => o.value === selected);
    if (at === -1) {
      choose(options[0].value);
      return;
    }
    const step = e.key === 'ArrowDown' ? 1 : -1;
    choose(options[(at + step + options.length) % options.length].value);
  };

  return (
    /* modal, and it has to be, or the Day and Year lists cannot be scrolled.
       Radix's Dialog locks scrolling with react-remove-scroll, which cancels
       every wheel and touch-move whose target is not inside the dialog's own
       content. These lists are portalled to document.body, so they ARE outside
       it: the list rendered, showed a scrollbar, and refused to move.
       modal makes Radix wrap this content in its own RemoveScroll, which pushes
       a second lock on top of the dialog's. react-remove-scroll only lets the
       topmost lock cancel anything, and the topmost one is now this list's, so
       it permits scrolling inside itself. That is exactly how Radix's own Select
       survives the same dialogs — it is modal by default for this reason.
       Costs one thing worth knowing: while a list is open, pointer events
       outside it are disabled, so moving straight from an open Month list to the
       Day cell takes a click to dismiss and a click to open. Radix Select
       behaves identically everywhere else in this app. */
    <Popover.Root open={open} onOpenChange={setOpen} modal>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="sis-tpd-cell"
          data-empty={shown === null ? 'true' : 'false'}
          disabled={disabled}
          // Radix defaults this to "dialog"; what opens is a listbox, and a
          // trigger announcing the wrong kind of popup is worse than one
          // announcing none.
          aria-haspopup="listbox"
          aria-label={shown === null ? ariaLabel + ', none chosen' : ariaLabel + ', ' + shown}
          onKeyDown={onKeyDown}
        >
          <span className="sis-tpd-text">{shown ?? label}</span>
          {/* Drawn with borders rather than an icon import, so this component
              adds no dependency to the pages that use it. */}
          <span
            aria-hidden="true"
            style={{
              flex: '0 0 auto',
              width: 0,
              height: 0,
              borderLeft: '3.5px solid transparent',
              borderRight: '3.5px solid transparent',
              borderTop: '4.5px solid #6B7280',
            }}
          />
        </button>
      </Popover.Trigger>

      {/* PORTALLED, which is the whole reason these lists are usable inside a
          dialog. Positioned in place they were clipped by the nearest ancestor
          with overflow:hidden — the dialog body, the app shell, the scroll
          container in <main>. A portal puts the list on document.body, outside
          every one of those. Same as PhoneInput and StudentFeeStatusPopover. */}
      <Popover.Portal>
        <Popover.Content
          className="sis-tpd-list"
          role="listbox"
          aria-label={ariaLabel}
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={16}
          style={{
            minWidth: minListWidth,
            // Radix measures the room it has and publishes it here. Without
            // this the list keeps its 260px and runs off the bottom of a short
            // viewport, taking its last options with it.
            maxHeight: 'min(260px, var(--radix-popover-content-available-height, 260px))',
            // Above everything this app stacks: mobile header 30, sidebar
            // overlay 40, sidebar 50, support button 60. Dialogs portal to the
            // body too, so this has to clear those as well.
            zIndex: 70,
          }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className="sis-tpd-opt"
              role="option"
              aria-selected={o.value === selected}
              onClick={() => choose(o.value)}
            >
              {o.label}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function ThreePartDateInput({
  value,
  onChange,
  disabled,
  height = 36,
  radius = 6,
  borderWidth = 1,
  'aria-label': ariaLabel,
}: {
  /** 'YYYY-MM-DD', or ''/null/undefined for no date. A trailing time is ignored. */
  value: string | null | undefined;
  /** 'YYYY-MM-DD' once all three are chosen, null while any of them is not. */
  onChange: (value: string | null) => void;
  disabled?: boolean;
  /** Match the fields beside it — 36 is this app's h-9. */
  height?: number;
  /** 6 for shadcn's rounded-md; the finance filters pass 9999 for their pills. */
  radius?: number;
  borderWidth?: number;
  /** Names the control; each cell appends its own part to it. */
  'aria-label'?: string;
}) {
  const [parts, setParts] = useState<DateParts>(() => parseDate(value));

  /**
   * The last value this component sent out, so it can tell its own echo from a
   * genuine change made elsewhere.
   *
   * Without it the control erases itself as it is used: choosing a month emits
   * null, the parent stores '', that '' arrives back as a new `value`, and a
   * naive sync reads it as "no date" and clears the month that was just chosen.
   * Comparing against what was emitted means an echo is ignored, while a real
   * outside change — a record loading, a form resetting after a save — still
   * replaces all three.
   */
  const lastEmitted = useRef<string | null>(normalise(value));

  useEffect(() => {
    const incoming = normalise(value);
    if (incoming === lastEmitted.current) return;
    lastEmitted.current = incoming;
    setParts(incoming ? parseDate(incoming) : EMPTY_PARTS);
  }, [value]);

  const emit = (next: DateParts) => {
    setParts(next);
    const formatted = formatDate(next);
    lastEmitted.current = formatted;
    onChange(formatted);
  };

  const setMonth = (month: number) => {
    // A day that does not exist in the new month is cleared, never moved.
    const max = DAYS_IN_MONTH[month];
    const day = parts.day !== null && parts.day > max ? null : parts.day;
    emit({ ...parts, month, day });
  };

  const dayCount = DAYS_IN_MONTH[parts.month ?? 0];
  const dayOptions = Array.from({ length: dayCount }, (_, i) => ({
    value: i + 1,
    label: String(i + 1),
  }));

  return (
    <div
      className="sis-tpd-box"
      data-disabled={disabled ? 'true' : 'false'}
      style={{ height, borderRadius: radius, borderWidth }}
    >
      <style>{DATE_CSS}</style>

      <DatePart
        label="Month"
        shown={parts.month === null ? null : MONTHS[parts.month - 1]}
        options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))}
        selected={parts.month}
        onSelect={setMonth}
        disabled={disabled}
        ariaLabel={ariaLabel ? ariaLabel + ' month' : 'Month'}
        minListWidth={104}
      />
      <DatePart
        label="Day"
        shown={parts.day === null ? null : String(parts.day)}
        options={dayOptions}
        selected={parts.day}
        onSelect={(day) => emit({ ...parts, day })}
        disabled={disabled}
        ariaLabel={ariaLabel ? ariaLabel + ' day' : 'Day'}
        minListWidth={84}
      />
      <DatePart
        label="Year"
        shown={parts.year === null ? null : String(parts.year)}
        options={yearOptions().map((y) => ({ value: y, label: String(y) }))}
        selected={parts.year}
        onSelect={(year) => emit({ ...parts, year })}
        disabled={disabled}
        ariaLabel={ariaLabel ? ariaLabel + ' year' : 'Year'}
        minListWidth={100}
      />
    </div>
  );
}
