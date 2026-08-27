'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSisCache } from '@/lib/SisCache';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';

/**
 * The mark-entry flow, shared by the admin dialog and the teacher portal so the
 * two cannot drift apart. Only the source of the class and subject lists differs:
 *
 *   admin   — every class in the school, subjects from the class level.
 *   teacher — GET /staff/me/teaching, which the server scopes by the same rule
 *             (canTeacherRecordMarks) it enforces on the roster read and the mark
 *             write. Nothing here widens that; the UI only ever offers a subset of
 *             what the server would accept.
 *
 * Selection order: class LEVEL -> [section] -> term -> assessment -> subject -> roster.
 *
 * A LEVEL is chosen because that is how people refer to a class, but marks belong
 * to the real enrolled students of ONE section: each section has its own TestExam
 * row and its own roster, and StudentMark points at a single testExamId. So the
 * section step appears whenever a level has more than one section holding
 * students, and is skipped (auto-resolved) when it does not — which keeps every
 * downstream behaviour operating on exactly one TestExam and one roster, exactly
 * as before.
 *
 * THE TOTAL IS SET FROM HERE TOO. A subject with no configured total is not
 * enterable — that is Stage 1's rule, and it is the right rule — but until now
 * the only place to set one was the admin's Manage Sequence Tests & Exams
 * dialog. So a teacher sitting in front of a marked script would reach this
 * screen, be told the subject is not counted, and have no way to say what the
 * paper was out of; the marks waited on somebody else opening a different
 * screen. The teacher is the person who knows the answer, so the box is here,
 * next to where it bites. The server gates it on the same canTeacherRecordMarks
 * pairing that already gates reading this roster and saving these marks, so
 * nothing about who may touch what has widened.
 *
 * Inline styles for layout: src/index.css is a pre-compiled Tailwind build, so a
 * utility class not already in it renders as nothing at all.
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

interface MissedStudent { studentId: string; firstName: string; lastName: string }
interface SubjectRow { id: number; name: string }
interface ExamRow { id: number; name: string; type: string; term: string; academicYear: string }

/** One concrete class row (a section), with what we need to route the flow. */
interface SectionRow {
  id: number;
  name: string;
  level: string;
  studentCount: number | null;
  /** Pre-scoped subjects (teacher). Null means "fetch for this section" (admin). */
  subjects: SubjectRow[] | null;
}

const TERMS = ['Term 1', 'Term 2', 'Term 3'];

/**
 * The level a class name belongs to. Mirrors classLevelOf in
 * sis-backend/src/utils/classLevels.js: a trailing single capital is a section
 * letter, anything else is already a level.
 */
function levelOf(className: string): string {
  const name = String(className || '').trim();
  const m = /^(.+) ([A-Z])$/.exec(name);
  return m ? m[1] : name;
}

