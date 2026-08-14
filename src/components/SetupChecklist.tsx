'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useCachedResource } from '../lib/SisCache';
import { NavigationPage } from '../App';
import { Card } from './ui/card';

/**
 * "Get your school ready" — the setup steps, ticked from live data.
 *
 * Every step's state is the server's answer to a question about the tables, from
 * GET /dashboard/setup-checklist, fetched fresh on every visit and never cached.
 * There is no "I clicked done" flag anywhere, deliberately: a stored tick is a
 * claim about the past and it rots in both directions — it stays ticked after
 * the last subject is deleted, and it stays unticked when the work was done from
 * another screen. Nothing here recomputes a condition either; a second
 * implementation would eventually disagree with the one the server uses.
 *
 * It gates NOTHING. No step blocks another, the order is a suggestion, and the
 * whole card disappears once everything is done rather than becoming a permanent
 * fixture congratulating the admin.
 *
 * COLLAPSED BY DEFAULT. Seven rows of outstanding work is the first thing an
 * admin sees every single time they open the dashboard, and a list that long
 * pushes the actual dashboard below the fold indefinitely. Collapsed, the bar
 * still says how far along they are; expanding is one click. The state is
 * component state ONLY — no localStorage — so it is genuinely "closed by
 * default" rather than "closed until you once opened it".
 *
 * WHERE A ROW SENDS YOU. Four of the seven have a tool the setup wizard already
 * drives (fees, subjects, assessment totals, staff), so those open the wizard AT
 * THAT STEP. The other three are screens, not steps, and route there directly —
 * see STEP_TARGET below.
 *
 * Styling is inline. src/index.css is a pre-compiled Tailwind artifact with no
 * build step behind it, so a utility class that happens not to be in it renders
 * as nothing at all — silently.
 */

interface Step {
  id: string;
  title: string;
  description: string;
  page: NavigationPage;
  action: string;
  done: boolean;
  /** Step 1 only: which of name/logo/motto/school type are absent. */
  missing?: string[];
  /** Steps 3–5: class levels that still have none of the thing. */
  missingLevels?: string[];
  /** Steps 3–5: there are no classes yet, so there is nothing to check against. */
  blockedOnClasses?: boolean;
  everyLevel?: boolean;
  count?: number;
}

interface Checklist {
  complete: boolean;
  completedCount: number;
  totalCount: number;
  steps: Step[];
}

/**
 * The four checklist items the wizard has an actual TOOL for. Clicking one opens
 * the wizard on that step, so the fee walk, the subject picker and the rest are
 * reached the same way from either place rather than reimplemented here.
 *
 * The other three are not wizard steps and must not pretend to be:
 *
 *   school-details  a settings form — the wizard never covered it, KYC did
 *   classes         likewise; the wizard deliberately does not re-ask for these
 *   students        IS a wizard step id, but the wizard's own handler for it
 *                   immediately closes and routes to /students, because Add
 *                   Student is written inline in StudentsManagement rather than
 *                   as a dialog. Opening a wizard in order to have it shut
 *                   itself is worse than going straight there.
 *
 * Anything not in this map falls through to step.page, which the server already
 * supplies for every step.
 */
const WIZARD_STEP_FOR: Record<string, string> = {
  fees: 'fees',
  subjects: 'subjects',
  'assessment-totals': 'assessment-totals',
  staff: 'staff',
};

// Brand palette. Forest for done, Navy for the progress fill.
const DONE = '#05603d';
const NAVY = '#0f2345';
const MUTED = '#6B7280';

/** What still stands between this step and being done, in words. */
function outstanding(step: Step): string | null {
  if (step.done) return null;
  if (step.missing?.length) {
    return `Still needed: ${step.missing.join(', ')}.`;
  }
  if (step.blockedOnClasses) {
    return 'Add your classes first — this is set per class level.';
  }
  if (step.missingLevels?.length) {
    const levels = step.missingLevels;
    // Named rather than counted: "add fees" is not actionable when you have ten
    // levels and cannot tell which two are short. Long lists are trimmed so the
    // card cannot be pushed off the screen by a school with many levels.
    const shown = levels.slice(0, 4).join(', ');
    const rest = levels.length - 4;
    return `Still needed for: ${shown}${rest > 0 ? ` and ${rest} more` : ''}.`;
  }
  return null;
}

interface Props {
  onNavigate?: (page: NavigationPage) => void;
  /**
   * Open the setup wizard at a specific step. Supplied by the dashboard, which
   * owns the wizard; the checklist only names the step it wants.
   */
  onOpenWizardStep?: (stepId: string) => void;
}

