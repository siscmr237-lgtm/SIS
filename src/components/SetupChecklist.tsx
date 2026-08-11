'use client';

import { Check } from 'lucide-react';
import { api } from '../lib/api';
import { useCachedResource } from '../lib/SisCache';
import { NavigationPage } from '../App';
import { Button } from './ui/button';
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

export function SetupChecklist({ onNavigate }: { onNavigate?: (page: NavigationPage) => void }) {
  // policy 'fresh' is the point of the whole card: the answer must reflect what
  // the database says right now, so a step completed on another screen a moment
  // ago is already ticked here.
  const { data, loading } = useCachedResource<Checklist>(
    null,
    () => api.get('/dashboard/setup-checklist'),
    { policy: 'fresh' },
  );

  // Nothing while loading, and nothing once finished. A checklist that flashes
  // in half-answered is worse than one that appears a moment later, and one that
  // never leaves stops being a checklist and becomes furniture.
  if (loading || !data || data.complete || !data.steps?.length) return null;

  const pct = Math.round((data.completedCount / data.totalCount) * 100);

  return (
    <Card className="p-6 mb-8">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 className="text-xl">Get your school ready</h2>
          <p className="text-sm" style={{ color: MUTED, marginTop: 2 }}>
            A few things to set up. You can do them in any order, and the rest of the app works
            meanwhile.
          </p>
        </div>
        <span className="text-sm" style={{ color: MUTED, whiteSpace: 'nowrap' }}>
          {data.completedCount} of {data.totalCount} complete
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

      <div>
        {data.steps.map((step) => {
          const note = outstanding(step);
          return (
            <div
              key={step.id}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                padding: '0.7rem 0', borderTop: '1px solid #F3F4F6',
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

              {!step.done && onNavigate && (
                <Button
                  variant="outline"
                  size="sm"
                  style={{ flexShrink: 0 }}
                  onClick={() => onNavigate(step.page)}
                >
                  {step.action}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
