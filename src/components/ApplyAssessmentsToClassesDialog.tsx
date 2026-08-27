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
 * Copies ONE class level's whole YEAR of set-up onto other class levels — every
 * term's sequence tests, its exams, their names and order, and what every
 * subject is marked out of.
 *
 * EVERY TERM, not the one showing behind it. A term-at-a-time copy is the same
 * repetition this exists to remove, one level down: an admin who has laid out
 * all three terms of Class 1 would have to reopen this and press it again per
 * term per target, and the term they forget is the one that silently differs.
 * The summary below lists what each term holds so it is clear what "all of it"
 * amounts to before Apply is pressed. A term the source has nothing in is left
 * alone rather than cleared on the target — the admin picked classes to receive
 * a set-up, not terms to empty.
 *
 * The case it exists for: a school whose Class 1 through Class 6 all run three
 * sequence tests and one exam a term, each out of the same totals, set out once
 * and then repeated five times by hand. That repetition is where two classes end
 * up marked out of different totals by a typo nobody notices until the report
 * cards disagree with each other. Modelled on ApplyFeesToClassesDialog, which
 * solves the identical problem for fees.
 *
 * IT COPIES WHAT IS SAVED, not what is on the screen behind it. The server reads
 * the source level's rows; an edit typed into the parent dialog and not yet
 * saved is not part of the set-up yet, and copying it would put a structure on
 * six classes that the source itself does not have. The parent refuses to open
 * this at all while anything is unsaved, for exactly that reason.
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
  academicYear: string;
  /** The school's terms, so the summary can ask about each of them. */
  terms: string[];
}

/** One term's line in the "here is what will be copied" summary. */
interface TermSummary { term: string; tests: number; exams: number }

/** Matches the parent dialog's cap and mobile gutter. */
const DIALOG_MAX_WIDTH = 'min(560px, calc(100vw - 2rem))';

const NAVY = '#0f2345';
const ORANGE = '#e0552e';
const MUTED = '#6B7280';
const RED = '#B91C1C';

