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
 * Copies ONE level's fee structure onto other levels.
 *
 * The case it exists for: a school whose Class 1 through Class 6 all charge the
 * same thing, set out once and then repeated five times by hand — which is where
 * the amounts drift apart by a typo nobody notices until a parent queries a bill.
 *
 * IT REPLACES. Every fee already on a target level is deleted and the source's
 * are written in its place, so the two levels genuinely match afterwards rather
 * than the target ending up with the union of both. That is destructive to data
 * an admin may have typed, and not undoable from this screen, so the warning is
 * stated on the dialog BEFORE Apply is reachable — not raised as a confirm
 * afterwards, which is read as a formality and clicked through.
 *
 * NOTHING IS PRE-TICKED, and there is no select-all. Every box is a level whose
 * fees are about to be deleted; the work of ticking six of them is small next to
 * the work of undoing one that was ticked by default.
 *
 * The source level is not in the list. Copying a level onto itself would delete
 * its fees and recreate them under new ids — losing every charge attached to the
 * old ones — so the server refuses it too; this is the half that keeps it off
 * screen in the first place.
 *
 * PARTIAL SUCCESS IS A REAL OUTCOME. The server runs one transaction per target,
 * so a level that fails rolls back alone and the others still land. This reports
 * both halves rather than one summary: an admin told only "something went wrong"
 * has no way to know which four of five classes are now correct.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The level whose fees are being copied — the one the parent is showing. */
  sourceLevel: string;
  /**
   * Every class level the school has. Passed down rather than fetched again: the
   * Fee Categories dialog already asked, and a second request could answer
   * differently mid-session. The source is filtered out here.
   */
  levels: string[];
  /**
   * Called after at least one level was written, so the parent can refresh
   * anything that reads fees. The parent stays open on its own level, which this
   * never touches.
   */
  onApplied?: () => void;
}

/** Matches the parent dialog's cap and mobile gutter — see DIALOG_MAX_WIDTH there. */
const DIALOG_MAX_WIDTH = 'min(560px, calc(100% - 32px))';

const NAVY = '#0f2345';
const ORANGE = '#e0552e';
const MUTED = '#6B7280';
const RED = '#B91C1C';

export function ApplyFeesToClassesDialog({ open, onOpenChange, sourceLevel, levels, onApplied }: Props) {
  const cache = useSisCache();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = levels.filter((l) => l !== sourceLevel);

  // Cleared on every open, and on a change of source. A tick left over from the
  // last time this was opened would be a class the admin never chose on this
  // occasion, about to have its fees deleted.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setError(null);
  }, [open, sourceLevel]);

  const toggle = (level: string, on: boolean) => {
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(level); else next.delete(level);
      return next;
    });
  };

  const apply = async () => {
    if (applying || selected.size === 0) return;
    setApplying(true);
    setError(null);
    try {
      const res: any = await api.post('/classes/fees/copy', {
        sourceClassLevelId: sourceLevel,
        targetClassLevelIds: [...selected],
      });
      const applied: { classLevel: string }[] = res?.applied ?? [];
      const failed: { classLevel: string; error: string }[] = res?.failed ?? [];

      if (applied.length) {
        // Re-billing rewrote charges on the target levels, so every cached fee
        // structure and student status is stale — the same invalidation a save
        // does, for the same reason.
        cache.invalidateOn('level-fee:write');
        onApplied?.();
        toast.success(
          `${sourceLevel} fees applied to ${applied.map((a) => a.classLevel).join(', ')}`,
        );
      }
      if (failed.length) {
        // Named, not counted. Which class still has its old fees is the thing
        // the admin has to go and fix.
        toast.error(
          `Could not apply to ${failed.map((f) => f.classLevel).join(', ')}: ${failed[0].error}`,
        );
      }

      // Closes only if something landed. With nothing applied there is an error
      // to read and a selection worth keeping, so the dialog stays put.
      if (applied.length) {
        onOpenChange(false);
      } else {
        setError(failed[0]?.error || 'No class levels were updated.');
      }
    } catch (e: any) {
      setError(e?.message || 'Could not apply these fees.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: DIALOG_MAX_WIDTH }}>
        <DialogHeader>
          <DialogTitle>Apply fees to other classes</DialogTitle>
        </DialogHeader>

        <p style={{ fontSize: '0.875rem', color: MUTED, marginTop: 4 }}>
          Copies every fee category on <strong style={{ color: NAVY }}>{sourceLevel || '—'}</strong>
          {' '}— name, amount, group and first installment — onto the classes you tick below.
        </p>

        {/* Before the checklist, not after it: the warning has to be readable
            while the boxes are being ticked, not once the choice is made. */}
        <div
          role="alert"
          style={{
            marginTop: 12, padding: '0.6rem 0.75rem', borderRadius: 8,
            border: '1px solid #F5C6B4', backgroundColor: '#FDF3EF', color: ORANGE,
          }}
        >
          <p style={{ fontSize: '0.8125rem', fontWeight: 600 }}>
            This will REPLACE all fee categories on the selected classes.
          </p>
          <p style={{ fontSize: '0.8125rem', marginTop: 4 }}>
            Any existing fees on those classes will be deleted. Students already enrolled in those
            classes will be re-billed.
          </p>
        </div>

        {targets.length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: MUTED, padding: '1rem 0' }}>
            This school has no other class levels to apply these fees to.
          </p>
        ) : (
          <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 12, paddingRight: 4 }}>
            {targets.map((l) => (
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
            ))}
          </div>
        )}

        {error && <p style={{ fontSize: '0.875rem', color: RED, marginTop: 8 }}>{error}</p>}

        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            gap: '0.5rem', marginTop: 16, flexWrap: 'wrap',
          }}
        >
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={applying || selected.size === 0}>
            {applying
              ? 'Applying...'
              : `Apply${selected.size ? ` to ${selected.size} class${selected.size === 1 ? '' : 'es'}` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
