'use client';

import { useState } from 'react';
import { Button } from './ui/button';
import { AcademicYearStatus } from '@/lib/academicYear';
import { toast } from 'sonner';

/**
 * The two academic-year notices, which are deliberately different in kind:
 *
 *   nudge (from 1 August)  persistent and NOT dismissible. The school can keep
 *                          operating in the current year, but the prompt stays
 *                          until they actually start the new one — that is the
 *                          whole point of a nudge.
 *   changed (after an      one-time and dismissible. It reports something that
 *   automatic advance)     has already happened, so once seen it should go.
 *
 * Inline styles because src/index.css is a pre-compiled Tailwind build: an
 * arbitrary colour utility that is not already in it renders as nothing at all.
 */
export function AcademicYearNotices({
  status,
  onAdvance,
  onAcknowledge,
}: {
  status: AcademicYearStatus | null;
  onAdvance: () => Promise<unknown>;
  onAcknowledge: () => Promise<unknown>;
}) {
  const [advancing, setAdvancing] = useState(false);
  const [acking, setAcking] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!status) return null;

  return (
    <>
      {status.autoAdvancedYear && (
        <div
          style={{
            marginBottom: '1.25rem', padding: '0.75rem 1rem', borderRadius: 10,
            border: '1px solid #86EFAC', backgroundColor: '#F0FDF4', color: '#15803D',
            fontSize: '0.875rem', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap',
          }}
        >
          <span>
            Your academic year has changed to <strong>{status.autoAdvancedYear}</strong>.
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={acking}
            onClick={async () => {
              setAcking(true);
              try { await onAcknowledge(); } finally { setAcking(false); }
            }}
          >
            {acking ? 'Dismissing...' : 'Dismiss'}
          </Button>
        </div>
      )}

      {status.nudgeDue && status.nudgeYear && (
        <div
          style={{
            marginBottom: '1.25rem', padding: '0.875rem 1rem', borderRadius: 10,
            border: '1px solid #FCD34D', backgroundColor: '#FFFBEB', color: '#92400E',
            fontSize: '0.875rem',
          }}
        >
          <p style={{ fontWeight: 600, marginBottom: 4 }}>
            Start the {status.nudgeYear} academic year
          </p>
          <p style={{ marginBottom: confirming ? 8 : 10 }}>
            You are still working in <strong>{status.activeYear}</strong>. You can carry on in it for
            now — if you have not started {status.nudgeYear} by 1 September, it will begin
            automatically.
          </p>
          {confirming ? (
            <div>
              <p style={{ marginBottom: 8 }}>
                New marks, fees and other records will be filed under{' '}
                <strong>{status.nudgeYear}</strong> from now on. Earlier years stay readable and
                selectable. Nothing is promoted, graduated or reset by this.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button
                  size="sm"
                  disabled={advancing}
                  onClick={async () => {
                    setAdvancing(true);
                    try {
                      await onAdvance();
                      toast.success('Academic year started');
                      setConfirming(false);
                    } catch (e: any) {
                      toast.error(e?.message || 'Could not start the new year.');
                    } finally {
                      setAdvancing(false);
                    }
                  }}
                >
                  {advancing ? 'Starting...' : `Yes, start ${status.nudgeYear}`}
                </Button>
                <Button size="sm" variant="outline" disabled={advancing} onClick={() => setConfirming(false)}>
                  Not yet
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={() => setConfirming(true)}>
              Start {status.nudgeYear}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
