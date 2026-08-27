'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useSisCache } from '@/lib/SisCache';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from './ui/dialog';
import { toast } from 'sonner';

/**
 * Copies ONE class level's term set-up onto other class levels — its sequence
 * tests, its exams, their names and order, and what every subject is marked out
 * of.
 *
 * The case it exists for: a school whose Class 1 through Class 6 all run three
 * sequence tests and one exam, each out of the same totals, set out once and
 * then repeated five times by hand. That repetition is where two classes end up
 * marked out of different totals by a typo nobody notices until the report cards
 * disagree with each other. Modelled on ApplyFeesToClassesDialog, which solves
 * the identical problem for fees.
 *
 * IT COPIES WHAT IS SAVED, not what is on the screen behind it. The server reads
 * the source level's rows; an edit typed into the parent dialog and not yet
 * saved is not part of the set-up yet, and copying it would put a structure on
 * six classes that the source itself does not have. The parent keeps Save next
 * to this button for exactly that reason.
 *
 * THE STRUCTURE IS REPLACED; THE TOTALS ARE MERGED. Those two rules differ on
 * purpose, and the difference is worth stating on screen rather than only in the
 * server:
 *
 *   Structure — a target running four sequence tests where the source runs three
 *   loses the fourth, and every mark against it. That is what making the classes
 *   match means, so it is warned about here and confirmed before it runs.
 *
 *   Totals — deleting a subject total does NOT delete the marks under it (marks
 *   hang off the assessment, not off the total), so clearing one would leave
 *   marks with nothing to be out of and every screen that scores them would skip
 *   the subject in silence. So totals are written over, never cleared: a subject
 *   the target teaches and the source does not keeps whatever it had.
 *
 * NOTHING IS PRE-TICKED, and there is no select-all — every box is a class whose
 * assessments are about to be rewritten, and ticking six is cheaper than undoing
 * one that was ticked by default. The source is not in the list: copying a level
 * onto itself is refused by the server, and this is the half that keeps it off
 * screen.
 *
 * PARTIAL SUCCESS IS A REAL OUTCOME. The server runs one transaction per target,
 * so a class that fails rolls back alone and the others still land. Both halves
 * are reported, because an admin told only "something went wrong" has no way to
 * know which four of five classes are now correct.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The level whose set-up is being copied — the one the parent is showing. */
  sourceLevel: string;
  /** Every class level the school has. The source is filtered out here. */
  levels: string[];
  term: string;
  academicYear: string;
  /** What the source runs, purely so the dialog can say so before it is applied. */
  testCount: number;
  examCount: number;
}

/** Matches the parent dialog's cap and mobile gutter. */
const DIALOG_MAX_WIDTH = 'min(560px, calc(100vw - 2rem))';

const NAVY = '#0f2345';
const ORANGE = '#e0552e';
const MUTED = '#6B7280';
const RED = '#B91C1C';

