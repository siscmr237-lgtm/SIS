'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';

/**
 * "Notify parents" — the panel that sends a WhatsApp absence notice to the
 * guardians of everyone marked absent on one day.
 *
 * THE POINT OF THIS SCREEN IS THE PHONE NUMBER. Every row shows the number AS IT
 * WILL BE DIALLED, after the server has normalised it, next to the name of the
 * child the message is about. That pairing is the last opportunity anybody has
 * to notice that a message saying "your child was absent today" is about to go
 * to a stranger, and it is the reason this is a panel to read rather than a
 * button that just sends. Nothing here is styled to be skimmed past.
 *
 * Only rows the SERVER called "ready" can be selected. The state on each row is
 * computed server-side and not re-derived here, so the screen cannot offer to
 * send something the send route would then refuse — the two would drift the
 * moment they were worked out separately, and the drift shows up as a family
 * the school believes it contacted and did not.
 *
 * INLINE STYLES THROUGHOUT. src/index.css is a frozen pre-compiled Tailwind
 * build: a utility class not already in it renders as nothing at all, silently.
 * Only classes already proven live elsewhere in this app are used.
 */

/** Brand palette, from the SIS conventions. */
const NAVY = '#0f2345';
const FOREST = '#05603d';
const BURNT = '#e0552e';
const RED = '#DC2626';
const GOLD = '#e6c482';
const MUTED = '#6b7280';

interface Row {
  studentId: string;
  studentName: string;
  guardianName: string;
  /** Post-normalisation, exactly what will be dialled. Null when unusable. */
  phone: string | null;
  /** What is actually on file, so a bad number can be shown and corrected. */
  storedPhone: string | null;
  state: 'ready' | 'no_consent' | 'no_number' | 'already_sent' | 'not_absent';
  status: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  sentAt?: string | null;
}

interface Payload {
  date: string;
  schoolName: string;
  configured: boolean;
  students: Row[];
}

/** Twilio's vocabulary, plus our own 'failed_to_send', as a person reads it. */
function statusLabel(status: string | null): { text: string; colour: string } {
  switch (String(status ?? '').toLowerCase()) {
    case 'queued':
    case 'accepted':
    case 'scheduled':
      return { text: 'Sending…', colour: MUTED };
    case 'sending':
      return { text: 'Sending…', colour: MUTED };
    case 'sent':
      return { text: 'Sent', colour: FOREST };
    case 'delivered':
      return { text: 'Delivered', colour: FOREST };
    case 'read':
      return { text: 'Read', colour: FOREST };
    case 'undelivered':
      return { text: 'Not delivered', colour: RED };
    case 'failed':
    case 'failed_to_send':
      return { text: 'Failed', colour: RED };
    default:
      return { text: status ? String(status) : '—', colour: MUTED };
  }
}

/** A status that is still moving, and therefore worth polling for. */
const isPending = (status: string | null) =>
  ['queued', 'accepted', 'scheduled', 'sending', 'sent'].includes(String(status ?? '').toLowerCase());

function stateLabel(row: Row): { text: string; colour: string; hint?: string } {
  switch (row.state) {
    case 'ready':
      return { text: 'Ready', colour: FOREST };
    case 'no_consent':
      return {
        text: 'No consent',
        colour: MUTED,
        hint: row.guardianName
          ? 'This guardian has not agreed to WhatsApp messages. Tick the box on the student’s record.'
          : 'No guardian is on file for this student.',
      };
    case 'no_number':
      return {
        text: 'No valid number',
        colour: BURNT,
        hint: row.storedPhone
          ? `“${row.storedPhone}” is not a number this can send to. Store it with its country code.`
          : 'No phone number is on file for this guardian.',
      };
    case 'already_sent':
      return { text: 'Already sent today', colour: NAVY };
    default:
      return { text: 'Not absent', colour: MUTED };
  }
}

