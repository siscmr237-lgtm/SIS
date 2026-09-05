'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ContentLoader } from './ContentLoader';
import { toast } from 'sonner';
import { Check, X, Lock, CalendarCheck } from 'lucide-react';

/**
 * THE TEACHER'S ATTENDANCE SCREEN — their own day, then their class.
 *
 * TWO SECTIONS, IN THIS ORDER, AND THE SECOND DEPENDS ON THE FIRST. A teacher
 * says whether they are here; only then does the class register open. That is
 * not a UI convenience, it is the rule the server enforces on every write (see
 * POST /staff-attendance/students), and the screen is arranged to make it
 * obvious rather than to work around it — a locked register with the reason
 * printed on it teaches the rule, a hidden one just looks broken.
 *
 * ONE FETCH DRIVES BOTH. GET /staff-attendance/today returns the day's record,
 * whether the register is open, and the roster if it is. Deriving "is it open?"
 * here from separate calls would put a second copy of the rule in TypeScript,
 * and the two would eventually disagree about a teacher who was rejected
 * mid-morning.
 *
 * INLINE STYLES THROUGHOUT: src/index.css is a frozen, pre-compiled Tailwind
 * build, so a utility class not already in it renders as nothing at all.
 */

type Approval = 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_APPROVED';

interface SelfRecord {
  id: number;
  date: string;
  status: 'PRESENT' | 'ABSENT';
  arrivalTime: string | null;
  approvalStatus: Approval;
  markedByAdmin: boolean;
  approvedByName: string | null;
  rejectedByName: string | null;
}

interface StudentRow {
  studentId: string;
  name: string;
  class: string;
  present: boolean;
  recorded: boolean;
}

interface Today {
  date: string;
  self: SelfRecord | null;
  canMarkStudents: boolean;
  lockedBy: string | null;
  students: StudentRow[];
}

/** The four states a day can be in, and how each one reads on a badge. */
const BADGE: Record<Approval, { label: string; color: string; background: string; border: string }> = {
  PENDING: { label: 'Pending', color: '#92400E', background: '#FEF3C7', border: '#FDE68A' },
  APPROVED: { label: 'Approved', color: '#05603D', background: '#D1FAE5', border: '#A7F3D0' },
  AUTO_APPROVED: { label: 'Auto-approved', color: '#0F2345', background: '#E4EEF9', border: '#C7DEF5' },
  REJECTED: { label: 'Rejected', color: '#9F1239', background: '#FFE4E6', border: '#FECDD3' },
};

