'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSisCache } from '@/lib/SisCache';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Check, Plus } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Manages which subjects a class LEVEL teaches.
 *
 * The level picker lists levels — "Class 1", "Nursery 1" — and never sections. A
 * subject list belongs to the level and every section shares it, so offering
 * "Class 1 A" would imply a distinction that no longer exists.
 *
 * The whole of the school's subject catalogue is shown as one ticked list rather
 * than as "assigned" plus a picker of what is left: setting up a level means
 * saying yes to a dozen subjects at once, and a select-then-Add flow charges a
 * round trip and three clicks for each one. Here a click is the whole edit, and
 * the tick flips immediately — the request settles behind it, and only a failure
 * puts the tick back.
 *
 * A subject the school has never taught can be typed in at the top: it is added
 * to the catalogue AND to this level in one step, because arriving at this dialog
 * with a subject in mind and being sent elsewhere to create it first is the
 * detour the field exists to remove.
 */

interface Subject {
  id: number;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Navigates to the school-wide subject catalogue. */
  onManageCatalogue?: () => void;
}

const byName = (a: Subject, b: Subject) => a.name.localeCompare(b.name);

/** Union by id, name-sorted — the catalogue is never allowed to lose a row. */
function mergeCatalogue(current: Subject[], incoming: Subject[]): Subject[] {
  const byId = new Map(current.map(s => [s.id, s]));
  for (const s of incoming) byId.set(s.id, s);
  return [...byId.values()].sort(byName);
}

function withTick(ids: Set<number>, id: number, on: boolean): Set<number> {
  const next = new Set(ids);
  if (on) next.add(id); else next.delete(id);
  return next;
}

