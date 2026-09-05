'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { ContentLoader } from './ContentLoader';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ApprovalBadge, formatTime } from './TeacherAttendance';

/**
 * THE STUDENT ATTENDANCE TAB — a month of one class at a glance, and any one day
 * of it in full.
 *
 * A CALENDAR RATHER THAN A TABLE, because the question this screen answers is
 * "which days went wrong?" and that is a question about shape. Thirty cells the
 * eye can scan beat thirty rows it has to read, and the three colours carry the
 * whole answer:
 *
 *   green   every student marked, all present
 *   red     marked, and somebody was absent
 *   grey    nothing recorded — a dash, not a zero
 *
 * GREY IS NOT ABSENT AND MUST NEVER READ AS IT. A day nobody took the register
 * is a day with no information, which is a different failure from a day everyone
 * missed, and conflating them would quietly turn an administrative lapse into a
 * pupil's attendance record. It is also what a rejected register leaves behind —
 * the cascade deletes those rows rather than marking them absent, precisely so
 * the cell goes back to saying nothing.
 *
 * THE COLOURS ARE THE SERVER'S. Each cell's state comes from
 * GET /attendance/calendar, so the rule lives in one place; this file only maps
 * a state to a swatch.
 *
 * Inline styles: src/index.css is a frozen, pre-compiled Tailwind build.
 */

type CellState = 'all-present' | 'some-absent' | 'none';

interface DayCell {
  date: string;
  state: CellState;
  recorded: number;
  present: number;
  absent: number;
  total: number;
}

interface TeacherRow {
  staffId: number;
  name: string;
  recordId: number | null;
  status: 'PRESENT' | 'ABSENT' | null;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_APPROVED' | null;
  arrivalTime: string | null;
  markedByAdmin: boolean;
}

interface StudentRow {
  studentId: string;
  name: string;
  present: boolean | null;
  recordedBy: string | null;
  byTeacher: boolean;
  adminOverride: boolean;
}

interface DayDetail {
  date: string;
  class: string;
  teachers: TeacherRow[];
  students: StudentRow[];
}

