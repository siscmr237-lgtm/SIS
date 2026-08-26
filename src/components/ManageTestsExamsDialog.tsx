'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useSisCache } from '../lib/SisCache';
import {
  defaultExamName,
  defaultSequenceTestName,
  isAutoAssessmentName,
} from '../utils/assessmentNames';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';

/**
 * Setting up a class level's assessments for a term, and what each subject is
 * marked out of.
 *
 * WHAT THIS SCREEN IS FOR. A school says how many sequence tests and how many
 * exams a term runs, optionally names them, and sets the totals. That first part
 * used to be missing entirely: the dialog listed whatever assessments happened
 * to exist and let you set totals against them, with no way to add one, remove
 * one or rename one — so a school running two sequence tests instead of three,
 * or a second exam, had nowhere to say so and was stuck with the seeded set.
 *
 * COUNTS FIRST, NAMES SECOND. The two counts are the primary control, because
 * "we run three sequence tests this term" is the thing a school actually knows.
 * Every name box is optional and shows what the row will be called if it is left
 * empty — "2nd Sequence Test", "1st Term Exam" — so a school that has no
 * particular names for its papers never has to invent any. See
 * ../utils/assessmentNames.
 *
 * AN AUTOMATIC NAME IS LEFT IN THE PLACEHOLDER, not copied into the box. If it
 * were filled in, the first person to open this dialog and press Save would
 * freeze it into a typed name, and it would stop tracking the position it
 * describes: adding a second exam has to be able to turn "1st Term Exam" into
 * "1st Term Exam 1", and it cannot do that to a name somebody appears to have
 * chosen.
 *
 * IT FILTERS ON THE LEVEL ("Class 1"), NEVER A SECTION ("Class 1 A"), because
 * the structure is a property of the level: every section of it sits the same
 * papers, out of the same totals, from the same subject list. The TestExam rows
 * behind it are per-section — the schema keys on (classId, academicYear, term,
 * name) — so one request to PUT /test-exams/levels/:level/structure writes all
 * of them in a single transaction. The fan-out used to be done here, a request
 * per section, which could and did stop half way and leave sections of one level
 * sitting different papers.
 */

const TERMS = ['Term 1', 'Term 2', 'Term 3'];

/** Enough for any real term, low enough that a stuck key cannot run away. */
const MAX_PER_TYPE = 12;

interface ClassRow { id: number; code?: string; name: string }
interface SubjectRow { id: number; name: string }

/** One row of the structure being edited. */
interface AssessmentRow {
  /** The saved row this edits, or null for one that only exists in this form. */
  id: number | null;
  /** What the school typed. Empty means "use the default in the placeholder". */
  name: string;
  /** Marks already entered against it, across every section of the level. */
  markCount: number;
  /** Somebody has entered a mark against it at some point. Never goes back. */
  activated: boolean;
}

/** What the server hands back for one row of the structure. */
interface StructureRow {
  id: number;
  name: string;
  order?: number;
  markCount?: number;
  activated?: boolean;
}

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

/**
 * A saved row as this form edits it. An automatically-named row comes back with
 * an EMPTY name box so it keeps tracking its position; anything the school typed
 * is shown as typed.
 */
function toEditable(row: StructureRow, type: 'TEST' | 'EXAM'): AssessmentRow {
  return {
    id: row.id,
    name: isAutoAssessmentName(row.name, type) ? '' : row.name,
    markCount: row.markCount ?? 0,
    activated: Boolean(row.activated),
  };
}

const blankRow = (): AssessmentRow => ({ id: null, name: '', markCount: 0, activated: false });

/** Grows or shrinks a list to `next`, keeping what is already in it. */
function resize(rows: AssessmentRow[], next: number): AssessmentRow[] {
  const n = Math.max(0, Math.min(MAX_PER_TYPE, Math.trunc(next)));
  if (n === rows.length) return rows;
  if (n < rows.length) return rows.slice(0, n);
  return [...rows, ...Array.from({ length: n - rows.length }, blankRow)];
}

