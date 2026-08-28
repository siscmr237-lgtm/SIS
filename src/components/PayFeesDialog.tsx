'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button } from './ui/button';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ThreePartDateInput } from './ThreePartDateInput';
import { ContentLoader } from './ContentLoader';

/**
 * Pay several of one student's fees from a single hand-over of money.
 *
 * A TABLE, not a category picker. The old dialog asked which one fee the money
 * was for, which is not how it arrives: somebody is handed a sum and told what
 * it covers -- 30,000 for tuition, 20,000 for books, 10,000 for PTA. That is
 * three payments, each tagged to its own fee, and one act.
 *
 * FIXED HEAD, SCROLLING MIDDLE, FIXED FOOT. The fee list is the only part that
 * can grow without limit (a class with a dozen fees), so it is the only part
 * that scrolls. The date, the method and the button that commits the money stay
 * on screen at every viewport height -- losing sight of what you are about to
 * record, or having to scroll to find the button, is exactly what should not
 * happen while handling cash. This is also why date and method are in the FOOT
 * rather than beside the table: at 390px there is no beside, and in a single
 * column they sat below the rows and scrolled out of view.
 *
 * It owns its own form state and hands the finished list up. The caller owns the
 * fee figures and the write, because the cap each row is checked against has to
 * come from the same place the server recomputes it from.
 */

export interface PayFeesCategory {
  key: string;
  name: string;
  /** Total charged for this fee for this student. */
  charged: number;
  /** Still outstanding — the ceiling for this row, and 0 means settled. */
  owing: number;
  payable: boolean;
  group?: 'REGISTRATION' | 'OTHER_FEES';
}

export interface PayFeesSubmission {
  entries: Array<{ feeKey: string; amount: number }>;
  entryDate: string;
  paymentMethod: string;
  total: number;
}

/**
 * The three bands of this dialog, as inline styles on the elements themselves.
 *
 * DialogContent caps its own height and lays itself out as a flex column (see
 * ui/dialog.tsx). These give that column its shape: the head and the foot never
 * shrink, and the middle takes what is left and scrolls.
 *
 * `minHeight: 0` on the middle is load-bearing. A flex item defaults to
 * min-height:auto and refuses to shrink below its own content, so without it the
 * middle pushes the dialog past its own max-height and nothing scrolls anywhere.
 *
 * Inline rather than a data attribute matched by a stylesheet: there is no
 * indirection to wire up wrongly, and it is what DevTools shows under
 * element.style.
 */
const HEAD: CSSProperties = {
  flex: '0 0 auto',
  // Right padding clears the close button, which sits at top-4 right-4.
  padding: '1.25rem 3rem 0.75rem 1.25rem',
};
const BODY: CSSProperties = {
  // 'auto' basis, NOT 0. flex-basis:0 is the right answer when the container
  // has a definite height, but this dialog's height is auto with only a
  // max-height above it: a 0 basis means the middle contributes nothing to the
  // intrinsic height, so the box shrink-wraps to head+foot and the fee list
  // collapses. Measured at 390x844 with 20 fees: 16px of 1516px, in a 299px
  // dialog. An 'auto' basis grows to the content and then shrinks under the cap,
  // which is what min-height:0 below is here to permit.
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  padding: '0 1.25rem 1rem',
};
const FOOT: CSSProperties = {
  flex: '0 0 auto',
  borderTop: '1px solid #E5E7EB',
  padding: '0.875rem 1.25rem',
  background: '#FFFFFF',
};

const PAY_FEES_CSS = [
  '[data-pay-table]{width:100%;border-collapse:collapse}',
  '[data-pay-table] th,[data-pay-table] td{padding:.4rem .6rem;text-align:left;vertical-align:middle}',
  /* The column heads stay put while the rows scroll under them: with a dozen
     fees the third column stops being self-evidently the one you type into. */
  '[data-pay-table] thead th{position:sticky;top:0;z-index:1;',
  '  font-size:.6875rem;font-weight:500;color:#6B7280;',
  '  text-transform:uppercase;letter-spacing:.04em;',
  '  border-bottom:1px solid #E5E7EB;background:#F9FAFB}',
  '[data-pay-table] tbody td{border-bottom:1px solid #F3F4F6}',
  '[data-pay-table] tbody tr:last-child td{border-bottom:none}',
  /* Group heading rows: a label across the table, not a fee. */
  '[data-pay-table] tr[data-pay-group] td{',
  '  font-size:.6875rem;font-weight:600;color:#6B7280;',
  '  text-transform:uppercase;letter-spacing:.04em;',
  '  padding-top:.85rem;border-bottom:none}',
  '[data-pay-num]{text-align:right;white-space:nowrap}',
  /* The FEE column gives up horizontal padding to the PAID column.
     table-layout is auto, so the columns negotiate: FEE is the one that can
     afford to lose room because its names WRAP ("Parents Teachers Association
     Fee" is happy on three lines), while the PAID input cannot wrap and has to
     show a whole amount. At 375px the two were competing and both lost —
     "Owin..." in an input beside a fee name that had plenty of slack. */
  '[data-pay-table] th:first-child,',
  '[data-pay-table] td:first-child{padding-left:.5rem;padding-right:.25rem}',
  /* Floors under the three date cells, SCOPED to this dialog.
     ThreePartDateInput makes its cells flex:1 1 0 with min-width:0 so the same
     control can sit in a finance filter column a third this wide; a floor in the
     component itself would make its box — which is overflow:hidden — clip the
     year there, and a clipped year is worse than an ellipsis. Measured inside
     this dialog the cells already come out 90-102px holding 22-28px of text, so
     this changes nothing at 375-412px. It is a guard against a narrower dialog,
     not a fix for today. */
  '[data-pay-date] .sis-tpd-cell:nth-child(1){min-width:60px}',
  '[data-pay-date] .sis-tpd-cell:nth-child(2){min-width:44px}',
  '[data-pay-date] .sis-tpd-cell:nth-child(3){min-width:56px}',
].join('\n');

