'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '../lib/api';
import { useCachedResource, useSisCache } from '../lib/SisCache';
import { useAcademicYear } from '@/lib/academicYear';
import { NavigationPage } from '../App';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { LevelFeesDialog } from './LevelFeesDialog';
import { LevelSubjectsDialog } from './LevelSubjectsDialog';
import { ManageTestsExamsDialog } from './ManageTestsExamsDialog';
import { StaffForm, StaffFormPayload } from './StaffForm';

/**
 * The post-KYC setup wizard.
 *
 * Walks the five things KYC did not do, in dependency order. It does NOT repeat
 * school details, classes or sections — onboarding already collected those, and
 * a wizard that opens by asking again for what someone just entered reads as
 * broken.
 *
 * It reuses the EXISTING setup tools rather than containing its own copies:
 *
 *   Fees      <LevelFeesDialog>          the same dialog the Classes screen opens
 *   Subjects  <LevelSubjectsDialog>      likewise
 *   Totals    <ManageTestsExamsDialog>   the same dialog Sequence Tests & Exams opens
 *   Staff     <StaffForm mode="add">     the same form the Staff screen submits
 *   Students  routes to the Students screen
 *
 * The first four are standalone `{ open, onOpenChange }` dialogs, so the wizard
 * opens them in place and nothing is duplicated. Add Student is the exception:
 * it is written inline inside StudentsManagement rather than as a component, so
 * the wizard ROUTES there instead of reproducing it. A second copy of that form
 * would be exactly the drift this approach exists to avoid.
 *
 * Nothing about skipping is recorded. A skipped step simply has no data, so it
 * reads as outstanding on the dashboard checklist, which is the same live query
 * this screen is driven by. The wizard guides once; the checklist catches the
 * rest.
 *
 * MOVEMENT IS ALWAYS THE USER'S. The wizard opens on the first step that is not
 * done and then never changes step by itself — not on mount, not on a refresh
 * landing while someone is reading. When a step becomes complete through work
 * done in this session it offers a prominent Continue, and waits. A screen that
 * moves on its own leaves people unsure whether what they just did worked.
 */

type ToolId = 'fees' | 'subjects' | 'assessment-totals' | 'staff' | 'students';

interface WizardStep {
  id: ToolId;
  title: string;
  description: string;
  page: NavigationPage;
  action: string;
  done: boolean;
  missingLevels?: string[];
  blockedOnClasses?: boolean;
  everyLevel?: boolean;
  count?: number;
}

interface WizardData {
  show: boolean;
  completedCount: number;
  totalCount: number;
  steps: WizardStep[];
}

const DONE = '#05603d';
const NAVY = '#0f2345';
const MUTED = '#6B7280';

/** What this step still needs, in words. Mirrors the checklist's wording. */
function outstanding(step: WizardStep): string | null {
  if (step.done) return null;
  if (step.blockedOnClasses) return 'Add your classes first — this is set per class level.';
  if (step.missingLevels?.length) {
    const shown = step.missingLevels.slice(0, 4).join(', ');
    const rest = step.missingLevels.length - 4;
    return `Still needed for: ${shown}${rest > 0 ? ` and ${rest} more` : ''}.`;
  }
  return null;
}

interface WizardProps {
  onNavigate?: (page: NavigationPage) => void;
  /**
   * Open at THIS step, rather than at the first incomplete one.
   *
   * Set when the dashboard checklist asks for a specific step, and it has to win
   * over the first-incomplete default: clicking "Subjects" while fees are also
   * outstanding must open subjects. Landing on fees because fees happen to come
   * first would ignore what the admin actually asked for, which is the one thing
   * a click must never do.
   *
   * It also OVERRIDES `show`. The wizard runs once and then stamps itself seen,
   * so for everyone past that first session `show` is false forever — and the
   * checklist, whose whole job is to catch what the wizard skipped, is used
   * precisely by those people. Without this the click would open nothing at all.
   *
   * null means an ordinary cold open: show only when the server says to, and
   * land on the first incomplete step exactly as before.
   */
  openAtStep?: string | null;
  /** Clear openAtStep. Called when a checklist-opened wizard is closed. */
  onCloseRequested?: () => void;
}

