'use client';

import { useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';

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
 * Longest dial code first, so +234 is never mistaken for +23 of something else.
 * A bare number is attributed by LENGTH only when that is unambiguous — 9 digits
 * can only be Cameroon here — and otherwise falls back to the default rather
 * than guessing between two countries that share a length.
 */
export function parsePhone(value: string | null | undefined): { country: PhoneCountry; national: string } {
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return { country: DEFAULT_PHONE_COUNTRY, national: '' };

  for (const c of byDial) {
    const code = c.dial.slice(1);
    // Only treat a leading dial code as one when what follows is the right
    // length. Without that, a US number starting 1 would eat its own first
    // digit as the +1.
    if (digits.startsWith(code) && digits.length === code.length + c.digits) {
      return { country: c, national: digits.slice(code.length) };
    }
  }

  // No country code. Drop a local trunk zero, then match on length.
  const local = digits.replace(/^0+/, '');
  const exact = PHONE_COUNTRIES.filter((c) => c.digits === local.length);
  const country = exact.length === 1 ? exact[0] : DEFAULT_PHONE_COUNTRY;
  return { country, national: local.slice(0, country.digits) };
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
  // Derived from the value, never held separately: two sources of truth for the
  // same number is how a field ends up showing one country and submitting
  // another.
  const { country, national } = useMemo(() => parsePhone(value), [value]);
  const [open, setOpen] = useState(false);

  const select = (next: PhoneCountry) => {
    // Re-emit under the new country, trimmed to ITS limit. Switching from a
    // 10-digit country to a 9-digit one has to drop a digit rather than keep an
    // over-long number that would never validate.
    onChange(formatPhone(next, national));
    setOpen(false);
  };

  // Arrow keys cycle the three without opening the list, which is the one
  // affordance a native <select> gave away for free. Only while closed — once
  // it is open the arrows belong to the list.
  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (open || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
    e.preventDefault();
    const i = PHONE_COUNTRIES.indexOf(country);
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
            aria-label={`Country calling code, ${country.name} ${country.dial}`}
            onKeyDown={onTriggerKeyDown}
          >
            <Flag iso={country.iso} />
            <span>{country.dial}</span>
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
          value={national}
          // maxLength alone does not stop a paste of mixed characters, so the
          // digits are filtered and capped in formatPhone as well.
          maxLength={country.digits}
          placeholder={country.example}
          onChange={(e) => onChange(formatPhone(country, e.target.value))}
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
              aria-selected={c.iso === country.iso}
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