export function ApplyAssessmentsToClassesDialog({
  open, onOpenChange, sourceLevel, levels, term, academicYear, testCount, examCount,
}: Props) {
  const cache = useSisCache();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the server refused a copy that would delete marks. */
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  const targets = levels.filter((l) => l !== sourceLevel);

  // Cleared on every open, and on a change of source or period. A tick left over
  // from the last time this was opened would be a class the admin never chose on
  // this occasion, about to have its assessments rewritten.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setError(null);
    setDeleteWarning(null);
  }, [open, sourceLevel, term, academicYear]);

  const toggle = (level: string, on: boolean) => {
    setError(null);
    setDeleteWarning(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(level); else next.delete(level);
      return next;
    });
  };

  const apply = async (confirmDelete = false) => {
    if (applying || selected.size === 0) return;
    setApplying(true);
    setError(null);
    if (!confirmDelete) setDeleteWarning(null);
    try {
      const res: any = await api.post(
        `/test-exams/levels/${encodeURIComponent(sourceLevel)}/structure/copy`,
        {
          term,
          academicYear,
          targetLevels: [...selected],
          ...(confirmDelete ? { confirmDelete: true } : {}),
        },
      );
      const applied: { classLevel: string; totalsWritten?: number }[] = res?.applied ?? [];
      const failed: { classLevel: string; error: string }[] = res?.failed ?? [];
      const skippedSubjects: { id: number; name: string }[] = res?.skippedSubjects ?? [];
      const strandedSubjects: { id: number; name: string }[] = res?.strandedSubjects ?? [];

      setDeleteWarning(null);

      if (applied.length) {
        cache.invalidateOn('test-exam:write');
        toast.success(
          `${sourceLevel}'s ${term} sequence tests and exams applied to ${applied.map((a) => a.classLevel).join(', ')}`,
        );
        // Named rather than counted: a subject the target does not teach is a
        // real gap in that class's set-up, and the admin has to decide whether
        // the subject belongs there or the total does not.
        if (skippedSubjects.length) {
          toast.info(
            `Skipped ${skippedSubjects.map((s) => s.name).join(', ')}`,
            { description: 'Those subjects are not taught at every class you picked, so no total was set for them there.' },
          );
        }
        // Different reason, so a different message: the subject IS taught there,
        // and its total was left alone because lowering it would have put marks
        // already entered above what the paper is out of.
        if (strandedSubjects.length) {
          toast.info(
            `Kept the existing total for ${strandedSubjects.map((s) => s.name).join(', ')}`,
            { description: 'Marks already entered there are above the total being copied, so the old total was left in place. Fix those marks first if you want them to match.' },
          );
        }
      }
      if (failed.length) {
        toast.error(
          `Could not apply to ${failed.map((f) => f.classLevel).join(', ')}: ${failed[0].error}`,
        );
      }

      // Closes only if something landed. With nothing applied there is an error
      // to read and a selection worth keeping, so the dialog stays put.
      if (applied.length) onOpenChange(false);
      else setError(failed[0]?.error || 'No classes were updated.');
    } catch (e: any) {
      if (e?.code === 'DELETES_MARKS') {
        setDeleteWarning(e?.message || 'This removes assessments that already hold marks.');
      } else {
        setError(e?.message || 'Could not apply this set-up.');
      }
    } finally {
      setApplying(false);
    }
  };

  const runs = [
    testCount ? `${testCount} sequence test${testCount === 1 ? '' : 's'}` : null,
    examCount ? `${examCount} exam${examCount === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' and ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: DIALOG_MAX_WIDTH }}>
        <DialogHeader style={{ flex: '0 0 auto' }}>
          <DialogTitle>Apply this set-up to other classes</DialogTitle>
        </DialogHeader>

        <p style={{ fontSize: '0.875rem', color: MUTED, marginTop: 4, flex: '0 0 auto' }}>
          Copies <strong style={{ color: NAVY }}>{sourceLevel || '—'}</strong>&rsquo;s {term} set-up
          {runs ? <> — {runs}, their names, and what every subject is marked out of</> : null}
          {' '}onto the classes you tick below. Every section of those classes gets it.
        </p>

        {/* Before the checklist, not after it: the warning has to be readable
            while the boxes are being ticked, not once the choice is made. */}
        <div
          role="alert"
          style={{
            marginTop: 12, padding: '0.6rem 0.75rem', borderRadius: 8, flex: '0 0 auto',
            border: '1px solid #F5C6B4', backgroundColor: '#FDF3EF', color: ORANGE,
          }}
        >
          <p style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            This REPLACES the sequence tests and exams on the classes you pick.
          </p>
          <p style={{ fontSize: '0.8125rem', marginTop: 4 }}>
            A class running more papers than {sourceLevel || 'this one'} loses the extra ones, and any
            marks entered against them. You will be asked again before that happens. Subject totals
            are written over, never cleared, so marks already entered keep something to be out of.
          </p>
        </div>

        {/* THE ONE SCROLLING CHILD — see ManageTestsExamsDialog for why the basis
            is `auto` and not 0. */}
        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', marginTop: 12, paddingRight: 4 }}>
          {targets.length === 0 ? (
            <p style={{ fontSize: '0.875rem', color: MUTED, padding: '1rem 0' }}>
              This school has no other class levels to apply this set-up to.
            </p>
          ) : (
            targets.map((l) => (
              <label
                key={l}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '0.4rem 0.25rem', cursor: applying ? 'default' : 'pointer',
                  fontSize: '0.875rem', color: NAVY, overflowWrap: 'anywhere',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(l)}
                  disabled={applying}
                  onChange={(e) => toggle(l, e.target.checked)}
                  style={{ width: 15, height: 15, flex: '0 0 auto' }}
                />
                <span>{l}</span>
              </label>
            ))
          )}
        </div>

        {error && <p style={{ fontSize: '0.875rem', color: RED, marginTop: 8, flex: '0 0 auto' }}>{error}</p>}

        {deleteWarning && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
              marginTop: 8, flex: '0 0 auto',
            }}
          >
            <span style={{ fontSize: '0.875rem', color: ORANGE, flex: '1 1 12rem', minWidth: 0 }}>
              {deleteWarning}
            </span>
            <Button variant="destructive" size="sm" disabled={applying} onClick={() => apply(true)}>
              {applying ? 'Applying...' : 'Remove them and apply'}
            </Button>
            <Button variant="outline" size="sm" disabled={applying} onClick={() => setDeleteWarning(null)}>
              Cancel
            </Button>
          </div>
        )}

        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            gap: '0.5rem', marginTop: 16, flexWrap: 'wrap', flex: '0 0 auto',
          }}
        >
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={() => apply()} disabled={applying || selected.size === 0}>
            {applying
              ? 'Applying...'
              : `Apply${selected.size ? ` to ${selected.size} class${selected.size === 1 ? '' : 'es'}` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
