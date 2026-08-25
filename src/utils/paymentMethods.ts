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
