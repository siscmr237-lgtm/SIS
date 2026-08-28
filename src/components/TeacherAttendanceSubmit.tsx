'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Label } from './ui/label';
import { ThreePartDateInput } from './ThreePartDateInput';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ContentLoader } from './ContentLoader';

/**
 * A TEACHER SUBMITTING THEIR OWN DAY, and the register that goes with it.
 *
 * Sits above the ordinary AttendanceSheet on /teacher/attendance rather than
 * replacing it: the sheet is how a teacher looks back over a range, and this is
 * how they declare a single day. Two different questions, so two controls.
 *
 * THE ONE RULE WORTH SPELLING OUT HERE: marking yourself ABSENT hides the
 * student list, and every one of your students is marked absent on submission.
 * That is not a shortcut in this component — the server ignores any student list
 * sent with an ABSENT submission outright (see POST /staff-attendance) — so the
 * screen is describing the rule, not implementing it.
 *
 * Inline styles throughout: src/index.css is a frozen, pre-compiled Tailwind
 * build, so a utility class not already in it renders as nothing at all.
 */

type Approval = 'PENDING' | 'APPROVED' | 'REJECTED';

interface Submission {
  id: number;
  date: string;
  status: 'PRESENT' | 'ABSENT';
  submittedAt: string;
  approvalStatus: Approval;
  approvedByName: string | null;
  approvedAt: string | null;
  rejectedByName: string | null;
  rejectedAt: string | null;
  autoApproved: boolean;
}

interface StudentRow {
  studentId: string;
  name: string;
  class: string;
}

/** The three states a submission can be in, and how each one reads. */
const BADGE: Record<Approval, { label: string; color: string; background: string; border: string }> = {
  PENDING: { label: 'Pending', color: '#92400E', background: '#FEF3C7', border: '#FDE68A' },
  APPROVED: { label: 'Approved', color: '#05603D', background: '#D1FAE5', border: '#A7F3D0' },
  REJECTED: { label: 'Rejected', color: '#9F1239', background: '#FFE4E6', border: '#FECDD3' },
};

export function StatusBadge({ status }: { status: Approval }) {
  const s = BADGE[status] ?? BADGE.PENDING;
  return (
    <span
      style={{
        display: 'inline-block', padding: '2px 9px', borderRadius: 999,
        fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap',
        color: s.color, background: s.background, border: `1px solid ${s.border}`,
      }}
    >
      {s.label}
    </span>
  );
}