export function ApprovalBadge({ status }: { status: Approval }) {
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

/** A clock time, for an arrival. Never a date — the card already says "today". */
export function formatTime(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const CARD: React.CSSProperties = {
  background: 'white', border: '1px solid #E2E8F0', borderRadius: 14,
  padding: '1.25rem', marginBottom: '1.25rem',
};

const NOTE = (tone: 'warn' | 'info' | 'bad'): React.CSSProperties => ({
  padding: '0.75rem 0.875rem', borderRadius: 10, fontSize: '0.875rem',
  background: tone === 'bad' ? '#FFE4E6' : tone === 'warn' ? '#FFF7ED' : '#F1F5F9',
  border: `1px solid ${tone === 'bad' ? '#FECDD3' : tone === 'warn' ? '#FED7AA' : '#E2E8F0'}`,
  color: tone === 'bad' ? '#9F1239' : tone === 'warn' ? '#9A3412' : '#475569',
});

export function TeacherAttendance() {
  const [data, setData] = useState<Today | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [indicating, setIndicating] = useState(false);

  // The register's working copy. Seeded from the server on every load, so a
  // save that was refused leaves the screen showing what is actually stored
  // rather than the edit that did not take.
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api
      .get('/staff-attendance/today')
      .then((res: Today) => {
        setData(res);
        const seed: Record<string, boolean> = {};
        for (const s of res.students ?? []) seed[s.studentId] = s.present;
        setMarks(seed);
      })
      .catch((e: any) => setLoadError(e?.message || 'Could not load your attendance.'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const indicate = async (status: 'PRESENT' | 'ABSENT') => {
    if (indicating) return;
    setIndicating(true);
    try {
      await api.post('/staff-attendance/self', { status });
      toast.success(status === 'PRESENT' ? 'Marked present for today.' : 'Marked absent for today.');
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not record your attendance.');
      // Reload anyway: the likeliest failure is that a record already exists,
      // and the screen should then show it rather than keep offering the button.
      load();
    } finally {
      setIndicating(false);
    }
  };

  const toggle = (studentId: string) => {
    setMarks((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
  };

  const saveRegister = async () => {
    if (saving || !data) return;
    setSaving(true);
    try {
      const res: any = await api.post('/staff-attendance/students', {
        students: data.students.map((s) => ({ studentId: s.studentId, present: marks[s.studentId] !== false })),
      });
      // The server may decline rows an admin has already ruled on. Saying so is
      // the difference between a save that did less than it claimed and one the
      // teacher understands.
      toast.success(
        res?.skippedAdminOverride
          ? `Saved. ${res.skippedAdminOverride} student${res.skippedAdminOverride === 1 ? '' : 's'} left as the school recorded them.`
          : 'Attendance saved.',
      );
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save the register.');
      load();
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="p-4 md:p-8">
        <p style={NOTE('bad')}>{loadError}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 md:p-8">
        <ContentLoader minHeight={320} />
      </div>
    );
  }

  const self = data.self;
  const rejected = self?.approvalStatus === 'REJECTED';
  const presentCount = data.students.filter((s) => marks[s.studentId] !== false).length;

  return (
    <div className="p-4 md:p-8">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="text-3xl mb-2">Attendance</h1>
        <p className="text-gray-600">
          Record your own presence for today, then take your class register.
        </p>
      </div>

      {/* ── TOP: the teacher's own day ─────────────────────────────────── */}
      <section style={CARD}>
        <h2 className="text-xl" style={{ marginBottom: '0.25rem' }}>My attendance today</h2>
        <p className="text-sm text-gray-500" style={{ marginBottom: '1rem' }}>
          {new Date(`${data.date}T00:00:00Z`).toLocaleDateString(undefined, {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
          })}
        </p>

        {!self ? (
          // NOT YET INDICATED. One prominent action and one quiet one — being
          // present is what happens almost every day, and giving the two equal
          // weight would make a mis-tap as likely as the right tap.
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 420 }}>
            <button
              type="button"
              onClick={() => indicate('PRESENT')}
              disabled={indicating}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '16px 20px', borderRadius: 12, border: 'none', cursor: indicating ? 'wait' : 'pointer',
                background: '#05603D', color: 'white', fontSize: '1.0625rem', fontWeight: 600,
                opacity: indicating ? 0.7 : 1,
              }}
            >
              <Check size={20} />
              I am present today
            </button>
            <button
              type="button"
              onClick={() => indicate('ABSENT')}
              disabled={indicating}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '9px 14px', borderRadius: 10, cursor: indicating ? 'wait' : 'pointer',
                border: '1px solid #D1D5DB', background: 'white', color: '#475569',
                fontSize: '0.875rem', fontWeight: 500, opacity: indicating ? 0.7 : 1,
              }}
            >
              <X size={15} />
              I am absent today
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <span
              style={{
                fontSize: '1.125rem', fontWeight: 600,
                color: self.status === 'PRESENT' ? '#05603D' : '#E0552E',
              }}
            >
              {self.status === 'PRESENT' ? 'Present' : 'Absent'}
            </span>
            <ApprovalBadge status={self.approvalStatus} />
            {self.status === 'PRESENT' && (
              <span style={{ fontSize: '0.875rem', color: '#64748B' }}>
                Arrived {formatTime(self.arrivalTime)}
              </span>
            )}
            {self.markedByAdmin && (
              <span style={{ fontSize: '0.8125rem', color: '#94A3B8' }}>
                Recorded by the school
              </span>
            )}
          </div>
        )}

        {self?.approvalStatus === 'PENDING' && (
          <p style={{ ...NOTE('info'), marginTop: '1rem' }}>
            Waiting for the school to approve. You can still take your class register.
          </p>
        )}

        {rejected && (
          // THE ONE MESSAGE THIS SCREEN MUST GET RIGHT. No retry button beside
          // it: the server refuses a second submission for a rejected day, so
          // offering one would only produce an error.
          <p style={{ ...NOTE('bad'), marginTop: '1rem' }}>
            Your attendance for today was rejected by the school admin.
            {self?.rejectedByName ? ` (${self.rejectedByName})` : ''}
          </p>
        )}
      </section>

      {/* ── BOTTOM: the class register ─────────────────────────────────── */}
      <section style={CARD}>
        <div
          style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap', marginBottom: '0.75rem',
          }}
        >
          <h2 className="text-xl">Class register</h2>
          {data.canMarkStudents && data.students.length > 0 && (
            <span style={{ fontSize: '0.8125rem', color: '#64748B' }}>
              {presentCount} present · {data.students.length - presentCount} absent
            </span>
          )}
        </div>

        {!self && (
          <p style={NOTE('info')}>
            <Lock size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />
            Indicate your own attendance above to open the register.
          </p>
        )}

        {self && self.status === 'ABSENT' && (
          <p style={NOTE('warn')}>
            You marked yourself absent today, so there is no register for you to take.
          </p>
        )}

        {rejected && (
          <p style={NOTE('bad')}>
            The register is closed because your attendance for today was rejected.
          </p>
        )}

        {/* ALREADY TAKEN BY SOMEBODY ELSE. Locked rather than merged: the
            register is one shared fact per student per day, and a second
            teacher saving over the first would silently replace their work. */}
        {data.lockedBy !== null && (
          <p style={NOTE('warn')}>
            Attendance for this class was already recorded today
            {data.lockedBy ? ` by ${data.lockedBy}` : ''}.
          </p>
        )}

        {data.canMarkStudents && data.students.length === 0 && (
          <p style={NOTE('info')}>
            You are not the class teacher of any class, so there is no register to take.
          </p>
        )}

        {data.canMarkStudents && data.students.length > 0 && (
          <>
            <p style={{ fontSize: '0.8125rem', color: '#94A3B8', marginBottom: 10 }}>
              Everyone starts present. Tap a name to mark them absent.
            </p>
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
              {data.students.map((s, i) => {
                const present = marks[s.studentId] !== false;
                return (
                  <div
                    key={s.studentId}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 10, padding: '10px 12px',
                      borderTop: i === 0 ? 'none' : '1px solid #F1F5F9',
                    }}
                  >
                    <span style={{ fontSize: '0.9375rem', color: '#0F172A', minWidth: 0 }}>{s.name}</span>
                    <button
                      type="button"
                      onClick={() => toggle(s.studentId)}
                      aria-pressed={present}
                      aria-label={`${s.name}: ${present ? 'present' : 'absent'}`}
                      style={{
                        padding: '5px 16px', borderRadius: 999, cursor: 'pointer',
                        fontSize: '0.8125rem', fontWeight: 500, whiteSpace: 'nowrap',
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={saveRegister}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 20px', borderRadius: 10, border: 'none',
                  cursor: saving ? 'wait' : 'pointer',
                  background: '#0F2345', color: 'white', fontSize: '0.9375rem', fontWeight: 500,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                <CalendarCheck size={16} />
                {saving ? 'Saving…' : 'Save Attendance'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
