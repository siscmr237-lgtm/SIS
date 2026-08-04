'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSisCache } from '@/lib/SisCache';
import { AcademicYearSelect, useAcademicYear } from '@/lib/academicYear';
import { formatTermLabel } from '@/utils/academicTerm';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';

/**
 * One continuous mark-entry dialog.
 *
 * The point of it is that entering marks for a whole class is ONE task, not a
 * repeated one. Class and academic year are the context and persist; changing the
 * subject or the assessment refreshes only the roster, and saving leaves the
 * dialog open so the next subject can be entered immediately. Nothing here
 * navigates.
 *
 * Selections cascade in the order an admin actually thinks in:
 *   class section -> academic year -> subject -> assessment -> marks
 *
 * A SECTION is chosen, not a level, because marks belong to the real enrolled
 * students of one section. SUBJECTS come from that section's class LEVEL, since a
 * level shares one subject list.
 *
 * Inline styles for layout details: src/index.css is a pre-compiled Tailwind build,
 * so a utility class that is not already in it renders as nothing at all.
 */

/**
 * The three states a student can be in for one assessment and subject. UNMARKED
 * is the absence of a mark, not a value — clearing the input returns them to it,
 * and at term end the backend converts it to a plain 0.
 */
type MarkState = 'MARKED' | 'UNMARKED' | 'EXEMPT';

interface RosterRow {
  studentId: string;
  firstName: string;
  lastName: string;
  marksObtained: number | null;
  state: MarkState;
  isExempt: boolean;
}

interface MissedStudent {
  studentId: string;
  firstName: string;
  lastName: string;
}

interface TestExam {
  id: number;
  name: string;
  type: string;
  term: string;
  academicYear: string;
}

