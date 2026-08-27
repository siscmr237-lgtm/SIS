'use client';

import { useEffect, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { popMotionCss } from './ui/motionCss';

/**
 * A phone number field: country picker on the left, national digits on the right,
 * inside one border so the two read as a single control.
 *
 * THREE COUNTRIES, CLOSED. Cameroon, Nigeria, USA — the places this product is
 * actually used. Not a full country list, because a 200-entry picker to reach
 * one of three is worse than three, and every extra entry is a length rule
 * nobody has checked.
 *
 * THE VALUE IS E.164 — "+237679379134". One canonical shape, so a number is
 * stored the same way whoever typed it and whichever screen they typed it on.
 * The alternative, bare national digits, is what older rows in the database
 * hold, and it cannot tell a Cameroonian number from a Nigerian one: both are
 * just digits. Storing the country is the point of asking for it.
 *
 * PARSING IS TOLERANT, on purpose. Existing rows hold bare digits with no
 * country code at all, so `parse` accepts:
 *
 *   +237679379134   an E.164 value this component wrote
 *   237679379134    the same without the plus
 *   679379134       a legacy bare national number
 *   0679379134      how people write it locally, leading trunk zero
 *
 * Anything unrecognised falls back to the default country with the digits kept,
 * so opening an old record shows the number rather than blanking a field the
 * user never touched. NOTHING IS REWRITTEN ON LOAD — a legacy value is only
 * re-emitted in E.164 when the user actually edits the field and saves. Reading
 * a record does not migrate it.
 *
 * LENGTH IS A CAP, NOT A GATE. The input refuses to accept more digits than the
 * country allows, so the limit is felt while typing rather than reported after
 * submitting. It does NOT block a short number on its own — `isValidPhone` is
 * exported for callers that want to require completeness, so a half-typed number
 * does not fire a validation error on the second keystroke.
 *
 * WHAT THE FIELD HOLDS IS NOT WHAT THE PARENT HOLDS. The component keeps two
 * pieces of state of its own — `selectedCountry` and `localNumber` — and the
 * input renders `localNumber` alone. The dial code is never in the field; it
 * lives in the picker to the left of it. Only on the way OUT are the two joined
 * into E.164 for the parent.
 *
 * That separation is the whole design, and it replaces deriving the field's
 * contents from `value` on every render. Deriving looked tidier — one source of
 * truth — but it made the field's contents a round trip through the parent, so
 * it was only ever as correct as the string that came back. Anything else put
 * the dial code ON SCREEN and let it eat the maxLength: a legacy row holding
 * bare digits of an unrecognised length falls to parsePhone's ambiguous case,
 * which can only hand back the digits it was given, dial code and all. The
 * field then showed "237679379" with nine of nine characters used and no room
 * to type. Holding the local digits directly means no string from outside can
 * do that, whatever shape it arrives in.
 *
 * `value` is still adopted when it genuinely changes from outside — a record
 * loading, a form resetting. What it cannot do any more is disturb the field by
 * echoing back the component's own number in a different shape; see the guard
 * on the sync effect.
 *
 * STYLING is inline plus one component-scoped <style> block. src/index.css is a
 * pre-compiled Tailwind artifact, so a utility class not already in it renders
 * as nothing at all — and the states below cannot be expressed inline at all:
 * :focus-within on the wrapper, the trigger's hover, and the list rows' hover
 * and selected states.
 */

export interface PhoneCountry {
  iso: 'CM' | 'NG' | 'US';
  name: string;
  dial: string;
  /** Digits in the national number, excluding the dial code. */
  digits: number;
  /** Shown greyed until something is typed. Shape mirrors `digits`. */
  example: string;
}

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'CM', name: 'Cameroon', dial: '+237', digits: 9, example: '6XX XXX XXX' },
  { iso: 'NG', name: 'Nigeria', dial: '+234', digits: 10, example: 'XXX XXX XXXX' },
  { iso: 'US', name: 'USA', dial: '+1', digits: 10, example: 'XXX XXX XXXX' },
];