export function ManageTestsExamsDialog({
  open,
  onOpenChange,
  academicYear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown, never edited — the structure always belongs to the active year. */
  academicYear: string;
}) {
  const cache = useSisCache();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [level, setLevel] = useState('');
  const [term, setTerm] = useState(TERMS[0]);

  const [tests, setTests] = useState<AssessmentRow[]>([]);
  const [exams, setExams] = useState<AssessmentRow[]>([]);
  const [sectionCount, setSectionCount] = useState(0);
  const [loadingStructure, setLoadingStructure] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Set when the server refused a save that would delete marks. */
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  // The assessment whose totals are being set, or null while showing the
  // structure. Only ever a SAVED row — an unsaved one has nothing to hang totals
  // on yet.
  const [openExam, setOpenExam] = useState<{ id: number; name: string } | null>(null);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [totals, setTotals] = useState<Record<number, string>>({});
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [savingSubjectId, setSavingSubjectId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api.get('/classes')
      .then((res: any) => setClasses(Array.isArray(res) ? res : []))
      .catch((e: any) => setError(e?.message || 'Failed to load classes.'));
  }, [open]);

  const levels = useMemo(() => {
    const set = new Set(classes.map((c) => levelOf(c.name)));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [classes]);

  // Every section of the chosen level. Shown so it is clear what a save affects;
  // the server is what actually writes them all.
  const sections = useMemo(
    () => classes.filter((c) => levelOf(c.name) === level),
    [classes, level],
  );
  const representative = sections[0] ?? null;

  useEffect(() => {
    if (!level && levels.length) setLevel(levels[0]);
  }, [levels, level]);

  const loadStructure = useCallback(async () => {
    if (!level || !term || !academicYear) return;
    setLoadingStructure(true);
    setError(null);
    setDeleteWarning(null);
    try {
      const res: any = await api.get(
        `/test-exams/levels/${encodeURIComponent(level)}/structure`
        + `?term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear)}`,
      );
      setTests((Array.isArray(res?.tests) ? res.tests : []).map((r: StructureRow) => toEditable(r, 'TEST')));
      setExams((Array.isArray(res?.exams) ? res.exams : []).map((r: StructureRow) => toEditable(r, 'EXAM')));
      setSectionCount(Array.isArray(res?.sections) ? res.sections.length : 0);
    } catch (e: any) {
      setTests([]);
      setExams([]);
      setError(e?.message || 'Failed to load this term’s sequence tests and exams.');
    } finally {
      setLoadingStructure(false);
    }
  }, [level, term, academicYear]);

  // Back to the structure whenever the filters move — the open assessment
  // belongs to the level and term that were showing when it was opened.
  useEffect(() => {
    setOpenExam(null);
    setNotice(null);
    if (open) loadStructure();
  }, [open, loadStructure]);

  /** The name a row will be saved under, given where it sits and what is typed. */
  const nameFor = (type: 'TEST' | 'EXAM', index: number) =>
    type === 'TEST'
      ? defaultSequenceTestName(index + 1)
      : defaultExamName(term, index + 1, exams.length);

  const saveStructure = async (confirmDelete = false) => {
    if (saving || !level || !academicYear) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    if (!confirmDelete) setDeleteWarning(null);
    try {
      await api.put(
        `/test-exams/levels/${encodeURIComponent(level)}/structure`,
        {
          term,
          academicYear,
          tests: tests.map((r) => ({ name: r.name.trim() })),
          exams: exams.map((r) => ({ name: r.name.trim() })),
          ...(confirmDelete ? { confirmDelete: true } : {}),
        },
      );
      setDeleteWarning(null);
      cache.invalidateOn('test-exam:write');
      setNotice(
        sectionCount > 1
          ? `Saved across all ${sectionCount} sections of ${level}.`
          : 'Saved.',
      );
      // Re-read rather than taking the response: the save reply carries no mark
      // counts, and showing every row as unmarked would understate what the next
      // reduction destroys.
      await loadStructure();
    } catch (e: any) {
      if (e?.code === 'DELETES_MARKS') setDeleteWarning(e?.message || 'This removes marks that have already been entered.');
      else setError(e?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const openTotals = async (row: AssessmentRow, type: 'TEST' | 'EXAM', index: number) => {
    if (row.id == null || !representative) return;
    setOpenExam({ id: row.id, name: row.name.trim() || nameFor(type, index) });
    setError(null);
    setNotice(null);
    setSubjects([]);
    setTotals({});
    setLoadingSubjects(true);
    try {
      const [subjectRes, totalsRes] = await Promise.all([
        api.get(`/classes/${representative.id}/subjects`),
        api.get(`/test-exams/${row.id}/subject-totals`),
      ]);
      const subjectRows: SubjectRow[] = (Array.isArray(subjectRes) ? subjectRes : [])
        .map((s: any) => ({ id: s.subjectId ?? s.id, name: s.name }))
        .filter((s: SubjectRow) => s.id && s.name);
      setSubjects(subjectRows);
      const map: Record<number, string> = {};
      for (const t of Array.isArray(totalsRes) ? totalsRes : []) {
        if (t?.subjectId != null) map[t.subjectId] = t.totalMarks != null ? String(t.totalMarks) : '';
      }
      setTotals(map);
    } catch (e: any) {
      setError(e?.message || 'Failed to load subjects for this assessment.');
    } finally {
      setLoadingSubjects(false);
    }
  };

  /**
   * Writes one subject's total for this assessment across EVERY section of the
   * level, so the sections cannot drift. Each section has its own TestExam row
   * with the same name, so the id is resolved per section rather than reused.
   */
  const saveTotal = async (subjectId: number) => {
    if (!openExam) return;
    const raw = totals[subjectId] ?? '';
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      setError('Enter a whole number greater than zero.');
      return;
    }
    setSavingSubjectId(subjectId);
    setError(null);
    setNotice(null);
    try {
      for (const section of sections) {
        let examId = openExam.id;
        if (section.id !== representative?.id) {
          const list: any = await api.get(
            `/test-exams?classId=${section.id}&term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear)}`,
          );
          const match = (Array.isArray(list) ? list : []).find(
            (t: any) => String(t.name).trim().toLowerCase() === openExam.name.trim().toLowerCase(),
          );
          if (!match) continue; // section genuinely lacks this assessment
          examId = match.id;
        }
        await api.put(`/test-exams/${examId}/subject-totals/${subjectId}`, { totalMarks: n });
      }
      cache.invalidateOn('test-exam:write');
      setNotice(
        sections.length > 1
          ? `Saved across all ${sections.length} sections of ${level}.`
          : 'Saved.',
      );
    } catch (e: any) {
      setError(e?.message || 'Failed to save the total.');
    } finally {
      setSavingSubjectId(null);
    }
  };

  const stepper = (
    label: string,
    rows: AssessmentRow[],
    setRows: (next: AssessmentRow[]) => void,
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
      <span className="text-sm font-medium">{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`One fewer ${label.toLowerCase()}`}
          disabled={rows.length === 0 || saving}
          onClick={() => setRows(resize(rows, rows.length - 1))}
        >
          −
        </Button>
        <Input
          type="number"
          className="w-16"
          min={0}
          max={MAX_PER_TYPE}
          value={String(rows.length)}
          onChange={(e) => {
            // An empty box is somebody mid-edit, not a request for zero rows.
            // Acting on it would wipe every name typed so far, and backspacing
            // before retyping a number is how most people change one.
            const raw = e.target.value;
            if (raw.trim() === '') return;
            const next = Number(raw);
            if (Number.isFinite(next)) setRows(resize(rows, next));
          }}
          style={{ textAlign: 'center' }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={`One more ${label.toLowerCase()}`}
          disabled={rows.length >= MAX_PER_TYPE || saving}
          onClick={() => setRows(resize(rows, rows.length + 1))}
        >
          +
        </Button>
      </div>
    </div>
  );

  const rowList = (
    rows: AssessmentRow[],
    setRows: (next: AssessmentRow[]) => void,
    type: 'TEST' | 'EXAM',
    emptyText: string,
  ) => {
    if (!rows.length) return <p className="text-sm text-gray-400" style={{ padding: '0.4rem 0' }}>{emptyText}</p>;
    return rows.map((row, i) => (
      <div
        key={`${type}-${row.id ?? `new-${i}`}`}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          padding: '0.35rem 0', borderBottom: '1px solid #F3F4F6',
        }}
      >
        <span className="text-xs text-gray-400" style={{ width: '1.25rem', flex: '0 0 auto' }}>{i + 1}</span>
        <Input
          value={row.name}
          placeholder={nameFor(type, i)}
          onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
          style={{ flex: '1 1 auto', minWidth: 0 }}
        />
        {(row.markCount > 0 || row.activated) && (
          <span
            className="text-xs text-gray-400"
            style={{ flex: '0 0 auto' }}
            title="Removing this assessment also deletes these marks."
          >
            {row.markCount > 0 ? `${row.markCount} marks` : 'sat'}
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={row.id == null}
          title={row.id == null ? 'Save first, then set what each subject is marked out of.' : undefined}
          onClick={() => openTotals(row, type, i)}
          style={{ flex: '0 0 auto' }}
        >
          Totals
        </Button>
      </div>
    ));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 'min(672px, calc(100vw - 2rem))' }}>
        <DialogHeader style={{ flex: '0 0 auto' }}>
          <DialogTitle>
            {openExam ? `${openExam.name} — subject totals` : 'Manage Sequence Tests & Exams'}
          </DialogTitle>
          <DialogDescription>
            {openExam
              ? 'Set the total marks each subject is out of for this assessment. A subject left blank is not counted in ranking or scoring for it.'
              : 'Choose a class and term, then say how many sequence tests and exams it runs. Names are optional — leave one empty to use the name shown in the box.'}
          </DialogDescription>
        </DialogHeader>

        {!openExam && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ flex: '0 0 auto' }}>
            <div>
              <Label>Class</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger>
                  <SelectValue placeholder={levels.length ? 'Select class' : 'No classes yet'} />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Term</Label>
              <Select value={term} onValueChange={setTerm}>
                <SelectTrigger>
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  {TERMS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* THE ONE SCROLLING CHILD. DialogContent is a capped flex column, so
            everything outside this stays on screen however long the lists get —
            which is what keeps the error banner and the Save button reachable. */}
        <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto' }}>
          {!openExam ? (
            loadingStructure ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : !academicYear ? (
              <p className="text-sm text-gray-500">
                Set the school&rsquo;s academic year in Settings first — an assessment belongs to one.
              </p>
            ) : !level ? (
              <p className="text-sm text-gray-500">Choose a class to begin.</p>
            ) : (
              <>
                {stepper('Sequence Tests', tests, setTests)}
                {rowList(tests, setTests, 'TEST', 'No sequence tests this term.')}

                <div style={{ marginTop: '1.25rem' }}>
                  {stepper('Exams', exams, setExams)}
                </div>
                {rowList(exams, setExams, 'EXAM', 'No exams this term.')}

                <p className="text-xs text-gray-400" style={{ marginTop: '0.75rem' }}>
                  {sectionCount > 1
                    ? `Saving applies to all ${sectionCount} sections of ${level}.`
                    : 'Saving applies to this class.'}
                </p>
              </>
            )
          ) : loadingSubjects ? (
            <p className="text-sm text-gray-500">Loading subjects...</p>
          ) : subjects.length === 0 ? (
            <p className="text-sm text-gray-500">This class level has no subjects configured.</p>
          ) : (
            subjects.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.4rem 0', borderBottom: '1px solid #F3F4F6',
                }}
              >
                <span className="text-sm" style={{ flex: 1, minWidth: 0 }}>{s.name}</span>
                <Input
                  type="number"
                  className="w-24"
                  placeholder="Total"
                  value={totals[s.id] ?? ''}
                  onChange={(e) => setTotals((v) => ({ ...v, [s.id]: e.target.value }))}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => saveTotal(s.id)}
                  disabled={savingSubjectId === s.id}
                >
                  {savingSubjectId === s.id ? 'Saving...' : 'Save'}
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Outside the scroller on purpose: a message about the save has to be
            visible from wherever the list happens to be scrolled to. */}
        {(error || notice || deleteWarning) && (
          <div style={{ flex: '0 0 auto' }}>
            {error && <p className="text-sm" style={{ color: '#e0552e' }}>{error}</p>}
            {notice && <p className="text-sm" style={{ color: '#05603d' }}>{notice}</p>}
            {deleteWarning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span className="text-sm" style={{ color: '#e0552e', flex: '1 1 12rem', minWidth: 0 }}>
                  {deleteWarning}
                </span>
                <Button variant="destructive" size="sm" disabled={saving} onClick={() => saveStructure(true)}>
                  {saving ? 'Removing...' : 'Remove anyway'}
                </Button>
                <Button variant="outline" size="sm" disabled={saving} onClick={loadStructure}>
                  Keep them
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Academic year, bottom-left and not editable: the structure always
            belongs to the school's active year, which is changed in Settings. */}
        <div
          style={{
            flex: '0 0 auto',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '0.75rem', flexWrap: 'wrap',
            borderTop: '1px solid #E5E7EB', paddingTop: '0.75rem',
          }}
        >
          <span className="text-xs text-gray-500">Academic year: {academicYear || '—'}</span>
          {openExam ? (
            <Button variant="outline" size="sm" onClick={() => { setOpenExam(null); setNotice(null); setError(null); }}>
              Back
            </Button>
          ) : (
            <Button size="sm" disabled={saving || loadingStructure || !level || !academicYear} onClick={() => saveStructure()}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
