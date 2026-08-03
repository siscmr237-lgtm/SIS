'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSisCache } from '@/lib/SisCache';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Manages which subjects a class LEVEL teaches.
 *
 * The level picker lists levels — "Class 1", "Nursery 1" — and never sections. A
 * subject list belongs to the level and every section shares it, so offering
 * "Class 1 A" would imply a distinction that no longer exists. The sections a
 * change affects are shown as read-only confirmation.
 *
 * Subjects are picked from the school's own catalogue; creating or deleting the
 * subjects themselves is a separate concern, reachable from the link at the foot
 * of the dialog.
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

export function LevelSubjectsDialog({ open, onOpenChange, onManageCatalogue }: Props) {
  const cache = useSisCache();
  const [levels, setLevels] = useState<string[]>([]);
  const [level, setLevel] = useState('');
  const [sections, setSections] = useState<string[]>([]);
  const [assigned, setAssigned] = useState<Subject[]>([]);
  const [catalogue, setCatalogue] = useState<Subject[]>([]);
  const [toAdd, setToAdd] = useState('');
  const [loading, setLoading] = useState(false);
  // Tracked separately from `loading`: without it, the seconds spent fetching the
  // level list are indistinguishable from having none, and the dialog tells the
  // admin to "create a class first" while their classes are still loading.
  const [levelsLoading, setLevelsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
        setCatalogue(subs ?? []);
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
      setSections(r?.sections ?? []);
      setAssigned(r?.subjects ?? []);
    } catch (e: any) {
      setError(e?.message || 'Could not load this level’s subjects.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !level) return;
    setToAdd('');
    loadLevel(level);
  }, [open, level]);

  const assignedIds = new Set(assigned.map(s => s.id));
  const available = catalogue.filter(s => !assignedIds.has(s.id));

  const add = async () => {
    if (!toAdd || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/classes/levels/${encodeURIComponent(level)}/subjects`, { subjectId: Number(toAdd) });
      // Every section of this level now teaches it, so any cached per-class
      // subject list is stale.
      cache.invalidate('class-subjects:*', 'test-exams:*');
      setToAdd('');
      await loadLevel(level);
      toast.success(`Added to ${level}`);
    } catch (e: any) {
      setError(e?.message || 'Could not add that subject.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: Subject) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/classes/levels/${encodeURIComponent(level)}/subjects/${s.id}`);
      cache.invalidate('class-subjects:*', 'test-exams:*');
      await loadLevel(level);
      toast.success(`${s.name} removed from ${level}`);
    } catch (e: any) {
      setError(e?.message || 'Could not remove that subject.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 620 }}>
        <DialogHeader>
          <DialogTitle>Manage Subjects</DialogTitle>
          <DialogDescription>
            Subjects belong to a class level and are taught by every section of it.
          </DialogDescription>
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
          {sections.length > 0 && (
            <p className="text-sm text-gray-500 mt-2">Applies to: {sections.join(', ')}</p>
          )}
        </div>

        {levelsLoading ? (
          <p className="text-sm text-gray-500 py-4">Loading class levels...</p>
        ) : !level ? (
          <p className="text-sm text-gray-500 py-4">Create a class first, then set its subjects here.</p>
        ) : loading ? (
          <p className="text-sm text-gray-500 py-4">Loading subjects...</p>
        ) : (
          <>
            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: 12 }}>
              {assigned.length === 0 ? (
                <p className="text-sm text-gray-500">No subjects for {level} yet.</p>
              ) : (
                <div className="space-y-2" style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {assigned.map(s => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between"
                      style={{ padding: '4px 0' }}
                    >
                      <span className="text-sm">{s.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(s)}
                        disabled={busy}
                        aria-label={`Remove ${s.name} from ${level}`}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-end gap-2 mt-4">
              <div style={{ flex: 1 }}>
                <label className="text-sm font-medium">Add a subject</label>
                <Select value={toAdd} onValueChange={setToAdd}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={available.length ? 'Select a subject' : 'All subjects already added'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={add} disabled={!toAdd || busy} className="flex items-center gap-2">
                <Plus size={16} />
                Add
              </Button>
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
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                Done
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
