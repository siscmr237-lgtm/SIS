'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSisCache } from '@/lib/SisCache';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner';

/**
 * How much of each fee has to be paid upfront — the first-installment rule for
 * one class level.
 *
 * SPLIT OUT FROM THE FEE CATEGORIES DIALOG, because the two answer different
 * questions and were being asked at once. That dialog decides what a level
 * CHARGES; this one decides how much of each charge is due by the deadline.
 * Interleaving them put a checkbox, a percentage box and a "%" label on every
 * row of a table whose actual job was a name and an amount, and the row that
 * mattered — the amount — got the least space on screen.
 *
 * AN AMOUNT, NOT A PERCENTAGE. A school knows what it wants upfront in money
 * ("30,000 of the tuition by September"); it does not think in shares of a
 * figure it also chose. The percentage had to be back-computed by whoever typed
 * it, and read back as a number nobody had decided.
 *
 * REGISTRATION IS NOT LISTED AT ALL. It is charged once at enrolment and is
 * structurally outside the rule — buildFirstInstallmentRule drops it whatever is
 * stored on it. A row here would invite somebody to set a requirement that can
 * never apply, so the group is filtered out rather than shown and disabled: a
 * disabled row still reads as a setting that exists.
 *
 * EMPTY MEANS NULL MEANS MET AUTOMATICALLY. A category with no requirement asks
 * nothing upfront and contributes zero to the required total. That is why the
 * input is left blank rather than defaulted to 0 or to the full fee — a
 * pre-filled number is a requirement nobody chose.
 *
 * WHAT IT WRITES. The level's WHOLE fee structure, through the same
 * PUT /classes/levels/:level/fees the categories dialog uses, because that
 * endpoint replaces the set as a unit and an omitted fee is deleted. Sending
 * only the rows shown here would delete every Registration fee on the level. The
 * amounts go back exactly as they arrived; only firstInstallmentAmount moves.
 *
 * Inline styles throughout: src/index.css is a pre-compiled Tailwind artifact,
 * so a utility class not already in it renders as nothing at all, silently.
 */

export type FeeGroup = 'REGISTRATION' | 'OTHER_FEES';

/**
 * One row of a level's fee structure, as both dialogs hold it.
 *
 * Defined here rather than in LevelFeesDialog so the dependency runs one way:
 * that dialog renders this one, and a shape owned by the parent would have this
 * file importing back out of its own caller.
 *
 * Amounts are STRINGS because they are the value of a text input, and a number
 * cannot represent the half-typed states an input passes through — "" while
 * being cleared, "1" on the way to "15000". Converting on every keystroke is how
 * a field fights the person filling it in.
 */
export interface LevelFeeRow {
  /** Absent on a row the user just added; the server creates it. */
  id?: number;
  name: string;
  amount: string;
  /** '' means no requirement — see the note on EMPTY MEANS NULL above. */
  firstInstallmentAmount: string;
  group: FeeGroup;
}

const NAVY = '#0f2345';
const MUTED = '#6B7280';
const RED = '#B91C1C';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The level being configured. Read-only here; it is chosen in the parent. */
  level: string;
  /**
   * The level's COMPLETE fee set, Registration included. All of it is written
   * back — see WHAT IT WRITES above — even though only Other Fees are listed.
   */
  rows: LevelFeeRow[];
  /**
   * Hands the server's saved fee set back, so the parent re-syncs rather than
   * keeping rows whose firstInstallmentAmount this dialog has just changed
   * underneath it. Without this, the parent's next Save Fees would write its
   * stale nulls straight over what was set here.
   */
  onSaved: (fees: unknown[]) => void;
}