export function EnterMarksFlow({
  audience,
  academicYear,
  active = true,
}: {
  audience: 'admin' | 'teacher';
  academicYear: string;
  /** False while a containing dialog is closed, so nothing is fetched. */
  active?: boolean;
}) {
  const cache = useSisCache();

  const [sections, setSections] = useState<SectionRow[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);

  const [level, setLevel] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [term, setTerm] = useState(TERMS[0]);
  const [testExamId, setTestExamId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const [exams, setExams] = useState<ExamRow[]>([]);
  const [adminSubjects, setAdminSubjects] = useState<SubjectRow[]>([]);
  /** subjectId -> configured total for the selected assessment, or absent. */
  const [subjectTotals, setSubjectTotals] = useState<Record<number, number>>({});

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [marks, setMarks] = useState<Record<string, string>>({});
  // Exempt is tracked separately from marks rather than as a magic value inside
  // them: an exempt student has no mark at all, and encoding that as a string
  // would make every numeric comparison below have to know about the sentinel.
  const [exempt, setExempt] = useState<Record<string, boolean>>({});
  const [totalMarks, setTotalMarks] = useState<number | null>(null);
  const [termEnded, setTermEnded] = useState(false);
  const [subjectActivated, setSubjectActivated] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missed, setMissed] = useState<{ zeroed: MissedStudent[]; pending: MissedStudent[] } | null>(null);

  // "What is this subject out of on this paper" — open only while it is being
  // answered, so the roster is not sharing its width with a box nobody is using.
  const [editingTotal, setEditingTotal] = useState(false);
  const [totalDraft, setTotalDraft] = useState('');
  const [savingTotal, setSavingTotal] = useState(false);
  /** Set when the server refused a total that sits under a mark already entered. */
  const [totalWarning, setTotalWarning] = useState<string | null>(null);

  /**
   * Two guards against out-of-order responses, which on this screen are not a
   * cosmetic flicker but a route to writing marks against the wrong assessment.
   *
   * loadSeq — every roster fetch takes a ticket, and only the newest may write
   * state. Switching subject twice quickly would otherwise let the earlier
   * response land last, leaving the inputs and the total showing a selection that
   * is no longer on screen.
   *
   * selRef — the live selection, readable from inside an async callback that
   * captured older values, so the post-save reload targets what is on screen now.
   */
  const loadSeq = useRef(0);
  const selRef = useRef({ testExamId: '', subjectId: '' });
  useEffect(() => { selRef.current = { testExamId, subjectId }; }, [testExamId, subjectId]);

  // ---------------------------------------------------------------- sources
  useEffect(() => {
    if (!active) return;
    let alive = true;
    setLoadingSections(true);
    setError(null);

    const load = async () => {
      if (audience === 'teacher') {
        const res: any = await api.get('/staff/me/teaching');
        const list: SectionRow[] = (res?.classes ?? []).map((c: any) => ({
          id: c.id,
          name: c.name,
          level: levelOf(c.name),
          studentCount: typeof c.studentCount === 'number' ? c.studentCount : null,
          subjects: Array.isArray(c.subjects) ? c.subjects : [],
        }));
        return list;
      }
      // Admin: every class, with student counts derived from the roster list —
      // /classes does not carry them and only the section step needs them.
      const [classesRes, studentsRes] = await Promise.all([
        api.get('/classes'),
        api.get('/students').catch(() => []),
      ]);
      const counts = new Map<string, number>();
      for (const s of Array.isArray(studentsRes) ? studentsRes : []) {
        const key = String((s as any)?.class ?? '');
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return (Array.isArray(classesRes) ? classesRes : []).map((c: any) => ({
        id: c.id,
        name: c.name,
        level: levelOf(c.name),
        studentCount: counts.get(c.name) ?? 0,
        subjects: null,
      })) as SectionRow[];
    };

    load()
      .then((list) => {
        if (!alive) return;
        list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        setSections(list);
      })
      .catch((e: any) => { if (alive) setError(e?.message || 'Could not load your classes.'); })
      .finally(() => { if (alive) setLoadingSections(false); });

    return () => { alive = false; };
  }, [active, audience]);

  const levels = useMemo(() => {
    const set = new Set(sections.map((s) => s.level));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [sections]);

  useEffect(() => {
    if (!level && levels.length) setLevel(levels[0]);
  }, [levels, level]);

  const sectionsOfLevel = useMemo(
    () => sections.filter((s) => s.level === level),
    [sections, level],
  );

  /**
   * The section step exists only when the choice is real: more than one section
   * of this level actually holds students. A level whose sections are empty but
   * for one resolves straight through, which is the common case.
   */
  const populated = useMemo(
    () => sectionsOfLevel.filter((s) => (s.studentCount ?? 0) > 0),
    [sectionsOfLevel],
  );
  const needsSectionStep = populated.length > 1;

  useEffect(() => {
    if (!sectionsOfLevel.length) { setSectionId(''); return; }
    // Keep a still-valid choice; otherwise resolve one.
    if (sectionId && sectionsOfLevel.some((s) => String(s.id) === sectionId)) return;
    const auto = populated.length === 1 ? populated[0] : sectionsOfLevel[0];
    setSectionId(auto ? String(auto.id) : '');
  }, [sectionsOfLevel, populated, sectionId]);

  const section = sections.find((s) => String(s.id) === sectionId) ?? null;

  // ---------------------------------------------------------------- cascade
  useEffect(() => {
    setExams([]);
    setTestExamId('');
    if (!active || !section || !term || !academicYear) return;
    let alive = true;
    api
      .get(`/test-exams?classId=${encodeURIComponent(section.id)}&term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear)}`)
      .then((r: any) => {
        if (!alive) return;
        const list: ExamRow[] = Array.isArray(r) ? r : [];
        setExams(list);
        setTestExamId(list[0] ? String(list[0].id) : '');
      })
      .catch(() => { if (alive) setExams([]); });
    return () => { alive = false; };
  }, [active, section?.id, term, academicYear]);

  // Admin subject list for the chosen section's LEVEL. Teachers already have a
  // scoped list from the server and must not be given a wider one.
  useEffect(() => {
    if (!active || audience !== 'admin' || !section) { setAdminSubjects([]); return; }
    let alive = true;
    api
      .get(`/classes/${encodeURIComponent(section.id)}/subjects`)
      .then((r: any) => {
        if (!alive) return;
        setAdminSubjects(
          (Array.isArray(r) ? r : [])
            .map((s: any) => ({ id: s.subjectId ?? s.id, name: s.name }))
            .filter((s: SubjectRow) => s.id && s.name),
        );
      })
      .catch(() => { if (alive) setAdminSubjects([]); });
    return () => { alive = false; };
  }, [active, audience, section?.id]);

  const subjects: SubjectRow[] = audience === 'teacher' ? (section?.subjects ?? []) : adminSubjects;

  // Which subjects have a total configured for this assessment. A subject with
  // none is not enterable — Stage 1's rule: no total means it is not counted in
  // ranking or scoring, so entering marks against it would be meaningless.
  useEffect(() => {
    setSubjectTotals({});
    if (!active || !testExamId) return;
    let alive = true;
    api
      .get(`/test-exams/${encodeURIComponent(testExamId)}/subject-totals`)
      .then((r: any) => {
        if (!alive) return;
        const map: Record<number, number> = {};
        for (const t of Array.isArray(r) ? r : []) {
          if (t?.subjectId != null && t?.totalMarks != null) map[t.subjectId] = t.totalMarks;
        }
        setSubjectTotals(map);
      })
      .catch(() => { if (alive) setSubjectTotals({}); });
    return () => { alive = false; };
  }, [active, testExamId]);

  const subjectHasTotal = (id: number) => subjectTotals[id] != null;

  // Keep the subject valid, preferring one that can actually be entered.
  useEffect(() => {
    if (!subjects.length) { setSubjectId(''); return; }
    if (subjectId && subjects.some((s) => String(s.id) === subjectId)) return;
    const firstEnterable = subjects.find((s) => subjectHasTotal(s.id)) ?? subjects[0];
    setSubjectId(String(firstEnterable.id));
  }, [subjects, subjectId, subjectTotals]);

  // ---------------------------------------------------------------- roster
  const loadRoster = useCallback(async () => {
    const seq = ++loadSeq.current;
    const current = () => seq === loadSeq.current;
    if (!testExamId || !subjectId) {
      setRoster([]); setMarks({}); setExempt({}); setTotalMarks(null);
      return;
    }
    setLoadingRoster(true);
    setError(null);
    // Cleared BEFORE awaiting: leaving the previous subject's values on screen
    // invites typing over them or believing the new subject is already marked.
    setMarks({});
    setExempt({});
    setTotalMarks(null);
    // The notice describes the subject just saved, so it must not survive into
    // a different one.
    setMissed(null);
    // Same reasoning for the total editor: a draft left open belongs to the
    // subject it was opened on, and applying it to the next one is exactly the
    // mistake this screen has to make impossible.
    setEditingTotal(false);
    setTotalDraft('');
    setTotalWarning(null);
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
      setSubjectActivated(Boolean(r?.subjectActivated));
      setMarks(Object.fromEntries(rows.map((s) => [s.studentId, s.marksObtained == null ? '' : String(s.marksObtained)])));
      setExempt(Object.fromEntries(rows.filter((s) => s.isExempt).map((s) => [s.studentId, true])));
    } catch (e: any) {
      if (!current()) return;
      setRoster([]); setMarks({}); setExempt({});
      setError(e?.message || 'Could not load the roster.');
    } finally {
      if (current()) setLoadingRoster(false);
    }
  }, [testExamId, subjectId]);

  useEffect(() => {
    if (!active) return;
    loadRoster();
  }, [active, loadRoster]);

  /**
   * Writes what this subject is out of on THIS assessment — one section, one
   * paper, one subject.
   *
   * Deliberately narrow. The admin dialog sets totals for a whole class level at
   * once, across every section, because that is the set-up job. This is the
   * marking job: the teacher in front of one class's scripts, saying what the
   * paper they just marked was out of. Writing the other sections from here
   * would be a teacher silently changing a class they may not even teach.
   *
   * A LOWERED TOTAL IS CONFIRMED, not refused outright. Marks are validated
   * against the total as they are saved, so dropping it afterwards leaves scores
   * above what the paper is out of and every average built on them is quietly
   * wrong. Re-scaling a paper you then re-enter is still a real thing to want,
   * so the server names the count and a second press goes through.
   */
  const saveTotal = async (confirmLower = false) => {
    if (savingTotal || !testExamId || !subjectId) return;
    const n = Number(String(totalDraft).trim());
    if (String(totalDraft).trim() === '' || !Number.isInteger(n) || n <= 0) {
      setError('Enter a whole number greater than zero for what this subject is out of.');
      return;
    }
    // Whether this subject was un-enterable a moment ago. It decides whether the
    // roster has to be re-read below, and getting it wrong throws away work: a
    // reload clears every input, so doing one after a mere CHANGE of total would
    // silently discard the marks already typed above it.
    const wasUnset = totalMarks == null;
    setSavingTotal(true);
    setError(null);
    if (!confirmLower) setTotalWarning(null);
    try {
      await api.put(
        `/test-exams/${encodeURIComponent(testExamId)}/subject-totals/${encodeURIComponent(subjectId)}`,
        { totalMarks: n, ...(confirmLower ? { confirmLower: true } : {}) },
      );
      cache.invalidate('test-exams:*', 'subject-totals:*');
      // Kept in step by hand rather than by a refetch: subjectTotals is what
      // decides whether this subject is enterable at all, and leaving it stale
      // would keep the inputs disabled behind a total that now exists.
      setSubjectTotals((prev) => ({ ...prev, [Number(subjectId)]: n }));
      setTotalMarks(n);
      setEditingTotal(false);
      setTotalWarning(null);
      const subjectName = subjects.find((s) => String(s.id) === subjectId)?.name ?? 'This subject';
      toast.success(`${subjectName} is now out of ${n}`);
      // Only when the subject has just BECOME enterable. Its roster was read
      // while the subject had no total, so the states and the disabled inputs on
      // screen belong to that reading and have to be replaced. Nothing was
      // typeable then, so there is nothing to lose by reloading — which is
      // exactly why a plain change of total must not do the same.
      if (wasUnset) await loadRoster();
    } catch (e: any) {
      if (e?.code === 'MARKS_ABOVE_TOTAL') setTotalWarning(e?.message || 'Marks already entered are above that total.');
      else setError(e?.message || 'Could not set the total for this subject.');
    } finally {
      setSavingTotal(false);
    }
  };

  const setMark = (studentId: string, v: string) => {
    setError(null);
    setMarks((m) => ({ ...m, [studentId]: v }));
  };

  /**
   * Exempting clears any number the student had: the two are mutually exclusive
   * states, and leaving a stale value behind the toggle would resurrect it on
   * un-exempt as if it had been entered deliberately.
   */
  const toggleExempt = (studentId: string, next: boolean) => {
    setError(null);
    setExempt((e) => ({ ...e, [studentId]: next }));
    if (next) setMarks((m) => ({ ...m, [studentId]: '' }));
  };

  /** The state a row is currently in, as the save will send it. */
  const stateOf = (studentId: string): MarkState => {
    if (exempt[studentId]) return 'EXEMPT';
    return String(marks[studentId] ?? '').trim() === '' ? 'UNMARKED' : 'MARKED';
  };

  const entered = roster.filter((s) => stateOf(s.studentId) === 'MARKED').length;
  const exemptCount = roster.filter((s) => stateOf(s.studentId) === 'EXEMPT').length;
  // Blanks that a save would convert to zeros. Exempt students are not blanks.
  const blankCount = roster.filter((s) => stateOf(s.studentId) === 'UNMARKED').length;

  const save = async () => {
    if (saving) return;
    setError(null);
    if (totalMarks == null) {
      setError('This assessment has no total configured for that subject yet — press Set total above to say what the paper is out of.');
      return;
    }
    // One entry per roster row, with its state spelled out. Sending the whole
    // roster rather than only the filled-in rows is what lets a cleared input and
    // a removed exemption actually undo themselves — a payload of just the
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
    if (!payload.some((p) => p.state !== 'UNMARKED')) {
      setError('Enter at least one mark, or mark a student exempt, before saving.');
      return;
    }
    // Pinned for the duration of the request, so the reload below can tell
    // whether the user has moved on to a different subject or assessment.
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
      const subjectName = subjects.find((s) => String(s.id) === savedSubjectId)?.name ?? 'subject';
      const savedCount = payload.filter((p) => p.state === 'MARKED').length;
      toast.success(`Saved ${savedCount} mark${savedCount === 1 ? '' : 's'} for ${subjectName}`);
      const moved =
        selRef.current.testExamId !== savedExamId || selRef.current.subjectId !== savedSubjectId;
      if (!moved) {
        await loadRoster();
        // Set AFTER the reload, which clears it — the notice belongs to the save
        // that just happened, and the server's lists are authoritative.
        setMissed({
          zeroed: Array.isArray(r?.zeroedOnSave) ? r.zeroedOnSave : [],
          pending: Array.isArray(r?.unmarked) ? r.unmarked : [],
        });
      }
    } catch (e: any) {
      setError(e?.message || 'Could not save these marks.');
    } finally {
      setSaving(false);
    }
  };

  const selectedSubjectEnterable = subjectId ? subjectHasTotal(Number(subjectId)) : false;

  return (
    <div>
      {/* All selectors are frozen while a save is in flight — changing the target
          of a request already sent is how marks end up on the wrong assessment. */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Class</Label>
          <Select value={level} onValueChange={setLevel} disabled={saving}>
            <SelectTrigger>
              <SelectValue placeholder={loadingSections ? 'Loading...' : levels.length ? 'Select class' : 'No classes available'} />
            </SelectTrigger>
            <SelectContent>
              {levels.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Only when the level genuinely has more than one populated section. */}
        {needsSectionStep && (
          <div>
            <Label>Section</Label>
            <Select value={sectionId} onValueChange={setSectionId} disabled={saving}>
              <SelectTrigger>
                <SelectValue placeholder="Select section" />
              </SelectTrigger>
              <SelectContent>
                {sectionsOfLevel.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}{s.studentCount != null ? ` (${s.studentCount})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label>Term</Label>
          <Select value={term} onValueChange={setTerm} disabled={saving}>
            <SelectTrigger><SelectValue placeholder="Select term" /></SelectTrigger>
            <SelectContent>
              {TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Sequence Test / Exam</Label>
          <Select value={testExamId} onValueChange={setTestExamId} disabled={saving || !section}>
            <SelectTrigger>
              <SelectValue placeholder={exams.length ? 'Select assessment' : 'None for this class and term'} />
            </SelectTrigger>
            <SelectContent>
              {exams.map((x) => <SelectItem key={x.id} value={String(x.id)}>{x.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Subject</Label>
          <Select value={subjectId} onValueChange={setSubjectId} disabled={saving || !testExamId}>
            <SelectTrigger>
              <SelectValue placeholder={subjects.length ? 'Select subject' : 'No subjects available'} />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}{subjectHasTotal(s.id) ? '' : ' — no total set'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!needsSectionStep && section && sectionsOfLevel.length > 1 && (
        <p className="text-sm text-gray-500" style={{ marginTop: '0.5rem' }}>
          Entering marks for {section.name} — the only section of {level} with students.
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
            {/* The total, and the way to set it. Not tucked behind a separate
                screen: a subject with none cannot be marked at all, so the fix
                belongs beside the sentence that says so. */}
            {editingTotal ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Out of</span>
                <Input
                  type="number"
                  min={1}
                  autoFocus
                  value={totalDraft}
                  onChange={(e) => setTotalDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void saveTotal(); }
                    if (e.key === 'Escape') { setEditingTotal(false); setTotalWarning(null); }
                  }}
                  disabled={savingTotal}
                  placeholder="20"
                  style={{ width: 80, textAlign: 'right' }}
                  aria-label="Total marks for this subject on this assessment"
                />
                <Button
                  size="sm"
                  onClick={() => void saveTotal()}
                  disabled={savingTotal}
                  style={{ height: 32, paddingLeft: 10, paddingRight: 10, fontSize: 12 }}
                >
                  {savingTotal ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setEditingTotal(false); setTotalWarning(null); }}
                  disabled={savingTotal}
                  style={{ height: 32, paddingLeft: 10, paddingRight: 10, fontSize: 12 }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-500">
                  {totalMarks == null
                    ? <span style={{ color: '#B45309' }}>No total set for this subject</span>
                    : <>Out of <strong>{totalMarks}</strong></>}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving || loadingRoster || !testExamId || !subjectId}
                  onClick={() => {
                    setError(null);
                    setTotalWarning(null);
                    setTotalDraft(totalMarks == null ? '' : String(totalMarks));
                    setEditingTotal(true);
                  }}
                  style={{ height: 32, paddingLeft: 10, paddingRight: 10, fontSize: 12 }}
                >
                  {totalMarks == null ? 'Set total' : 'Change'}
                </Button>
              </div>
            )}
          </div>

          {/* Nothing is deleted by lowering a total — the marks stay, they are
              simply above what the paper is now out of — so this is a plain
              confirm and not a destructive one. */}
          {totalWarning && (
            <div
              className="flex items-center gap-2"
              style={{ flexWrap: 'wrap', marginBottom: '0.5rem' }}
            >
              <span className="text-sm" style={{ color: '#B45309', flex: '1 1 12rem', minWidth: 0 }}>
                {totalWarning}
              </span>
              <Button
                size="sm"
                onClick={() => void saveTotal(true)}
                disabled={savingTotal}
                style={{ height: 32, paddingLeft: 10, paddingRight: 10, fontSize: 12 }}
              >
                {savingTotal ? 'Saving...' : 'Lower it anyway'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setTotalWarning(null)}
                disabled={savingTotal}
                style={{ height: 32, paddingLeft: 10, paddingRight: 10, fontSize: 12 }}
              >
                Leave it
              </Button>
            </div>
          )}

          {/* Stage 1's rule, stated where it bites: without a total this subject
              is not counted in ranking or scoring, so it is not enterable. */}
          {!loadingRoster && !selectedSubjectEnterable && !editingTotal && (
            <p className="text-sm" style={{ color: '#B45309', marginBottom: '0.5rem' }}>
              This subject has no total set for this assessment, so it is not counted in ranking or
              scoring and marks cannot be entered. Press <strong>Set total</strong> above to say what
              the paper is out of.
            </p>
          )}

          {/* Explains why a roster for a finished term shows zeros rather than
              blanks — otherwise they look like marks nobody entered. */}
          {termEnded && !loadingRoster && (
            <p className="text-sm text-gray-500" style={{ marginBottom: '0.5rem' }}>
              This term has ended, so students left unmarked were given a 0. Editing any of them
              still works.
            </p>
          )}

          {/* Said BEFORE saving: the conversion is the kind of thing to know is
              coming while there is still a chance to fill blanks in or exempt. */}
          {!termEnded && !loadingRoster && selectedSubjectEnterable && blankCount > 0 && (
            <p className="text-sm" style={{ color: '#B45309', marginBottom: '0.5rem' }}>
              {subjectActivated
                ? `${blankCount} student${blankCount === 1 ? '' : 's'} left blank — saving gives them a 0, because this subject has already been marked.`
                : `${blankCount} student${blankCount === 1 ? '' : 's'} left blank — saving any mark here counts the paper as written and gives the rest a 0.`}
            </p>
          )}

          {/* While a roster is loading, show nothing rather than the previous
              selection's rows — on a slow connection they would sit there looking
              like the new selection's data. */}
          {loadingRoster ? (
            <p className="text-sm text-gray-400">Fetching the roster and any marks already entered...</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-gray-500">No students enrolled in {section?.name ?? 'this class'}.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {roster.map((s, i) => {
                const isExempt = Boolean(exempt[s.studentId]);
                return (
                  <div key={s.studentId} className="flex items-center gap-2">
                    <span className="text-sm text-gray-500" style={{ width: 24, textAlign: 'right' }}>{i + 1}</span>
                    <span className="text-sm" style={{ flex: 1 }}>{s.firstName} {s.lastName}</span>
                    {/* An exempt student has no mark to type, so the input is
                        replaced outright rather than disabled with a value in it. */}
                    {isExempt ? (
                      <span className="text-sm" style={{ width: 96, textAlign: 'right', color: '#05603D', fontWeight: 500 }}>
                        Exempt
                      </span>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        max={totalMarks ?? undefined}
                        value={marks[s.studentId] ?? ''}
                        onChange={(e) => setMark(s.studentId, e.target.value)}
                        disabled={saving || !selectedSubjectEnterable}
                        placeholder="—"
                        style={{ width: 96, textAlign: 'right' }}
                        aria-label={`Mark for ${s.firstName} ${s.lastName}`}
                      />
                    )}
                    <span className="text-sm text-gray-400" style={{ width: 48 }}>
                      {isExempt || totalMarks == null ? '' : `/ ${totalMarks}`}
                    </span>
                    <Button
                      type="button"
                      variant={isExempt ? 'default' : 'outline'}
                      onClick={() => toggleExempt(s.studentId, !isExempt)}
                      disabled={saving || !selectedSubjectEnterable}
                      style={{ height: 32, paddingLeft: 10, paddingRight: 10, fontSize: 12, width: 96 }}
                      aria-pressed={isExempt}
                      aria-label={isExempt
                        ? `Cancel exemption for ${s.firstName} ${s.lastName}`
                        : `Exempt ${s.firstName} ${s.lastName} from this assessment`}
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

      {/* Post-save report. Exempt students never appear in either list — they were
          excluded on purpose and are not something to chase. */}
      {missed && missed.zeroed.length > 0 && (
        <div style={{ marginTop: '0.75rem', border: '1px solid #E0552E', borderRadius: 6, padding: '0.5rem 0.75rem', backgroundColor: '#FFF7F5' }}>
          <p className="text-sm" style={{ color: '#E0552E', fontWeight: 500 }}>
            {missed.zeroed.length} student{missed.zeroed.length === 1 ? ' was' : 's were'} left unmarked and
            {missed.zeroed.length === 1 ? ' has' : ' have'} been given 0
          </p>
          <p className="text-sm text-gray-600" style={{ marginTop: '0.25rem' }}>
            {missed.zeroed.map((m) => `${m.firstName} ${m.lastName}`).join(', ')}
          </p>
          <p className="text-sm text-gray-500" style={{ marginTop: '0.25rem' }}>
            This subject has been marked, so a blank now counts as a score of zero. Enter a mark to
            correct any of them, or set a student to Exempt to take them out of the scoring.
          </p>
        </div>
      )}

      {/* Nothing has been graded yet, so a blank is still genuinely pending. */}
      {missed && missed.zeroed.length === 0 && missed.pending.length > 0 && (
        <div style={{ marginTop: '0.75rem', border: '1px solid #E5E7EB', borderRadius: 6, padding: '0.5rem 0.75rem' }}>
          <p className="text-sm" style={{ fontWeight: 500 }}>
            {missed.pending.length} student{missed.pending.length === 1 ? '' : 's'} still unmarked for this subject
          </p>
          <p className="text-sm text-gray-600" style={{ marginTop: '0.25rem' }}>
            {missed.pending.map((m) => `${m.firstName} ${m.lastName}`).join(', ')}
          </p>
          <p className="text-sm text-gray-500" style={{ marginTop: '0.25rem' }}>
            {termEnded
              ? 'This term has already ended, so any student left blank has been given a 0.'
              : 'Nothing has been marked for this subject yet, so these are still pending. The first mark entered turns any remaining blanks into a 0.'}
          </p>
        </div>
      )}

      {missed && missed.zeroed.length === 0 && missed.pending.length === 0 && (
        <p className="text-sm" style={{ color: '#05603D', marginTop: '0.75rem' }}>
          Every student in this class now has a mark or an exemption for this subject.
        </p>
      )}

      {error && <p className="text-sm" style={{ color: '#B91C1C', marginTop: '0.75rem' }}>{error}</p>}

      <div className="flex items-center justify-between" style={{ paddingTop: '0.75rem' }}>
        <p className="text-sm text-gray-500">
          Totals and rankings update themselves — there is nothing to compile.
        </p>
        <Button onClick={save} disabled={saving || loadingRoster || !roster.length || !selectedSubjectEnterable}>
          {saving ? 'Saving...' : 'Save Marks'}
        </Button>
      </div>
    </div>
  );
}
