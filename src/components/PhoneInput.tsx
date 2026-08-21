'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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
 * as nothing at all — and the four things below cannot be expressed inline at
 * all: :focus-within on the wrapper, :hover on the trigger, and the dropdown
 * rows' hover and selected states.
 */

export interface PhoneCountry {
  iso: 'CM' | 'NG' | 'US';
  name: string;
  dial: string;
  /** Digits in the national number, excluding the dial code. */
  digits: number;
  /** Shown greyed until something is typed. Shape mirrors `digits`. */
  example: string;
  /**
   * A regional-indicator pair, not an icon component — no flag library, as
   * asked. Worth knowing: Windows ships no flag glyphs in Segoe UI Emoji, so
   * these render as the two letters ("CM") there rather than a flag. That is a
   * platform font gap, not a bug here, and the country name and dial code
   * beside it carry the meaning on their own.
   */
  flag: string;
}

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'CM', name: 'Cameroon', dial: '+237', digits: 9, example: '6XX XXX XXX', flag: '🇨🇲' },
  { iso: 'NG', name: 'Nigeria', dial: '+234', digits: 10, example: 'XXX XXX XXXX', flag: '🇳🇬' },
  { iso: 'US', name: 'USA', dial: '+1', digits: 10, example: 'XXX XXX XXXX', flag: '🇺🇸' },
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

/**
 * Rendered once per instance. Duplicate identical <style> tags are inert, and
 * the alternative — asking all seven calling files to also mount a styles
 * provider — is the kind of setup step that gets forgotten on the eighth.
 */
const PHONE_CSS = `
.sis-phone-box{display:flex;align-items:stretch;min-width:0;overflow:hidden;
  border:1px solid #D1D5DB;background:#FFFFFF;transition:border-color .15s,box-shadow .15s}
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
.sis-phone-list{position:absolute;z-index:60;top:calc(100% + 4px);left:0;min-width:220px;
  margin:0;padding:4px;list-style:none;background:#FFFFFF;border:1px solid #E5E7EB;
  border-radius:10px;box-shadow:0 10px 28px rgba(15,35,69,.18)}
.sis-phone-opt{display:flex;align-items:center;gap:8px;width:100%;padding:8px 10px;
  border:none;border-radius:6px;background:transparent;font-size:.875rem;color:#111827;
  text-align:left;cursor:pointer;font-family:inherit}
.sis-phone-opt:hover{background:#F3F4F6}
.sis-phone-opt[aria-selected="true"]{background:#2563EB;color:#FFFFFF}
.sis-phone-opt[aria-selected="true"]:hover{background:#1D4ED8}
.sis-phone-flag{font-size:1rem;line-height:1;
  font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif}
`;

export function PhoneInput({
  value,
  onChange,
  disabled,
  required,
  id,
  height = 36,
  radius = 6,
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
  'aria-label'?: string;
}) {
  // Derived from the value, never held separately: two sources of truth for the
  // same number is how a field ends up showing one country and submitting
  // another.
  const { country, national } = useMemo(() => parsePhone(value), [value]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside press and on Escape. Same shape as SupportButton's panel,
  // deliberately — one dismissal behaviour for every popover in the app.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const node = containerRef.current;
      if (node && e.target instanceof Node && !node.contains(e.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  const select = (next: PhoneCountry) => {
    // Re-emit under the new country, trimmed to ITS limit. Switching from a
    // 10-digit country to a 9-digit one has to drop a digit rather than keep an
    // over-long number that would never validate.
    onChange(formatPhone(next, national));
    setOpen(false);
  };

  // Arrow keys move between the three without opening the list, which is the
  // one affordance a native <select> gave away for free.
  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = PHONE_COUNTRIES.indexOf(country);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    select(PHONE_COUNTRIES[(i + step + PHONE_COUNTRIES.length) % PHONE_COUNTRIES.length]);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', minWidth: 0 }}>
      <style>{PHONE_CSS}</style>

      <div className="sis-phone-box" data-disabled={disabled ? 'true' : 'false'} style={{ height, borderRadius: radius }}>
        <button
          type="button"
          className="sis-phone-trigger"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Country calling code, ${country.name} ${country.dial}`}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={onTriggerKeyDown}
        >
          <span className="sis-phone-flag" aria-hidden="true">{country.flag}</span>
          <span>{country.dial}</span>
          {/* A caret drawn in CSS rather than an icon import: this component is
              used on pages that pull in nothing else from lucide. */}
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

      {open && (
        <ul className="sis-phone-list" role="listbox" aria-label="Country calling code">
          {PHONE_COUNTRIES.map((c) => (
            <li key={c.iso}>
              <button
                type="button"
                className="sis-phone-opt"
                role="option"
                aria-selected={c.iso === country.iso}
                onClick={() => select(c)}
              >
                <span className="sis-phone-flag" aria-hidden="true">{c.flag}</span>
                <span>{c.name} ({c.dial})</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
