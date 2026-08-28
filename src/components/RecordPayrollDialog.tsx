'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useSisCache } from '../lib/SisCache';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { ThreePartDateInput } from './ThreePartDateInput';
import { PAYMENT_METHODS } from '../utils/paymentMethods';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { ContentLoader } from './ContentLoader';

/**
 * Record Payroll — one month's pay for one staff member.
 *
 *   net pay = salary portion + bonus − the charges settled out of this run
 *
 * The net is the number the admin is really approving, so it is shown broken
 * down before anything is written, and the same arithmetic is repeated
 * server-side in POST /ledger/staff-payroll. Two implementations of a money
 * figure would eventually disagree; here the server is authoritative and this is
 * a preview of it, which is why every rule below is a mirror of a server check
 * rather than the only place it is enforced.
 *
 * Shared by the Staff list and each staff member's Finance tab. One component
 * rather than two copies: the netting rules are intricate enough that two would
 * drift, and a payroll dialog that behaved differently depending on which screen
 * opened it is exactly the bug that would not be noticed until the money was
 * already out.
 *
 * Styling is largely inline. src/index.css is a pre-compiled Tailwind artifact
 * with no build step behind it, so a utility class that happens not to be in it
 * renders as nothing at all — silently, which for a form about money is not a
 * risk worth taking for shorter markup.
 */

interface PayrollMonth {
  key: string;
  label: string;
  paid: boolean;
  paidOn: string | null;
  paidAmount: number | null;
}

interface OutstandingCharge {
  id: string;
  category: string | null;
  description: string;
  note: string | null;
  amount: number;
  settled: number;
  outstanding: number;
  entryDate: string;
}

interface PayrollData {
  staffId: string;
  staffName: string;
  salary: number;
  academicYear: string;
  months: PayrollMonth[];
  unpaidMonths: PayrollMonth[];
  charges: OutstandingCharge[];
  paymentMethods: string[];
}

interface RecordPayrollDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The staff CODE (STF…), which is what every ledger route addresses. */
  staffCode: string;
  staffName?: string;
  /** Called after a successful run, so the opener can refresh what it shows. */
  onRecorded?: () => void | Promise<void>;
}

function money(n: number) {
  return `${n.toLocaleString()} FCFA`;
}

const fieldGap = { display: 'flex', flexDirection: 'column' as const, gap: '0.35rem' };

