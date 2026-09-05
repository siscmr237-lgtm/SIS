'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ContentLoader } from './ContentLoader';
import { ThreePartDateInput } from './ThreePartDateInput';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { toast } from 'sonner';
import { ApprovalBadge, formatTime } from './TeacherAttendance';

/**
 * THE STAFF ATTENDANCE TAB — who was at work, for one day, and what the school
 * does about it.
 *
 * DRIVEN OFF THE STAFF LIST, NOT OFF THE RECORDS. Everybody appears, every day,
 * whether or not they said anything — which is the point. A teacher who forgot
 * has no row in StaffAttendance and never will (nothing creates them
 * retroactively), so listing only records would make the people most worth
 * noticing the ones who silently disappear from the screen. They show as "No
 * record" with the two buttons that turn that into a fact.
 *
 * FOUR ACTIONS, TWO KINDS. Approve and Reject decide a claim somebody made and
 * are offered only while it is PENDING — a decided day is settled, and Reject in
 * particular deletes student records with no undo, so there must be no button
 * that implies one. Mark Present and Mark Absent are the school recording the
 * day itself; they need no approval and are always available.
 *
 * Inline styles: src/index.css is a frozen, pre-compiled Tailwind build.
 */

interface Record_ {
  id: number;
  status: 'PRESENT' | 'ABSENT';
  arrivalTime: string | null;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_APPROVED';
  markedByAdmin: boolean;
  approvedByName: string | null;
  rejectedByName: string | null;
}

interface StaffRow {
  staffId: number;
  staffCode: string;
  name: string;
  role: string;
  isTeacher: boolean;
  record: Record_ | null;
}

interface Preview {
  studentCount: number;
  protectedCount: number;
  staffName: string | null;
  date: string;
}

const todayKey = () => new Date().toISOString().slice(0, 10);

const th: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: '0.75rem',
  textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B',
  borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = {
  padding: '12px 14px', fontSize: '0.875rem', color: '#0F172A',
  borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle',
};

