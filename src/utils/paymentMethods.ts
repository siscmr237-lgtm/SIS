/**
 * The two ways this school actually receives and pays out money.
 *
 * DELIBERATELY SHORT, AND THE ONLY LIST. Every Payment Method dropdown in the
 * app reads from here — fee payments, group settlements, damage charges,
 * payroll and expenses — so there is one place to change if a third method ever
 * becomes real. A method nobody uses is a wrong answer somebody can pick by
 * accident, and it also splits the same real-world payment across two labels in
 * every report that groups by method.
 *
 * THE VALUE IS THE LABEL. These strings are what get stored on the row and what
 * gets printed on a receipt, so the option's value and its visible text are the
 * same thing on purpose — an option whose value was 'mobile' printed "Mobile"
 * on the expense table and lost the "Money".
 *
 * The backend keeps its own copy for payroll (PAYROLL_METHODS in
 * sis-backend/src/utils/staffPayroll.js), which is the one list that is
 * validated server-side; it must stay in step with this one.
 */
export const PAYMENT_METHODS = ['Cash', 'Mobile Money'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * A stored payment method as it should be READ.
 *
 * WHY THIS EXISTS. The Add Expense dialog used to save a short code rather than
 * the label — 'cash', 'bank', 'mobile', 'check' — so every expense recorded
 * before that was fixed still holds one. The expense table hid it behind a
 * `capitalize` class, which turned 'mobile' into "Mobile" and quietly dropped
 * the "Money"; the PDF had no such class and printed the bare code. Both were
 * reading a code as if it were a label.
 *
 * IT EXPANDS, IT DOES NOT REWRITE. 'bank' becomes "Bank Transfer" even though
 * Bank Transfer is no longer offered, because an expense genuinely settled by
 * transfer in 2025 was settled by transfer — narrowing the dropdown changes what
 * can be recorded from now on, not what already happened. Restating history to
 * match the current options would put a number against a method nobody used.
 *
 * Anything unrecognised passes through untouched, which is what makes this safe
 * to run over a value that is already a label: 'Mobile Money' in, 'Mobile Money'
 * out. Empty and null give the em dash the tables already use for "not recorded".
 */
const LEGACY_CODES: Record<string, string> = {
  cash: 'Cash',
  mobile: 'Mobile Money',
  bank: 'Bank Transfer',
  check: 'Check',
  cheque: 'Cheque',
};

export function formatPaymentMethod(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '—';
  return LEGACY_CODES[raw.toLowerCase()] ?? raw;
}
