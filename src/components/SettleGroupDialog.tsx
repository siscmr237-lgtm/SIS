'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ThreePartDateInput } from './ThreePartDateInput';
import { PAYMENT_METHODS } from '../utils/paymentMethods';

/**
 * Settle every outstanding category in one fee group, in one action.
 *
 * NOTHING IS COMPUTED HERE. The plan — which categories, at what amounts, for
 * what total — is fetched from GET .../group-settlement and displayed as
 * received. The server recomputes it again at write time, on purpose: between
 * this dialog opening and somebody pressing the button, another admin may have
 * recorded a payment, and writing the figures this screen remembers would
 * overpay. Duplicating that arithmetic here would give two answers that drift.
 *
 * The POST writes REAL payments — one per category, each tagged to its own fee,
 * each at that category's own outstanding amount. Afterwards they are ordinary
 * payments: each shows on its own line and each deletes on its own. This dialog
 * sets no flag and zeroes no balance.
 *
 * Confirmation is a step, not a checkbox. The first screen shows what would be
 * recorded and offers no way to write; pressing Continue moves to a second
 * screen that states the total again and asks for it explicitly. Somebody who
 * clicked through without reading has still been shown the number twice.
 */

type FeeGroup = 'REGISTRATION' | 'OTHER_FEES';

const GROUP_LABEL: Record<FeeGroup, string> = {
  REGISTRATION: 'Registration',
  OTHER_FEES: 'Other Fees',
};

interface Plan {
  group: FeeGroup;
  categories: { key: string; name: string; owing: number }[];
  alreadySettled: string[];
  notPayable: string[];
  total: number;
  count: number;
}

export function SettleGroupDialog({
  open,
  onOpenChange,
  studentCode,
  studentName,
  group,
  onSettled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentCode: string;
  studentName: string;
  group: FeeGroup;
  /** Fired after a successful write so the caller can refresh its figures. */
  onSettled: (recorded: number, total: number) => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entryDate, setEntryDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState('');

  useEffect(() => {
    if (!open) return;
    setPlan(null);
    setError(null);
    setConfirming(false);
    setEntryDate(today);
    setPaymentMethod('');
    setLoading(true);
    api
      .get(`/ledger/student/${encodeURIComponent(studentCode)}/group-settlement?group=${group}`)
      .then((r: any) => setPlan(r as Plan))
      .catch((e: any) => setError(e?.message || 'Could not work out what is outstanding.'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, studentCode, group]);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res: any = await api.post(
        `/ledger/student/${encodeURIComponent(studentCode)}/group-settlement`,
        { group, entryDate, paymentMethod: paymentMethod || undefined, confirm: true },
      );
      onSettled(res?.recorded ?? 0, res?.total ?? 0);
      onOpenChange(false);
    } catch (e: any) {
      // 409 is not a failure. It means somebody else settled this in the
      // meantime, or it was never outstanding — a true statement about the
      // account, not an error to apologise for. Shown as the empty state.
      if (e?.code === 'NOTHING_OUTSTANDING' || /nothing is outstanding/i.test(e?.message ?? '')) {
        setPlan((p) => (p ? { ...p, count: 0, categories: [], total: 0 } : p));
        setConfirming(false);
      } else {
        setError(e?.message || 'Could not record these payments.');
      }
    } finally {
      setSaving(false);
    }
  };

  const label = GROUP_LABEL[group];
  const nothing = plan !== null && plan.count === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Width inline because max-w-md is not in the frozen stylesheet and
          renders as nothing. The height cap comes from DialogContent itself. */}
      <DialogContent style={{ maxWidth: 'min(448px, calc(100vw - 2rem))', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle>Settle {label}</DialogTitle>
          <DialogDescription>
            {confirming
              ? 'This records a payment for each category below.'
              : `Everything still outstanding in ${label} for ${studentName}.`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-gray-500">Working out what is outstanding...</p>
        ) : nothing ? (
          <div>
            <p className="text-sm" style={{ color: '#05603d', fontWeight: 500 }}>
              Nothing outstanding in {label}.
            </p>
            <p className="text-xs text-gray-500" style={{ marginTop: 4 }}>
              {plan?.alreadySettled?.length
                ? `Already settled: ${plan.alreadySettled.join(', ')}.`
                : `This student has no ${label.toLowerCase()} charges to settle.`}
            </p>
          </div>
        ) : plan ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
              {plan.categories.map((c) => (
                <div
                  key={c.key}
                  style={{
                    display: 'flex', justifyContent: 'space-between', gap: '1rem',
                    padding: '0.5rem 0.75rem', borderBottom: '1px solid #F3F4F6',
                  }}
                >
                  <span className="text-sm">{c.name}</span>
                  <span className="text-sm" style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {c.owing.toLocaleString()} FCFA
                  </span>
                </div>
              ))}
              <div
                style={{
                  display: 'flex', justifyContent: 'space-between', gap: '1rem',
                  padding: '0.55rem 0.75rem', backgroundColor: '#F9FAFB',
                }}
              >
                <span className="text-sm" style={{ fontWeight: 600 }}>
                  Total ({plan.count} payment{plan.count === 1 ? '' : 's'})
                </span>
                <span className="text-sm" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {plan.total.toLocaleString()} FCFA
                </span>
              </div>
            </div>

            {/* Named rather than silently omitted — otherwise the total looks
                wrong to anyone who knows the category exists. */}
            {plan.notPayable.length > 0 && (
              <p className="text-xs" style={{ color: '#B45309' }}>
                Not included, cannot be paid against directly: {plan.notPayable.join(', ')}.
              </p>
            )}
            {plan.alreadySettled.length > 0 && (
              <p className="text-xs text-gray-500">
                Already settled: {plan.alreadySettled.join(', ')}.
              </p>
            )}

            {!confirming ? (
              <>
                <div>
                  <Label className="text-xs text-gray-500 mb-1">Date received</Label>
                  <ThreePartDateInput value={entryDate} onChange={(v) => setEntryDate(v ?? '')} aria-label="Date received" />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1">Payment method (optional)</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue placeholder="Not recorded" /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <div
                style={{
                  border: '1px solid #FDE68A', backgroundColor: '#FFFBEB',
                  borderRadius: 8, padding: '0.7rem 0.85rem',
                }}
              >
                <p className="text-sm" style={{ fontWeight: 600, color: '#92400E' }}>
                  Record {plan.count} payment{plan.count === 1 ? '' : 's'} totalling{' '}
                  {plan.total.toLocaleString()} FCFA?
                </p>
                <p className="text-xs" style={{ color: '#92400E', marginTop: 4 }}>
                  Each is recorded separately against its own fee, dated {entryDate}. They appear in
                  Student Transactions like any other payment and can be deleted individually.
                </p>
              </div>
            )}

            {error && <p className="text-sm" style={{ color: '#B91C1C' }}>{error}</p>}
          </div>
        ) : (
          error && <p className="text-sm" style={{ color: '#B91C1C' }}>{error}</p>
        )}

        <div className="flex justify-end gap-2">
          {nothing ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          ) : confirming ? (
            <>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={saving}>
                Back
              </Button>
              <Button onClick={submit} disabled={saving}>
                {saving ? 'Recording...' : `Yes, record ${plan?.total.toLocaleString()} FCFA`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => setConfirming(true)} disabled={loading || !plan || !entryDate}>
                Continue
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
