'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from './ui/button';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ThreePartDateInput } from './ThreePartDateInput';
import { DialogSizing, dialogWidth } from './dialogSizing';

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
  /* The footer's two controls sit side by side and wrap to their own lines when
     there is no room, which is what keeps the foot short on a narrow phone. */
  '[data-pay-when]{display:flex;gap:.75rem;flex-wrap:wrap}',
  '[data-pay-when] > *{flex:1 1 150px;min-width:0}',
  '[data-pay-commit]{display:flex;align-items:center;gap:.75rem;',
  '  flex-wrap:wrap;margin-top:.75rem}',
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
  methods: string[];
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
      <DialogContent data-dialog-frame="" style={dialogWidth(880)}>
        <DialogSizing />
        <style>{PAY_FEES_CSS}</style>

        <div data-dialog-head="">
          <DialogHeader>
            <DialogTitle>Pay Fees</DialogTitle>
            <DialogDescription>
              Enter what was received against each fee. Every row with an amount becomes its
              own payment, tagged to that fee — recorded together, or not at all.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div data-dialog-body="" data-role="pay-body">
          {loading ? (
            <p className="text-sm text-gray-500" style={{ paddingTop: '0.5rem' }}>Loading fees…</p>
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
                    <th>Fee</th>
                    <th data-pay-num="">Total</th>
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
                        const settled = c.owing <= 0;
                        const locked = settled || !c.payable;
                        return (
                          <tr key={c.key}>
                            <td className="text-sm" style={{ overflowWrap: 'anywhere' }}>{c.name}</td>
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
                                  settled ? 'Completed'
                                    : !c.payable ? 'Unavailable'
                                    : `Owing ${c.owing.toLocaleString()}`
                                }
                                style={{ textAlign: 'right' }}
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
        <div data-dialog-foot="">
          <div data-pay-when="">
            <div>
              <Label>Date</Label>
              <ThreePartDateInput
                value={entryDate}
                onChange={(v) => setEntryDate(v ?? '')}
                aria-label="Payment date"
              />
            </div>
            <div>
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

          <div data-pay-commit="">
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
