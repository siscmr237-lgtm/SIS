'use client';

import { useState } from 'react';
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
 *   Totals    <ManageTestsExamsDialog>   the same dialog Tests & Exams opens
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

export function SetupWizard({ onNavigate }: { onNavigate?: (page: NavigationPage) => void }) {
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

  if (loading || !data?.show || exited) return null;

  const steps = data.steps;
  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;

  /**
   * Leaving the wizard, by finishing or by skipping out of the last step.
   *
   * Hidden locally first so the overlay goes away immediately rather than after
   * a round trip; the flag is what stops it coming back on the next login. If
   * the write fails the wizard simply reappears next time, which is a better
   * failure than a wizard that will not close.
   */
  const exit = async (goTo?: NavigationPage) => {
    setExited(true);
    setTool(null);
    try {
      await api.post('/dashboard/setup-wizard/dismiss', {});
    } catch {
      // Deliberately swallowed — see above.
    }
    if (goTo && onNavigate) onNavigate(goTo);
  };

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
  // was just set up, without the wizard recomputing any of it itself.
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
                  Done — nothing outstanding here.
                </p>
              ) : (
                <p className="text-xs" style={{ color: MUTED, marginTop: 6 }}>
                  {outstanding(step) ?? 'Not set up yet.'}
                </p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button variant="outline" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
              Back
            </Button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button variant="outline" onClick={next}>
                {isLast ? 'Finish' : 'Skip for later'}
              </Button>
              <Button onClick={openTool}>
                {step.done ? 'Review' : 'Set up now'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* The existing tools, opened in place. The wizard shell hides itself
          while one is up (open={!tool} above) rather than stacking two modals. */}
      {tool === 'fees' && (
        <LevelFeesDialog open onOpenChange={(o) => { if (!o) void closeTool(); }} />
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