export function SetupChecklist({ onNavigate, onOpenWizardStep }: Props) {
  // policy 'fresh' is the point of the whole card: the answer must reflect what
  // the database says right now, so a step completed on another screen a moment
  // ago is already ticked here.
  const { data, loading } = useCachedResource<Checklist>(
    null,
    () => api.get('/dashboard/setup-checklist'),
    { policy: 'fresh' },
  );

  // Closed on every load, by design — see the note at the top. Not persisted.
  const [expanded, setExpanded] = useState(false);
  const [barHover, setBarHover] = useState(false);
  const [hoveredStep, setHoveredStep] = useState<string | null>(null);

  // Nothing while loading, and nothing once finished. A checklist that flashes
  // in half-answered is worse than one that appears a moment later, and one that
  // never leaves stops being a checklist and becomes furniture.
  //
  // UNCHANGED by the collapse work: when all seven are done the whole card is
  // gone, not collapsed-and-empty. There is no "0 outstanding" state to click
  // into, and a bar reading 7 of 7 forever would be the furniture this avoids.
  if (loading || !data || data.complete || !data.steps?.length) return null;

  const pct = Math.round((data.completedCount / data.totalCount) * 100);

  /**
   * Where an unfinished row goes. A wizard step if the wizard has a tool for it,
   * otherwise the screen the server named. Silently does nothing only when the
   * dashboard supplied neither handler, which is the same no-op as before.
   */
  const openStep = (step: Step) => {
    if (step.done) return;
    const wizardStep = WIZARD_STEP_FOR[step.id];
    if (wizardStep && onOpenWizardStep) onOpenWizardStep(wizardStep);
    else if (onNavigate) onNavigate(step.page);
  };

  const toggle = () => setExpanded((e) => !e);

  return (
    /* Tighter than the p-6/mb-8 it had. Collapsed, this card is a one-line
       summary bar, and 24px of padding all round plus a 32px margin made it
       taller than the four metric cards it sits above — which is what pushed
       the fourth of them under the floating support button at 390x844.
       Expanded, the step rows carry their own padding, so the open state is
       not cramped by this. */
    <Card style={{ padding: '0.875rem 1rem', marginBottom: '1rem' }}>
      {/* The whole progress row is the toggle. role/tabIndex rather than a
          <button> because the row contains headings and a progressbar, which are
          flow content and not legal inside a button. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls="setup-checklist-steps"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        onMouseEnter={() => setBarHover(true)}
        onMouseLeave={() => setBarHover(false)}
        style={{
          cursor: 'pointer',
          borderRadius: 8,
          // The only affordance a pre-compiled stylesheet lets us give this, so
          // it is done explicitly: it lifts on hover and the chevron turns.
          backgroundColor: barHover ? '#F9FAFB' : 'transparent',
          margin: '-0.5rem -0.5rem 0',
          padding: '0.5rem',
          transition: 'background-color 150ms ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 className="text-xl">Get your school ready</h2>
            <p className="text-sm" style={{ color: MUTED, marginTop: 2 }}>
              A few things to set up. You can do them in any order, and the rest of the app works
              meanwhile.
            </p>
          </div>
          {/* Kept visible while collapsed: the count is the reason to keep the
              card at all when the list itself is hidden. */}
          <span
            className="text-sm"
            style={{ color: MUTED, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {data.completedCount} of {data.totalCount} complete
            <ChevronDown
              size={16}
              aria-hidden="true"
              style={{
                transition: 'transform 200ms ease',
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
              {expanded ? 'Hide the setup steps' : 'Show the setup steps'}
            </span>
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={data.completedCount}
          aria-valuemin={0}
          aria-valuemax={data.totalCount}
          aria-label="Setup progress"
          style={{
            height: 6, borderRadius: 999, backgroundColor: '#E5E7EB',
            overflow: 'hidden', margin: '0.9rem 0 0.25rem',
          }}
        >
          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: NAVY, transition: 'width 300ms ease' }} />
        </div>
      </div>

      {expanded && (
        <div id="setup-checklist-steps">
          {data.steps.map((step) => {
            const note = outstanding(step);
            // Done rows are inert: no handler, no pointer, no hover, nothing
            // that offers something there is nothing left to do.
            const clickable = !step.done && Boolean(onOpenWizardStep || onNavigate);
            const hovered = clickable && hoveredStep === step.id;
            return (
              <div
                key={step.id}
                {...(clickable
                  ? {
                    role: 'button' as const,
                    tabIndex: 0,
                    onClick: () => openStep(step),
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openStep(step);
                      }
                    },
                    onMouseEnter: () => setHoveredStep(step.id),
                    onMouseLeave: () => setHoveredStep(null),
                  }
                  : {})}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  padding: '0.7rem 0.5rem', borderTop: '1px solid #F3F4F6',
                  cursor: clickable ? 'pointer' : 'default',
                  backgroundColor: hovered ? '#F9FAFB' : 'transparent',
                  borderRadius: hovered ? 6 : 0,
                  transition: 'background-color 150ms ease',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0, marginTop: 2,
                    width: 20, height: 20, borderRadius: '50%',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: step.done ? DONE : 'transparent',
                    border: step.done ? `1px solid ${DONE}` : '1px solid #D1D5DB',
                    color: '#FFFFFF',
                  }}
                >
                  {step.done && <Check size={13} strokeWidth={3} />}
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    className="text-sm"
                    style={{ color: step.done ? MUTED : '#111827', fontWeight: step.done ? 400 : 500 }}
                  >
                    {step.title}
                    {/* The screen-reader equivalent of the tick, which is decorative. */}
                    <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                      {step.done ? ' — done' : ' — not done yet'}
                    </span>
                  </p>
                  {!step.done && (
                    <p className="text-xs" style={{ color: MUTED, marginTop: 2 }}>
                      {note ?? step.description}
                    </p>
                  )}
                </div>

                {clickable && (
                  <span
                    className="text-xs"
                    style={{
                      flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 2,
                      color: NAVY, fontWeight: 500, marginTop: 2,
                    }}
                  >
                    {step.action}
                    <ChevronRight size={14} aria-hidden="true" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