const todayKey = () => new Date().toISOString().slice(0, 10);

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMoment(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function TeacherAttendanceSubmit() {
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [windowHours, setWindowHours] = useState(48);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayKey());
  const [selfStatus, setSelfStatus] = useState<'PRESENT' | 'ABSENT'>('PRESENT');
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get('/staff-attendance/me')
      .then((res: any) => {
        setRows(res?.submissions ?? []);
        if (res?.autoApproveAfterHours) setWindowHours(res.autoApproveAfterHours);
      })
      .catch((e: any) => setLoadError(e?.message || 'Could not load your submissions.'));
  }, []);

  useEffect(() => { load(); }, [load]);

  // The roster comes from the SERVER, and only once the modal opens. It is the
  // same list POST /staff-attendance will mark — see GET /my-students — so what
  // is ticked here is exactly what gets written.
  const openModal = () => {
    setDate(todayKey());
    setSelfStatus('PRESENT');
    setAbsent(new Set());
    setFormError(null);
    setStudents(null);
    setOpen(true);
    api
      .get('/staff-attendance/my-students')
      .then((res: any) => setStudents(res?.students ?? []))
      .catch((e: any) => setFormError(e?.message || 'Could not load your class list.'));
  };

  const toggle = (studentId: string) => {
    setAbsent((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = { date, status: selfStatus };
      // Only sent for a PRESENT submission. The server ignores it for an ABSENT
      // one either way; not sending it keeps the request honest about what the
      // teacher was actually shown.
      if (selfStatus === 'PRESENT') {
        payload.students = (students ?? []).map((s) => ({
          studentId: s.studentId,
          present: !absent.has(s.studentId),
        }));
      }
      const res: any = await api.post('/staff-attendance', payload);
      setOpen(false);
      toast.success(
        res?.studentsMarked
          ? `Submitted. ${res.studentsMarked} student${res.studentsMarked === 1 ? '' : 's'} recorded.`
          : 'Attendance submitted.',
      );
      load();
    } catch (e: any) {
      setFormError(e?.message || 'Could not submit your attendance.');
    } finally {
      setSubmitting(false);
    }
  };

  const th: React.CSSProperties = {
    textAlign: 'left', padding: '10px 14px', fontSize: '0.75rem',
    textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B',
    borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '12px 14px', fontSize: '0.875rem', color: '#0F172A',
    borderBottom: '1px solid #F1F5F9', verticalAlign: 'top',
  };

  const presentCount = (students?.length ?? 0) - absent.size;

  return (
    <Card className="p-6 mb-6">
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap', marginBottom: '1rem',
        }}
      >
        <div>
          <h2 className="text-xl">My Attendance</h2>
          <p className="text-sm text-gray-500 mt-1">
            Record whether you were at work, and take your class register with it. A submission
            cannot be edited afterwards, and is approved automatically if the school has not
            answered within {windowHours} hours.
          </p>
        </div>
        <Button onClick={openModal} style={{ whiteSpace: 'nowrap' }}>
          <ClipboardCheck className="mr-2" size={16} />
          Record Attendance
        </Button>
      </div>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      {!loadError && rows === null && <ContentLoader minHeight={160} />}
      {rows && rows.length === 0 && (
        <p className="text-sm text-gray-500">
          You have not submitted any attendance yet.
        </p>
      )}

      {rows && rows.length > 0 && (
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>You were</th>
                <th style={th}>Submitted</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                  <td style={td}>
                    <span style={{ color: r.status === 'PRESENT' ? '#05603D' : '#E0552E', fontWeight: 500 }}>
                      {r.status === 'PRESENT' ? 'Present' : 'Absent'}
                    </span>
                  </td>
                  <td style={{ ...td, color: '#475569', whiteSpace: 'nowrap' }}>{formatMoment(r.submittedAt)}</td>
                  <td style={td}>
                    <StatusBadge status={r.approvalStatus} />
                    {/* Who decided, and when. A rejection is the one a teacher
                        most needs to be able to ask somebody about, so it names
                        the person rather than leaving them to guess. */}
                    {r.approvalStatus === 'REJECTED' && r.rejectedByName && (
                      <p style={{ marginTop: 4, fontSize: '0.6875rem', color: '#94A3B8' }}>
                        by {r.rejectedByName}
                      </p>
                    )}
                    {r.approvalStatus === 'APPROVED' && (
                      <p style={{ marginTop: 4, fontSize: '0.6875rem', color: '#94A3B8' }}>
                        {r.autoApproved ? `automatically after ${windowHours}h` : `by ${r.approvedByName ?? 'the school'}`}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setFormError(null); }}>
        {/* The student list can run long, so the dialog nominates ONE scrolling
            child rather than letting the whole box grow — a growing
            DialogContent pushes its error line and its buttons off-screen. */}
        <DialogContent style={{ maxWidth: 'min(560px, calc(100vw - 2rem))' }}>
          <DialogHeader>
            <DialogTitle>Record Attendance</DialogTitle>
            <DialogDescription>
              This cannot be changed once submitted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Date</Label>
              <div className="mt-2">
                <ThreePartDateInput value={date} onChange={(v) => setDate(v ?? '')} aria-label="Attendance date" />
              </div>
            </div>

            <div>
              <Label>Were you at work?</Label>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {(['PRESENT', 'ABSENT'] as const).map((value) => {
                  const active = selfStatus === value;
                  const tone = value === 'PRESENT' ? '#05603D' : '#E0552E';
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSelfStatus(value)}
                      style={{
                        flex: 1, padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
                        fontSize: '0.875rem', fontWeight: 500,
                        border: `1.5px solid ${active ? tone : '#D1D5DB'}`,
                        background: active ? tone : 'white',
                        color: active ? 'white' : '#374151',
                      }}
                    >
                      {value === 'PRESENT' ? 'Present' : 'Absent'}
                    </button>
                  );
                })}
              </div>
            </div>

            {selfStatus === 'ABSENT' ? (
              // No list at all, and the reason said plainly. A disabled list
              // would suggest the marks were merely unavailable rather than
              // that the whole class is about to be marked absent.
              <p
                className="text-sm"
                style={{
                  padding: '0.75rem', borderRadius: 10,
                  background: '#FFF7ED', border: '1px solid #FED7AA', color: '#9A3412',
                }}
              >
                You were not at work, so no register was taken. Every student in your class will be
                marked absent for this day.
              </p>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <Label>Your class</Label>
                  {students && students.length > 0 && (
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      {presentCount} present · {absent.size} absent
                    </span>
                  )}
                </div>

                {students === null && <ContentLoader minHeight={160} />}
                {students && students.length === 0 && (
                  <p className="text-sm text-gray-500 mt-2">
                    You are not the class teacher of any class, so there is no register to take.
                    Your own attendance will still be submitted.
                  </p>
                )}

                {students && students.length > 0 && (
                  <div
                    style={{
                      marginTop: 8, maxHeight: '38vh', overflowY: 'auto',
                      border: '1px solid #E2E8F0', borderRadius: 10,
                    }}
                  >
                    {students.map((s) => {
                      const isAbsent = absent.has(s.studentId);
                      return (
                        <div
                          key={s.studentId}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: 10, padding: '9px 12px', borderBottom: '1px solid #F1F5F9',
                          }}
                        >
                          <span style={{ fontSize: '0.875rem', color: '#0F172A', minWidth: 0 }}>{s.name}</span>
                          <button
                            type="button"
                            onClick={() => toggle(s.studentId)}
                            aria-pressed={!isAbsent}
                            style={{
                              padding: '3px 12px', borderRadius: 999, cursor: 'pointer',
                              fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap',
                              border: `1px solid ${isAbsent ? '#FECDD3' : '#A7F3D0'}`,
                              background: isAbsent ? '#FFE4E6' : '#D1FAE5',
                              color: isAbsent ? '#9F1239' : '#05603D',
                            }}
                          >
                            {isAbsent ? 'Absent' : 'Present'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p style={{ marginTop: 6, fontSize: '0.75rem', color: '#94A3B8' }}>
                  Everyone starts present. Tap a name to mark them absent.
                </p>
              </div>
            )}

            {formError && <p className="text-sm text-red-600">{formError}</p>}
          </div>

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={submitting}>Cancel</Button>
            </DialogClose>
            <Button onClick={submit} disabled={submitting || !date}>
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
