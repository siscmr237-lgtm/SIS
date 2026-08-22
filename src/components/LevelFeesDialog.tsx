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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { FirstInstallmentDialog, type FeeGroup, type LevelFeeRow } from './FirstInstallmentDialog';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Editor for a class LEVEL's fee structure.
 *
 * The level picker deliberately lists levels — "Class 1", "Nursery 1" — and
 * never sections. A fee structure belongs to the level and every section of it
 * shares one, so offering "Class 1 A" would imply a distinction that does not
 * exist.
 *
 * WHAT IT NO LONGER DOES: set the first installment. That moved to its own
 * dialog, opened from the button on the left of the footer, because the two are
 * separate decisions — what a level charges, and how much of it is due upfront
 * — and asking both down one table left the amount, the figure people actually
 * came to change, sharing a row with a checkbox and a percentage box. The
 * requirement is still carried on every row here so that saving an amount
 * cannot wipe it; it is simply not editable on this screen.
 *
 * Saving replaces the level's whole structure, so removing a row deletes that
 * fee, and re-bills every student of the level — including those who had already
 * paid in full. That is stated on the dialog rather than left to be discovered.
 *
 * TWO CONTEXTS, told apart by ONE prop.
 *
 * Opened from the Classes page it is a plain editor: pick a level, save it, and
 * the dialog stays exactly where it is. Opened by the setup wizard (`inWizard`)
 * it becomes a walk — each save moves to the next level that still needs fees,
 * and when none are left it hands back so the wizard can mark its step complete.
 *
 * `inWizard` is passed explicitly and is never inferred from the route or the
 * URL. Someone can reach the Classes page mid-setup, and someone can open this
 * from a deep link; where the browser happens to be says nothing about which
 * behaviour is wanted.
 *
 * The walk itself decides nothing. Which levels still need fees, and which one
 * comes next, are answered by the server's /classes/levels/fee-setup — the same
 * function the dashboard checklist's fees step is ticked by. A second opinion
 * here is how you get a dialog that hands back a level the checklist still
 * wants, and a user who cannot get out of the loop.
 */

/**
 * The row shape is LevelFeeRow, defined alongside the First Installment dialog
 * because both dialogs edit the same structure and only one of them can own the
 * type without the dependency pointing both ways.
 *
 * firstInstallmentAmount is carried on every row but never edited HERE. This
 * dialog decides what a level charges; how much of each charge is due upfront is
 * the other dialog's question. The value still has to travel through this one,
 * or saving an amount would silently wipe a requirement set next door.
 */
type FeeRow = LevelFeeRow;

/**
 * The server's answer about the walk — never computed here. `nextLevel` is
 * relative to the level just written, so the walk reads forward down the list
 * rather than restarting at the top after every save.
 */
interface FeeSetup {
  levels: string[];
  missingLevels: string[];
  chargedLevels: string[];
  freeLevels: string[];
  blockedOnClasses: boolean;
  done: boolean;
  nextLevel: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * True only when the setup wizard is driving this. Turns on the level walk,
   * the progress line, and the hand-back below. Absent or false is the Classes
   * page's plain editor, which chains nothing.
   */
  inWizard?: boolean;
  /**
   * Wizard only. Called once every level either charges something or has been
   * declared free — the dialog closes and the wizard re-reads the live condition
   * for itself rather than being told the step is done.
   */
  onAllLevelsComplete?: () => void;
}

/** A student on custom fees, who therefore did not receive this change. */
interface DetachedStudent {
  id: string;
  name: string;
  class: string;
}

/** A fee whose amount actually moved in this save. */
interface ChangedFee {
  name: string;
  from: number | null;
  to: number;
}

const NAVY = '#0f2345';

/**
 * One server fee to one editable row. Shared by the initial load and the two
 * saves, because these three had drifted before: a field added to the load and
 * missed in a save reads back correctly and is then written away as undefined.
 */