export function FirstInstallmentDialog({ open, onOpenChange, level, rows, onSaved }: Props) {
  const cache = useSisCache();
  /**
   * The draft, keyed by each row's index in the FULL rows array. An index rather
   * than a name because a name can be edited in the parent between openings, and
   * rather than an id because a row the user has just added has none yet.
   */
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Per-row messages, so a fee whose requirement exceeds it says so ON that row.
   * A single error line at the bottom naming one fee is unhelpful when three are
   * wrong, and worse when the offending row is scrolled out of sight.
   */
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

  // Re-seeded on every open, from whatever the parent now holds. Editing here
  // and reopening must not resurrect a draft the user abandoned.
  const seeded = useRef(false);
  useEffect(() => {
    if (!open) { seeded.current = false; return; }
    if (seeded.current) return;
    seeded.current = true;
    const next: Record<number, string> = {};
    rows.forEach((r, i) => { next[i] = r.firstInstallmentAmount ?? ''; });
    setDraft(next);
    setRowErrors({});
    setError(null);
  }, [open, rows]);

  /**
   * The rows this dialog lists, each paired with its index in the FULL array.
   * Editing addresses that index, so a change lands on the fee it appears to
   * rather than on whatever sits at that position once Registration is dropped.
   */
  const visible = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.group !== 'REGISTRATION');

  const feeAmountOf = (row: LevelFeeRow) => Math.round(Number(row.amount) || 0);

  const edit = (index: number, value: string) => {
    setError(null);
    setDraft(d => ({ ...d, [index]: value }));
    // Cleared as the row is corrected, rather than waiting for the next save
    // attempt to re-run validation.
    setRowErrors(e => {
      if (!(index in e)) return e;
      const next = { ...e };
      delete next[index];
      return next;
    });
  };

  /**
   * Validates the draft and returns the value to store per row index, or null if
   * anything is wrong.
   *
   * The ceiling is the fee's own amount. Above it the requirement is unmeetable:
   * the student could pay the category in full and still read as short, on a
   * screen offering nothing to do about it. The server refuses the same case
   * (parseFirstInstallmentAmount) — this is the copy that can name the row.
   */
  const validate = (): Record<number, number | null> | null => {
    const errs: Record<number, string> = {};
    const out: Record<number, number | null> = {};

    for (const { row, index } of visible) {
      const raw = (draft[index] ?? '').trim();
      if (raw === '') { out[index] = null; continue; }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        errs[index] = 'Must be 0 or more, or left blank for no requirement.';
        continue;
      }
      // Zero is accepted and stored as null: it asks nothing upfront, which is
      // what blank means, and keeping both would be two spellings of one state.
      if (n === 0) { out[index] = null; continue; }
      const fee = feeAmountOf(row);
      if (n > fee) {
        errs[index] = `Cannot exceed the fee amount of ${fee.toLocaleString()}.`;
        continue;
      }
      out[index] = n;
    }

    setRowErrors(errs);
    const bad = Object.keys(errs).length;
    if (bad) {
      setError(
        bad === 1
          ? 'One first installment amount is more than its fee. Fix it to save.'
          : `${bad} first installment amounts are more than their fees. Fix them to save.`,
      );
      return null;
    }
    setError(null);
    return out;
  };

  const save = async () => {
    if (saving) return;
    const values = validate();
    if (!values) return;

    setSaving(true);
    try {
      // Every row, not just the visible ones. The endpoint replaces the level's
      // structure as a unit, so an omitted fee is deleted.
      const res: any = await api.put(`/classes/levels/${encodeURIComponent(level)}/fees`, {
        fees: rows.map((r, i) => ({
          ...(r.id != null ? { id: r.id } : {}),
          name: r.name.trim(),
          amount: feeAmountOf(r),
          // Registration carries no requirement whatever the draft holds — it is
          // not listed, so nothing here could have set one, and the server would
          // null it regardless.
          firstInstallmentAmount: r.group === 'REGISTRATION' ? null : (values[i] ?? null),
          group: r.group,
        })),
      });

      // The rule decides firstInstallmentMet for every student of the level, so
      // their cached status is now stale.
      cache.invalidateOn('level-fee:write');
      onSaved(res?.fees ?? []);
      const set = Object.values(values).filter(v => v != null).length;
      toast.success(
        set
          ? `${level} first installment saved — ${set} categor${set === 1 ? 'y' : 'ies'} required upfront`
          : `${level} first installment cleared — nothing is required upfront`,
      );
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || 'Could not save the first installment.');
    } finally {
      setSaving(false);
    }
  };

  /** What a student of this level must have paid to have met the rule. */
  const requiredTotal = visible.reduce((sum, { index }) => {
    const n = Number((draft[index] ?? '').trim());
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
  const otherFeesTotal = visible.reduce((sum, { row }) => sum + feeAmountOf(row), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 720 }}>
        <DialogHeader>
          <DialogTitle>First Installment</DialogTitle>
        </DialogHeader>

        <div className="py-2">
          {/* The same two-column grid as the Fee Categories dialog, with the
              second cell deliberately EMPTY. There is no group to choose here —
              Registration is never part of the rule — but collapsing to one
              column would shift the Class Level field sideways as the dialogs
              are opened one from the other, which reads as the screen jumping
              rather than as one field being absent. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
            <div style={{ minWidth: 0 }}>
              <Label>Class Level</Label>
              {/* Read-only: the level is chosen in the Fee Categories dialog this
                  one opens from, and a second picker here could disagree with it. */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', height: 36, marginTop: 6,
                  padding: '0 0.75rem', borderRadius: 6, border: '1px solid #DDE3EC',
                  backgroundColor: '#F5F7FA', color: NAVY, fontWeight: 600, fontSize: '0.875rem',
                }}
              >
                {level || '—'}
              </div>
            </div>
            <div aria-hidden="true" style={{ minWidth: 0 }} />
          </div>

          <p className="text-sm" style={{ color: MUTED, marginTop: 10 }}>
            How much of each fee must be paid for a student to have met their first installment.
            Leave a fee blank to require nothing upfront for it.
          </p>
        </div>

        <div
          className="flex items-center gap-2 text-sm text-gray-500"
          style={{ paddingBottom: 6, borderBottom: '1px solid #E5E7EB' }}
        >
          <span style={{ flex: 1 }}>Fee Category</span>
          <span style={{ width: 120, textAlign: 'right' }}>Fee Amount</span>
          <span style={{ width: 170, textAlign: 'right' }}>First Installment Amount</span>
        </div>

        <div className="space-y-2" style={{ maxHeight: 320, overflowY: 'auto', paddingTop: 8 }}>
          {visible.length === 0 && (
            <p className="text-sm text-gray-500">
              No other fees on this level, so there is nothing to require upfront. Registration is
              never part of the first installment.
            </p>
          )}

          {visible.map(({ row: r, index: i }) => (
            <div key={r.id ?? `new-${i}`}>
              <div className="flex items-center gap-2">
                {/* Read-only labels, not disabled inputs: neither the name nor
                    the amount is editable here, and an input that cannot be
                    typed into still looks like one that should be. */}
                <span
                  className="text-sm"
                  style={{ flex: 1, minWidth: 0, color: NAVY, fontWeight: 500 }}
                  title={r.name || 'Unnamed fee'}
                >
                  {r.name || <span style={{ color: MUTED, fontWeight: 400 }}>Unnamed fee</span>}
                </span>
                <span
                  className="text-sm"
                  style={{ width: 120, textAlign: 'right', color: NAVY }}
                >
                  {feeAmountOf(r).toLocaleString()}
                </span>
                <Input
                  type="number"
                  min={0}
                  max={feeAmountOf(r)}
                  value={draft[i] ?? ''}
                  onChange={e => edit(i, e.target.value)}
                  placeholder="None"
                  aria-label={`First installment amount for ${r.name || 'this fee'}`}
                  aria-invalid={i in rowErrors ? true : undefined}
                  style={{
                    width: 170,
                    textAlign: 'right',
                    ...(i in rowErrors ? { borderColor: RED } : {}),
                  }}
                />
              </div>
              {rowErrors[i] && (
                <p className="text-xs" style={{ color: RED, textAlign: 'right', marginTop: 2 }}>
                  {rowErrors[i]}
                </p>
              )}
            </div>
          ))}
        </div>

        {visible.length > 0 && (
          <p className="text-sm text-gray-500" style={{ textAlign: 'right', marginTop: 8 }}>
            Required upfront: <strong>{requiredTotal.toLocaleString()}</strong>
            {' · '}Other fees: <strong>{otherFeesTotal.toLocaleString()}</strong>
          </p>
        )}

        {error && <p className="text-sm mt-2" style={{ color: RED }}>{error}</p>}

        <div className="flex justify-end mt-4">
          <Button onClick={save} disabled={saving || !level}>
            {saving ? 'Saving...' : 'Save First Installment'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