const SWATCH: Record<CellState, { bg: string; fg: string; border: string }> = {
  'all-present': { bg: '#D1FAE5', fg: '#05603D', border: '#A7F3D0' },
  'some-absent': { bg: '#FFE4E6', fg: '#9F1239', border: '#FECDD3' },
  none: { bg: '#F1F5F9', fg: '#94A3B8', border: '#E2E8F0' },
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A YYYY-MM-DD key from UTC fields, matching what the server sends back. */
const key = (d: Date) => d.toISOString().slice(0, 10);

/** First and last day of the month containing `d`, in UTC. */
function monthBounds(d: Date) {
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { from, to };
}

/**
 * How many blank cells precede the 1st, so the grid lines up under Mon–Sun.
 *
 * getUTCDay is 0 for Sunday; this grid starts on Monday, which is what the
 * `+ 6) % 7` turns it into.
 */
const leadingBlanks = (first: Date) => (first.getUTCDay() + 6) % 7;

const td: React.CSSProperties = {
  padding: '10px 12px', fontSize: '0.875rem', color: '#0F172A',
  borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle',
};
const th: React.CSSProperties = {
  textAlign: 'left', padding: '9px 12px', fontSize: '0.75rem',
  textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B',
  borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap',
};

export function StudentAttendanceCalendar() {
  const [classes, setClasses] = useState<string[] | null>(null);
  const [className, setClassName] = useState<string>('');
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });

  const [cells, setCells] = useState<DayCell[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [openDay, setOpenDay] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [savingStudent, setSavingStudent] = useState<string | null>(null);

  // The class list is the filter's whole content, so the screen cannot do
  // anything until it arrives — hence the first class is selected for them
  // rather than leaving an empty picker over an empty calendar.
  useEffect(() => {
    api
      .get('/classes')
      .then((r: any) => {
        const names = (Array.isArray(r) ? r : []).map((c: any) => c.name).filter(Boolean);
        setClasses(names);
        setClassName((cur) => cur || names[0] || '');
      })
      .catch((e: any) => setLoadError(e?.message || 'Could not load classes.'));
  }, []);

  const loadMonth = useCallback(() => {
    if (!className) return;
    setCells(null);
    setLoadError(null);
    const { from, to } = monthBounds(month);
    api
      .get(`/attendance/calendar?class=${encodeURIComponent(className)}&from=${key(from)}&to=${key(to)}`)
      .then((res: any) => setCells(res?.days ?? []))
      .catch((e: any) => setLoadError(e?.message || 'Could not load the calendar.'));
  }, [className, month]);

  useEffect(() => { loadMonth(); }, [loadMonth]);

  const loadDay = useCallback((date: string) => {
    setDetail(null);
    setDetailError(null);
    api
      .get(`/attendance/day?class=${encodeURIComponent(className)}&date=${encodeURIComponent(date)}`)
      .then((res: DayDetail) => setDetail(res))
      .catch((e: any) => setDetailError(e?.message || 'Could not load that day.'));
  }, [className]);

  const openDetail = (date: string) => {
    setOpenDay(date);
    loadDay(date);
  };

  /**
   * Set one student's status for the open day.
   *
   * Goes through POST /attendance/mark, the same endpoint the register sheet
   * uses — which stamps adminOverride for an admin caller. That is what protects
   * this edit from a later rejection cascade, and it happens on the server so
   * this screen cannot forget to ask for it.
   */
  const setStudent = async (studentId: string, present: boolean) => {
    if (!openDay || savingStudent) return;
    setSavingStudent(studentId);
    try {
      await api.post('/attendance/mark', {
        date: openDay,
        records: [{ studentId, present }],
      });
      loadDay(openDay);
      // The cell's colour may have just changed, and the calendar behind the
      // dialog is still on screen.
      loadMonth();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save that.');
      loadDay(openDay);
    } finally {
      setSavingStudent(null);
    }
  };

  const byDate = useMemo(() => new Map((cells ?? []).map((c) => [c.date, c])), [cells]);
  const { from } = monthBounds(month);
  const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  const todayKey = key(new Date());

  const shiftMonth = (delta: number) =>
    setMonth((m) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + delta, 1)));

  return (
    <div>
      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap', marginBottom: '1rem',
        }}
      >
        <div style={{ minWidth: 200 }}>
          <label
            htmlFor="attendance-class"
            style={{ display: 'block', fontSize: '0.8125rem', color: '#475569', marginBottom: 6 }}
          >
            Class
          </label>
          <select
            id="attendance-class"
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            style={{
              padding: '8px 12px', borderRadius: 8, border: '1px solid #D1D5DB',
              background: 'white', fontSize: '0.875rem', color: '#0F172A', minWidth: 200,
            }}
          >
            {classes === null && <option>Loading…</option>}
            {classes?.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            style={{
              padding: 7, borderRadius: 8, border: '1px solid #D1D5DB',
              background: 'white', cursor: 'pointer', lineHeight: 0,
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: '0.9375rem', fontWeight: 500, minWidth: 148, textAlign: 'center' }}>
            {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            style={{
              padding: 7, borderRadius: 8, border: '1px solid #D1D5DB',
              background: 'white', cursor: 'pointer', lineHeight: 0,
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: '0.875rem' }}>
        {([
          ['all-present', 'All present'],
          ['some-absent', 'Some absent'],
          ['none', 'Not taken'],
        ] as [CellState, string][]).map(([state, label]) => (
          <span key={state} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: '#64748B' }}>
            <span
              style={{
                width: 12, height: 12, borderRadius: 3,
                background: SWATCH[state].bg, border: `1px solid ${SWATCH[state].border}`,
              }}
            />
            {label}
          </span>
        ))}
      </div>

      {loadError && (
        <p style={{
          padding: '0.75rem 0.875rem', borderRadius: 10, fontSize: '0.875rem',
          background: '#FFE4E6', border: '1px solid #FECDD3', color: '#9F1239',
        }}>
          {loadError}
        </p>
      )}

      {!loadError && cells === null && <ContentLoader minHeight={320} />}

      {/* ── The calendar ────────────────────────────────────────────────── */}
      {!loadError && cells !== null && (
        <div style={{ background: 'white', border: '1px solid #E2E8F0', borderRadius: 12, padding: '0.875rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                style={{
                  textAlign: 'center', fontSize: '0.6875rem', textTransform: 'uppercase',
                  letterSpacing: '0.04em', color: '#94A3B8', paddingBottom: 4,
                }}
              >
                {d}
              </div>
            ))}

            {Array.from({ length: leadingBlanks(from) }).map((_, i) => <div key={`blank-${i}`} />)}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), i + 1));
              const k = key(d);
              const cell = byDate.get(k);
              const s = SWATCH[cell?.state ?? 'none'];
              const isToday = k === todayKey;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => openDetail(k)}
                  title={
                    cell && cell.recorded
                      ? `${cell.present} present, ${cell.absent} absent of ${cell.total}`
                      : 'No attendance taken'
                  }
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: 2, minHeight: 58, padding: '6px 2px', borderRadius: 9, cursor: 'pointer',
                    background: s.bg, color: s.fg,
                    border: isToday ? '2px solid #0F2345' : `1px solid ${s.border}`,
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{i + 1}</span>
                  <span style={{ fontSize: '0.6875rem', opacity: 0.85 }}>
                    {cell && cell.recorded ? `${cell.present}/${cell.total}` : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── One day, in full ────────────────────────────────────────────── */}
      <Dialog open={!!openDay} onOpenChange={(o) => { if (!o) { setOpenDay(null); setDetail(null); } }}>
        <DialogContent style={{ maxWidth: 'min(680px, calc(100vw - 2rem))' }}>
          <DialogHeader>
            <DialogTitle>
              {openDay
                ? new Date(`${openDay}T00:00:00Z`).toLocaleDateString(undefined, {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
                  })
                : ''}
            </DialogTitle>
            <DialogDescription>{className}</DialogDescription>
          </DialogHeader>

          {detailError && <p style={{ fontSize: '0.875rem', color: '#9F1239' }}>{detailError}</p>}
          {!detailError && !detail && <ContentLoader minHeight={220} />}

          {detail && (
            <div style={{ maxHeight: '62vh', overflowY: 'auto', paddingRight: 2 }}>
              {/* TOP: who was responsible for this class that day. First,
                  because whether the register can be trusted is prior to what
                  it says. */}
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: 8 }}>Teachers</h3>
              {detail.teachers.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: '#94A3B8', marginBottom: 20 }}>
                  No class teacher is assigned to this class.
                </p>
              ) : (
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflowX: 'auto', marginBottom: 22 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                    <thead>
                      <tr>
                        <th style={th}>Name</th>
                        <th style={th}>Status</th>
                        <th style={th}>Approval</th>
                        <th style={th}>Arrival</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.teachers.map((t) => (
                        <tr key={t.staffId}>
                          <td style={td}>{t.name}</td>
                          <td style={td}>
                            {t.status ? (
                              <span style={{ fontWeight: 500, color: t.status === 'PRESENT' ? '#05603D' : '#E0552E' }}>
                                {t.status === 'PRESENT' ? 'Present' : 'Absent'}
                              </span>
                            ) : (
                              <span style={{ color: '#94A3B8' }}>No record</span>
                            )}
                          </td>
                          <td style={td}>
                            {t.approvalStatus
                              ? <ApprovalBadge status={t.approvalStatus} />
                              : <span style={{ color: '#CBD5E1' }}>—</span>}
                          </td>
                          <td style={{ ...td, whiteSpace: 'nowrap', color: '#475569' }}>
                            {t.status === 'PRESENT'
                              ? formatTime(t.arrivalTime)
                              : <span style={{ color: '#CBD5E1' }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* BOTTOM: the register itself, editable in place. */}
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: 8 }}>Students</h3>
              {detail.students.length === 0 ? (
                <p style={{ fontSize: '0.875rem', color: '#94A3B8' }}>No students in this class.</p>
              ) : (
                <div style={{ border: '1px solid #E2E8F0', borderRadius: 10, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
                    <thead>
                      <tr>
                        <th style={th}>Name</th>
                        <th style={th}>Recorded by</th>
                        <th style={{ ...th, textAlign: 'right' }}>Attendance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.students.map((s) => {
                        const working = savingStudent === s.studentId;
                        return (
                          <tr key={s.studentId}>
                            <td style={td}>{s.name}</td>
                            <td style={{ ...td, color: '#64748B', fontSize: '0.8125rem' }}>
                              {s.recordedBy ?? <span style={{ color: '#CBD5E1' }}>—</span>}
                              {s.adminOverride && (
                                <div style={{ fontSize: '0.6875rem', color: '#8C52FF', marginTop: 2 }}>
                                  edited by admin
                                </div>
                              )}
                            </td>
                            <td style={{ ...td, textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: 6 }}>
                                {(['present', 'absent'] as const).map((which) => {
                                  const wantPresent = which === 'present';
                                  const active = s.present === wantPresent;
                                  const tone = wantPresent
                                    ? { bg: '#D1FAE5', fg: '#05603D', border: '#A7F3D0' }
                                    : { bg: '#FFE4E6', fg: '#9F1239', border: '#FECDD3' };
                                  return (
                                    <button
                                      key={which}
                                      type="button"
                                      disabled={working}
                                      onClick={() => setStudent(s.studentId, wantPresent)}
                                      aria-pressed={active}
                                      style={{
                                        padding: '4px 12px', borderRadius: 999,
                                        fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap',
                                        cursor: working ? 'wait' : 'pointer',
                                        background: active ? tone.bg : 'white',
                                        color: active ? tone.fg : '#94A3B8',
                                        border: `1px solid ${active ? tone.border : '#E2E8F0'}`,
                                        opacity: working ? 0.6 : 1,
                                      }}
                                    >
                                      {wantPresent ? 'Present' : 'Absent'}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={{ marginTop: 10, fontSize: '0.75rem', color: '#94A3B8' }}>
                Changing a student here records it as a school edit, and it will not be
                removed if this day's teacher attendance is later rejected.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