/** Cameroon, as asked. Also the country every legacy row belongs to. */
export const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES[0];

const byDial = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

/**
 * Split a stored value into a country and its national digits.
 *
 * `explicit` says whether the country was STATED by the value or merely
 * guessed from it. That distinction is what lets the picker work: a value can
 * only name a country while it has digits, so on an empty or half-typed field
 * the component has to fall back to what the user last chose rather than to
 * whatever this function guessed.
 *
 * A LEADING PLUS IS TRUSTED. It means the string was composed as E.164 — by
 * this component or by the API — so the dial code is stated outright and the
 * rest is however far through typing the user happens to be. Matching the
 * prefix without demanding a complete number is what makes switching country
 * mid-edit work: nine Cameroonian digits under Nigeria's ten is a legitimate
 * in-progress number, and it used to parse as neither.
 *
 * A BARE NUMBER IS NOT TRUSTED, because it is ambiguous by construction — it
 * is what legacy rows hold. It is read in decreasing order of confidence:
 * a dial code plus a COMPLETE national number; then the string as a national
 * number of a length we recognise; then, only once no valid national length
 * fits at all, a dial code plus an incomplete number. That last step is what
 * stops an odd-length legacy row — "23767937913", eleven digits — from being
 * handed back whole and putting "237679379" in the field with no room left to
 * type. Its ordering is load-bearing: it runs after the length check
 * specifically so a legal 10-digit number starting with 1 is never mistaken
 * for a +1 and robbed of its first digit.
 *
 * Longest dial code first throughout, so +234 is never mistaken for +23 of
 * something else, and +1 never shadows +237.
 */
export function parsePhone(
  value: string | null | undefined,
): { country: PhoneCountry; national: string; explicit: boolean } {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return { country: DEFAULT_PHONE_COUNTRY, national: '', explicit: false };

  if (raw.startsWith('+')) {
    for (const c of byDial) {
      const code = c.dial.slice(1);
      if (digits.startsWith(code)) {
        return { country: c, national: digits.slice(code.length).slice(0, c.digits), explicit: true };
      }
    }
  }

  // Drop a local trunk zero first, so "00237..." and "0679..." are read the
  // same as the numbers they are written from.
  const local = digits.replace(/^0+/, '');

  // (a) A dial code followed by a COMPLETE national number. Exact length is
  //     what makes this safe: without it a US number starting 1 would eat its
  //     own first digit as the +1.
  for (const c of byDial) {
    const code = c.dial.slice(1);
    if (local.startsWith(code) && local.length === code.length + c.digits) {
      return { country: c, national: local.slice(code.length), explicit: true };
    }
  }

  // (b) The string is a national number on its own. Attributed by LENGTH,
  //     which is a guess rather than a statement — hence explicit: false — but
  //     it keeps every digit the row holds. Where two countries share a length
  //     the first is taken rather than the default: with nothing to separate
  //     them, preserving all ten digits beats truncating to nine under a
  //     country that was not one of the candidates.
  const sameLength = PHONE_COUNTRIES.filter((c) => c.digits === local.length);
  if (sameLength.length) {
    return { country: sameLength[0], national: local, explicit: false };
  }

  // (c) It is not a national number at ANY of our lengths, so the only reading
  //     left that does not put a dial code in the field is a code followed by
  //     an incomplete number — a half-typed row, or one stored short.
  //
  //     Reachable only after (b) has ruled out every valid national length,
  //     which is precisely what keeps the US hazard out: "1234567890" is a
  //     legal 10-digit national number, so it never gets here to have its
  //     leading 1 taken for a dial code.
  for (const c of byDial) {
    const code = c.dial.slice(1);
    if (!local.startsWith(code)) continue;
    // The code and nothing else: a country was named, no number given.
    if (local.length === code.length) {
      return { country: c, national: '', explicit: true };
    }
    if (local.length - code.length < c.digits) {
      return { country: c, national: local.slice(code.length), explicit: true };
    }
  }

  // (d) Nothing fits. The default country, capped at its length — the cap
  //     matters, because whatever is left here is unrecognised and must not be
  //     allowed to overflow the field it is about to be shown in.
  return {
    country: DEFAULT_PHONE_COUNTRY,
    national: local.slice(0, DEFAULT_PHONE_COUNTRY.digits),
    explicit: false,
  };
}

