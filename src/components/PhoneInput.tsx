'use client';

import { useMemo } from 'react';

/**
 * A phone number field: country code on the left, national digits on the right.
 *
 * THREE COUNTRIES, CLOSED. Cameroon, Nigeria, USA — the places this product is
 * actually used. Not a full country list, because a 200-entry picker to reach
 * one of three is worse than three, and every extra entry is a length rule
 * nobody has checked.
 *
 * THE VALUE IS E.164 — "+237679379134". One canonical shape, so a number is
 * stored the same way whoever typed it and whichever screen they typed it on.
 * The alternative, bare national digits, is what the database holds today, and
 * it cannot tell a Cameroonian number from a Nigerian one: both are just digits.
 * Storing the country is the point of asking for it.
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
 * user never touched. It is only rewritten in E.164 when they actually save.
 *
 * LENGTH IS A CAP, NOT A GATE. The input refuses to accept more digits than the
 * country allows, so the limit is felt while typing rather than reported after
 * submitting. It does NOT block a short number on its own — `isValidPhone` is
 * exported for callers that want to require completeness, so a half-typed number
 * does not fire a validation error on the second keystroke.
 *
 * Styling is inline and matches the app's h-9 inputs. src/index.css is a
 * pre-compiled Tailwind artifact, so a utility class not already in it renders
 * as nothing at all.
 */

export interface PhoneCountry {
  iso: 'CM' | 'NG' | 'US';
  name: string;
  dial: string;
  /** Digits in the national number, excluding the dial code. */
  digits: number;
  /** Shown greyed until something is typed. */
  example: string;
}

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'CM', name: 'Cameroon', dial: '+237', digits: 9, example: '6XX XXX XXX' },
  { iso: 'NG', name: 'Nigeria', dial: '+234', digits: 10, example: '8XX XXX XXXX' },
  { iso: 'US', name: 'USA', dial: '+1', digits: 10, example: '555 123 4567' },
];

/** Cameroon, as asked. Also the country every existing row belongs to. */
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

export function PhoneInput({
  value,
  onChange,
  disabled,
  required,
  id,
  height = 36,
  'aria-label': ariaLabel,
}: {
  /** E.164, or a legacy bare national number. */
  value: string;
  /** Called with E.164, or '' once the field is cleared. */
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  /** Fill a taller wrapper — signup's field is 44px, the app's inputs are 36. */
  height?: number;
  'aria-label'?: string;
}) {
  // Derived from the value, never held separately: two sources of truth for the
  // same number is how a field ends up showing one country and submitting
  // another.
  const { country, national } = useMemo(() => parsePhone(value), [value]);

  const box: React.CSSProperties = {
    height,
    border: '1px solid #D1D5DB',
    backgroundColor: disabled ? '#F9FAFB' : '#FFFFFF',
    fontSize: '0.875rem',
    opacity: disabled ? 0.6 : 1,
  };

  return (
    <div style={{ display: 'flex', minWidth: 0 }}>
      {/* Attached, not merely adjacent: the two share an edge and only the outer
          corners are rounded, so they read as one control. */}
      <select
        value={country.iso}
        disabled={disabled}
        aria-label="Country code"
        onChange={(e) => {
          const next = PHONE_COUNTRIES.find((c) => c.iso === e.target.value) ?? DEFAULT_PHONE_COUNTRY;
          // Re-emit under the new country, trimmed to ITS limit. Switching from
          // a 10-digit country to a 9-digit one has to drop a digit rather than
          // keep an over-long number that would never validate.
          onChange(formatPhone(next, national));
        }}
        style={{
          ...box,
          flex: '0 0 auto',
          width: 92,
          borderRadius: '6px 0 0 6px',
          borderRight: 'none',
          padding: '0 4px 0 8px',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {PHONE_COUNTRIES.map((c) => (
          <option key={c.iso} value={c.iso}>
            {c.dial} {c.iso}
          </option>
        ))}
      </select>

      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        aria-label={ariaLabel ?? 'Phone number'}
        required={required}
        disabled={disabled}
        value={national}
        // maxLength alone does not stop a paste of mixed characters, so the
        // digits are filtered and capped here as well.
        maxLength={country.digits}
        placeholder={country.example}
        onChange={(e) => onChange(formatPhone(country, e.target.value))}
        style={{
          ...box,
          flex: 1,
          minWidth: 0,
          borderRadius: '0 6px 6px 0',
          padding: '0 12px',
        }}
      />
    </div>
  );
}