export function SetupWizard({ onNavigate, openAtStep = null, onCloseRequested }: WizardProps) {
  const cache = useSisCache();
  const { status: yearStatus } = useAcademicYear();
  // Live, uncached — the same data the dashboard checklist reads, so the two
  // cannot disagree about what is done.
  const { data, loading, refresh } = useCachedResource<WizardData>(
    null,
    () => api.get('/dashboard/setup-wizard'),
    { policy: 'fresh' },
  );

  const [index, setIndex] = useState(0);
  const [tool, setTool] = useState<ToolId | null>(null);
  const [exited, setExited] = useState(false);
  /** Whether the opening step has been chosen yet — see the landing effect. */
  const landed = useRef(false);
  /** The done/not-done the wizard opened with, to spot what changes under it. */
  const doneAtStart = useRef<Set<ToolId> | null>(null);
  /**
   * Steps that went from outstanding to done while this wizard was open.
   *
   * The trigger for offering Continue, and the reason it is a set rather than a
   * flag: someone can go back to an earlier step, and the offer should still be
   * there for the one they actually finished.
   */
  const [completedHere, setCompletedHere] = useState<Set<ToolId>>(new Set());

  /**
   * Leaving the wizard, by finishing or by skipping out of the last step.
   *
   * Hidden locally first so the overlay goes away immediately rather than after
   * a round trip; the flag is what stops it coming back on the next login. If
   * the write fails the wizard simply reappears next time, which is a better
   * failure than a wizard that will not close.
   */
  const exit = useCallback(async (goTo?: NavigationPage) => {
    setTool(null);

    // Opened FROM the checklist: just close it again. Stamping "seen" here would
    // be recording the wrong fact — they did not walk the wizard, they clicked
    // one item on a checklist — and for an admin who has not yet been through
    // it, one checklist click would silently burn their first run.
    if (openAtStep) {
      onCloseRequested?.();
      if (goTo && onNavigate) onNavigate(goTo);
      return;
    }

    setExited(true);
    try {
      await api.post('/dashboard/setup-wizard/dismiss', {});
    } catch {
      // Deliberately swallowed — see above.
    }
    if (goTo && onNavigate) onNavigate(goTo);
  }, [onNavigate, openAtStep, onCloseRequested]);

  /**
   * Where to open: the first step that is not done.
   *
   * Runs exactly once, on the first load that brings steps. Deliberately NOT on
   * every load — a returning admin who completes step 2 must stay on step 2 and
   * be offered the move, not be yanked forward by a refresh landing under them.
   * The wizard never moves the user; only the user does.
   */
  useEffect(() => {
    const steps = data?.steps;
    if (landed.current || !steps?.length) return;
    landed.current = true;
    doneAtStart.current = new Set(steps.filter((s) => s.done).map((s) => s.id));
    const firstOutstanding = steps.findIndex((s) => !s.done);
    setIndex(firstOutstanding === -1 ? 0 : firstOutstanding);
  }, [data]);

  /**
   * An explicit target beats the first-incomplete default.
   *
   * Keyed on openAtStep rather than guarded by a ref, so asking for the same
   * step twice reopens it — the dashboard clears openAtStep on close, and
   * without that the second click on the same checklist row would do nothing.
   *
   * doneAtStart is seeded here too when the wizard has never landed cold, so the
   * Continue button still appears if the admin completes this step while it is
   * open. Both effects can run for the same load; whichever sets `index` last
   * wins, and that is this one, because a request is a decision and the default
   * is only a default.
   */
  useEffect(() => {
    const steps = data?.steps;
    if (!openAtStep || !steps?.length) return;
    const target = steps.findIndex((s) => s.id === openAtStep);
    if (target === -1) return;   // not a wizard step; the checklist routes those
    if (!doneAtStart.current) {
      doneAtStart.current = new Set(steps.filter((s) => s.done).map((s) => s.id));
    }
    landed.current = true;
    setExited(false);
    setIndex(target);
  }, [openAtStep, data]);

  /**
   * Notice a step becoming complete, WITHOUT acting on it.
   *
   * Completion is the server's `done` — the same every-level rule the dashboard
   * checklist is ticked by, re-read live after a tool closes. Nothing is judged
   * here: a per-level step is done only when EVERY level has the thing, so
   * saving one level out of five leaves `done` false and no Continue appears.
   *
   * A step already done when the wizard opened is not "completed here": the
   * admin did not just do it, so pushing them onward off the back of it would be
   * the jump this exists to avoid.
   */
  useEffect(() => {
    const steps = data?.steps;
    const before = doneAtStart.current;
    if (!steps?.length || !before) return;
    const freshlyDone = steps.filter((s) => s.done && !before.has(s.id)).map((s) => s.id);
    if (!freshlyDone.length) return;
    setCompletedHere((prev) => {
      if (freshlyDone.every((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      freshlyDone.forEach((id) => next.add(id));
      return next;
    });
  }, [data]);

  // A checklist request opens the wizard whether or not the server would have
  // volunteered it — see openAtStep. Otherwise nothing has changed: show when
  // told to, and stay gone once left.
  const requested = Boolean(openAtStep && data?.steps?.some((s) => s.id === openAtStep));
  if (loading || !data?.steps?.length) return null;
  if (!requested && (!data.show || exited)) return null;

  const steps = data.steps;
  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;
  /** This step was finished just now, in this session — offer the move on. */
  const justCompleted = step.done && completedHere.has(step.id);

  const next = () => {
    if (isLast) void exit();
    else setIndex((i) => i + 1);
  };

  /** Add Student has no standalone component, so this step routes. */
  const openTool = () => {
    if (step.id === 'students') void exit('students');
    else setTool(step.id);
  };

  // Re-reads the live state so the tick and the per-level list reflect whatever
  // was just set up, without the wizard recomputing any of it itself. Closing a
  // tool never changes which step is showing — the refresh may turn this one
  // green and put a Continue button up, and that is as far as it goes.
  const closeTool = async () => {
    setTool(null);
    await refresh();
  };

  return (
    <>
      <Dialog
        open={!tool}
        onOpenChange={(open) => { if (!open) void exit(); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set up your school</DialogTitle>
            <DialogDescription>
              Step {index + 1} of {steps.length} — {data.completedCount} of {data.totalCount} done. You can
              skip anything and come back to it from the dashboard.
            </DialogDescription>
          </DialogHeader>

          {/* One pip per step: position without a second list of titles. */}
          <div style={{ display: 'flex', gap: 6 }}>
            {steps.map((s, i) => (
              <span
                key={s.id}
                title={s.title}
                style={{
                  flex: 1, height: 5, borderRadius: 999,
                  backgroundColor: s.done ? DONE : i === index ? NAVY : '#E5E7EB',
                }}
              />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', paddingTop: '0.35rem' }}>
            <span
              aria-hidden="true"
              style={{
                flexShrink: 0, marginTop: 3, width: 22, height: 22, borderRadius: '50%',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: step.done ? DONE : 'transparent',
                border: step.done ? `1px solid ${DONE}` : '1px solid #D1D5DB',
                color: '#FFFFFF',
              }}
            >
              {step.done && <Check size={14} strokeWidth={3} />}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="text-sm" style={{ fontWeight: 500 }}>{step.title}</p>
              <p className="text-xs" style={{ color: MUTED, marginTop: 2 }}>{step.description}</p>
              {step.done ? (
                <p className="text-xs" style={{ color: DONE, marginTop: 6 }}>
                  {justCompleted ? 'All set — nothing left outstanding here.' : 'Done — nothing outstanding here.'}
                </p>
              ) : (
                <p className="text-xs" style={{ color: MUTED, marginTop: 6 }}>
                  {outstanding(step) ?? 'Not set up yet.'}
                </p>
              )}
            </div>
          </div>

          {/* Finished in this session: the move on is OFFERED, never taken. The
              wizard jumping by itself is disorienting — the screen changes under
              someone who is still reading what they just did — so Continue is
              prominent and one click away, and nothing happens until it is
              pressed. */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button variant="outline" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
              Back
            </Button>
            {justCompleted ? (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Button variant="outline" onClick={openTool}>
                  Review
                </Button>
                <Button
                  onClick={next}
                  style={{
                    backgroundColor: DONE, color: '#FFFFFF', borderColor: DONE,
                    fontWeight: 600, paddingLeft: '1.4rem', paddingRight: '1.4rem',
                  }}
                >
                  {isLast ? 'Finish setup' : `Continue to ${steps[index + 1]?.title ?? 'the next step'}`}
                </Button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button variant="outline" onClick={next}>
                  {isLast ? 'Finish' : 'Skip for later'}
                </Button>
                <Button onClick={openTool}>
                  {step.done ? 'Review' : 'Set up now'}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* The existing tools, opened in place. The wizard shell hides itself
          while one is up (open={!tool} above) rather than stacking two modals. */}
      {tool === 'fees' && (
        <LevelFeesDialog
          open
          onOpenChange={(o) => { if (!o) void closeTool(); }}
          // Explicit, and the only thing that turns the level walk on. Not
          // inferred from the route: this same dialog is reachable from the
          // Classes page mid-setup, where chaining would be wrong.
          inWizard
          // Handed back once every level charges something or has been declared
          // free. The dialog announces nothing about the STEP — closing it makes
          // the wizard re-read the live condition, which is what ticks it.
          onAllLevelsComplete={() => void closeTool()}
        />
      )}
      {tool === 'subjects' && (
        <LevelSubjectsDialog
          open
          onOpenChange={(o) => { if (!o) void closeTool(); }}
          onManageCatalogue={() => void exit('subjects')}
        />
      )}
      {tool === 'assessment-totals' && (
        <ManageTestsExamsDialog
          open
          onOpenChange={(o) => { if (!o) void closeTool(); }}
          academicYear={yearStatus?.activeYear ?? ''}
        />
      )}
      {tool === 'staff' && (
        <StaffForm
          mode="add"
          open
          onOpenChange={(o) => { if (!o) void closeTool(); }}
          onSubmit={async (payload: StaffFormPayload) => {
            await api.post('/staff', payload);
            cache.invalidateOn('staff:write');
            await closeTool();
          }}
        />
      )}
    </>
  );
}