export function EnterMarksDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const cache = useSisCache();
  const { status: yearStatus } = useAcademicYear();

  // --- context that PERSISTS across subjects ---
  const [classes, setClasses] = useState<Array<{ id: number; name: string }>>([]);
  const [classId, setClassId] = useState('');
  const [academicYear, setAcademicYear] = useState('');

  // --- per-subject selections, which reset the roster ---
  const [subjects, setSubjects] = useState<Array<{ id: number; name: string }>>([]);
  const [subjectId, setSubjectId] = useState('');
  const [exams, setExams] = useState<TestExam[]>([]);
  const [testExamId, setTestExamId] = useState('');

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [marks, setMarks] = useState<Record<string, string>>({});
  // Exempt is tracked separately from marks rather than as a magic value inside
  // them: an exempt student has no mark at all, and encoding that as a string
  // would make every numeric comparison below have to know about the sentinel.
  const [exempt, setExempt] = useState<Record<string, boolean>>({});
  const [totalMarks, setTotalMarks] = useState<number | null>(null);
  const [termEnded, setTermEnded] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set from the save response — the students the server confirms are still
  // unmarked for this subject. Cleared whenever the selection changes, since it
  // describes one subject on one assessment and nothing else.
  const [missed, setMissed] = useState<MissedStudent[] | null>(null);

  /**
   * Two guards against out-of-order responses, which on this screen are not a
   * cosmetic flicker but a route to writing marks against the wrong assessment.
   *
   * loadSeq — every roster fetch takes a ticket, and only the newest ticket may
   * write state. Switching subject twice quickly, or switching while a fetch is
   * still out, would otherwise let the earlier response land last and leave the
   * inputs, the roster and the total showing a selection that is no longer on
   * screen. Whatever is then typed and saved goes to the visible selection with
   * the invisible one's numbers.
   *
   * selRef — the live selection, readable from inside an async callback that
   * captured older values. save() awaits a network round-trip and then reloads;
   * without this it reloads whatever was selected when the button was clicked.
   */
  const loadSeq = useRef(0);
  const selRef = useRef({ testExamId: '', subjectId: '' });
  useEffect(() => { selRef.current = { testExamId, subjectId }; }, [testExamId, subjectId]);

  // Default the year to the school's active year once it is known.
  useEffect(() => {
    if (!academicYear && yearStatus?.activeYear) setAcademicYear(yearStatus.activeYear);
  }, [yearStatus, academicYear]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    api
      .get('/classes')
      .then((r: any) => {
        const list = (r ?? []).map((c: any) => ({ id: c.id, name: c.name }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        setClasses(list);
        setClassId(prev => (prev && list.some((c: any) => String(c.id) === prev) ? prev : list[0] ? String(list[0].id) : ''));
      })
      .catch((e: any) => setError(e?.message || 'Could not load classes.'));
  }, [open]);

  // Subjects come from the section's class LEVEL — the endpoint resolves that.
  useEffect(() => {
    if (!open || !classId) return;
    let alive = true;
    api
      .get(`/classes/${encodeURIComponent(classId)}/subjects`)
      .then((r: any) => {
        if (!alive) return;
        const list = r ?? [];
        setSubjects(list);
        setSubjectId(prev => (prev && list.some((s: any) => String(s.id) === prev) ? prev : list[0] ? String(list[0].id) : ''));
      })
      .catch(() => { if (alive) setSubjects([]); });
    return () => { alive = false; };
  }, [open, classId]);

  // Assessments for this section and year. Not filtered by term here: each option
  // shows its own term, so the admin picks the exact assessment without an extra
  // control — and it still works during Holiday, when there is no active term.
  useEffect(() => {
    if (!open || !classId || !academicYear) return;
    let alive = true;
    api
      .get(`/test-exams?classId=${encodeURIComponent(classId)}&academicYear=${encodeURIComponent(academicYear)}`)
      .then((r: any) => {
        if (!alive) return;
        const list: TestExam[] = r ?? [];
        setExams(list);
        setTestExamId(prev => (prev && list.some(x => String(x.id) === prev) ? prev : list[0] ? String(list[0].id) : ''));
      })
      .catch(() => { if (alive) setExams([]); });
    return () => { alive = false; };
  }, [open, classId, academicYear]);

  // The roster plus any existing marks and this assessment's total, in one call.
  const loadRoster = useCallback(async () => {
    const seq = ++loadSeq.current;
    const current = () => seq === loadSeq.current;
    if (!testExamId || !subjectId) { setRoster([]); setMarks({}); setExempt({}); setTotalMarks(null); return; }
    setLoadingRoster(true);
    setError(null);
    // Clear the previous subject's marks BEFORE awaiting. The fetch can take
    // several seconds, and leaving the old values on screen invites the admin to
    // type over them or to believe the new subject is already marked — the worst
    // possible confusion on a data-entry screen. The rows are hidden while
    // loading (below), so this never shows as a flash of empty inputs.
    setMarks({});
    setExempt({});
    setTotalMarks(null);
    // The notice describes the subject just saved, so it must not survive into
    // a different one.
    setMissed(null);
    try {
      const r: any = await api.get(
        `/test-exams/${encodeURIComponent(testExamId)}/marks?subjectId=${encodeURIComponent(subjectId)}`,
      );
      // A newer selection is already loading — that response is the one that
      // belongs on screen, so this one is dropped rather than applied late.
      if (!current()) return;
      const rows: RosterRow[] = r?.roster ?? [];
      setRoster(rows);
      setTotalMarks(r?.totalMarks ?? null);
      setTermEnded(Boolean(r?.termEnded));
      setMarks(Object.fromEntries(rows.map(s => [s.studentId, s.marksObtained == null ? '' : String(s.marksObtained)])));
      setExempt(Object.fromEntries(rows.filter(s => s.isExempt).map(s => [s.studentId, true])));
    } catch (e: any) {
      if (!current()) return;
      setRoster([]);
      setMarks({});
      setExempt({});
      setError(e?.message || 'Could not load the roster.');
    } finally {
      if (current()) setLoadingRoster(false);
    }
  }, [testExamId, subjectId]);

  useEffect(() => {
    if (!open) return;
    loadRoster();
  }, [open, loadRoster]);

  const setMark = (studentId: string, v: string) => {
    setError(null);
    setMarks(m => ({ ...m, [studentId]: v }));
  };

  /**
   * Exempting clears any number the student had: the two are mutually exclusive
   * states, and leaving a stale value behind the toggle would resurrect it on
   * un-exempt as if it had been entered deliberately.
   */
  const toggleExempt = (studentId: string, next: boolean) => {
    setError(null);
    setExempt(e => ({ ...e, [studentId]: next }));
    if (next) setMarks(m => ({ ...m, [studentId]: '' }));
  };

  /** The state a row is currently in, as the save will send it. */
  const stateOf = (studentId: string): MarkState => {
    if (exempt[studentId]) return 'EXEMPT';
    return String(marks[studentId] ?? '').trim() === '' ? 'UNMARKED' : 'MARKED';
  };

  const entered = roster.filter(s => stateOf(s.studentId) === 'MARKED').length;
  const exemptCount = roster.filter(s => stateOf(s.studentId) === 'EXEMPT').length;

  const save = async () => {
    if (saving) return;
    setError(null);
    if (totalMarks == null) {
      setError('This assessment has no total configured for that subject yet — set it under Tests & Exams first.');
      return;
    }
    // One entry per roster row, with its state spelled out. Sending the whole
    // roster rather than only the filled-in rows is what lets a cleared input
    // and a removed exemption actually undo themselves — a payload of just the
    // numbers can only ever add.
    const payload: Array<{ studentId: string; state: MarkState; marksObtained?: number }> = [];
    for (const s of roster) {
      const state = stateOf(s.studentId);
      if (state !== 'MARKED') { payload.push({ studentId: s.studentId, state }); continue; }
      const n = Number(String(marks[s.studentId]).trim());
      if (!Number.isFinite(n) || n < 0) {
        setError(`${s.firstName} ${s.lastName}: enter a number of 0 or more.`);
        return;
      }
      if (n > totalMarks) {
        setError(`${s.firstName} ${s.lastName}: ${n} is above this assessment's total of ${totalMarks}.`);
        return;
      }
      payload.push({ studentId: s.studentId, state, marksObtained: Math.round(n) });
    }
    // A save of nothing but blanks would only ever delete, which is not what the
    // button means. An all-exempt save IS meaningful, so it is allowed.
    if (!payload.some(p => p.state !== 'UNMARKED')) {
      setError('Enter at least one mark, or mark a student exempt, before saving.');
      return;
    }
    // Pinned for the duration of the request, so the reload below can tell
    // whether the admin has moved on to a different subject or assessment.
    const savedExamId = testExamId;
    const savedSubjectId = subjectId;
    setSaving(true);
    try {
      const r: any = await api.post(`/test-exams/${encodeURIComponent(savedExamId)}/marks/bulk`, {
        subjectId: Number(savedSubjectId),
        entries: payload,
      });
      // Totals and rankings are live-computed from marks, so nothing needs
      // recompiling — only the cached exam/total reads are now stale. The
      // students list carries the zero dot, so a saved 0 has to invalidate it.
      cache.invalidate('test-exams:*', 'subject-totals:*', 'students');
      const subjectName = subjects.find(s => String(s.id) === savedSubjectId)?.name ?? 'subject';
      const savedCount = payload.filter(p => p.state === 'MARKED').length;
      toast.success(`Saved ${savedCount} mark${savedCount === 1 ? '' : 's'} for ${subjectName}`);
      // Deliberately stays open: the next subject is the same task. Re-read so
      // the inputs show what the server actually stored — but only if that is
      // still the selection on screen, otherwise this would overwrite the new
      // selection's roster with the one just saved.
      const moved =
        selRef.current.testExamId !== savedExamId || selRef.current.subjectId !== savedSubjectId;
      if (!moved) {
        await loadRoster();
        // Set AFTER the reload, which clears it — the notice belongs to the save
        // that just happened, and the server's list is authoritative over the
        // roster the client happened to be holding.
        setMissed(Array.isArray(r?.unmarked) ? r.unmarked : []);
      }
    } catch (e: any) {
      setError(e?.message || 'Could not save these marks.');
    } finally {
      setSaving(false);
    }
  };

  const selectedClassName = classes.find(c => String(c.id) === classId)?.name ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}
      >
        <DialogHeader>
          <DialogTitle>Enter Marks</DialogTitle>
          <DialogDescription>
            Pick a class and year once, then work through the subjects — saving keeps this open so
            you can move straight to the next one.
          </DialogDescription>
        </DialogHeader>

        <div style={{ overflowY: 'auto', minHeight: 0, flex: 1 }}>
          {/* Context: chosen once, kept across subjects. All four are frozen
              while a save is in flight — changing the target of a request that
              has already been sent is how marks end up on the wrong assessment. */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId} disabled={saving}>
                <SelectTrigger>
                  <SelectValue placeholder={classes.length ? 'Select class' : 'No classes yet'} />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Academic Year</Label>
              <AcademicYearSelect
                value={academicYear}
                onChange={setAcademicYear}
                years={yearStatus?.years ?? []}
                disabled={saving}
              />
            </div>
            <div>
              <Label>Subject</Label>
              <Select value={subjectId} onValueChange={setSubjectId} disabled={saving}>
                <SelectTrigger>
                  <SelectValue placeholder={subjects.length ? 'Select subject' : 'No subjects for this level'} />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Test / Exam</Label>
              <Select value={testExamId} onValueChange={setTestExamId} disabled={saving}>
                <SelectTrigger>
                  <SelectValue placeholder={exams.length ? 'Select assessment' : 'None for this class and year'} />
                </SelectTrigger>
                <SelectContent>
                  {exams.map(x => (
                    <SelectItem key={x.id} value={String(x.id)}>
                      {x.name} — {formatTermLabel(x.term)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {subjects.length === 0 && classId && (
            <p className="text-sm text-gray-500" style={{ marginTop: '0.75rem' }}>
              {selectedClassName}’s class level has no subjects yet — set them under Classes →
              Manage Subjects.
            </p>
          )}
          {exams.length === 0 && classId && academicYear && (
            <p className="text-sm text-gray-500" style={{ marginTop: '0.75rem' }}>
              No tests or exams defined for {selectedClassName} in {academicYear} — create one under
              Tests &amp; Exams first.
            </p>
          )}

          {/* Roster */}
          {testExamId && subjectId && (
            <div style={{ marginTop: '1rem', borderTop: '1px solid #E5E7EB', paddingTop: '0.75rem' }}>
              <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
                <p className="text-sm text-gray-500">
                  {loadingRoster
                    ? 'Loading students...'
                    : `${roster.length} student${roster.length === 1 ? '' : 's'} · ${entered} marked` +
                      (exemptCount ? ` · ${exemptCount} exempt` : '')}
                </p>
                <p className="text-sm text-gray-500">
                  {totalMarks == null ? (
                    <span style={{ color: '#B45309' }}>No total set for this subject</span>
                  ) : (
                    <>Out of <strong>{totalMarks}</strong></>
                  )}
                </p>
              </div>

              {/* Explains why a roster for a finished term shows zeros rather
                  than blanks — otherwise they look like marks nobody entered. */}
              {termEnded && !loadingRoster && (
                <p className="text-sm text-gray-500" style={{ marginBottom: '0.5rem' }}>
                  This term has ended, so students left unmarked were given a 0. Editing any of
                  them still works.
                </p>
              )}

              {/* While a roster is loading, show nothing rather than the previous
                  selection's rows. Switching subject or class re-fetches, and on a
                  slow connection the old rows would sit there for seconds looking
                  like the new selection's data. */}
              {loadingRoster ? (
                <p className="text-sm text-gray-400">Fetching the roster and any marks already entered...</p>
              ) : roster.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No students enrolled in {selectedClassName}.
                </p>
              ) : (
                <div className="space-y-2">
                  {roster.map((s, i) => {
                    const isExempt = Boolean(exempt[s.studentId]);
                    return (
                      <div key={s.studentId} className="flex items-center gap-2">
                        <span className="text-sm text-gray-500" style={{ width: 24, textAlign: 'right' }}>
                          {i + 1}
                        </span>
                        <span className="text-sm" style={{ flex: 1 }}>
                          {s.firstName} {s.lastName}
                        </span>
                        {/* An exempt student has no mark to type, so the input is
                            replaced outright rather than disabled with a value
                            sitting in it — there is nothing there to show. */}
                        {isExempt ? (
                          <span
                            className="text-sm"
                            style={{ width: 96, textAlign: 'right', color: '#05603D', fontWeight: 500 }}
                          >
                            Exempt
                          </span>
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            max={totalMarks ?? undefined}
                            value={marks[s.studentId] ?? ''}
                            onChange={e => setMark(s.studentId, e.target.value)}
                            disabled={saving}
                            placeholder="—"
                            style={{ width: 96, textAlign: 'right' }}
                            aria-label={`Mark for ${s.firstName} ${s.lastName}`}
                          />
                        )}
                        <span className="text-sm text-gray-400" style={{ width: 48 }}>
                          {isExempt || totalMarks == null ? '' : `/ ${totalMarks}`}
                        </span>
                        {/* Reversible in both directions: the same control puts a
                            student back to being markable. */}
                        <Button
                          type="button"
                          variant={isExempt ? 'default' : 'outline'}
                          onClick={() => toggleExempt(s.studentId, !isExempt)}
                          disabled={saving}
                          style={{ height: 32, paddingLeft: 10, paddingRight: 10, fontSize: 12, width: 96 }}
                          aria-pressed={isExempt}
                          aria-label={
                            isExempt
                              ? `Cancel exemption for ${s.firstName} ${s.lastName}`
                              : `Exempt ${s.firstName} ${s.lastName} from this assessment`
                          }
                        >
                          {isExempt ? 'Un-exempt' : 'Exempt'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Post-save nudge. Only ever shown after a save, and only for students
              genuinely left blank — exempt students were excluded on purpose and
              listing them here would read as an error. Left visible until the
              selection changes, because it is the one prompt standing between a
              forgotten student and an automatic zero at term end. */}
          {missed && missed.length > 0 && (
            <div
              style={{
                marginTop: '0.75rem',
                border: '1px solid #E0552E',
                borderRadius: 6,
                padding: '0.5rem 0.75rem',
                backgroundColor: '#FFF7F5',
              }}
            >
              <p className="text-sm" style={{ color: '#E0552E', fontWeight: 500 }}>
                {missed.length} student{missed.length === 1 ? '' : 's'} still unmarked for this subject
              </p>
              <p className="text-sm text-gray-600" style={{ marginTop: '0.25rem' }}>
                {missed.map(m => `${m.firstName} ${m.lastName}`).join(', ')}
              </p>
              <p className="text-sm text-gray-500" style={{ marginTop: '0.25rem' }}>
                {termEnded
                  ? 'This term has already ended, so any student left blank has been given a 0.'
                  : 'Enter their marks before the term ends — anyone still blank then is given a 0.'}
              </p>
            </div>
          )}

          {missed && missed.length === 0 && (
            <p className="text-sm" style={{ color: '#05603D', marginTop: '0.75rem' }}>
              Every student in this class now has a mark or an exemption for this subject.
            </p>
          )}

          {error && <p className="text-sm" style={{ color: '#B91C1C', marginTop: '0.75rem' }}>{error}</p>}
        </div>

        <div className="flex items-center justify-between" style={{ paddingTop: '0.75rem' }}>
          <p className="text-sm text-gray-500">
            Totals and rankings update themselves — there is nothing to compile.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Close
            </Button>
            <Button onClick={save} disabled={saving || loadingRoster || !roster.length}>
              {saving ? 'Saving...' : 'Save Marks'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
