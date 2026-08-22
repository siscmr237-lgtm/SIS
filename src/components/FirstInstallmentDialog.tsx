'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSisCache } from '@/lib/SisCache';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';

/**
 * How much of each fee has to be paid upfront — the first-installment rule,
 * level by level.
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
 * IT OWNS ITS LEVEL, AND FETCHES. The level is picked here, from the list the
 * Fee Categories dialog passes down, and switching it loads that level's SAVED
 * fees from the server. It deliberately does not read the parent's in-progress
 * rows: the requirement is validated against an amount, so it has to be
 * validated against the amount the level actually charges, and the parent's rows
 * only ever describe one level anyway. Fetching is also what makes the Fee
 * Amount column honest — it is the saved figure, not a draft.
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
 * WHAT IT WRITES. The selected level's WHOLE fee structure, through the same
 * PUT /classes/levels/:level/fees the categories dialog uses, because that
 * endpoint replaces the set as a unit and an omitted fee is deleted. Sending
 * only the rows shown here would delete every Registration fee on the level. The
 * names and amounts go back exactly as they were fetched; only
 * firstInstallmentAmount moves.
 *
 * ONE LEVEL PER SAVE, and switching away from unsaved edits is refused rather
 * than silently dropped. Carrying drafts for several levels and writing them all
 * at once would mean one button issuing several money writes, any of which could
 * fail on its own — and a half-applied save across levels is far worse to
 * unpick than being asked to press Save twice.
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

/**
 * Never edge-to-edge, at any width.
 *
 * The 720 cap is the desktop width; the calc is the mobile floor. It has to be
 * an inline style rather than left to the shared DialogContent, which already
 * carries a max-w-[calc(100%-2rem)] class — an inline maxWidth BEATS that class,
 * so setting a bare number here is exactly what removed the gutter and let the
 * dialog run into both edges of a phone.
 */
const DIALOG_MAX_WIDTH = 'min(720px, calc(100% - 32px))';

/**
 * The narrowest the three columns are readable at. Below this the table scrolls
 * inside itself rather than pushing the dialog back out to the screen edges —
 * the gutter above is the point, and content is not allowed to spend it.
 */
const TABLE_MIN_WIDTH = 280;

/**
 * Column geometry, shared by the header and every row so the two cannot drift.
 *
 * The two numeric columns do not shrink; the name column does, and wraps. The
 * fixed pair comes to 198px plus 16px of gaps, which leaves the name 81px on a
 * 375px phone — narrow, but a wrapped name is still a whole name.
 */
const COL_FEE = { flex: '1 1 auto', minWidth: 0 } as const;
const COL_AMOUNT = { flex: '0 0 78px', textAlign: 'right' } as const;
const COL_INPUT = { flex: '0 0 120px' } as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Every class level the school has, for the picker. Passed down rather than
   * fetched again: the Fee Categories dialog already asked for it, and two
   * requests could answer differently mid-session.
   */
  levels: string[];
  /** Which level to open on — the one the parent is showing. */
  level: string;
  /**
   * Hands back the level that was saved AND the server's fee set for it.
   *
   * The level is not decoration. This dialog can be showing a different level
   * from the parent by the time it saves, and the parent must only re-sync its
   * own rows when the two match — applying another level's fees to the rows the
   * parent is holding would have its next Save Fees write them onto the wrong
   * level.
   */
  onSaved: (savedLevel: string, fees: unknown[]) => void;
}

