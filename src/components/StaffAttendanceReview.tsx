'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from './ui/button';
import { Card } from './ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { toast } from 'sonner';
import { useAdminRole } from '@/lib/adminRole';
import { StatusBadge } from './TeacherAttendanceSubmit';
import { ContentLoader } from './ContentLoader';

/**
 * WHAT THE SCHOOL DOES WITH A TEACHER'S SUBMISSION.
 *
 * Both admin roles read this table. What they may DO with it differs:
 *
 *   OWNER          approves and rejects.
 *   ADMINISTRATOR  looks, and corrects the student register underneath.
 *
 * The buttons follow the role, but that is presentation only — approve and
 * reject carry requireOwner on the server, so an Administrator who calls them
 * directly is refused by the API itself. See src/routes/staffAttendance.js.
 *
 * Inline styles throughout: src/index.css is a frozen Tailwind build, so a
 * class not already compiled into it renders as nothing.
 */

type Approval = 'PENDING' | 'APPROVED' | 'REJECTED';

interface Submission {
  id: number;
  date: string;
  staffId: number;
  staffName: string | null;
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
  /** null means no register was taken for this student that day. */
  present: boolean | null;
  doneBy: string | null;
}

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

export function StaffAttendanceReview() {
  const role = useAdminRole();
  const isOwner = role === 'OWNER';

  const [rows, setRows] = useState<Submission[] | null>(null);
  const [windowHours, setWindowHours] = useState(48);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Reject confirmation. The count comes from the server, from the same helper
  // the cascade itself uses, so the number in the sentence is the number that
  // will actually change.
  const [rejecting, setRejecting] = useState<Submission | null>(null);
  const [rejectCount, setRejectCount] = useState<number | null>(null);
  const [rejectBusy, setRejectBusy] = useState(false);

  // The inline student editor.
  const [editing, setEditing] = useState<Submission | null>(null);
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [saveBusy, setSaveBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get('/staff-attendance')
      .then((res: any) => {
        setRows(res?.submissions ?? []);
        if (res?.autoApproveAfterHours) setWindowHours(res.autoApproveAfterHours);
      })
      .catch((e: any) => setError(e?.message || 'Could not load staff attendance.'));
  }, []);

  useEffect(() => {
    // Not until the role has settled — the table is the same for both, but the
    // Actions column is not, and rendering it twice would flash buttons at an
    // Administrator who is not allowed them.
    if (role === null) return;
    load();
  }, [role, load]);

  const approve = async (row: Submission) => {
    if (busyId) return;
    setBusyId(row.id);
    try {
      const res: any = await api.post(`/staff-attendance/${row.id}/approve`, {});
      toast.success(
        res?.wasRejected
          ? 'Approved. The students marked absent by the rejection are still absent — adjust them below if they were present.'
          : 'Approved.',
      );
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not approve that record.');
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (row: Submission) => {
    setRejecting(row);
    setRejectCount(null);
    api
      .get(`/staff-attendance/${row.id}/reject-preview`)
      .then((res: any) => setRejectCount(res?.studentCount ?? 0))
      // A failed preview must not block the decision, only the number in it.
      .catch(() => setRejectCount(null));
  };

  const confirmReject = async () => {
    if (!rejecting || rejectBusy) return;
    setRejectBusy(true);
    try {
      const res: any = await api.post(`/staff-attendance/${rejecting.id}/reject`, {});
      toast.success(`Rejected. ${res?.studentsMarkedAbsent ?? 0} student(s) marked absent.`);
      setRejecting(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not reject that record.');
    } finally {
      setRejectBusy(false);
    }
  };

  const openEditor = (row: Submission) => {
    setEditing(row);
    setStudents(null);
    setDraft({});
    setEditError(null);
    api
      .get(`/staff-attendance/${row.id}/students`)
      .then((res: any) => {
        const list: StudentRow[] = res?.students ?? [];
        setStudents(list);
        // A student with no record at all starts as ABSENT in the draft rather
        // than as present: saving is what creates the row, and inventing a
        // present mark for a day nobody recorded would be inventing a fact.
        setDraft(Object.fromEntries(list.map((s) => [s.studentId, s.present === true])));
      })
      .catch((e: any) => setEditError(e?.message || 'Could not load the class list.'));
  };

  const saveStudents = async () => {
    if (!editing || saveBusy || !students) return;
    setSaveBusy(true);
    setEditError(null);
    try {
      const res: any = await api.patch(`/staff-attendance/${editing.id}/students`, {
        students: students.map((s) => ({ studentId: s.studentId, present: !!draft[s.studentId] })),
      });
      toast.success(`${res?.updated ?? 0} student record(s) updated.`);
      setEditing(null);
    } catch (e: any) {
      setEditError(e?.message || 'Could not save those changes.');
    } finally {
      setSaveBusy(false);
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

  return (
    <Card className="p-6">
      <div style={{ marginBottom: '1rem' }}>
        <h2 className="text-xl">Staff Attendance</h2>
        <p className="text-sm text-gray-500 mt-1">
          What each teacher submitted about their own day, and the class register that came with it.
          {isOwner
            ? ` Anything you do not answer within ${windowHours} hours is approved automatically.`
            : ' Only the school owner can approve or reject; you can correct the student records.'}
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && rows === null && <ContentLoader minHeight={140} />}
      {rows && rows.length === 0 && (
        <p className="text-sm text-gray-500">No staff attendance has been submitted yet.</p>
      )}

      {rows && rows.length > 0 && (
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>Date</th>
                <th style={th}>Staff Name</th>
                <th style={th}>Present/Absent</th>
                <th style={th}>Submitted</th>
                <th style={th}>Approval Status</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                  <td style={td}>{r.staffName ?? '—'}</td>
                  <td style={td}>
                    <span style={{ color: r.status === 'PRESENT' ? '#05603D' : '#E0552E', fontWeight: 500 }}>
                      {r.status === 'PRESENT' ? 'Present' : 'Absent'}
                    </span>
                  </td>
                  <td style={{ ...td, color: '#475569', whiteSpace: 'nowrap' }}>{formatMoment(r.submittedAt)}</td>
                  <td style={td}>
                    <StatusBadge status={r.approvalStatus} />
                    {/* WHO DECIDED, always shown next to the badge. The record has
                        to say who submitted it AND who answered for it, and the
                        submitter is already the Staff Name column. */}
                    {r.approvalStatus === 'APPROVED' && (
                      <p style={{ marginTop: 4, fontSize: '0.6875rem', color: '#94A3B8' }}>
                        {r.autoApproved
                          ? `auto after ${windowHours}h · ${formatMoment(r.approvedAt)}`
                          : `by ${r.approvedByName ?? 'the school'} · ${formatMoment(r.approvedAt)}`}
                      </p>
                    )}
                    {r.approvalStatus === 'REJECTED' && (
                      <p style={{ marginTop: 4, fontSize: '0.6875rem', color: '#94A3B8' }}>
                        by {r.rejectedByName ?? 'the school'} · {formatMoment(r.rejectedAt)}
                      </p>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Button variant="outline" size="sm" onClick={() => openEditor(r)}>
                        Students
                      </Button>
                      {isOwner && r.approvalStatus === 'PENDING' && (
                        <>
                          <Button size="sm" disabled={busyId === r.id} onClick={() => approve(r)}>
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyId === r.id}
                            onClick={() => openReject(r)}
                            style={{ color: '#DC2626', borderColor: '#FECACA' }}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {isOwner && r.approvalStatus === 'REJECTED' && (
                        <Button size="sm" disabled={busyId === r.id} onClick={() => approve(r)}>
                          Re-approve
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject confirmation. It names the number of students because agreeing to
          "some students" is not agreeing to anything. */}
      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) setRejecting(null); }}>
        <DialogContent style={{ maxWidth: 'min(448px, calc(100vw - 2rem))' }}>
          <DialogHeader>
            <DialogTitle>Reject this record?</DialogTitle>
            <DialogDescription>
              {rejectCount === null
                ? 'This will mark every student in that class absent for the day. Continue?'
                : `This will mark ${rejectCount} student${rejectCount === 1 ? '' : 's'} absent. Continue?`}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            {rejecting?.staffName} · {formatDate(rejecting?.date ?? null)}. Re-approving later does
            not put the students back — you would adjust them yourself.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={rejectBusy} onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={rejectBusy} onClick={confirmReject}>
              {rejectBusy ? 'Rejecting…' : 'Reject and mark absent'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* The student register underneath one submission. Open to BOTH roles —
          correcting who was in the room is not the same act as deciding whether
          to stand behind the claim. */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setEditError(null); } }}>
        <DialogContent style={{ maxWidth: 'min(560px, calc(100vw - 2rem))' }}>
          <DialogHeader>
            <DialogTitle>Student attendance</DialogTitle>
            <DialogDescription>
              {editing?.staffName} · {formatDate(editing?.date ?? null)}
            </DialogDescription>
          </DialogHeader>

          {students === null && !editError && <ContentLoader minHeight={140} />}
          {students && students.length === 0 && (
            <p className="text-sm text-gray-500">
              This staff member is not the class teacher of any class, so there is no register.
            </p>
          )}

          {students && students.length > 0 && (
            <div
              style={{
                maxHeight: '46vh', overflowY: 'auto',
                border: '1px solid #E2E8F0', borderRadius: 10,
              }}
            >
              {students.map((s) => {
                const present = !!draft[s.studentId];
                return (
                  <div
                    key={s.studentId}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 10, padding: '9px 12px', borderBottom: '1px solid #F1F5F9',
                    }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontSize: '0.875rem', color: '#0F172A' }}>{s.name}</span>
                      {/* No record at all is a third state, and it must not read
                          as absent — nobody recorded anything for this student. */}
                      {s.present === null && (
                        <span style={{ marginLeft: 8, fontSize: '0.6875rem', color: '#94A3B8' }}>
                          not recorded
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, [s.studentId]: !d[s.studentId] }))}
                      aria-pressed={present}
                      style={{
                        padding: '3px 12px', borderRadius: 999, cursor: 'pointer',
                        fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap',
                        border: `1px solid ${present ? '#A7F3D0' : '#FECDD3'}`,
                        background: present ? '#D1FAE5' : '#FFE4E6',
                        color: present ? '#05603D' : '#9F1239',
                      }}
                    >
                      {present ? 'Present' : 'Absent'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {editError && <p className="text-sm text-red-600">{editError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={saveBusy} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveStudents} disabled={saveBusy || !students || students.length === 0}>
              {saveBusy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
