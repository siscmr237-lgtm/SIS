'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
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

interface Row {
  name: string;
  amount: string;
  /**
   * Carried, never edited here — see the note in save(). '' means the category
   * asks nothing upfront, which is what a row added on this screen has.
   */
  firstInstallmentAmount: string;
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

/**
 * CHARGES ARE NOT RAISED HERE. They were, as a section at the bottom, and the
 * menu item had to be called "Edit Fees / Add Charge" to admit it — the name a
 * screen doing two jobs is forced to give itself.
 *
 * Worse than the name: the two halves committed differently. Everything above
 * is a draft until Save, while Add charge posted the instant it was pressed, so
 * one screen asked somebody to hold two commit models at once. A charge is also
 * not a fee — it carries no fee linkage precisely so that raising one cannot
 * flip a student onto custom fees — which makes the shared screen a claim about
 * the data that was not true. See AddChargeDialog, which owns it now.
 */
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
            firstInstallmentAmount:
              f.firstInstallmentAmount != null ? String(f.firstInstallmentAmount) : '',
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
    setRows(rs => [...rs, { name: '', amount: '0', firstInstallmentAmount: '' }]);
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
    }
    setSaving(true);
    try {
      await api.put(`/students/${encodeURIComponent(studentCode)}/fee-override`, {
        fees: rows.map(r => ({
          name: r.name.trim(),
          amount: Math.round(Number(r.amount)),
          // Sent back exactly as it was loaded. This dialog no longer EDITS the
          // first-installment rule — that lives in the First Installment dialog
          // under Classes now — but it must still carry the existing value
          // through, or saving an amount here would silently wipe a rule set
          // somewhere else. A row added here has no rule yet, which is correct:
          // null means "asks nothing upfront", not "a requirement of 0".
          //
          // Clamped on the way out, because lowering a waived amount BELOW an
          // inherited requirement is exactly what this dialog is for — a
          // scholarship dropping tuition to 5,000 must not leave a 15,000
          // requirement standing on it, which the server would refuse and which
          // no screen here would explain.
          firstInstallmentAmount: r.firstInstallmentAmount.trim() === ''
            ? null
            : Math.min(Number(r.firstInstallmentAmount), Math.round(Number(r.amount))),
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
      {/* Fixed head, scrolling middle, fixed foot — see dialogSizing for why the
          height cap is a stylesheet rule and not an inline style. The fee rows
          are the only part that can grow without limit, so they are the only
          part that scrolls; Save stays on screen at every viewport height. */}
      <DialogContent style={{ maxWidth: 'min(680px, calc(100vw - 2rem))', padding: 0, gap: 0 }}>
        <div style={HEAD}>
          <DialogHeader>
            <DialogTitle>{wasOverridden ? 'Custom fees' : 'Edit this student’s fees'}</DialogTitle>
            {wasOverridden && (
              <DialogDescription>
                {studentName} is on a custom fee structure and does not follow {classLevel} fee changes.
              </DialogDescription>
            )}
          </DialogHeader>
          {/* The column heads belong with the title, not with the rows: they
              have to stay put while the rows move under them. */}
          {!loading && (
            <div
              className="flex items-center gap-2 text-sm text-gray-500"
              style={{ paddingBottom: 6, borderBottom: '1px solid #E5E7EB', marginTop: 12 }}
            >
              <span style={{ flex: 1 }}>Fee</span>
              <span style={{ width: 120, textAlign: 'right' }}>Amount</span>
              <span style={{ width: 32 }} />
            </div>
          )}
        </div>

        {loading ? (
          <div style={BODY}>
            <p className="text-sm text-gray-500 py-4">Loading fees...</p>
          </div>
        ) : (
          <>
            {/* No maxHeight of its own any more. The frame decides how tall the
                scrolling area is, and a fixed 300px inside a box that already
                scrolls gave two nested scrollbars where the outer one moved and
                the rows stayed where they were. */}
            <div className="space-y-2" data-role="fee-rows" style={{ ...BODY, paddingTop: 8 }}>
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

            <div style={FOOT}>
            <div className="flex items-center justify-between" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
              <Button variant="outline" size="sm" onClick={addRow} className="flex items-center gap-2">
                <Plus size={16} />
                Add Fee
              </Button>
              <p className="text-sm text-gray-500">
                Total for this student: <strong>{total.toLocaleString()}</strong>
              </p>
            </div>

            {error && <p className="text-sm mt-2" style={{ color: '#B91C1C' }}>{error}</p>}

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
              <div
                className="flex items-center justify-between mt-4"
                style={{ gap: '0.75rem', flexWrap: 'wrap' }}
              >
                <div>
                  {wasOverridden && (
                    <Button variant="outline" size="sm" onClick={() => setConfirmRemove(true)}>
                      Use standard {classLevel} fees
                    </Button>
                  )}
                </div>
                <div className="flex gap-2" style={{ marginLeft: 'auto' }}>
                  <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button onClick={save} disabled={saving}>
                    {saving ? 'Saving...' : wasOverridden ? 'Save Fees' : 'Detach and Save'}
                  </Button>
                </div>
              </div>
            )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