export function FirstInstallmentDialog({ open, onOpenChange, levels, level, onSaved }: Props) {
  const cache = useSisCache();
  /** The level being edited here, which the parent's is only the starting point for. */
  const [selected, setSelected] = useState(level);
  /** The selected level's COMPLETE saved fee set, Registration included. */
  const [rows, setRows] = useState<LevelFeeRow[]>([]);
  /**
   * The draft, keyed by each row's index in the FULL rows array — the same array
   * the save walks, so a value cannot land on a different fee than it was typed
   * into once Registration is filtered out of the list.
   */
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Per-row messages, so a fee whose requirement exceeds it says so ON that row.
   * A single error line at the bottom naming one fee is unhelpful when three are
   * wrong, and worse when the offending row is scrolled out of sight.
   */
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  /** Whether the draft has been touched since it was loaded or last saved. */
  const [unsaved, setUnsaved] = useState(false);

  // Opening snaps back to the parent's level, every time. A level left selected
  // from a previous opening would quietly put the next edit somewhere the person
  // did not choose.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) setSelected(level);
    wasOpen.current = open;
  }, [open, level]);

  /**
   * Loads the selected level's saved fees.
   *
   * Guarded against a landing response overwriting newer state the same way the
   * Fee Categories dialog is: a slow answer for a level the user has already
   * switched away from must not repopulate the table under them.
   */
  useEffect(() => {
    if (!open || !selected) { setRows([]); setDraft({}); return; }
    let alive = true;
    setLoading(true);
    setError(null);
    setRowErrors({});
    setUnsaved(false);
    api
      .get(`/classes/levels/${encodeURIComponent(selected)}/fees`)
      .then((r: any) => {
        if (!alive) return;
        const loaded: LevelFeeRow[] = (r?.fees ?? []).map((f: any) => ({
          id: f.id,
          name: f.name,
          amount: String(f.amount ?? 0),
          firstInstallmentAmount:
            f.firstInstallmentAmount != null ? String(f.firstInstallmentAmount) : '',
          group: (f.group ?? 'OTHER_FEES') as FeeGroup,
        }));
        setRows(loaded);
        const next: Record<number, string> = {};
        loaded.forEach((row, i) => { next[i] = row.firstInstallmentAmount; });
        setDraft(next);
      })
      .catch((e: any) => {
        if (!alive) return;
        setRows([]);
        setDraft({});
        setError(e?.message || `Could not load ${selected}’s fees.`);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, selected]);

  /**
   * Switches level — unless that would drop edits nobody saved.
   *
   * Refused rather than confirmed with a prompt, because the fix is one click
   * away and the alternative is a dialog asking permission to lose money
   * settings. The Select is controlled, so declining here leaves it showing the
   * level actually loaded rather than the one that was clicked.
   */
  const changeLevel = useCallback((next: string) => {
    if (next === selected) return;
    if (unsaved) {
      setError('Save this level’s first installment before switching, or reopen to discard it.');
      return;
    }
    setError(null);
    setSelected(next);
  }, [selected, unsaved]);

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
    setUnsaved(true);
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
    const savedLevel = selected;
    try {
      // Every row, not just the visible ones. The endpoint replaces the level's
      // structure as a unit, so an omitted fee is deleted.
      const res: any = await api.put(`/classes/levels/${encodeURIComponent(savedLevel)}/fees`, {
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
      setUnsaved(false);
      onSaved(savedLevel, res?.fees ?? []);
      const set = Object.values(values).filter(v => v != null).length;
      toast.success(
        set
          ? `${savedLevel} first installment saved — ${set} categor${set === 1 ? 'y' : 'ies'} required upfront`
          : `${savedLevel} first installment cleared — nothing is required upfront`,
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
      <DialogContent style={{ maxWidth: DIALOG_MAX_WIDTH }}>
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
              <Select value={selected} onValueChange={changeLevel} disabled={saving}>
                <SelectTrigger>
                  <SelectValue placeholder={levels.length ? 'Select a class level' : 'No classes yet'} />
                </SelectTrigger>
                <SelectContent>
                  {levels.map(l => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div aria-hidden="true" style={{ minWidth: 0 }} />
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 py-4">Loading fees...</p>
        ) : !selected ? (
          <p className="text-sm text-gray-500 py-4">Create a class first, then set its fees here.</p>
        ) : (
          <>
            {/* Scrolls inside itself on a narrow phone rather than widening the
                dialog past its gutter. The columns shrink first; this only comes
                into play below TABLE_MIN_WIDTH. */}
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: TABLE_MIN_WIDTH }}>
                <div
                  className="flex items-center gap-2 text-sm text-gray-500"
                  style={{ paddingBottom: 6, borderBottom: '1px solid #E5E7EB' }}
                >
                  <span style={COL_FEE}>Fee Category</span>
                  <span style={COL_AMOUNT}>Fee Amount</span>
                  <span style={{ ...COL_INPUT, textAlign: 'right' }}>First Installment Amount</span>
                </div>

                <div className="space-y-2" style={{ maxHeight: 320, overflowY: 'auto', paddingTop: 8 }}>
                  {/* Only claimed when the fees actually loaded. After a failed
                      fetch the table is empty for a reason that has nothing to
                      do with the level, and asserting it charges nothing would
                      be stating a fact nobody has established. */}
                  {visible.length === 0 && !error && (
                    <p className="text-sm text-gray-500">
                      No other fees on {selected}, so there is nothing to require upfront.
                      Registration is never part of the first installment.
                    </p>
                  )}

                  {visible.map(({ row: r, index: i }) => (
                    <div key={r.id ?? `new-${i}`}>
                      <div className="flex items-center gap-2">
                        {/* Read-only labels, not disabled inputs: neither the name
                            nor the amount is editable here, and an input that
                            cannot be typed into still looks like one that should
                            be. The name wraps rather than truncating — a wrapped
                            fee name is longer, a clipped one is wrong. */}
                        <span
                          className="text-sm"
                          style={{ ...COL_FEE, color: NAVY, fontWeight: 500, overflowWrap: 'anywhere' }}
                        >
                          {r.name || <span style={{ color: MUTED, fontWeight: 400 }}>Unnamed fee</span>}
                        </span>
                        <span className="text-sm" style={{ ...COL_AMOUNT, color: NAVY }}>
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
                            ...COL_INPUT,
                            width: 'auto',
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
              </div>
            </div>

            {visible.length > 0 && (
              <p className="text-sm text-gray-500" style={{ textAlign: 'right', marginTop: 8 }}>
                Required upfront: <strong>{requiredTotal.toLocaleString()}</strong>
                {' · '}Other fees: <strong>{otherFeesTotal.toLocaleString()}</strong>
              </p>
            )}

            {error && <p className="text-sm mt-2" style={{ color: RED }}>{error}</p>}

            <div className="flex justify-end mt-4">
              <Button onClick={save} disabled={saving || !selected}>
                {saving ? 'Saving...' : 'Save First Installment'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