export function RecordPayrollDialog({
  open, onOpenChange, staffCode, staffName, onRecorded,
}: RecordPayrollDialogProps) {
  const cache = useSisCache();
  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    category: 'Salary',
    month: '',
    amount: '',
    entryDate: today,
    bonus: '',
    bonusNote: '',
    paymentMethod: 'Cash',
  });
  const [settling, setSettling] = useState<string[]>([]);

  // Loaded fresh every time the dialog opens, never cached: which months are
  // still unpaid and what is still owed are precisely the facts another admin
  // may have changed since this page was rendered, and both decide what the
  // staff member is handed.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setError(null);
    setSettling([]);
    setForm((f) => ({
      ...f, category: 'Salary', month: '', amount: '', entryDate: new Date().toISOString().split('T')[0],
      bonus: '', bonusNote: '', paymentMethod: 'Cash',
    }));
    api.get(`/ledger/staff/${encodeURIComponent(staffCode)}/payroll`)
      .then((res: PayrollData) => {
        if (cancelled) return;
        setData(res);
        // Defaulting the amount to the full salary is the common case and saves
        // retyping it twelve times a year; it stays editable downwards for a
        // part-month or a deduction agreed separately.
        setForm((f) => ({
          ...f,
          month: res.unpaidMonths?.[0]?.key ?? '',
          amount: res.salary ? String(res.salary) : '',
          paymentMethod: res.paymentMethods?.[0] ?? 'Cash',
        }));
      })
      .catch((e: any) => { if (!cancelled) setLoadError(e?.message || 'Failed to load payroll details.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, staffCode]);

  const charges = data?.charges ?? [];
  // The server owns this list (PAYROLL_METHODS); the shared constant is what
  // shows while the fetch is in flight or if it fails.
  const methods = data?.paymentMethods?.length ? data.paymentMethods : PAYMENT_METHODS;

  // The net, and every figure it is built from. Mirrors computeNetPay() in
  // sis-backend/src/utils/staffPayroll.js.
  const net = useMemo(() => {
    const salary = Math.max(0, Math.round(Number(form.amount) || 0));
    const bonus = Math.max(0, Math.round(Number(form.bonus) || 0));
    const settled = charges
      .filter((c) => settling.includes(c.id))
      .reduce((sum, c) => sum + c.outstanding, 0);
    return { salary, bonus, settled, gross: salary + bonus, net: salary + bonus - settled };
  }, [form.amount, form.bonus, settling, charges]);

  const salaryCap = data?.salary ?? 0;
  const overCap = net.salary > salaryCap;
  const noUnpaidMonths = Boolean(data) && (data?.unpaidMonths?.length ?? 0) === 0;

  // Every reason the button is disabled, resolved once so the message under it
  // and the disabled state can never disagree about why.
  const blocker = (() => {
    if (!data || loading) return 'Loading…';
    if (noUnpaidMonths) return `Every month of ${data.academicYear} has already been paid.`;
    if (!form.month) return 'Choose the month being paid.';
    if (net.salary <= 0) return 'Enter the salary amount being paid.';
    if (overCap) return `The salary portion cannot exceed ${money(salaryCap)}. A bonus goes in the bonus field and is not capped.`;
    if (net.bonus > 0 && !form.bonusNote.trim()) return 'Say what the bonus is for.';
    if (net.net < 0) return `The charges selected (${money(net.settled)}) come to more than this month's pay (${money(net.gross)}).`;
    return null;
  })();

  const toggleCharge = (id: string) => {
    setError(null);
    setSettling((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (blocker) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/ledger/staff-payroll', {
        staffId: staffCode,
        category: form.category,
        month: form.month,
        amount: net.salary,
        bonus: net.bonus,
        ...(net.bonus > 0 ? { bonusNote: form.bonusNote.trim() } : {}),
        entryDate: form.entryDate,
        paymentMethod: form.paymentMethod,
        settleChargeIds: settling,
      });
      // Refreshes the staff roster the red dot reads, as well as the student
      // figures — see INVALIDATES in lib/SisCache.tsx.
      cache.invalidateOn('ledger:write');
      onOpenChange(false);
      await onRecorded?.();
    } catch (e: any) {
      setError(e?.message || 'Failed to record payroll.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) { onOpenChange(o); if (!o) setError(null); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Payroll</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.staffName} — ${data.academicYear}. Set salary ${money(data.salary)}.`
              : `Pay ${staffName || 'this staff member'} for a month of the academic year.`}
          </DialogDescription>
        </DialogHeader>

        {loading && <ContentLoader minHeight={140} />}
        {loadError && <p className="text-sm" style={{ color: '#e0552e' }}>{loadError}</p>}

        {data && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', maxHeight: '62vh', overflowY: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={fieldGap}>
                {/* A selector even though there is one option: more categories
                    are expected, and a field that appears later in a different
                    shape is a field people stop reading. */}
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Salary">Salary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div style={fieldGap}>
                <Label>Month</Label>
                <Select
                  value={form.month}
                  onValueChange={(v) => { setError(null); setForm((f) => ({ ...f, month: v })); }}
                  disabled={noUnpaidMonths}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={noUnpaidMonths ? 'All months paid' : 'Select month'} />
                  </SelectTrigger>
                  {/* Only the UNPAID months are offered. A month already paid is
                      absent rather than greyed out — the server rejects it, and
                      the database refuses it outright, so offering it at all
                      would only be offering an error. */}
                  <SelectContent>
                    {data.unpaidMonths.map((m) => (
                      <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={fieldGap}>
                <Label>Salary amount</Label>
                <Input
                  type="number"
                  min={0}
                  max={salaryCap || undefined}
                  value={form.amount}
                  onChange={(e) => { setError(null); setForm((f) => ({ ...f, amount: e.target.value })); }}
                  placeholder="0"
                />
                <span className="text-xs" style={{ color: overCap ? '#e0552e' : '#6B7280' }}>
                  Up to {money(salaryCap)}
                </span>
              </div>
              <div style={fieldGap}>
                <Label>Payment date</Label>
                <ThreePartDateInput
                  value={form.entryDate}
                  onChange={(v) => setForm((f) => ({ ...f, entryDate: v ?? '' }))}
                  aria-label="Payment date"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '0.75rem' }}>
              <div style={fieldGap}>
                <Label>Bonus</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.bonus}
                  onChange={(e) => { setError(null); setForm((f) => ({ ...f, bonus: e.target.value })); }}
                  placeholder="0"
                />
              </div>
              <div style={fieldGap}>
                <Label>What the bonus is for</Label>
                <Input
                  value={form.bonusNote}
                  onChange={(e) => { setError(null); setForm((f) => ({ ...f, bonusNote: e.target.value })); }}
                  placeholder={net.bonus > 0 ? 'e.g. Sports day supervision' : 'Only needed with a bonus'}
                  disabled={net.bonus <= 0}
                />
              </div>
            </div>

            <div style={fieldGap}>
              <Label>Payment method</Label>
              <Select value={form.paymentMethod} onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {methods.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* --- what is being netted off ------------------------------- */}
            <div style={fieldGap}>
              <Label>Charges to settle from this payment</Label>
              {charges.length === 0 ? (
                <p className="text-sm text-gray-500">Nothing outstanding.</p>
              ) : (
                <>
                  <p className="text-xs" style={{ color: '#6B7280' }}>
                    Netting is the only way a staff charge is cleared — it comes out of this
                    month&apos;s pay rather than being collected separately.
                  </p>
                  <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, maxHeight: 170, overflowY: 'auto' }}>
                    {charges.map((c) => (
                      <label
                        key={c.id}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: '0.6rem',
                          padding: '0.55rem 0.7rem', borderBottom: '1px solid #F3F4F6', cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={settling.includes(c.id)}
                          onChange={() => toggleCharge(c.id)}
                          style={{ marginTop: 3, width: 15, height: 15, flexShrink: 0, accentColor: '#0f2345' }}
                        />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="text-sm" style={{ display: 'block' }}>{c.description}</span>
                          <span className="text-xs" style={{ color: '#6B7280' }}>
                            {c.category ?? 'Charge'}
                            {/* Shown only once something has been netted off it
                                already, so a part-settled charge cannot be
                                mistaken for its original amount. */}
                            {c.settled > 0 ? ` · ${money(c.settled)} of ${money(c.amount)} already settled` : ''}
                          </span>
                        </span>
                        <span className="text-sm font-medium" style={{ whiteSpace: 'nowrap', color: '#DC2626' }}>
                          −{money(c.outstanding)}
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* --- the number being approved ------------------------------ */}
            <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '0.7rem 0.8rem', backgroundColor: '#F9FAFB' }}>
              <Row label="Salary" value={money(net.salary)} />
              <Row label="Bonus" value={`+ ${money(net.bonus)}`} />
              <Row label="Charges settled" value={`− ${money(net.settled)}`} muted={net.settled === 0} />
              <div style={{ borderTop: '1px solid #E5E7EB', marginTop: '0.45rem', paddingTop: '0.45rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span className="text-sm font-medium">Net pay</span>
                  <span
                    className="font-medium"
                    style={{ fontSize: '1.05rem', color: net.net < 0 ? '#e0552e' : '#05603d' }}
                  >
                    {money(net.net)}
                  </span>
                </div>
                <p className="text-xs" style={{ color: '#6B7280', marginTop: 2 }}>
                  What {data.staffName.split(' ')[0]} actually receives.
                </p>
              </div>
            </div>

            {error && <p className="text-sm" style={{ color: '#e0552e' }}>{error}</p>}
            {!error && blocker && blocker !== 'Loading…' && (
              <p className="text-xs" style={{ color: '#6B7280' }}>{blocker}</p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || Boolean(blocker)}>
            {submitting ? 'Recording…' : 'Record Payroll'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '1px 0' }}>
      <span className="text-sm" style={{ color: '#6B7280' }}>{label}</span>
      <span className="text-sm" style={{ color: muted ? '#9CA3AF' : '#111827' }}>{value}</span>
    </div>
  );
}