/** The small buttons in the actions column, in the two weights they come in. */
function ActionButton({
  onClick, disabled, tone, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone: 'approve' | 'reject' | 'quiet';
  children: React.ReactNode;
}) {
  const palette = {
    approve: { bg: '#05603D', fg: 'white', border: '#05603D' },
    reject: { bg: 'white', fg: '#9F1239', border: '#FECDD3' },
    quiet: { bg: 'white', fg: '#475569', border: '#D1D5DB' },
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 12px', borderRadius: 8, fontSize: '0.8125rem', fontWeight: 500,
        whiteSpace: 'nowrap', cursor: disabled ? 'wait' : 'pointer',
        background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}`,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function StaffAttendanceTab() {
  const [date, setDate] = useState(todayKey());
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  // The rejection confirmation. Holds the row AND the server's count, because
  // the dialog names the number of student records that will go — asking
  // somebody to agree to an unknown is what this dialog exists to avoid.
  const [rejecting, setRejecting] = useState<{ row: StaffRow; preview: Preview | null } | null>(null);
  const [rejectBusy, setRejectBusy] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    setLoadError(null);
    api
      .get(`/staff-attendance/day?date=${encodeURIComponent(date)}`)
      .then((res: any) => setRows(res?.staff ?? []))
      .catch((e: any) => setLoadError(e?.message || 'Could not load staff attendance.'));
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const approve = async (row: StaffRow) => {
    if (!row.record || busy) return;
    setBusy(row.staffId);
    try {
      await api.post(`/staff-attendance/${row.record.id}/approve`, {});
      toast.success(`${row.name} approved.`);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not approve.');
      load();
    } finally {
      setBusy(null);
    }
  };

  const mark = async (row: StaffRow, status: 'PRESENT' | 'ABSENT') => {
    if (busy) return;
    setBusy(row.staffId);
    try {
      await api.post('/staff-attendance/mark', { staffId: row.staffId, date, status });
      toast.success(`${row.name} marked ${status === 'PRESENT' ? 'present' : 'absent'}.`);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not record that.');
      load();
    } finally {
      setBusy(null);
    }
  };

  // The preview is fetched as the dialog opens, so the wording can name a real
  // number. It opens either way: a preview that failed must not stop an admin
  // rejecting, it just means the dialog asks the question in general terms.
  const openReject = (row: StaffRow) => {
    if (!row.record) return;
    setRejecting({ row, preview: null });
    api
      .get(`/staff-attendance/${row.record.id}/reject-preview`)
      .then((p: Preview) => setRejecting((cur) => (cur?.row.staffId === row.staffId ? { row, preview: p } : cur)))
      .catch(() => { /* the dialog stands without the count */ });
  };

  const confirmReject = async () => {
    if (!rejecting?.row.record || rejectBusy) return;
    setRejectBusy(true);
    try {
      const res: any = await api.post(`/staff-attendance/${rejecting.row.record.id}/reject`, {});
      toast.success(
        res?.studentRecordsDeleted
          ? `Rejected. ${res.studentRecordsDeleted} student record${res.studentRecordsDeleted === 1 ? '' : 's'} removed.`
          : 'Rejected.',
      );
      setRejecting(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not reject.');
      load();
    } finally {
      setRejectBusy(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap',
          marginBottom: '1rem',
        }}
      >
        <div style={{ minWidth: 200 }}>
          <label style={{ display: 'block', fontSize: '0.8125rem', color: '#475569', marginBottom: 6 }}>
            Date
          </label>
          <ThreePartDateInput
            value={date}
            onChange={(v) => setDate(v ?? todayKey())}
            aria-label="Staff attendance date"
          />
        </div>
      </div>

      {loadError && (
        <p style={{
          padding: '0.75rem 0.875rem', borderRadius: 10, fontSize: '0.875rem',
          background: '#FFE4E6', border: '1px solid #FECDD3', color: '#9F1239',
        }}>
          {loadError}
        </p>
      )}

      {!loadError && rows === null && <ContentLoader minHeight={280} />}

      {rows && rows.length === 0 && (
        <p style={{ fontSize: '0.875rem', color: '#64748B' }}>No staff on record for this school.</p>
      )}

      {rows && rows.length > 0 && (
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflowX: 'auto', background: 'white' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Status</th>
                <th style={th}>Approval</th>
                <th style={th}>Arrival</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const r = row.record;
                const pending = r?.approvalStatus === 'PENDING';
                const working = busy === row.staffId;
                return (
                  <tr key={row.staffId}>
                    <td style={td}>
                      <div>{row.name}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{row.role}</div>
                    </td>
                    <td style={td}>
                      {r ? (
                        <span style={{ fontWeight: 500, color: r.status === 'PRESENT' ? '#05603D' : '#E0552E' }}>
                          {r.status === 'PRESENT' ? 'Present' : 'Absent'}
                        </span>
                      ) : (
                        <span style={{ color: '#94A3B8' }}>No record</span>
                      )}
                    </td>
                    <td style={td}>
                      {r ? (
                        <>
                          <ApprovalBadge status={r.approvalStatus} />
                          {r.markedByAdmin && (
                            <div style={{ marginTop: 4, fontSize: '0.6875rem', color: '#94A3B8' }}>
                              recorded by the school
                            </div>
                          )}
                        </>
                      ) : (
                        <span style={{ color: '#CBD5E1' }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: '#475569' }}>
                      {r && r.status === 'PRESENT' ? formatTime(r.arrivalTime) : <span style={{ color: '#CBD5E1' }}>—</span>}
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {pending && (
                          <>
                            <ActionButton tone="approve" disabled={working} onClick={() => approve(row)}>
                              Approve
                            </ActionButton>
                            <ActionButton tone="reject" disabled={working} onClick={() => openReject(row)}>
                              Reject
                            </ActionButton>
                          </>
                        )}
                        <ActionButton tone="quiet" disabled={working} onClick={() => mark(row, 'PRESENT')}>
                          Mark Present
                        </ActionButton>
                        <ActionButton tone="quiet" disabled={working} onClick={() => mark(row, 'ABSENT')}>
                          Mark Absent
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!rejecting} onOpenChange={(o) => { if (!o) setRejecting(null); }}>
        <DialogContent style={{ maxWidth: 'min(480px, calc(100vw - 2rem))' }}>
          <DialogHeader>
            <DialogTitle>Reject this attendance?</DialogTitle>
            <DialogDescription>
              Rejecting this will cancel all student attendance recorded by this teacher today.
              Continue?
            </DialogDescription>
          </DialogHeader>

          {rejecting?.preview && (
            <div style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.6 }}>
              <p>
                <strong>{rejecting.preview.studentCount}</strong> student record
                {rejecting.preview.studentCount === 1 ? '' : 's'} will be deleted.
              </p>
              {/* Said out loud because "12 will be deleted" reads very
                  differently beside "3 will not". */}
              {rejecting.preview.protectedCount > 0 && (
                <p style={{ marginTop: 4 }}>
                  {rejecting.preview.protectedCount} record
                  {rejecting.preview.protectedCount === 1 ? '' : 's'} you have already edited will be kept.
                </p>
              )}
              <p style={{ marginTop: 8, color: '#9F1239' }}>This cannot be undone.</p>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '1rem' }}>
            <DialogClose asChild>
              <button
                type="button"
                disabled={rejectBusy}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: '0.875rem',
                  border: '1px solid #D1D5DB', background: 'white', color: '#475569', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </DialogClose>
            <button
              type="button"
              onClick={confirmReject}
              disabled={rejectBusy}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: '0.875rem', fontWeight: 500,
                border: 'none', background: '#E0552E', color: 'white',
                cursor: rejectBusy ? 'wait' : 'pointer', opacity: rejectBusy ? 0.7 : 1,
              }}
            >
              {rejectBusy ? 'Rejecting…' : 'Reject'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