export function AbsenceNoticesDialog({
  open, onOpenChange, date, sectionId, className,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string;
  sectionId?: string | number | null;
  className?: string;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  // Only the newest load may write state, as in AttendanceSheet: the dialog can
  // be reopened on a different date while a request is still in the air.
  const seq = useRef(0);

  const load = useCallback(async (quiet = false) => {
    if (!date) return;
    const mine = ++seq.current;
    if (!quiet) setLoading(true);
    try {
      const qs = new URLSearchParams({ date });
      if (sectionId) qs.set('section', String(sectionId));
      const res: any = await api.get(`/whatsapp/absence-notices?${qs.toString()}`);
      if (mine !== seq.current) return;
      setData(res);
      setError(null);
    } catch (e: any) {
      if (mine !== seq.current) return;
      setError(e?.message || 'Could not load the list of absent students.');
    } finally {
      if (mine === seq.current && !quiet) setLoading(false);
    }
  }, [date, sectionId]);

  // Fresh every time it opens. A snapshot from the last time the dialog was
  // opened could name a student the register has since corrected.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setConfirming(false);
    load();
  }, [open, load]);

  const rows = data?.students ?? [];
  const ready = rows.filter((r) => r.state === 'ready');
  const anyPending = rows.some((r) => r.state === 'already_sent' && isPending(r.status));

  // Poll while anything is still in flight, and only then. Delivery is
  // asynchronous — Twilio reports back to /whatsapp/status — so the row that
  // says "Sending…" is genuinely waiting on something and the admin should not
  // have to reopen the panel to find out how it ended.
  useEffect(() => {
    if (!open || !anyPending) return;
    const t = setInterval(() => load(true), 4000);
    return () => clearInterval(t);
  }, [open, anyPending, load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = ready.length > 0 && ready.every((r) => selected.has(r.studentId));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(ready.map((r) => r.studentId)));
  };

  const send = async () => {
    const ids = ready.filter((r) => selected.has(r.studentId)).map((r) => r.studentId);
    if (!ids.length || sending) return;
    setSending(true);
    setError(null);
    try {
      const res: any = await api.post('/whatsapp/absence-notices', { date, studentIds: ids });
      const sent = res?.sent ?? 0;
      const failed = (res?.results ?? []).filter((r: any) => !r.sent && r.reason && r.reason !== 'already_sent').length;
      if (sent) toast.success(`${sent} notice${sent === 1 ? '' : 's'} sent`);
      if (!sent) toast.error('Nothing was sent');
      else if (failed) toast.error(`${failed} could not be sent`);
      setSelected(new Set());
      setConfirming(false);
      await load(true);
    } catch (e: any) {
      // A 403 lands here: the whole batch was refused and nothing was sent.
      setError(e?.message || 'Could not send the notices.');
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  const selectedCount = ready.filter((r) => selected.has(r.studentId)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wider than the default sm:max-w-lg because every row carries a name, a
          guardian and a phone number, and wrapping the number onto a second
          line is exactly how it stops being checked. */}
      <DialogContent className={className} style={{ maxWidth: 760 }}>
        <DialogHeader style={{ flex: '0 0 auto' }}>
          <DialogTitle>Notify parents of absence</DialogTitle>
        </DialogHeader>

        <div style={{ flex: '0 0 auto' }}>
          <p className="text-sm text-gray-500">
            {data?.schoolName ? `${data.schoolName} · ` : ''}Register of {date}
          </p>
          <p className="text-sm" style={{ color: NAVY, marginTop: '0.35rem' }}>
            Check each number against the child’s name before sending. A WhatsApp cannot be unsent.
          </p>
        </div>

        {data && !data.configured && (
          <div
            style={{
              flex: '0 0 auto', border: `1px solid ${BURNT}`, background: '#fff7ed',
              borderRadius: 6, padding: '0.6rem 0.75rem',
            }}
          >
            <p className="text-sm" style={{ color: BURNT }}>
              WhatsApp is not set up on the server, so nothing can be sent yet. The list below is
              still accurate.
            </p>
          </div>
        )}

        {/* THE NOMINATED SCROLLING CHILD. DialogContent is a flex column capped
            to the viewport; without exactly one child taking the overflow, a
            long class pushes the buttons below the bottom of the screen and
            body scroll is locked, so they cannot be reached. */}
        <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto' }}>
          {loading ? (
            <p className="text-sm text-gray-500" style={{ padding: '1rem 0' }}>Loading…</p>
          ) : error ? (
            <p className="text-sm" style={{ color: RED, padding: '0.5rem 0' }}>{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-500" style={{ padding: '1rem 0' }}>
              Nobody is marked absent on this date.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="px-2 py-3 font-medium" style={{ width: 34 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      disabled={ready.length === 0 || sending}
                      onChange={toggleAll}
                      aria-label="Select every parent who can be notified"
                    />
                  </th>
                  <th className="px-2 py-3 font-medium">Student</th>
                  <th className="px-2 py-3 font-medium">Guardian</th>
                  <th className="px-2 py-3 font-medium">Number to be dialled</th>
                  <th className="px-2 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const label = stateLabel(r);
                  const live = r.state === 'already_sent' ? statusLabel(r.status) : null;
                  const selectable = r.state === 'ready';
                  return (
                    <tr key={r.studentId} className="border-b">
                      <td className="px-2 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(r.studentId)}
                          disabled={!selectable || sending}
                          onChange={() => toggle(r.studentId)}
                          aria-label={`Notify the guardian of ${r.studentName}`}
                        />
                      </td>
                      <td className="px-2 py-3" style={{ color: NAVY }}>{r.studentName}</td>
                      <td className="px-2 py-3">
                        {r.guardianName || <span className="text-gray-400">Not recorded</span>}
                      </td>
                      <td className="px-2 py-3">
                        {r.phone ? (
                          // Monospaced and spaced out, because this is the one
                          // thing on the row that has to be read digit by digit
                          // rather than recognised at a glance.
                          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.02em', color: NAVY }}>
                            {r.phone}
                          </span>
                        ) : (
                          <span style={{ color: BURNT }}>
                            {r.storedPhone ? `“${r.storedPhone}”` : 'None on file'}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <span style={{ color: live ? live.colour : label.colour, fontWeight: 600 }}>
                          {live ? live.text : label.text}
                        </span>
                        {live && r.errorMessage && (
                          <p className="text-xs" style={{ color: RED, marginTop: 2 }}>{r.errorMessage}</p>
                        )}
                        {!live && label.hint && (
                          <p className="text-xs text-gray-500" style={{ marginTop: 2 }}>{label.hint}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ flex: '0 0 auto', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }}>
          {confirming ? (
            // The confirmation is a step INSIDE this dialog rather than a second
            // dialog on top of it. It restates the count and the school name,
            // because "are you sure?" on its own is a question nobody reads.
            <div>
              <p className="text-sm" style={{ color: NAVY, marginBottom: '0.6rem' }}>
                Send an absence notice for <strong>{date}</strong> to{' '}
                <strong>{selectedCount} parent{selectedCount === 1 ? '' : 's'}</strong>
                {data?.schoolName ? ` from ${data.schoolName}` : ''}? This cannot be undone.
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={send}
                  disabled={sending}
                  style={{ background: FOREST, color: '#fff', borderColor: FOREST }}
                >
                  {sending ? 'Sending…' : `Yes, send ${selectedCount}`}
                </Button>
                <Button variant="outline" onClick={() => setConfirming(false)} disabled={sending}>
                  Go back
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={() => setConfirming(true)}
                disabled={selectedCount === 0 || sending || !data?.configured}
                style={
                  selectedCount > 0 && data?.configured
                    ? { background: NAVY, color: GOLD, borderColor: NAVY }
                    : undefined
                }
              >
                Send to {selectedCount} parent{selectedCount === 1 ? '' : 's'}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
                Close
              </Button>
              {ready.length === 0 && rows.length > 0 && (
                <span className="text-sm text-gray-500">
                  Nobody on this list can be messaged yet.
                </span>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