function toRow(f: any): FeeRow {
  return {
    id: f.id,
    name: f.name,
    amount: String(f.amount ?? 0),
    // '' rather than '0': no requirement is not a requirement of zero, and the
    // input has to come up blank for the distinction to survive a round trip.
    firstInstallmentAmount: f.firstInstallmentAmount != null ? String(f.firstInstallmentAmount) : '',
    group: (f.group ?? 'OTHER_FEES') as FeeGroup,
  };
}

export function LevelFeesDialog({ open, onOpenChange, inWizard = false, onAllLevelsComplete }: Props) {
  const cache = useSisCache();
  const [levels, setLevels] = useState<string[]>([]);
  const [level, setLevel] = useState('');
  /** Wizard only: the server's live picture of the walk. */
  const [feeSetup, setFeeSetup] = useState<FeeSetup | null>(null);
  /**
   * Set when a save left the level it wrote still outstanding — every amount at
   * 0 bills nobody anything, so the level is not set up and the walk must not
   * count it. Said out loud, because a Save that visibly does nothing is the
   * point at which someone gives up.
   */
  const [zeroNotice, setZeroNotice] = useState<string | null>(null);
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [installmentOpen, setInstallmentOpen] = useState(false);
  /**
   * Mirrors the `dirty` ref for RENDERING. The ref exists to be read inside a
   * landing fetch without re-running it, which is exactly why it cannot drive the
   * First Installment button — a ref change re-renders nothing. Both are kept in
   * step rather than one replacing the other.
   */
  const [unsaved, setUnsaved] = useState(false);
  /**
   * Which group's fees are listed.
   *
   * A FILTER over the same rows array, never a separate fetch. The level's whole
   * structure stays loaded even while only one group is on screen, because
   * saving replaces all of it — see save(), which sends every row regardless of
   * the filter. Sending only the visible ones would delete the other group.
   */
  const [groupFilter, setGroupFilter] = useState<FeeGroup>('OTHER_FEES');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);
  // Shown after a save that changed amounts while detached students exist.
  const [notice, setNotice] = useState<{ detached: DetachedStudent[]; changed: ChangedFee[] } | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<string | null>(null);
  /**
   * A walk step held back because the save raised the detached-students notice.
   * Moving levels underneath that notice would leave it describing a level the
   * dialog is no longer showing, so it waits until the notice is dismissed.
   */
  const pendingWalk = useRef<{ setup: FeeSetup; from: string } | null>(null);
  // Guards the same class of bug as the settings form: a load landing after the
  // user has started editing must not discard their work.
  const dirty = useRef(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setZeroNotice(null);
    setFeeSetup(null);
    pendingWalk.current = null;

    // In the wizard, one call gives both the level list and the walk. On the
    // Classes page only the list is wanted — asking about outstanding levels
    // there would be a query answering a question nobody asked.
    api
      .get(inWizard ? '/classes/levels/fee-setup' : '/classes/levels')
      .then((r: any) => {
        const ls: string[] = r?.levels ?? [];
        setLevels(ls);
        if (inWizard) {
          setFeeSetup(r as FeeSetup);
          // Start on the first level that still needs fees. Nothing outstanding
          // means the step was already complete and the wizard will move on.
          setLevel((r?.missingLevels ?? [])[0] ?? ls[0] ?? '');
        } else {
          setLevel(prev => (prev && ls.includes(prev) ? prev : ls[0] ?? ''));
        }
      })
      .catch((e: any) => setError(e?.message || 'Could not load class levels.'));
  }, [open, inWizard]);

  useEffect(() => {
    if (!open || !level) return;
    let alive = true;
    setLoading(true);
    setError(null);
    dirty.current = false;
    setUnsaved(false);
    api
      .get(`/classes/levels/${encodeURIComponent(level)}/fees`)
      .then((r: any) => {
        if (!alive || dirty.current) return;
        setRows((r?.fees ?? []).map(toRow));
      })
      .catch((e: any) => { if (alive) setError(e?.message || 'Could not load this level’s fees.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, level]);

  const edit = (i: number, patch: Partial<FeeRow>) => {
    dirty.current = true;
    setUnsaved(true);
    setError(null);
    setZeroNotice(null);
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const addRow = () => {
    dirty.current = true;
    setUnsaved(true);
    setError(null);
    setZeroNotice(null);
    // A new fee lands in whichever group is being viewed. That is what makes the
    // filter the only place a group is ever chosen. It starts with no
    // first-installment requirement, which is what a fee nobody has configured
    // upfront payment for genuinely has.
    setRows(rs => [...rs, { name: '', amount: '0', firstInstallmentAmount: '', group: groupFilter }]);
  };
  const removeRow = (i: number) => {
    dirty.current = true;
    setUnsaved(true);
    setError(null);
    setRows(rs => rs.filter((_, idx) => idx !== i));
  };

  /**
   * The rows the filter shows, each paired with its index in the FULL rows
   * array. Editing addresses that index, so a change made while filtered lands
   * on the fee it appears to rather than on whatever sits at that position in
   * the unfiltered list.
   */
  const visibleRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.group === groupFilter);

  // Two figures, because one would be ambiguous while a filter is on: what this
  // group costs, and what the level costs altogether.
  const groupTotal = visibleRows.reduce((sum, { row }) => sum + (Number(row.amount) || 0), 0);
  const total = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  /**
   * Take one step of the walk, on the server's answer alone.
   *
   * Wizard only — on the Classes page this records the new status and stops,
   * because someone who came to change one number should not have the screen
   * taken away from them.
   *
   * `setup.nextLevel` can come back as the level just written: a save with every
   * amount at 0 leaves it outstanding. Moving would be wrong (nothing was set
   * up) and looping back to it silently would be worse, so that case stays put
   * and says why.
   */
  const walk = (setup: FeeSetup, from: string) => {
    setFeeSetup(setup);
    if (!inWizard) return;
    if (setup.done || !setup.nextLevel) {
      onAllLevelsComplete?.();
      return;
    }
    if (setup.nextLevel === from) {
      setZeroNotice(from);
      return;
    }
    setZeroNotice(setup.missingLevels.includes(from) ? from : null);
    setLevel(setup.nextLevel);
  };

  /**
   * Opens the First Installment dialog — but not over unsaved edits.
   *
   * That dialog states a requirement AGAINST an amount, and refuses one larger
   * than the fee. Opened on top of an unsaved amount it would be validating
   * against a figure that is not what the level charges, and the admin would be
   * told a perfectly good requirement is too big — or, worse, allowed to set one
   * that the real amount does not support. Saving first is one click and makes
   * the number on the row the number being reasoned about.
   */
  const openInstallments = () => {
    if (unsaved) {
      setError('Save these fees first. The first installment is set against saved amounts.');
      return;
    }
    setError(null);
    setInstallmentOpen(true);
  };

  /** Clears the detached-students notice, running any walk step it held back. */
  const dismissNotice = () => {
    setNotice(null);
    const held = pendingWalk.current;
    pendingWalk.current = null;
    if (held) walk(held.setup, held.from);
  };

  const save = async () => {
    if (saving) return;
    setError(null);
    setZeroNotice(null);
    const seen = new Set<string>();
    for (const r of rows) {
      const name = r.name.trim();
      if (!name) { setError('Every fee needs a name.'); return; }
      if (seen.has(name.toLowerCase())) { setError(`Duplicate fee name "${name}".`); return; }
      seen.add(name.toLowerCase());
      const amt = Number(r.amount);
      if (!Number.isFinite(amt) || amt < 0) { setError(`"${name}": amount must be 0 or more.`); return; }
      // Lowering a fee below its own first-installment requirement is caught
      // here as well as on the server, because the fix is on THIS screen: the
      // amount just typed is the thing that is wrong, not the requirement set
      // next door. The server refuses it either way.
      const fi = Number(r.firstInstallmentAmount);
      if (r.firstInstallmentAmount.trim() !== '' && Number.isFinite(fi) && fi > amt) {
        setError(
          `"${name}": its first installment of ${fi.toLocaleString()} is more than the amount ` +
          `${Math.round(amt).toLocaleString()}. Raise the amount, or lower the first installment.`,
        );
        return;
      }
    }
    setSaving(true);
    const savedLevel = level;
    try {
      const res: any = await api.put(`/classes/levels/${encodeURIComponent(savedLevel)}/fees`, {
        fees: rows.map(r => ({
          ...(r.id != null ? { id: r.id } : {}),
          name: r.name.trim(),
          amount: Math.round(Number(r.amount)),
          // Carried through untouched. This dialog cannot set it; wiping it on
          // every amount edit is the bug that not carrying it would cause.
          firstInstallmentAmount:
            r.group === 'REGISTRATION' || r.firstInstallmentAmount.trim() === ''
              ? null
              : Number(r.firstInstallmentAmount),
          group: r.group,
        })),
      });
      dirty.current = false;
      setUnsaved(false);
      // Re-billing changed students' charges, so their fee status is stale too.
      cache.invalidateOn('level-fee:write');
      setRows((res?.fees ?? []).map(toRow));
      const rb = res?.rebill;
      const billed = rb ? rb.created + rb.updated : 0;
      toast.success(
        billed
          ? `${savedLevel} fees saved — ${billed} charge${billed === 1 ? '' : 's'} updated across ${rb.students} student${rb.students === 1 ? '' : 's'}`
          : `${savedLevel} fees saved`,
      );

      // Students on custom fees did NOT receive this change, by design. Surface
      // them so the admin can pass specific categories on where it should apply,
      // rather than discovering later that a scholarship student kept the old
      // amount.
      const detached: DetachedStudent[] = res?.detachedStudents ?? [];
      const changed: ChangedFee[] = res?.changedFees ?? [];
      const setup: FeeSetup | null = res?.feeSetup ?? null;
      if (detached.length && changed.length) {
        setNotice({ detached, changed });
        setSelectedStudents(new Set());
        // Held until the notice is dealt with — see pendingWalk.
        if (setup) pendingWalk.current = { setup, from: savedLevel };
      } else {
        setNotice(null);
        if (setup) walk(setup, savedLevel);
      }
    } catch (e: any) {
      setError(e?.message || 'Could not save these fees.');
    } finally {
      setSaving(false);
    }
  };

  // Progress through the walk, from the server's numbers. Wizard only: on the
  // Classes page there is no walk to be a position within.
  const progress = inWizard && feeSetup && feeSetup.levels.length > 0
    ? {
      done: feeSetup.levels.length - feeSetup.missingLevels.length,
      total: feeSetup.levels.length,
    }
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 720 }}>
        <DialogHeader>
          <DialogTitle>Fee Categories</DialogTitle>
        </DialogHeader>

        {progress && (
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 8,
              border: '1px solid #DDE3EC', backgroundColor: '#F5F7FA', color: NAVY,
            }}
          >
            {/* Two lines, and the level on its own. On one line the level name
                was the part that ran out of room, so the only thing that
                changes between steps was the thing getting clipped.
                overflowWrap over any ellipsis: a wrapped level name is longer,
                a truncated one is wrong. */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="text-sm" style={{ fontWeight: 600 }}>
                {progress.done} of {progress.total} level{progress.total === 1 ? '' : 's'} done
              </p>
              <p className="text-sm" style={{ marginTop: 2, overflowWrap: 'anywhere' }}>
                Now: {level || '—'}
              </p>
            </div>
            <span
              aria-hidden="true"
              style={{
                flex: '0 0 96px', height: 5, borderRadius: 999,
                backgroundColor: '#DDE3EC', overflow: 'hidden',
              }}
            >
              <span
                style={{
                  display: 'block', height: '100%', borderRadius: 999,
                  width: `${Math.round((progress.done / progress.total) * 100)}%`,
                  backgroundColor: '#05603d',
                }}
              />
            </span>
          </div>
        )}

        <div className="py-2">
          {/* Two filters: which class level, and which group of its fees. The
              group is a FILTER, not a per-row field — a fee's group is decided
              by which list it was added to. That is one fewer decision on every
              row, and it lets the two groups be read separately instead of
              interleaved down one list. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
            <div style={{ minWidth: 0 }}>
              <Label>Class Level</Label>
              <Select value={level} onValueChange={setLevel}>
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
            <div style={{ minWidth: 0 }}>
              <Label>Fee Group</Label>
              <Select value={groupFilter} onValueChange={(v) => setGroupFilter(v as FeeGroup)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="OTHER_FEES">Other Fees</SelectItem>
                  <SelectItem value="REGISTRATION">Registration</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {zeroNotice && (
            <div
              style={{
                marginTop: 10, padding: '0.6rem 0.75rem', borderRadius: 8,
                border: '1px solid #F5C6B4', backgroundColor: '#FDF3EF', color: '#e0552e',
              }}
            >
              <p className="text-sm" style={{ fontWeight: 600 }}>
                {zeroNotice} is still outstanding.
              </p>
              <p className="text-xs" style={{ marginTop: 2 }}>
                Every amount there is 0, so it bills nobody anything. Give at least one fee an
                amount for at least one fee on this level.
              </p>
            </div>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 py-4">Loading fees...</p>
        ) : !level ? (
          <p className="text-sm text-gray-500 py-4">Create a class first, then set its fees here.</p>
        ) : (
          <>
            <div
              className="flex items-center gap-2 text-sm text-gray-500"
              style={{ paddingBottom: 6, borderBottom: '1px solid #E5E7EB' }}
            >
              <span style={{ flex: 1 }}>Fee</span>
              <span style={{ width: 110, textAlign: 'right' }}>Amount</span>
              <span style={{ width: 32 }} />
            </div>

            <div className="space-y-2" style={{ maxHeight: 320, overflowY: 'auto', paddingTop: 8 }}>
              {visibleRows.length === 0 && (
                <p className="text-sm text-gray-500">
                  No {groupFilter === 'REGISTRATION' ? 'registration' : 'other'} fees for this level.
                  Add one below.
                </p>
              )}
              {/* The index threaded through here is the row's position in the
                  FULL rows array, not in this filtered view — see visibleRows. */}
              {visibleRows.map(({ row: r, index: i }) => (
                <div key={r.id ?? `new-${i}`} className="flex items-center gap-2">
                  <Input
                    style={{ flex: 1 }}
                    placeholder="Fee name"
                    value={r.name}
                    onChange={e => edit(i, { name: e.target.value })}
                  />
                  <Input
                    type="number"
                    min={0}
                    style={{ width: 110, textAlign: 'right' }}
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

            <div className="flex items-center justify-between mt-2">
              <Button variant="outline" size="sm" onClick={addRow} className="flex items-center gap-2">
                <Plus size={16} />
                Add Fee
              </Button>
              <p className="text-sm text-gray-500">
                {groupFilter === 'REGISTRATION' ? 'Registration' : 'Other Fees'}:{' '}
                <strong>{groupTotal.toLocaleString()}</strong>
                {' · '}All fees: <strong>{total.toLocaleString()}</strong>
              </p>
            </div>

            {error && <p className="text-sm mt-2" style={{ color: '#B91C1C' }}>{error}</p>}

            {notice && (
              <div
                style={{
                  marginTop: '1rem', padding: '0.75rem 0.875rem', borderRadius: 8,
                  border: '1px solid #C4B5FD', backgroundColor: '#F5F3FF',
                  color: '#4C1D95', fontSize: '0.8125rem',
                }}
              >
                <p style={{ fontWeight: 600, marginBottom: 6 }}>
                  {notice.detached.length} student{notice.detached.length === 1 ? '' : 's'} on custom
                  fees did not receive this change
                </p>
                <p style={{ marginBottom: 8 }}>
                  Tick anyone this should also apply to, then choose which changed fee to pass on.
                  Only that fee is updated for them — their other custom amounts stay as they are,
                  and they remain on custom fees.
                </p>

                <div style={{ marginBottom: 10 }}>
                  {notice.detached.map(s => (
                    <label
                      key={s.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '2px 0' }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedStudents.has(s.id)}
                        onChange={e => {
                          setSelectedStudents(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(s.id); else next.delete(s.id);
                            return next;
                          });
                        }}
                        style={{ width: 15, height: 15 }}
                      />
                      <span>{s.name} <span style={{ opacity: 0.7 }}>({s.class})</span></span>
                    </label>
                  ))}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {notice.changed.map(f => (
                    <Button
                      key={f.name}
                      size="sm"
                      variant="outline"
                      disabled={selectedStudents.size === 0 || applying !== null}
                      onClick={async () => {
                        setApplying(f.name);
                        try {
                          const res: any = await api.post(
                            `/classes/levels/${encodeURIComponent(level)}/fees/apply-to-overridden`,
                            { feeName: f.name, studentIds: [...selectedStudents] },
                          );
                          cache.invalidateOn('level-fee:write');
                          toast.success(
                            `${f.name} set to ${f.to.toLocaleString()} for ${res?.applied ?? 0} student${res?.applied === 1 ? '' : 's'}`,
                          );
                        } catch (e: any) {
                          toast.error(e?.message || `Could not apply ${f.name}.`);
                        } finally {
                          setApplying(null);
                        }
                      }}
                    >
                      {applying === f.name
                        ? 'Applying...'
                        : `Apply ${f.name} (${f.from === null ? 'new' : f.from.toLocaleString()} → ${f.to.toLocaleString()})`}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={dismissNotice} disabled={applying !== null}>
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

            <div
              className="flex items-center justify-between mt-4"
              style={{ gap: '0.5rem', flexWrap: 'wrap' }}
            >
              {/* Left, away from Save, because it does not save this dialog — it
                  opens the other question. Sitting beside Save is how a button
                  gets read as a second way to commit the form. */}
              <Button variant="outline" onClick={openInstallments} disabled={saving}>
                First Installment
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save Fees'}
              </Button>
            </div>
          </>
        )}
        {/* Rendered inside this Dialog so it stacks over it rather than replacing
            it: the level and its amounts stay on screen behind. It gets the level
            LIST as well as the current one, because it picks its own level and
            loads that level's saved fees itself — asking for the list again there
            could answer differently mid-session. */}
        <FirstInstallmentDialog
          open={installmentOpen}
          onOpenChange={setInstallmentOpen}
          levels={levels}
          level={level}
          onSaved={(savedLevel, fees) => {
            // ONLY when it saved the level this dialog is showing.
            //
            // That dialog can be on a different level by the time it writes, and
            // these rows are about to be sent to `level` by Save Fees. Taking
            // another level's fees here would have that save copy them onto this
            // level — renaming its categories and re-billing every student of it.
            // The mismatch case needs no re-sync at all: nothing this dialog holds
            // went stale, because nothing about this level changed.
            if (savedLevel !== level) return;
            // Re-synced from the server's answer, not from the draft that dialog
            // held. Leaving these rows as they were would have the next Save Fees
            // write their stale nulls over the requirement just set.
            setRows((fees ?? []).map(toRow));
            dirty.current = false;
            setUnsaved(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
