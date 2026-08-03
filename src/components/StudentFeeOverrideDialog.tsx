'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSisCache } from '@/lib/SisCache';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Editor for ONE student's personal fee structure — a scholarship, a staff
 * child, a partial waiver.
 *
 * Opening it on a student who is still on standard fees pre-fills their class
 * level's current categories and amounts, so the admin adjusts DOWN from the
 * standard rather than rebuilding it. Saving detaches them: from then on their
 * bill is described entirely by these rows and class-level fee changes no longer
 * reach them automatically.
 *
 * Inline styles for the notices because src/index.css is a pre-compiled Tailwind
 * build and an arbitrary colour utility would silently render as nothing.
 */

interface Row {
  name: string;
  amount: string;
  included: boolean;
  percent: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentCode: string;
  studentName: string;
  /** Whether the student is already detached when the dialog opens. */
  overridden: boolean;
  /** Called after a successful save or removal so the profile can refresh. */
  onChanged: () => void;
}

export function StudentFeeOverrideDialog({
  open, onOpenChange, studentCode, studentName, overridden, onChanged,
}: Props) {
  const cache = useSisCache();
  const [rows, setRows] = useState<Row[]>([]);
  const [classLevel, setClassLevel] = useState('');
  const [wasOverridden, setWasOverridden] = useState(overridden);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A background load must not discard edits in progress.
  const dirty = useRef(false);

  useEffect(() => {
    if (!open) { setConfirmRemove(false); return; }
    let alive = true;
    setLoading(true);
    setError(null);
    dirty.current = false;
    api
      .get(`/students/${encodeURIComponent(studentCode)}/fee-override`)
      .then((r: any) => {
        if (!alive || dirty.current) return;
        setClassLevel(r?.classLevel ?? '');
        setWasOverridden(Boolean(r?.overridden));
        setRows(
          (r?.fees ?? []).map((f: any) => ({
            name: f.name,
            amount: String(f.amount ?? 0),
            included: f.firstInstallmentPercent != null,
            percent: f.firstInstallmentPercent != null ? String(f.firstInstallmentPercent) : '100',
          })),
        );
      })
      .catch((e: any) => { if (alive) setError(e?.message || 'Could not load this student’s fees.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, studentCode]);

  const edit = (i: number, patch: Partial<Row>) => {
    dirty.current = true; setError(null);
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const addRow = () => {
    dirty.current = true; setError(null);
    setRows(rs => [...rs, { name: '', amount: '0', included: false, percent: '100' }]);
  };
  const removeRow = (i: number) => {
    dirty.current = true; setError(null);
    setRows(rs => rs.filter((_, idx) => idx !== i));
  };

  const total = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const save = async () => {
    if (saving) return;
    setError(null);
    const seen = new Set<string>();
    for (const r of rows) {
      const name = r.name.trim();
      if (!name) { setError('Every fee needs a name.'); return; }
      if (seen.has(name.toLowerCase())) { setError(`Duplicate fee name "${name}".`); return; }
      seen.add(name.toLowerCase());
      const amt = Number(r.amount);
      if (!Number.isFinite(amt) || amt < 0) { setError(`"${name}": amount must be 0 or more.`); return; }
      if (r.included) {
        const p = Number(r.percent);
        if (!r.percent.trim() || !Number.isFinite(p) || p < 0 || p > 100) {
          setError(`"${name}": first installment % must be between 0 and 100.`);
          return;
        }
      }
    }
    setSaving(true);
    try {
      await api.put(`/students/${encodeURIComponent(studentCode)}/fee-override`, {
        fees: rows.map(r => ({
          name: r.name.trim(),
          amount: Math.round(Number(r.amount)),
          firstInstallmentPercent: r.included ? Math.round(Number(r.percent)) : null,
        })),
      });
      dirty.current = false;
      // Their charges changed, so the roster's status and the ledger are stale.
      cache.invalidateOn('ledger:write');
      toast.success(`${studentName} now has a custom fee structure`);
      onChanged();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || 'Could not save these fees.');
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = async () => {
    if (removing) return;
    setError(null);
    setRemoving(true);
    try {
      await api.delete(`/students/${encodeURIComponent(studentCode)}/fee-override`);
      dirty.current = false;
      cache.invalidateOn('ledger:write');
      toast.success(`${studentName} is back on standard ${classLevel} fees`);
      onChanged();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || 'Could not remove the override.');
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 680 }}>
        <DialogHeader>
          <DialogTitle>{wasOverridden ? 'Custom fees' : 'Edit this student’s fees'}</DialogTitle>
          <DialogDescription>
            {wasOverridden
              ? `${studentName} is on a custom fee structure and does not follow ${classLevel} fee changes.`
              : `Saving detaches ${studentName} from standard ${classLevel} fees. Their fees become their own, and later ${classLevel} changes will not apply to them automatically.`}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-gray-500 py-4">Loading fees...</p>
        ) : (
          <>
            {!wasOverridden && (
              <div
                style={{
                  padding: '0.625rem 0.75rem', borderRadius: 8,
                  border: '1px solid #BFDBFE', backgroundColor: '#EFF6FF',
                  color: '#1E3A8A', fontSize: '0.8125rem',
                }}
              >
                Pre-filled with the current {classLevel} fees — adjust the amounts down, or
                remove categories this student should not pay.
              </div>
            )}

            <div
              className="flex items-center gap-2 text-sm text-gray-500"
              style={{ paddingBottom: 6, borderBottom: '1px solid #E5E7EB', marginTop: 12 }}
            >
              <span style={{ flex: 1 }}>Fee</span>
              <span style={{ width: 120, textAlign: 'right' }}>Amount</span>
              <span style={{ width: 150, textAlign: 'center' }}>First installment</span>
              <span style={{ width: 32 }} />
            </div>

            <div className="space-y-2" style={{ maxHeight: 300, overflowY: 'auto', paddingTop: 8 }}>
              {rows.length === 0 && (
                <p className="text-sm text-gray-500">
                  No fees — this student would owe nothing. Add one below if that is not intended.
                </p>
              )}
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    style={{ flex: 1 }}
                    placeholder="Fee name"
                    value={r.name}
                    onChange={e => edit(i, { name: e.target.value })}
                  />
                  <Input
                    type="number"
                    min={0}
                    style={{ width: 120, textAlign: 'right' }}
                    value={r.amount}
                    onChange={e => edit(i, { amount: e.target.value })}
                  />
                  <div className="flex items-center gap-1" style={{ width: 150, justifyContent: 'center' }}>
                    <input
                      type="checkbox"
                      checked={r.included}
                      onChange={e => edit(i, { included: e.target.checked })}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                      aria-label={`Include ${r.name || 'this fee'} in first installment`}
                    />
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={r.included ? r.percent : ''}
                      onChange={e => edit(i, { percent: e.target.value })}
                      disabled={!r.included}
                      placeholder="—"
                      style={{ width: 72, textAlign: 'right' }}
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(i)}
                    aria-label={`Remove ${r.name || 'fee'}`}
                    style={{ width: 32 }}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between mt-3">
              <Button variant="outline" size="sm" onClick={addRow} className="flex items-center gap-2">
                <Plus size={16} />
                Add Fee
              </Button>
              <p className="text-sm text-gray-500">
                Total for this student: <strong>{total.toLocaleString()}</strong>
              </p>
            </div>

            {error && <p className="text-sm mt-3" style={{ color: '#B91C1C' }}>{error}</p>}

            {confirmRemove ? (
              <div
                style={{
                  marginTop: '1rem', padding: '0.75rem 0.875rem', borderRadius: 8,
                  border: '1px solid #FCA5A5', backgroundColor: '#FEF2F2',
                  color: '#7F1D1D', fontSize: '0.8125rem',
                }}
              >
                <p style={{ fontWeight: 600, marginBottom: 4 }}>
                  Discard {studentName}’s custom fees?
                </p>
                <p style={{ marginBottom: 8 }}>
                  They go back onto standard {classLevel} fees and their existing charges are
                  re-billed at the full amounts. Their custom setup cannot be recovered, and if
                  they had paid a reduced fee they may show as owing again.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="destructive" size="sm" onClick={removeOverride} disabled={removing}>
                    {removing ? 'Removing...' : 'Yes, use standard fees'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmRemove(false)} disabled={removing}>
                    Keep custom fees
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between mt-5">
                <div>
                  {wasOverridden && (
                    <Button variant="outline" size="sm" onClick={() => setConfirmRemove(true)}>
                      Use standard {classLevel} fees
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button onClick={save} disabled={saving}>
                    {saving ? 'Saving...' : wasOverridden ? 'Save Fees' : 'Detach and Save'}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