export function ApplyAssessmentsToClassesDialog({
  open, onOpenChange, sourceLevel, levels, academicYear, terms,
}: Props) {
  const cache = useSisCache();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the server refused a copy that would delete marks. */
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);
  const [summary, setSummary] = useState<TermSummary[] | null>(null);

  const targets = levels.filter((l) => l !== sourceLevel);

  // Cleared on every open, and on a change of source or year. A tick left over
  // from the last time this was opened would be a class the admin never chose on
  // this occasion, about to have its assessments rewritten.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setError(null);
    setDeleteWarning(null);
  }, [open, sourceLevel, academicYear]);

  // What each term actually holds, so "every term" is a list and not a promise.
  // Read term by term from the structure endpoint the parent already uses rather
  // than from a new one: it is the same answer, and a second way of computing it
  // is a second thing that can disagree with the copy about what is there.
  useEffect(() => {
    if (!open || !sourceLevel || !academicYear) { setSummary(null); return; }
    let alive = true;
    setSummary(null);
    Promise.all(terms.map(async (t): Promise<TermSummary> => {
      try {
        const res: any = await api.get(
          `/test-exams/levels/${encodeURIComponent(sourceLevel)}/structure`
          + `?term=${encodeURIComponent(t)}&academicYear=${encodeURIComponent(academicYear)}`,
        );
        return {
          term: t,
          tests: Array.isArray(res?.tests) ? res.tests.length : 0,
          exams: Array.isArray(res?.exams) ? res.exams.length : 0,
        };
      } catch {
        // A term that cannot be read is shown as empty rather than failing the
        // whole dialog. The copy itself reads the same rows and is authoritative.
        return { term: t, tests: 0, exams: 0 };
      }
    }))
      .then((rows) => { if (alive) setSummary(rows); })
      .catch(() => { if (alive) setSummary([]); });
    return () => { alive = false; };
  }, [open, sourceLevel, academicYear, terms]);

  const termsWithWork = (summary ?? []).filter((s) => s.tests + s.exams > 0);
  const nothingToCopy = summary !== null && termsWithWork.length === 0;

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
      // No `terms` in the body: omitting it is what tells the server "every term
      // this level has set up", which is the promise the button makes.
      const res: any = await api.post(
        `/test-exams/levels/${encodeURIComponent(sourceLevel)}/structure/copy`,
        {
          academicYear,
          targetLevels: [...selected],
          ...(confirmDelete ? { confirmDelete: true } : {}),
        },
      );
      const applied: { classLevel: string; totalsWritten?: number }[] = res?.applied ?? [];
      const failed: { classLevel: string; error: string }[] = res?.failed ?? [];
      const skippedSubjects: { id: number; name: string }[] = res?.skippedSubjects ?? [];
      const strandedSubjects: { id: number; name: string }[] = res?.strandedSubjects ?? [];
      const copiedTerms: string[] = Array.isArray(res?.terms) ? res.terms : [];

      setDeleteWarning(null);

      if (applied.length) {
        cache.invalidateOn('test-exam:write');
        // The terms are named, not counted. "Applied to 3 classes" leaves the
        // admin still having to open each one to find out how much of the year
        // it got.
        toast.success(
          `${sourceLevel}'s ${copiedTerms.length ? copiedTerms.join(', ') : 'sequence tests and exams'}`
          + ` applied to ${applied.map((a) => a.classLevel).join(', ')}`,
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

  const runs = (s: TermSummary) => [
    s.tests ? `${s.tests} sequence test${s.tests === 1 ? '' : 's'}` : null,
    s.exams ? `${s.exams} exam${s.exams === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' and ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: DIALOG_MAX_WIDTH }}>
        <DialogHeader style={{ flex: '0 0 auto' }}>
          <DialogTitle>Apply this set-up to other classes</DialogTitle>
        </DialogHeader>

        <p style={{ fontSize: '0.875rem', color: MUTED, marginTop: 4, flex: '0 0 auto' }}>
          Copies every term <strong style={{ color: NAVY }}>{sourceLevel || '—'}</strong> has set up
          in {academicYear || 'this year'} — the sequence tests and exams, their names, and what every
          subject is marked out of — onto the classes you tick below. Every section of those classes
          gets it.
        </p>

        {/* Spelled out per term. "Every term" is a promise; this is the list, so
            a term that was never set up is visibly not part of the copy rather
            than quietly missing from it afterwards. */}
        <div style={{ flex: '0 0 auto', marginTop: 8 }}>
          {summary === null ? (
            <p style={{ fontSize: '0.8125rem', color: MUTED }}>Reading what {sourceLevel} runs...</p>
          ) : nothingToCopy ? (
            <p style={{ fontSize: '0.8125rem', color: ORANGE }}>
              {sourceLevel} has no sequence tests or exams set up in any term yet, so there is nothing
              to copy. Add them and save first.
            </p>
          ) : (
            summary.map((s) => (
              <p key={s.term} style={{ fontSize: '0.8125rem', color: s.tests + s.exams ? NAVY : MUTED }}>
                <strong>{s.term}</strong>{' — '}
                {s.tests + s.exams ? runs(s) : 'nothing set up, so it is left alone'}
              </p>
            ))
          )}
        </div>

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
            In any term listed above, a class running more papers than {sourceLevel || 'this one'}
            {' '}loses the extra ones, and any marks entered against them. You will be asked again
            before that happens. Subject totals are written over, never cleared, so marks already
            entered keep something to be out of.
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
          <Button
            onClick={() => apply()}
            disabled={applying || selected.size === 0 || summary === null || nothingToCopy}
          >
            {applying
              ? 'Applying...'
              : `Apply${selected.size ? ` to ${selected.size} class${selected.size === 1 ? '' : 'es'}` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
