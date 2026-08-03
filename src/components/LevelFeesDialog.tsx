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
 */

interface FeeRow {
  /** Absent on a row the user just added; the server creates it. */
  id?: number;
  name: string;
  amount: string;
  includedInFirstInstallment: boolean;
  percent: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function LevelFeesDialog({ open, onOpenChange }: Props) {
  const cache = useSisCache();
  const [levels, setLevels] = useState<string[]>([]);
  const [level, setLevel] = useState('');
  const [sections, setSections] = useState<string[]>([]);
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown after a save that changed amounts while detached students exist.
  const [notice, setNotice] = useState<{ detached: DetachedStudent[]; changed: ChangedFee[] } | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<string | null>(null);
  // Guards the same class of bug as the settings form: a load landing after the
  // user has started editing must not discard their work.
  const dirty = useRef(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    api
      .get('/classes/levels')
      .then((r: any) => {
        const ls: string[] = r?.levels ?? [];
        setLevels(ls);
        setLevel(prev => (prev && ls.includes(prev) ? prev : ls[0] ?? ''));
      })
      .catch((e: any) => setError(e?.message || 'Could not load class levels.'));
  }, [open]);

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
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const addRow = () => {
    dirty.current = true;
    setError(null);
    setRows(rs => [...rs, { name: '', amount: '0', includedInFirstInstallment: false, percent: '100' }]);
  };
  const removeRow = (i: number) => {
    dirty.current = true;
    setError(null);
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
      if (r.includedInFirstInstallment) {
        const p = Number(r.percent);
        if (!r.percent.trim() || !Number.isFinite(p) || p < 0 || p > 100) {
          setError(`"${name}": first installment % must be between 0 and 100.`);
          return;
        }
      }
    }
    setSaving(true);
    try {
      const res: any = await api.put(`/classes/levels/${encodeURIComponent(level)}/fees`, {
        fees: rows.map(r => ({
          ...(r.id != null ? { id: r.id } : {}),
          name: r.name.trim(),
          amount: Math.round(Number(r.amount)),
          firstInstallmentPercent: r.includedInFirstInstallment ? Math.round(Number(r.percent)) : null,
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
          percent: f.firstInstallmentPercent != null ? String(f.firstInstallmentPercent) : '100',
        })),
      );
      const rb = res?.rebill;
      const billed = rb ? rb.created + rb.updated : 0;
      toast.success(
        billed
          ? `${level} fees saved — ${billed} charge${billed === 1 ? '' : 's'} updated across ${rb.students} student${rb.students === 1 ? '' : 's'}`
          : `${level} fees saved`,
      );

      // Students on custom fees did NOT receive this change, by design. Surface
      // them so the admin can pass specific categories on where it should apply,
      // rather than discovering later that a scholarship student kept the old
      // amount.
      const detached: DetachedStudent[] = res?.detachedStudents ?? [];
      const changed: ChangedFee[] = res?.changedFees ?? [];
      if (detached.length && changed.length) {
        setNotice({ detached, changed });
        setSelectedStudents(new Set());
      } else {
        setNotice(null);
      }
    } catch (e: any) {
      setError(e?.message || 'Could not save these fees.');
    } finally {
      setSaving(false);
    }
  };

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
              <span style={{ width: 120, textAlign: 'right' }}>Amount</span>
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
                Total per student: <strong>{total.toLocaleString()}</strong>
              </p>
            </div>

            {error && <p className="text-sm mt-3" style={{ color: '#B91C1C' }}>{error}</p>}

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
                  <Button size="sm" variant="ghost" onClick={() => setNotice(null)} disabled={applying !== null}>
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save Fees'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
