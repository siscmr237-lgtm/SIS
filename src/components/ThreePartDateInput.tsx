'use client';

import { useEffect, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { popMotionCss } from './ui/motionCss';
import { FIRST_DATE_YEAR, lastDateYear } from '../utils/dateOnly';

/**
 * A date as three cells — Day | Month | Year — inside one bordered box. Each
 * cell can be typed into or picked from its own dropdown.
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
 * Three ordinary cells ask for the same three facts plainly, and they look the
 * same on every device because nothing in them belongs to the browser.
 *
 * THIS IS THE ONLY DATE CONTROL IN THE APP. Every dialog field and every
 * From/To filter uses it. If a date needs picking somewhere new, use this — do
 * not reach for <input type="date"> again.
 *
 * TYPE IT OR PICK IT. Each cell is a real text field with its dropdown still on
 * the right, because three dropdowns are a lot of scrolling for a date somebody
 * already knows — a date of birth is faster typed than hunted for. Nothing
 * about the dropdowns changed: same lists, same arrow-key stepping, same
 * emitted value. The field is an addition, not a replacement.
 *
 * WHAT EACH FIELD ACCEPTS, and it accepts nothing else — a keystroke that could
 * not begin a legal answer is dropped rather than typed and then complained
 * about, so the box can never hold something the control would have to reject
 * later:
 *
 *   Day    digits only, and never past the days in the chosen month (31 while
 *          no month is chosen — see DAYS_IN_MONTH). '4' then '5' leaves '4'.
 *   Month  letters only, and only letters that keep spelling a real month.
 *          'Jan' and 'January' both land on Jan; 'Jax' cannot be typed at all.
 *          There is no month this field will take that the list will not show.
 *   Year   digits only, and only digits that can still grow into a year in
 *          range — FIRST_DATE_YEAR to this year, which utils/dateOnly owns
 *          and the finance From/To filters bound themselves with too. '3'
 *          is dropped because no year starts with it; '199' is kept
 *          because 1999 does.
 *
 * A HALF-TYPED CELL IS AN UNCHOSEN ONE. '19' in the year box is not a year, so
 * the value is null exactly as it is before anything is picked (see below).
 * Leaving the cell tidies what is in it to what was actually understood: a
 * month resolves to its abbreviation ('j' → Jan, first match), a day loses a
 * leading zero, and anything still incomplete empties. Nothing is guessed into
 * the stored value — only into the text the user can see and correct.
 *
 * DAY FIRST, THEN MONTH, THEN YEAR — the order this app already writes dates
 * in everywhere it prints one, and the order the people using it read. The
 * other date control, DateFilterInput, displays DD/MM/YYYY; this used to sit
 * beside it asking for the month first, so the same date was entered in one
 * order and shown back in another. The stored value is untouched by this: the
 * API format is ISO regardless of which cell is drawn first.
 *
 * Picking a day before any month is known is safe by construction, not by
 * luck — see DAYS_IN_MONTH below, whose index 0 is the widest list. The day
 * then re-checks itself when the month arrives, which is the clearing rule
 * described further down.
 *
 * ONE BORDER, THREE CELLS, exactly as PhoneInput is one border around a picker
 * and a field. That is what keeps this the same height, the same radius and the
 * same total width as the control it replaces, so no caller's layout moves. The
 * cells are flex: 1 1 0, so they are equal thirds of whatever width the caller
 * gives — down to a filter column a third this wide.
 *
 * ONLY THE THREE FIELDS TAKE TAB. The dropdown buttons are tabIndex -1, so a
 * keyboard runs Day → Month → Year and types, which is the whole point of
 * having fields. The lists are still reachable without a mouse: Up and Down on
 * a field step through its options exactly as they did when the cell was one
 * big button and nothing else.
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
 * they have to fill is the honest version. Typing the month does this too — the
 * rule belongs to the month changing, not to how it was changed.
 *
 * A STORED YEAR OUTSIDE THE RANGE IS SHOWN, NOT ERASED. A record saved before
 * this range existed displays its real year; the year list simply will not have
 * it highlighted. Blanking it on sight would destroy a saved date just by
 * opening the form. Editing that cell does hold the range, so a year can only
 * ever leave this control in range.
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

/**
 * The same twelve months spelled out, and only the typing uses them: somebody
 * typing a month reaches for 'January' at least as readily as 'Jan', and both
 * are the same month, so both are accepted. What is shown and stored is always
 * the abbreviation above.
 */
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Longest of the names above, which is all the month field can ever hold. */
const MONTH_MAX_CHARS = 9;

/**
 * Days in a month, 1-indexed.
 *
 * Index 0 is the "no month chosen yet" case and is 31 — the widest list, so
 * picking a day before a month never hides a legal option. Choosing the month
 * afterwards re-checks it.
 */
const DAYS_IN_MONTH = [31, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Newest first, and stopping at this year: a date on this platform is something
 * that happened or is happening, so a year that has not arrived is neither
 * offered in the list nor typeable into the field.
 */
function yearOptions(): number[] {
  const last = lastDateYear();
  const out: number[] = [];
  for (let y = last; y >= FIRST_DATE_YEAR; y--) out.push(y);
  return out;
}

/**
 * Every month the typed letters could still be spelling, as 0-based indexes.
 *
 * Prefix rather than equality, because this runs on every keystroke: 'j' is
 * three months and settles nothing yet, 'ju' is two, 'jun' is one. Empty means
 * the letters cannot become any month at all, which is how the field knows to
 * drop the keystroke instead of showing it.
 */
function monthMatches(letters: string): number[] {
  const want = letters.toLowerCase();
  const out: number[] = [];
  for (let i = 0; i < MONTHS_FULL.length; i++) {
    if (MONTHS_FULL[i].toLowerCase().startsWith(want)) out.push(i);
  }
  return out;
}

interface DateParts {
  month: number | null;
  day: number | null;
  year: number | null;
}

/** What is actually in the three boxes, which is not always a chosen part. */
interface PartsText {
  month: string;
  day: string;
  year: string;
}

const EMPTY_PARTS: DateParts = { month: null, day: null, year: null };

/** The three boxes as they read when three parts are chosen. */
function textOf(parts: DateParts): PartsText {
  return {
    day: parts.day === null ? '' : String(parts.day),
    month: parts.month === null ? '' : MONTHS[parts.month - 1],
    year: parts.year === null ? '' : String(parts.year),
  };
}

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
  '.sis-tpd-cell{display:flex;align-items:center;gap:2px;',
  '  flex:1 1 0;min-width:0;border-right:1px solid #E5E7EB;background:transparent;',
  '  padding:0 2px 0 8px}',
  '.sis-tpd-cell:last-child{border-right:none}',
  /* Fills the cell, so a tap anywhere in the white lands a caret rather than
     making the user hunt for a thin text box beside a button. */
  '.sis-tpd-input{flex:1 1 0;min-width:0;width:100%;height:100%;padding:0;margin:0;',
  '  border:none;background:transparent;font-size:.8125rem;color:#111827;',
  '  font-family:inherit;outline:none}',
  '.sis-tpd-input::placeholder{color:#9CA3AF;opacity:1}',
  '.sis-tpd-input:disabled{cursor:not-allowed;color:#111827}',
  /* Full height, so the tap target is the whole right edge of the cell and not
     just the arrow drawn in the middle of it. */
  '.sis-tpd-caret{flex:0 0 auto;display:flex;align-items:center;justify-content:center;',
  '  width:22px;height:100%;padding:0;border:none;border-radius:4px;background:transparent;',
  '  cursor:pointer}',
  '.sis-tpd-caret:hover:not(:disabled){background:#F3F4F6}',
  '.sis-tpd-caret:disabled{cursor:not-allowed}',
  '.sis-tpd-list{margin:0;padding:4px;list-style:none;background:#FFFFFF;',
  '  border:1px solid #E5E7EB;border-radius:10px;box-shadow:0 10px 28px rgba(15,35,69,.18);',
  '  max-height:260px;overflow-y:auto;overscroll-behavior:contain}',
  '.sis-tpd-opt{display:block;width:100%;padding:7px 10px;border:none;border-radius:6px;',
  '  border-left:3px solid transparent;background:transparent;font-size:.875rem;color:#111827;',
  '  text-align:left;cursor:pointer;font-family:inherit}',
  '.sis-tpd-opt:hover{background:#F3F4F6}',
  '.sis-tpd-opt[aria-selected="true"]{background:#0f2345;color:#FFFFFF;border-left-color:#e6c482}',
  '.sis-tpd-opt[aria-selected="true"]:hover{background:#0f2345}',
  /* The list's open and close, the same fade-and-scale as the dialogs. Mounted
     from this component rather than globally because this block sits on the date
     box itself, not inside the portal Radix tears down when the list closes — so
     the exit animation still has its rule when it runs. Do not write an opening
     style tag literally in here: it is stylesheet text, and the server escapes
     it where the client does not, which hydrates as a mismatch. */
  popMotionCss('.sis-tpd-list'),
].join('\n');

/** One cell of the three: a text field, and a button opening its option list. */
function DatePart({
  label,
  text,
  onText,
  onBlur,
  inputMode,
  maxLength,
  options,
  selected,
  onSelect,
  disabled,
  ariaLabel,
  minListWidth,
}: {
  label: string;
  /** What is in the box right now — not necessarily a chosen part. */
  text: string;
  /** Every keystroke, raw. The parent decides what survives it. */
  onText: (raw: string) => void;
  onBlur: () => void;
  inputMode: 'numeric' | 'text';
  maxLength: number;
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
   * the country picker in PhoneInput behaves and how this cell behaved when it
   * was a button rather than a field. From nothing, either key starts at the
   * first option rather than doing nothing at all. A single-line text field has
   * no meaning of its own for these two keys, so nothing is taken away.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    <div className="sis-tpd-cell">
      <input
        type="text"
        className="sis-tpd-input"
        value={text}
        placeholder={label}
        disabled={disabled}
        inputMode={inputMode}
        maxLength={maxLength}
        // A date part is three of a kind on one row, and the field already
        // refuses everything illegal; a browser offering to fill one of them
        // from a saved address is noise on top of that.
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label={ariaLabel}
        onChange={(e) => onText(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />

      {/* modal, and it has to be, or the Day and Year lists cannot be scrolled.
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
          Day cell takes a click to dismiss and a click to land. Radix Select
          behaves identically everywhere else in this app. */}
      <Popover.Root open={open} onOpenChange={setOpen} modal>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="sis-tpd-caret"
            disabled={disabled}
            // Tab belongs to the three fields — see the header. The list is
            // still keyboard-reachable, with Up and Down on the field.
            tabIndex={-1}
            // Radix defaults this to "dialog"; what opens is a listbox, and a
            // trigger announcing the wrong kind of popup is worse than one
            // announcing none.
            aria-haspopup="listbox"
            aria-label={'Choose ' + ariaLabel}
          >
            {/* Drawn with borders rather than an icon import, so this component
                adds no dependency to the pages that use it. */}
            <span
              aria-hidden="true"
              style={{
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
            every one of those. Same as PhoneInput and StudentFeeStatusPopover.

            Aligned to the end, because the button it hangs from is now the
            narrow caret at the cell's right rather than the whole cell: aligned
            to the start, a 100px-wide list would hang off to the right of its
            own field instead of sitting under it. */}
        <Popover.Portal>
          <Popover.Content
            className="sis-tpd-list"
            role="listbox"
            aria-label={ariaLabel}
            side="bottom"
            align="end"
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
    </div>
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
   * What the three boxes show, which is only the same as `parts` between edits.
   * Half a year ('19') is text with no part behind it, and a month still being
   * spelled ('febr') is text whose part is already known. Keeping the two apart
   * is what lets a keystroke be shown without being stored, and stored without
   * being rewritten under the cursor.
   */
  const [text, setText] = useState<PartsText>(() => textOf(parseDate(value)));

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
    const next = incoming ? parseDate(incoming) : EMPTY_PARTS;
    setParts(next);
    setText(textOf(next));
  }, [value]);

  /** Parts and the text showing them move together, and the caller hears once. */
  const push = (nextParts: DateParts, nextText: PartsText) => {
    setParts(nextParts);
    setText(nextText);
    const formatted = formatDate(nextParts);
    lastEmitted.current = formatted;
    onChange(formatted);
  };

  /** A part chosen from a list, or stepped to with an arrow key. */
  const choose = (nextParts: DateParts) => push(nextParts, textOf(nextParts));

  const years = yearOptions();
  const maxDay = DAYS_IN_MONTH[parts.month ?? 0];

  /**
   * The month changing, however it changed — from the list, from an arrow key,
   * or from letters typed. A day that does not exist in the new month is
   * cleared, never moved, and its box empties with it so the two never disagree.
   */
  const applyMonth = (month: number | null, monthText: string) => {
    const drops = parts.day !== null && parts.day > DAYS_IN_MONTH[month ?? 0];
    push(
      { ...parts, month, day: drops ? null : parts.day },
      { ...text, month: monthText, day: drops ? '' : text.day },
    );
  };

  const onDayText = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    if (digits === '') {
      push({ ...parts, day: null }, { ...text, day: '' });
      return;
    }
    const n = Number(digits);
    // Past the end of the month, so the keystroke is dropped and the box keeps
    // what it had. 45 in a 31-day month never appears to have been accepted.
    if (n > maxDay) return;
    // '0' is not a day, but it is how '01' starts — so it is shown, and stored
    // as nothing, which is the same state the box is in before anything typed.
    push({ ...parts, day: n === 0 ? null : n }, { ...text, day: digits });
  };

  /** Leaving only tidies the box; the day itself was settled per keystroke. */
  const onDayBlur = () => {
    setText((t) => ({ ...t, day: parts.day === null ? '' : String(parts.day) }));
  };

  const onMonthText = (raw: string) => {
    const letters = raw.replace(/[^A-Za-z]/g, '').slice(0, MONTH_MAX_CHARS);
    if (letters === '') {
      applyMonth(null, '');
      return;
    }
    const hits = monthMatches(letters);
    // Not the start of any month, so it is dropped rather than typed: this box
    // cannot be made to hold a word that is not one of the twelve.
    if (hits.length === 0) return;
    // One match settles the month; more than one is a month still being
    // spelled, and a month nobody has narrowed to is no month at all yet.
    applyMonth(hits.length === 1 ? hits[0] + 1 : null, letters);
  };

  /**
   * Leaving resolves what is in the box. 'j' is three months and the first of
   * them is taken — a guess at the text, never at anything the user cannot see,
   * because the box then reads 'Jan' and says so.
   */
  const onMonthBlur = () => {
    const letters = text.month.replace(/[^A-Za-z]/g, '');
    const hits = letters === '' ? [] : monthMatches(letters);
    if (hits.length === 0) {
      if (parts.month !== null || text.month !== '') applyMonth(null, '');
      return;
    }
    const month = hits[0] + 1;
    if (month === parts.month) setText((t) => ({ ...t, month: MONTHS[month - 1] }));
    else applyMonth(month, MONTHS[month - 1]);
  };

  const onYearText = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (digits === '') {
      push({ ...parts, year: null }, { ...text, year: '' });
      return;
    }
    // Dropped unless some year in range still starts this way, which is what
    // stops 1998 and next year being reached a digit at a time. Four digits
    // that survive this test are themselves a year in range.
    if (!years.some((y) => String(y).startsWith(digits))) return;
    push(
      { ...parts, year: digits.length === 4 ? Number(digits) : null },
      { ...text, year: digits },
    );
  };

  /** Anything short of four digits was never a year, so the box empties. */
  const onYearBlur = () => {
    setText((t) => ({ ...t, year: parts.year === null ? '' : String(parts.year) }));
  };

  const dayOptions = Array.from({ length: maxDay }, (_, i) => ({
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
        label="Day"
        text={text.day}
        onText={onDayText}
        onBlur={onDayBlur}
        inputMode="numeric"
        maxLength={2}
        options={dayOptions}
        selected={parts.day}
        onSelect={(day) => choose({ ...parts, day })}
        disabled={disabled}
        ariaLabel={ariaLabel ? ariaLabel + ' day' : 'Day'}
        minListWidth={84}
      />
      <DatePart
        label="Month"
        text={text.month}
        onText={onMonthText}
        onBlur={onMonthBlur}
        inputMode="text"
        maxLength={MONTH_MAX_CHARS}
        options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))}
        selected={parts.month}
        onSelect={(month) => applyMonth(month, MONTHS[month - 1])}
        disabled={disabled}
        ariaLabel={ariaLabel ? ariaLabel + ' month' : 'Month'}
        minListWidth={104}
      />
      <DatePart
        label="Year"
        text={text.year}
        onText={onYearText}
        onBlur={onYearBlur}
        inputMode="numeric"
        maxLength={4}
        options={years.map((y) => ({ value: y, label: String(y) }))}
        selected={parts.year}
        onSelect={(year) => choose({ ...parts, year })}
        disabled={disabled}
        ariaLabel={ariaLabel ? ariaLabel + ' year' : 'Year'}
        minListWidth={100}
      />
    </div>
  );
}