export function LevelSubjectsDialog({ open, onOpenChange, onManageCatalogue }: Props) {
  const cache = useSisCache();
  const [levels, setLevels] = useState<string[]>([]);
  const [level, setLevel] = useState('');
  const [assignedIds, setAssignedIds] = useState<Set<number>>(new Set());
  const [catalogue, setCatalogue] = useState<Subject[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  // Tracked separately from `loading`: without it, the seconds spent fetching the
  // level list are indistinguishable from having none, and the dialog tells the
  // admin to "create a class first" while their classes are still loading.
  const [levelsLoading, setLevelsLoading] = useState(true);
  // Per-subject rather than one dialog-wide flag: ticking several subjects in a
  // row must not be serialised behind whichever request is still in the air.
  const [pending, setPending] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(null);
    setLevelsLoading(true);
    Promise.all([api.get('/classes/levels'), api.get('/subjects')])
      .then(([lv, subs]: any[]) => {
        if (!alive) return;
        const ls: string[] = lv?.levels ?? [];
        setLevels(ls);
        setCatalogue(mergeCatalogue([], subs ?? []));
        setLevel(prev => (prev && ls.includes(prev) ? prev : ls[0] ?? ''));
      })
      .catch((e: any) => { if (alive) setError(e?.message || 'Could not load class levels.'); })
      .finally(() => { if (alive) setLevelsLoading(false); });
    return () => { alive = false; };
  }, [open]);

  const loadLevel = async (lvl: string) => {
    if (!lvl) return;
    setLoading(true);
    setError(null);
    try {
      const r: any = await api.get(`/classes/levels/${encodeURIComponent(lvl)}/subjects`);
      const subjects: Subject[] = r?.subjects ?? [];
      setAssignedIds(new Set(subjects.map(s => s.id)));
      // A subject assigned to this level must have a row to tick even if the
      // catalogue fetch raced it or failed.
      setCatalogue(prev => mergeCatalogue(prev, subjects));
    } catch (e: any) {
      setError(e?.message || 'Could not load this level’s subjects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !level) return;
    setNewName('');
    loadLevel(level);
  }, [open, level]);

  const toggle = async (s: Subject) => {
    if (!level || pending.includes(s.id)) return;
    const wasOn = assignedIds.has(s.id);
    setError(null);
    setPending(p => [...p, s.id]);
    setAssignedIds(prev => withTick(prev, s.id, !wasOn));
    try {
      if (wasOn) {
        await api.delete(`/classes/levels/${encodeURIComponent(level)}/subjects/${s.id}`);
      } else {
        await api.post(`/classes/levels/${encodeURIComponent(level)}/subjects`, { subjectId: s.id });
      }
      // Every section of this level now teaches it, so any cached per-class
      // subject list is stale.
      cache.invalidate('class-subjects:*', 'test-exams:*');
    } catch (e: any) {
      setAssignedIds(prev => withTick(prev, s.id, wasOn));
      setError(e?.message || `Could not ${wasOn ? 'remove' : 'add'} ${s.name}.`);
    } finally {
      setPending(p => p.filter(id => id !== s.id));
    }
  };

  /** The catalogue row for a typed name, creating it if the school has none. */
  const resolveSubject = async (name: string): Promise<Subject> => {
    const local = catalogue.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (local) return local;
    try {
      return await api.post('/subjects', { name });
    } catch (e: any) {
      // 409: the school already has it under a row this copy of the catalogue
      // predates. Re-read and reuse it rather than making the admin guess why
      // a name they cannot see is taken.
      if (e?.status !== 409) throw e;
      const fresh: Subject[] = (await api.get('/subjects')) ?? [];
      setCatalogue(prev => mergeCatalogue(prev, fresh));
      const found = fresh.find(s => s.name.toLowerCase() === name.toLowerCase());
      if (!found) throw e;
      return found;
    }
  };

  const addNew = async () => {
    const name = newName.trim();
    if (!name || !level || creating) return;
    setCreating(true);
    setError(null);
    try {
      const subject = await resolveSubject(name);
      setCatalogue(prev => mergeCatalogue(prev, [subject]));
      if (!assignedIds.has(subject.id)) {
        await api.post(`/classes/levels/${encodeURIComponent(level)}/subjects`, { subjectId: subject.id });
        cache.invalidate('class-subjects:*', 'test-exams:*');
        setAssignedIds(prev => withTick(prev, subject.id, true));
      }
      setNewName('');
      toast.success(`${subject.name} added to ${level}`);
    } catch (e: any) {
      setError(e?.message || 'Could not add that subject.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 620 }} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Manage Subjects</DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <label className="text-sm font-medium">Class Level</label>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger>
              <SelectValue placeholder={levelsLoading ? 'Loading class levels...' : levels.length ? 'Select a class level' : 'No classes yet'} />
            </SelectTrigger>
            <SelectContent>
              {levels.map(l => (
                <SelectItem key={l} value={l}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {levelsLoading ? (
          <p className="text-sm text-gray-500 py-4">Loading class levels...</p>
        ) : !level ? (
          <p className="text-sm text-gray-500 py-4">Create a class first, then set its subjects here.</p>
        ) : loading ? (
          <p className="text-sm text-gray-500 py-4">Loading subjects...</p>
        ) : (
          <>
            <div className="flex items-end gap-2" style={{ borderTop: '1px solid #E5E7EB', paddingTop: 12 }}>
              <div style={{ flex: 1 }}>
                <label className="text-sm font-medium mb-1 block" htmlFor="new-subject-name">Add a subject</label>
                <Input
                  id="new-subject-name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); addNew(); }
                  }}
                  placeholder="Type a new subject name"
                  disabled={creating}
                />
              </div>
              <Button onClick={addNew} disabled={!newName.trim() || creating} className="flex items-center gap-2">
                <Plus size={16} />
                Add
              </Button>
            </div>

            <div className="mt-4" style={{ maxHeight: 280, overflowY: 'auto' }}>
              {catalogue.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">
                  No subjects in this school’s list yet — add the first one above.
                </p>
              ) : (
                catalogue.map(s => {
                  const on = assignedIds.has(s.id);
                  const inFlight = pending.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s)}
                      onMouseEnter={() => setHovered(s.id)}
                      onMouseLeave={() => setHovered(h => (h === s.id ? null : h))}
                      disabled={inFlight}
                      aria-pressed={on}
                      aria-label={`${s.name}${on ? ' — remove from ' : ' — add to '}${level}`}
                      className="w-full text-left flex items-center gap-2 rounded-md"
                      style={{
                        padding: '8px 10px',
                        border: 'none',
                        background: hovered === s.id && !inFlight ? '#F3F4F6' : 'transparent',
                        cursor: inFlight ? 'default' : 'pointer',
                        opacity: inFlight ? 0.55 : 1,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 18,
                          height: 18,
                          flexShrink: 0,
                          borderRadius: 4,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: `1px solid ${on ? '#2563EB' : '#D1D5DB'}`,
                          background: on ? '#2563EB' : '#FFFFFF',
                          color: '#FFFFFF',
                        }}
                      >
                        {on && <Check size={13} strokeWidth={3} />}
                      </span>
                      <span className="text-sm">{s.name}</span>
                    </button>
                  );
                })
              )}
            </div>

            {error && <p className="text-sm mt-2" style={{ color: '#B91C1C' }}>{error}</p>}

            <div className="flex items-center justify-between mt-4">
              {onManageCatalogue ? (
                <button
                  type="button"
                  onClick={() => { onOpenChange(false); onManageCatalogue(); }}
                  className="text-sm hover:underline"
                  style={{ color: '#2563EB' }}
                >
                  Manage the school’s subject list
                </button>
              ) : <span />}
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating || pending.length > 0}>
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
