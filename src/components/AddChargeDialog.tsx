'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSisCache } from '@/lib/SisCache';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';

/**
 * Raising a ONE-OFF charge against a student — a fine, a trip, a replaced book.
 *
 * ITS OWN DIALOG, off its own menu item. It spent a while as a section at the
 * bottom of Edit This Student's Fees, on the reasoning that both are "this
 * student's money". That put two unrelated actions behind one button, and the
 * one you had not come for was the one that wrote immediately: the fee rows
 * above it are a draft until Save, while Add charge posted the moment it was
 * pressed. Two different commit models on one screen is a bad thing to ask
 * anybody to hold in their head, and the menu item had to be called "Edit Fees /
 * Add Charge" — which is what a screen doing two jobs is forced to call itself.
 *
 * A CHARGE IS NOT A FEE, and this separation is the honest expression of that.
 * It posts to /ledger/charge with NO fee linkage, so it lands as a standalone
 * ledger line: it never becomes a StudentFeeOverride row and therefore cannot
 * flip feesOverridden. That matters — a fine has nothing to do with which fees a
 * student is billed, and settling it through the structure would silently
 * convert a student on standard class fees to custom ones. It becomes payable on
 * its own straight away, through the settlesEntryId link Record Payment uses.
 *
 * Fields stack rather than sitting in a row. Three inputs across were already
 * wrapping awkwardly inside the fees dialog, and a dialog this narrow on a phone
 * has no room for them side by side.
 *
 * Inline styles: src/index.css is a pre-compiled Tailwind artifact, so a utility
 * class not already in it renders as nothing at all, silently.
 */

const RED = '#B91C1C';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The student's code, as the ledger endpoint identifies them. */
  studentCode: string;
  studentName: string;
  /**
   * Called after a charge is posted, so the profile re-reads the ledger and the
   * per-category owing figures. The charge is already written by then — this is
   * a refresh, not a confirmation step.
   */
  onAdded: () => void;
}

export function AddChargeDialog({ open, onOpenChange, studentCode, studentName, onAdded }: Props) {
  const cache = useSisCache();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cleared on open, not on close. Closing mid-typing and reopening should give
  // a fresh form, but wiping it during the closing animation is visible.
  useEffect(() => {
    if (!open) return;
    setName('');
    setAmount('');
    setNote('');
    setError(null);
  }, [open]);

  const submit = async () => {
    if (busy) return;
    const amt = Number(amount);
    if (!name.trim()) {
      setError('Give the charge a name.');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // No fee linkage sent, so this lands as a standalone charge. That is what
      // keeps the student's fee structure — and feesOverridden — untouched.
      await api.post('/ledger/charge', {
        studentId: studentCode,
        description: name.trim(),
        note: note.trim() || undefined,
        amount: Math.round(amt),
        entryDate: new Date().toISOString().split('T')[0],
      });
      cache.invalidateOn('ledger:write');
      toast.success(
        `“${name.trim()}” charged to ${studentName} — ${Math.round(amt).toLocaleString()} FCFA`,
      );
      onAdded();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || 'Could not add the charge.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a charge</DialogTitle>
          <DialogDescription>
            A one-off charge such as a fine or a replaced book. It does not change{' '}
            {studentName}’s fee structure, and it can be paid on its own.
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingTop: 4 }}>
          <div>
            <Label htmlFor="charge-name">Charge name</Label>
            <Input
              id="charge-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder="e.g. Broken window"
              disabled={busy}
              style={{ marginTop: 6 }}
            />
          </div>
          <div>
            <Label htmlFor="charge-amount">Amount</Label>
            <Input
              id="charge-amount"
              type="number"
              min="1"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null); }}
              placeholder="0"
              disabled={busy}
              style={{ marginTop: 6 }}
            />
          </div>
          <div>
            <Label htmlFor="charge-note">Description</Label>
            <Input
              id="charge-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason (optional)"
              disabled={busy}
              style={{ marginTop: 6 }}
            />
          </div>
        </div>

        {error && <p className="text-sm" style={{ color: RED, marginTop: 8 }}>{error}</p>}

        <div className="flex justify-end mt-4">
          <Button onClick={submit} disabled={busy}>
            {busy ? 'Adding...' : 'Add charge'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