/** Every digit in a string, in order — punctuation, spaces and the '+' dropped. */
function digitsOf(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

/** The E.164 string for a country and national digits, or '' for no digits. */
export function formatPhone(country: PhoneCountry, national: string): string {
  const digits = national.replace(/\D/g, '').slice(0, country.digits);
  return digits ? `${country.dial}${digits}` : '';
}

/** True when the value holds a complete number for the country it names. */
export function isValidPhone(value: string | null | undefined): boolean {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  const { country, national } = parsePhone(raw);
  return national.length === country.digits;
}

/* ------------------------------------------------------------------------- *
 * Flags
 *
 * Drawn here as SVG rather than written as emoji. The emoji flags these
 * replace are regional-indicator pairs, and Windows ships no glyphs for them
 * in Segoe UI Emoji — every Windows user saw the literal letters "CM", "NG",
 * "US" instead of a flag. That is not a fallback worth keeping when the whole
 * point of the picker is to be recognisable at a glance.
 *
 * No package and no image files: three flags of two or three flat bands each
 * are a handful of <rect>s. All share one 21x14 viewBox so they line up in the
 * list whatever their real-world aspect ratio, and each is capped with a
 * hairline border so a white band still has an edge against a white menu.
 * ------------------------------------------------------------------------- */

const FLAG_W = 21;
const FLAG_H = 14;

function FlagFrame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${FLAG_W} ${FLAG_H}`}
      width={FLAG_W}
      height={FLAG_H}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      {children}
      {/* Drawn last so it sits over the bands rather than under them. */}
      <rect x="0.25" y="0.25" width={FLAG_W - 0.5} height={FLAG_H - 0.5} fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="0.5" />
    </svg>
  );
}

/** Green / red / yellow vertical bands, with the yellow star on the red one. */
function FlagCM() {
  return (
    <FlagFrame>
      <rect width="7" height="14" fill="#007A5E" />
      <rect x="7" width="7" height="14" fill="#CE1126" />
      <rect x="14" width="7" height="14" fill="#FCD116" />
      <polygon
        fill="#FCD116"
        points="10.5,4 11.18,6.07 13.35,6.07 11.59,7.36 12.26,9.43 10.5,8.15 8.74,9.43 9.41,7.36 7.65,6.07 9.82,6.07"
      />
    </FlagFrame>
  );
}

/** Green / white / green vertical bands. */
function FlagNG() {
  return (
    <FlagFrame>
      <rect width="7" height="14" fill="#008751" />
      <rect x="7" width="7" height="14" fill="#FFFFFF" />
      <rect x="14" width="7" height="14" fill="#008751" />
    </FlagFrame>
  );
}

/**
 * Seven stripes rather than the true thirteen, and nine stars rather than
 * fifty. At 14px tall a real stripe is barely one pixel: thirteen of them
 * render as grey mush on any display that is not retina. Seven keeps each
 * stripe a crisp 2px and still reads instantly as the stars and stripes, which
 * is the entire job at this size.
 */
function FlagUS() {
  return (
    <FlagFrame>
      <rect width="21" height="14" fill="#FFFFFF" />
      {[0, 2, 4, 6].map((i) => (
        <rect key={i} y={i * 2} width="21" height="2" fill="#B22234" />
      ))}
      <rect width="9" height="6" fill="#3C3B6E" />
      {[1.5, 3.5, 5.5, 7.5].map((x) =>
        [1.5, 4.5].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="0.5" fill="#FFFFFF" />),
      )}
      <circle cx="4.5" cy="3" r="0.5" fill="#FFFFFF" />
    </FlagFrame>
  );
}

const FLAGS: Record<PhoneCountry['iso'], () => React.ReactElement> = {
  CM: FlagCM,
  NG: FlagNG,
  US: FlagUS,
};

function Flag({ iso }: { iso: PhoneCountry['iso'] }) {
  const Component = FLAGS[iso];
  return <Component />;
}

/**
 * Rendered once per instance. Duplicate identical <style> tags are inert, and
 * the alternative — asking all six calling files to also mount a styles
 * provider — is the kind of setup step that gets forgotten on the seventh.
 */
const PHONE_CSS = `
.sis-phone-box{display:flex;align-items:stretch;min-width:0;overflow:hidden;
  border-style:solid;border-color:#D1D5DB;background:#FFFFFF;
  transition:border-color .15s,box-shadow .15s}
.sis-phone-box:focus-within{border-color:#2563EB;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
.sis-phone-box[data-disabled="true"]{background:#F9FAFB;opacity:.6}
.sis-phone-trigger{display:flex;align-items:center;gap:6px;flex:0 0 auto;border:none;
  border-right:1px solid #E5E7EB;background:transparent;font-size:.875rem;color:#111827;
  padding:0 8px;cursor:pointer;white-space:nowrap;font-family:inherit}
.sis-phone-trigger:hover:not(:disabled){background:#F3F4F6}
.sis-phone-trigger:disabled{cursor:not-allowed}
.sis-phone-trigger:focus-visible{outline:2px solid #2563EB;outline-offset:-2px}
.sis-phone-field{flex:1;min-width:0;border:none;outline:none;background:transparent;
  font-size:.875rem;color:#111827;padding:0 12px;font-family:inherit}
.sis-phone-list{min-width:200px;margin:0;padding:4px;list-style:none;background:#FFFFFF;
  border:1px solid #E5E7EB;border-radius:10px;box-shadow:0 10px 28px rgba(15,35,69,.18)}
.sis-phone-opt{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;
  border:none;border-radius:6px;background:transparent;font-size:.875rem;color:#111827;
  text-align:left;cursor:pointer;font-family:inherit}
.sis-phone-opt:hover{background:#F3F4F6}
.sis-phone-opt[aria-selected="true"]{background:#2563EB;color:#FFFFFF}
.sis-phone-opt[aria-selected="true"]:hover{background:#1D4ED8}

/* The list's own open and close, the same fade-and-scale as the dialogs. Safe
   to mount from this component — unlike a dialog's, this block lives on the
   input itself, not inside the portal Radix tears down when the list closes, so
   the exit animation still has its rule when it needs it.

   NOTE FOR ANYONE EDITING THIS COMMENT: it is inside the stylesheet text, and
   React's server renderer CSS-escapes an opening style tag written literally in
   there while the client does not — which hydrates as a text mismatch on every
   page carrying a phone field. Describe the element, do not spell its tag. */
${popMotionCss('.sis-phone-list')}
`;

export function PhoneInput({
  value,
  onChange,
  disabled,
  required,
  id,
  height = 36,
  radius = 6,
  borderWidth = 1,
  'aria-label': ariaLabel,
}: {
  /** E.164, or a legacy bare national number. */
  value: string;
  /** Called with E.164, or '' once the field is cleared. */
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  /** Match the form's other inputs — 44 on signup, 36 for the app's h-9 fields. */
  height?: number;
  /** Likewise: 12 on signup, 8 in the console, 6 for shadcn's rounded-md. */
  radius?: number;
  /** Likewise: signup's fields outline at 1.5px, everything else at 1. */
  borderWidth?: number;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);

  /**
   * THE TWO PIECES OF STATE. Everything the control shows is one of these.
   *
   * `localNumber` is the national digits ONLY — what the user typed, never a
   * dial code. It is what the input renders and what maxLength counts.
   * `selectedCountry` is what the picker shows and what supplies the dial code
   * on the way out.
   *
   * Seeded from `value` once, at mount, so an existing record opens on the
   * right country with its digits in the field. After that they are the
   * component's own, and no string arriving from the parent can put a dial code
   * back into the field.
   */
  const [selectedCountry, setSelectedCountry] = useState<PhoneCountry>(
    () => parsePhone(value).country,
  );
  const [localNumber, setLocalNumber] = useState<string>(() => parsePhone(value).national);

  /**
   * The exact string last handed to the parent.
   *
   * Kept so the sync effect below can tell "the parent is showing me my own
   * number back" from "something outside changed the number". Without it the
   * effect cannot distinguish the two, and every keystroke looks like an
   * external edit.
   */
  const lastEmitted = useRef<string>(String(value ?? ''));

  /** Join the two halves and hand them out. The only place onChange is called. */
  const emit = (nextCountry: PhoneCountry, nextLocal: string) => {
    const composed = formatPhone(nextCountry, nextLocal);
    lastEmitted.current = composed;
    onChange(composed);
  };

  /**
   * Adopt a value that genuinely came from OUTSIDE — a record finishing its
   * load, a form being reset.
   *
   * Compared on DIGITS rather than on the exact string, deliberately. A parent
   * that stores what it was given and hands it straight back is the easy case;
   * one that trims it, or drops the '+' before putting it in state, is just as
   * common and must not read as an external edit. Comparing digits treats
   * "+2348" and "2348" as the same number, which is the question actually being
   * asked here.
   *
   * The country moves only when the incoming value NAMES one. A cleared field
   * says nothing about country, so clearing must not spring the picker back to
   * Cameroon — which is what it used to do the moment an empty value round
   * tripped.
   */
  useEffect(() => {
    const incoming = String(value ?? '');
    if (digitsOf(incoming) === digitsOf(lastEmitted.current)) return;

    lastEmitted.current = incoming;
    const parsed = parsePhone(incoming);
    if (parsed.explicit) setSelectedCountry(parsed.country);
    setLocalNumber(parsed.national);
    // Only `value` — this must react to the parent changing the number, not to
    // the component changing its own state, or it would undo every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  /**
   * Typing, and pasting, which are the same event and have to be told apart.
   *
   * Typing is the simple case: digits only, capped at the country's length.
   *
   * PASTING A WHOLE NUMBER is the case that has to be caught, because people
   * paste "+237 679 379 134" into a field like this constantly and the dial
   * code has nowhere to go — capping it blindly would leave "237679379" on
   * screen, which is the very thing this component exists to prevent.
   *
   * The two are distinguished by what could not have been TYPED here: text
   * holding a '+', or more digits than maxLength permits at the keyboard. Only
   * then is the value re-read as a whole number, and only when it names a
   * country outright is that reading taken — so a pasted Cameroonian number
   * moves the picker to Cameroon, while an ordinary Cameroonian local number
   * that happens to begin 237 is left exactly as typed.
   */
  const onFieldChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digits = digitsOf(raw);

    if (raw.includes('+') || digits.length > selectedCountry.digits) {
      const parsed = parsePhone(raw);
      if (parsed.explicit) {
        setSelectedCountry(parsed.country);
        setLocalNumber(parsed.national);
        emit(parsed.country, parsed.national);
        return;
      }
    }

    const capped = digits.slice(0, selectedCountry.digits);
    setLocalNumber(capped);
    emit(selectedCountry, capped);
  };

  /**
   * Choosing a country CLEARS the number.
   *
   * The digits that were there were typed to a different country's format and
   * usually a different length, so carrying them over produces a number that is
   * wrong in a way nobody can see — right count of digits, wrong country. An
   * empty field states plainly that the number has to be typed again, and the
   * placeholder that appears alongside it shows the shape to type.
   */
  const select = (next: PhoneCountry) => {
    setSelectedCountry(next);
    setLocalNumber('');
    emit(next, '');
    setOpen(false);
  };

  // Arrow keys cycle the three without opening the list, which is the one
  // affordance a native <select> gave away for free. Only while closed — once
  // it is open the arrows belong to the list.
  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (open || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    const i = PHONE_COUNTRIES.findIndex((c) => c.iso === selectedCountry.iso);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    select(PHONE_COUNTRIES[(i + step + PHONE_COUNTRIES.length) % PHONE_COUNTRIES.length]);
  };

  return (
    /* Popover.Root renders no DOM of its own — it is context only — so the
       bordered box below is this component's root element. */
    <Popover.Root open={open} onOpenChange={setOpen}>
      <style>{PHONE_CSS}</style>

      <div
        className="sis-phone-box"
        data-disabled={disabled ? 'true' : 'false'}
        style={{ height, borderRadius: radius, borderWidth }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className="sis-phone-trigger"
            disabled={disabled}
            // Radix defaults this to "dialog"; the content below is a listbox,
            // and a trigger that announces the wrong kind of popup is worse
            // than one that announces none.
            aria-haspopup="listbox"
            aria-label={`Country calling code, ${selectedCountry.name} ${selectedCountry.dial}`}
            onKeyDown={onTriggerKeyDown}
          >
            <Flag iso={selectedCountry.iso} />
            <span>{selectedCountry.dial}</span>
            {/* A caret drawn with borders rather than an icon import: this
                component is used on pages that pull in nothing else from
                lucide. */}
            <span
              aria-hidden="true"
              style={{
                width: 0,
                height: 0,
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderTop: '5px solid #6B7280',
              }}
            />
          </button>
        </Popover.Trigger>

        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          className="sis-phone-field"
          aria-label={ariaLabel ?? 'Phone number'}
          required={required}
          disabled={disabled}
          // The national digits alone. The dial code is in the picker to the
          // left and never in here, so all `digits` characters of the cap are
          // available for the number the user is actually typing.
          value={localNumber}
          // maxLength alone does not stop a paste of mixed characters, so
          // onFieldChange filters and caps as well.
          maxLength={selectedCountry.digits}
          placeholder={selectedCountry.example}
          onChange={onFieldChange}
        />
      </div>

      {/* PORTALLED, and that is the whole fix for the list not appearing.
          Absolutely positioned, it was clipped by the nearest ancestor with
          overflow:hidden — on signup that was the field wrapper itself, 44px
          tall, so the list was rendered and then cut off entirely. A portal
          puts it on document.body, outside every one of those ancestors,
          which also covers the app shell's overflow-hidden and the scroll
          container in <main>. Same approach as StudentFeeStatusPopover.

          Radix anchors it to the trigger, flips it above when there is no room
          below, and brings dismiss-on-outside-click and Escape with it — all
          of which had to be hand-rolled before. */}
      <Popover.Portal>
        <Popover.Content
          className="sis-phone-list"
          role="listbox"
          aria-label="Country calling code"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={16}
          style={{
            // Above everything this app stacks: mobile header 30, sidebar
            // overlay 40, sidebar 50, support button 60. Dialogs portal to the
            // body too, and this has to clear those as well.
            zIndex: 70,
          }}
        >
          {PHONE_COUNTRIES.map((c) => (
            <button
              key={c.iso}
              type="button"
              className="sis-phone-opt"
              role="option"
              aria-selected={c.iso === selectedCountry.iso}
              onClick={() => select(c)}
            >
              <Flag iso={c.iso} />
              <span>{c.name} ({c.dial})</span>
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