const GROUPS = ['REGISTRATION', 'OTHER_FEES'] as const;

export function PayFeesDialog({
  open,
  onOpenChange,
  categories,
  loading,
  submitting,
  error,
  methods,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: PayFeesCategory[];
  loading: boolean;
  submitting: boolean;
  error: string | null;
  methods: readonly string[];
  onSubmit: (submission: PayFeesSubmission) => void;
}) {
  /**
   * One amount per fee, keyed by feeKey. A STRING, and ABSENT rather than 0
   * when untouched: '' is what "left empty" looks like and it is the thing
   * submit skips, whereas a number would make an untouched row
   * indistinguishable from one somebody deliberately zeroed, since Number('')
   * is 0.
   */
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [entryDate, setEntryDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  // Reset on every open, so a dialog reopened after a save never shows the
  // amounts from last time against figures that have since changed.
  useEffect(() => {
    if (!open) return;
    setAmounts({});
    setPaymentMethod('');
    setEntryDate(new Date().toISOString().split('T')[0]);
  }, [open]);

  /**
   * Digits only, and never more than this fee's own outstanding balance. The
   * cap is applied to the VALUE rather than shown as a warning beside it: an
   * amount that cannot be recorded should not be typable, and the server
   * refuses it anyway, so leaving it in the box only defers the refusal.
   */
  const setAmount = (fee: PayFeesCategory, raw: string) => {
    const digits = raw.replace(/[^\d]/g, '');
    const next = digits === '' ? '' : String(Math.min(Number(digits), fee.owing));
    setAmounts((prev) => ({ ...prev, [fee.key]: next }));
  };

  /** What this submit would record — to check against the cash in hand. */
  const total = useMemo(
    () => categories.reduce((sum, c) => {
      if (!c.payable || c.owing <= 0) return sum;
      const n = Number(amounts[c.key]);
      return Number.isFinite(n) && n > 0 ? sum + Math.round(n) : sum;
    }, 0),
    [categories, amounts],
  );

  const submit = () => {
    const entries = categories
      .filter((c) => c.payable && c.owing > 0)
      .map((c) => ({ feeKey: c.key, amount: Math.round(Number(amounts[c.key])) }))
      .filter((e) => Number.isFinite(e.amount) && e.amount > 0);
    onSubmit({ entries, entryDate, paymentMethod, total });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 'min(880px, calc(100vw - 2rem))', padding: 0, gap: 0 }}>
        {/* Only the table's cell rules are left in CSS -- padding on every th/td,
            a sticky thead, the group rows. None of that is expressible inline,
            and none of it is what sizes the dialog. */}
        <style>{PAY_FEES_CSS}</style>

        {/* LEFT-ALIGNED and short. DialogHeader carries shadcn's
            "text-center sm:text-left", so on a phone — the one width where space
            is actually scarce — it was centring a 146-character paragraph across
            four lines. An inline textAlign beats the class, and the sentence now
            says the only thing somebody opening this needs to be told: put
            numbers in. What it used to explain (each row becomes its own tagged
            payment, all of them or none) is true, but it describes the mechanism
            rather than the task, and it spent about 60px of the table's room
            saying so. */}
        <div style={HEAD}>
          <DialogHeader style={{ textAlign: 'left' }}>
            <DialogTitle>Pay Fees</DialogTitle>
            <DialogDescription>Enter amounts received for each fee.</DialogDescription>
          </DialogHeader>
        </div>

        <div style={BODY} data-role="pay-body">
          {loading ? (
            <ContentLoader minHeight={140} />
          ) : categories.length === 0 ? (
            <p className="text-sm text-gray-500" style={{ paddingTop: '0.5rem' }}>
              This student has no fee categories yet.
            </p>
          ) : (
            /* overflowX on the wrapper, so a long fee name scrolls the table
               inside its own box rather than widening the dialog. */
            <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflowX: 'auto' }}>
              <table data-pay-table="">
                <thead>
                  <tr>
                    {/* No width, so Fee is the column that absorbs slack on a
                        wide dialog — which is where extra room is actually
                        useful, since names are the only content here that wants
                        to be on one line. On a phone it falls back to its
                        longest word (break-word below) and the Paid input's
                        minWidth holds the rest. Pinning Fee at 100 instead sent
                        every spare desktop pixel to Paid: measured a 415px
                        numeric input on an 836px dialog. */}
                    <th>Fee</th>
                    {/* 1% is the shrink-to-fit idiom for an auto-layout table:
                        an absurdly small width a nowrap column cannot honour, so
                        it settles at its content and hands the slack on. Without
                        it, pinning Fee above sent every spare pixel here instead
                        — measured 560px of Total on a 836px dialog, with the fee
                        names wrapping at 95px beside it. */}
                    <th data-pay-num="" style={{ width: '1%' }}>Total</th>
                    <th data-pay-num="" style={{ width: 132 }}>Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {/* EVERY fee in this student's structure, both groups,
                      including the ones with nothing left to pay. A group with
                      no fees renders nothing at all rather than a heading over
                      an empty list: a school with no registration fee is
                      perfectly valid. */}
                  {GROUPS.flatMap((g) => {
                    const inGroup = categories.filter((c) => (c.group ?? 'OTHER_FEES') === g);
                    if (inGroup.length === 0) return [];
                    return [
                      <tr key={`hdr-${g}`} data-pay-group="">
                        <td colSpan={3}>{g === 'REGISTRATION' ? 'Registration' : 'Other Fees'}</td>
                      </tr>,
                      ...inGroup.map((c) => {
                        // Settled and unpayable are different facts and the
                        // placeholder says which; both lock the row, because
                        // neither can legally take money.
                        //
                        // The placeholders are as short as they can be because
                        // this input is the narrowest thing in the dialog and
                        // an ellipsis is worse than a terser word: "Completed"
                        // read as "Comp..." and "Owing 70,000" as "Owin...",
                        // which is the one number somebody needs. The column
                        // header already says Paid, so the amount can stand on
                        // its own without repeating "Owing" in front of it.
                        const settled = c.owing <= 0;
                        const locked = settled || !c.payable;
                        return (
                          <tr key={c.key}>
                            {/* break-word, NOT anywhere. `anywhere` also counts
                                toward min-content, so the browser was free to
                                squeeze this column to a single character and
                                did: at 375px it collapsed to 69px and split
                                names mid-word — "Registrat/ion Fee",
                                "Admissio/n Levy". break-word keeps the column
                                at least as wide as its longest word and only
                                breaks inside one that genuinely cannot fit. */}
                            <td className="text-sm" style={{ overflowWrap: 'break-word' }}>{c.name}</td>
                            <td className="text-sm" data-pay-num="">{c.charged.toLocaleString()}</td>
                            <td data-pay-num="">
                              <Input
                                type="text"
                                inputMode="numeric"
                                aria-label={`Amount paid for ${c.name}`}
                                value={locked ? '' : (amounts[c.key] ?? '')}
                                onChange={(e) => setAmount(c, e.target.value)}
                                disabled={locked}
                                placeholder={
                                  settled ? 'Paid'
                                    : !c.payable ? 'Unavailable'
                                    : c.owing.toLocaleString()
                                }
                                // The floor that keeps this readable on a
                                // phone: a min-width on the control raises the
                                // cell's min-content, which is what makes the
                                // COLUMN at least this wide. 92 is the ceiling
                                // on that floor — it fits '125,000' (about 80px
                                // of text plus the input's own padding), and 120
                                // pushed the table's min-content past a 375px
                                // screen and started it scrolling sideways.
                                style={{ textAlign: 'right', minWidth: 92 }}
                              />
                            </td>
                          </tr>
                        );
                      }),
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Everything the whole hand-over shares, plus the commit. One date and
            one method cover every row: this is one person handing over money
            once, not several transactions. */}
        <div style={FOOT}>
          {/* STACKED, not side by side. Sharing the row gave each of these
              about 163px, which is not enough for either: the label truncated
              to "Payment Meth..." and the date's three cells were squeezed to
              roughly 50px each. A full-width field costs one more line of the
              footer and makes both legible at 375px. flex-wrap would only have
              helped once they were narrow enough to be unreadable anyway. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ minWidth: 0 }} data-pay-date="">
              <Label>Date</Label>
              <ThreePartDateInput
                value={entryDate}
                onChange={(v) => setEntryDate(v ?? '')}
                aria-label="Payment date"
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                <SelectContent>
                  {methods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <p className="text-sm" style={{ color: '#B91C1C', marginTop: '0.6rem' }}>{error}</p>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <span className="text-sm" style={{ color: '#374151' }}>
              Total being paid <strong>{total.toLocaleString()}</strong> FCFA
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <DialogClose asChild>
                <Button variant="outline" disabled={submitting}>Cancel</Button>
              </DialogClose>
              {/* Disabled until something would actually be recorded — an
                  enabled button that can only produce "enter an amount" is a
                  button that lies about being ready. */}
              <Button onClick={submit} disabled={submitting || total <= 0}>
                {submitting ? 'Saving…' : 'Record Payment'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
