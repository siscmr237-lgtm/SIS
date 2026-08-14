'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSisCache } from '@/lib/SisCache';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Editor for a class LEVEL's fee structure.
 *
 * The level picker deliberately lists levels — "Class 1", "Nursery 1" — and
 * never sections. A fee structure belongs to the level and every section of it
 * shares one, so offering "Class 1 A" would imply a distinction that does not
 * exist. The sections covered are shown as read-only confirmation of that.
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

type FeeGroup = 'REGISTRATION' | 'OTHER_FEES';

interface FeeRow {
  /** Absent on a row the user just added; the server creates it. */
  id?: number;
  name: string;
  amount: string;
  includedInFirstInstallment: boolean;
  percent: string;
  /** One of the two fixed groups. Registration is out of the first-installment rule. */
  group: FeeGroup;
}

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
const MUTED = '#6B7280';

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
  const [sections, setSections] = useState<string[]>([]);
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markingFree, setMarkingFree] = useState(false);
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
    api
      .get(`/classes/levels/${encodeURIComponent(level)}/fees`)
      .then((r: any) => {
        if (!alive || dirty.current) return;
        setSections(r?.sections ?? []);
        setRows(
          (r?.fees ?? []).map((f: any) => ({
            id: f.id,
            name: f.name,
            amount: String(f.amount ?? 0),
            includedInFirstInstallment: f.firstInstallmentPercent != null,
            group: (f.group ?? 'OTHER_FEES') as FeeGroup,
            percent: f.firstInstallmentPercent != null ? String(f.firstInstallmentPercent) : '100',
          })),
        );
      })
      .catch((e: any) => { if (alive) setError(e?.message || 'Could not load this level’s fees.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, level]);

  const edit = (i: number, patch: Partial<FeeRow>) => {
    dirty.current = true;
    setError(null);
    setZeroNotice(null);
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const addRow = () => {
    dirty.current = true;
    setError(null);
    setZeroNotice(null);
    setRows(rs => [...rs, { name: '', amount: '0', includedInFirstInstallment: false, percent: '100', group: 'OTHER_FEES' }]);
  };
  const removeRow = (i: number) => {
    dirty.current = true;
    setError(null);
    setRows(rs => rs.filter((_, idx) => idx !== i));
  };

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
      if (r.includedInFirstInstallment) {
        const p = Number(r.percent);
        if (!r.percent.trim() || !Number.isFinite(p) || p < 0 || p > 100) {
          setError(`"${name}": first installment % must be between 0 and 100.`);
          return;
        }
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
          firstInstallmentPercent: r.group === 'REGISTRATION' || !r.includedInFirstInstallment ? null : Math.round(Number(r.percent)),
          group: r.group,
        })),
      });
      dirty.current = false;
      // Re-billing changed students' charges, so their fee status is stale too.
      cache.invalidateOn('level-fee:write');
      setRows(
        (res?.fees ?? []).map((f: any) => ({
          id: f.id,
          name: f.name,
          amount: String(f.amount ?? 0),
          includedInFirstInstallment: f.firstInstallmentPercent != null,
            group: (f.group ?? 'OTHER_FEES') as FeeGroup,
          percent: f.firstInstallmentPercent != null ? String(f.firstInstallmentPercent) : '100',
        })),
      );
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

  /**
   * "This level charges nothing" — a statement, recorded in the database.
   *
   * Needed because a level with no fees and a level nobody has got to yet look
   * identical in the data, so without this a school with a free nursery could
   * never finish the fees step and the checklist would nag about it forever.
   *
   * Browser state would not do: the checklist is a live query the server answers,
   * and a flag the server cannot see would leave the two permanently disagreeing.
   */
  const markNoFees = async () => {
    if (markingFree || saving) return;
    const charged = rows.filter(r => (Number(r.amount) || 0) > 0);
    if (charged.length) {
      setError(
        `${level} still charges ${charged.map(r => r.name.trim() || 'an unnamed fee').join(', ')}. `
        + 'Clear those amounts first if this level is free.',
      );
      return;
    }
    setError(null);
    setZeroNotice(null);
    setMarkingFree(true);
    const freedLevel = level;
    try {
      const res: any = await api.post(`/classes/levels/${encodeURIComponent(freedLevel)}/no-fees`, {});
      dirty.current = false;
      cache.invalidateOn('level-fee:write');
      const removed = res?.removedEmptyFees ?? 0;
      toast.success(
        removed
          ? `${freedLevel} charges nothing — ${removed} empty categor${removed === 1 ? 'y' : 'ies'} removed`
          : `${freedLevel} charges nothing`,
      );
      setRows([]);
      if (res?.feeSetup) walk(res.feeSetup, freedLevel);
    } catch (e: any) {
      setError(e?.message || 'Could not mark this level as free.');
    } finally {
      setMarkingFree(false);
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
          <DialogDescription>
            Fees belong to a class level and apply to every section of it. Saving re-bills all
            students in the level, including any who have already paid in full.
          </DialogDescription>
        </DialogHeader>

        {progress && (
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 8,
              border: '1px solid #DDE3EC', backgroundColor: '#F5F7FA', color: NAVY,
            }}
          >
            <span className="text-sm" style={{ fontWeight: 600 }}>
              {progress.done} of {progress.total} level{progress.total === 1 ? '' : 's'} done — now: {level || '—'}
            </span>
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
          {sections.length > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              Applies to: {sections.join(', ')}
            </p>
          )}
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
                amount, or use “No fees for this level” if that is intended.
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
              <span style={{ width: 132, textAlign: 'center' }}>Group</span>
              <span style={{ width: 110, textAlign: 'right' }}>Amount</span>
              <span style={{ width: 150, textAlign: 'center' }}>First installment</span>
              <span style={{ width: 32 }} />
            </div>

            <div className="space-y-2" style={{ maxHeight: 320, overflowY: 'auto', paddingTop: 8 }}>
              {rows.length === 0 && (
                <p className="text-sm text-gray-500">No fees for this level. Add one below.</p>
              )}
              {rows.map((r, i) => (
                <div key={r.id ?? `new-${i}`} className="flex items-center gap-2">
                  <Input
                    style={{ flex: 1 }}
                    placeholder="Fee name"
                    value={r.name}
                    onChange={e => edit(i, { name: e.target.value })}
                  />
                  {/* Two fixed options, never free text. Registration means the
                      same thing in every school because the first-installment
                      rule is written in terms of it; a school-nameable group
                      would make that rule mean whatever each school typed. */}
                  <select
                    value={r.group}
                    onChange={e => edit(i, { group: e.target.value as FeeGroup })}
                    aria-label={`Group for ${r.name || 'this fee'}`}
                    style={{
                      width: 132, height: 36, borderRadius: 6, padding: '0 8px',
                      border: '1px solid #D1D5DB', backgroundColor: '#FFFFFF',
                      fontSize: '0.875rem', cursor: 'pointer',
                    }}
                  >
                    <option value="OTHER_FEES">Other Fees</option>
                    <option value="REGISTRATION">Registration</option>
                  </select>
                  <Input
                    type="number"
                    min={0}
                    style={{ width: 110, textAlign: 'right' }}
                    value={r.amount}
                    onChange={e => edit(i, { amount: e.target.value })}
                  />
                  {/* Not offered for Registration: the server ignores whatever is
                      stored there (see buildFirstInstallmentRule), and a control
                      that changes nothing is worse than no control. */}
                  {r.group === 'REGISTRATION' ? (
                    <div
                      className="text-xs text-gray-400"
                      style={{ width: 150, textAlign: 'center' }}
                      title="Registration is never part of the first installment"
                    >
                      Not applicable
                    </div>
                  ) : (
                  <div className="flex items-center gap-1" style={{ width: 150, justifyContent: 'center' }}>
                    <input
                      type="checkbox"
                      checked={r.includedInFirstInstallment}
                      onChange={e => edit(i, { includedInFirstInstallment: e.target.checked })}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                      aria-label={`Include ${r.name || 'this fee'} in first installment`}
                    />
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={r.includedInFirstInstallment ? r.percent : ''}
                      onChange={e => edit(i, { percent: e.target.value })}
                      disabled={!r.includedInFirstInstallment}
                      placeholder="—"
                      style={{ width: 72, textAlign: 'right' }}
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                  )}
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
                Total per student: <strong>{total.toLocaleString()}</strong>
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

            <div className="flex items-center justify-between gap-2 mt-4" style={{ flexWrap: 'wrap' }}>
              {/* Offered in both contexts: whether a level is free is a fact
                  about the school, not about which screen you happen to be on.
                  Only the moving-on afterwards is wizard-only. */}
              <Button
                variant="outline"
                onClick={markNoFees}
                disabled={saving || markingFree || !level}
                title={`Record that ${level || 'this level'} charges nothing`}
              >
                {markingFree ? 'Saving...' : 'No fees for this level'}
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving || markingFree}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={saving || markingFree}>
                  {saving ? 'Saving...' : 'Save Fees'}
                </Button>
              </div>
            </div>
            {inWizard && (
              <p className="text-xs" style={{ color: MUTED, marginTop: 6 }}>
                Saving moves on to the next level that still needs fees.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
