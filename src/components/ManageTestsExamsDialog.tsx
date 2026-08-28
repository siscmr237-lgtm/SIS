'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useSisCache } from '../lib/SisCache';
import {
  defaultExamName,
  defaultSequenceTestName,
  isAutoAssessmentName,
} from '../utils/assessmentNames';
import { ApplyAssessmentsToClassesDialog } from './ApplyAssessmentsToClassesDialog';
import { Button } from './ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { ContentLoader } from './ContentLoader';

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
 *
 * TOTALS ARE SET FOR EVERY SUBJECT AT ONCE, on the second screen. There is one
 * box per subject, one "every subject out of N" to fill them all, and one Save
 * — which goes to PUT /test-exams/levels/:level/subject-totals and writes the
 * whole level in a single transaction. It used to be a Save button per subject,
 * and each of those fanned out a request per section from here: twelve subjects
 * across three sections was thirty-six requests and thirty-six places to stop,
 * and stopping left the sections of one level marked out of different totals.
 * A box left EMPTY is not a zero — it means the subject is not counted on that
 * paper, which is a real answer and is why a blank is never sent.
 *
 * AND IT COPIES TO OTHER CLASSES. Most schools run the same shape of year in
 * every class, and setting that out nine times by hand is where two classes end
 * up marked out of different totals by a typo nobody notices until the report
 * cards disagree. "Apply to other classes" copies EVERY TERM this level has set
 * up — the structure and the totals — onto the levels you tick. See
 * ./ApplyAssessmentsToClassesDialog for what it replaces and what it leaves
 * alone.
 *
 * NOTHING MOVES WHILE THERE IS UNSAVED WORK. The class picker, the term picker,
 * Totals and Apply are all held until Save. A term's papers are read and written
 * per term, so moving the Term picker re-reads and throws the edit away with no
 * warning and no way back — adding a third sequence test to Term 1, switching to
 * Term 2 to do the same, and finding on return that Term 1 still runs two is a
 * mistake this screen used to invite. Apply is held for a second reason as well:
 * it copies what is SAVED, so an unsaved edit would be silently left out of what
 * lands on the other classes.
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

/**
 * The two lists reduced to what a SAVE would actually write: how many of each,
 * and the name typed in each box. Ids, mark counts and activation are left out
 * on purpose — none of them is editable here, so a change in one is the server
 * telling us something, not the user having unsaved work.
 *
 * Names are trimmed because the save trims them: typing a trailing space and
 * deleting it again has changed nothing, and a dirty flag that says otherwise
 * blocks the term picker over a keystroke that did not happen.
 */
function snapshot(tests: AssessmentRow[], exams: AssessmentRow[]) {
  const line = (rows: AssessmentRow[]) => JSON.stringify(rows.map((r) => r.name.trim()));
  return { tests: line(tests), exams: line(exams) };
}

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
  /** The last thing the server said, to tell an edit from a fresh read. */
  const [baseline, setBaseline] = useState(() => snapshot([], []));
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
  const [savingTotals, setSavingTotals] = useState(false);
  /** "Every subject is out of this" — fills the boxes, saves nothing by itself. */
  const [bulkTotal, setBulkTotal] = useState('');
  /** Set when the server refused a total that would sit under a mark already in. */
  const [lowerWarning, setLowerWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);

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
      const loadedTests = (Array.isArray(res?.tests) ? res.tests : []).map((r: StructureRow) => toEditable(r, 'TEST'));
      const loadedExams = (Array.isArray(res?.exams) ? res.exams : []).map((r: StructureRow) => toEditable(r, 'EXAM'));
      setTests(loadedTests);
      setExams(loadedExams);
      // What is on the server, so an edit can be told from a fresh read. Set
      // from the SAME rows the boxes are filled with, never from the response
      // separately — the two drifting apart is a dirty flag that is either
      // always on or never on.
      setBaseline(snapshot(loadedTests, loadedExams));
      setSectionCount(Array.isArray(res?.sections) ? res.sections.length : 0);
    } catch (e: any) {
      setTests([]);
      setExams([]);
      setBaseline(snapshot([], []));
      setError(e?.message || 'Failed to load this term’s sequence tests and exams.');
    } finally {
      setLoadingStructure(false);
    }
  }, [level, term, academicYear]);

  /**
   * Whether the boxes hold something the server has not been told about.
   *
   * A term's papers are read and written per term, so moving the Term picker
   * throws away whatever is on screen — silently, and with no way back. That is
   * the whole reason this exists: adding a third sequence test to Term 1,
   * switching to Term 2 to do the same, and finding on return that Term 1 still
   * runs two is a mistake the screen invites rather than one the user makes.
   * Both pickers are held until Save, and so is Apply to other classes, which
   * copies what is SAVED and would quietly leave the unsaved edit out.
   */
  const dirty = useMemo(() => {
    const now = snapshot(tests, exams);
    return now.tests !== baseline.tests || now.exams !== baseline.exams;
  }, [tests, exams, baseline]);

  /** Refuses a move off this term, and says why. True when it blocked. */
  const blockedByUnsaved = (what: string) => {
    if (!dirty || loadingStructure) return false;
    setNotice(null);
    setError(`Save your changes to ${term} before ${what}.`);
    return true;
  };

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
    setLowerWarning(null);
    setBulkTotal('');
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

  /** Puts one number in every subject's box. Saves nothing until Save is pressed. */
  const applyBulkTotal = () => {
    const n = Number(bulkTotal);
    if (bulkTotal.trim() === '' || !Number.isInteger(n) || n <= 0) {
      setError('Enter a whole number greater than zero to give every subject.');
      return;
    }
    setError(null);
    setNotice(null);
    setTotals(Object.fromEntries(subjects.map((s) => [s.id, String(n)])));
  };

  /**
   * Writes EVERY subject's total for this assessment, across every section of
   * the level, in one request.
   *
   * It used to be a button per subject, and each of those fanned out a request
   * per section from here — resolve the assessment in the section, then PUT the
   * total. A school with twelve subjects and three sections was thirty-six
   * requests and thirty-six chances to stop half way, and what it left behind
   * was sections of one level marked out of different totals. The server now
   * does the whole level in one transaction; the assessment is identified across
   * sections by NAME, because each section holds its own row for it.
   *
   * A BLANK BOX IS NOT A ZERO and is not sent. It means "this subject is not
   * counted on this paper", which is a real answer — leaving it out is how a
   * school runs an exam that some subjects do not sit.
   */
  const saveAllTotals = async (confirmLower = false) => {
    if (!openExam || savingTotals) return;
    const payload: { subjectId: number; totalMarks: number }[] = [];
    for (const s of subjects) {
      const raw = String(totals[s.id] ?? '').trim();
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        setError(`${s.name}: enter a whole number greater than zero, or leave it empty.`);
        return;
      }
      payload.push({ subjectId: s.id, totalMarks: n });
    }
    if (!payload.length) {
      setError('Enter a total for at least one subject.');
      return;
    }
    setSavingTotals(true);
    setError(null);
    setNotice(null);
    if (!confirmLower) setLowerWarning(null);
    try {
      const res: any = await api.put(
        `/test-exams/levels/${encodeURIComponent(level)}/subject-totals`,
        {
          term,
          academicYear,
          assessmentName: openExam.name,
          totals: payload,
          ...(confirmLower ? { confirmLower: true } : {}),
        },
      );
      setLowerWarning(null);
      cache.invalidateOn('test-exam:write');
      const written = Number(res?.sections) || sections.length;
      setNotice(
        written > 1
          ? `${payload.length} subject total${payload.length === 1 ? '' : 's'} saved across all ${written} sections of ${level}.`
          : `${payload.length} subject total${payload.length === 1 ? '' : 's'} saved.`,
      );
      // Named, not counted: a section without this paper is a level that has
      // drifted, and re-saving the structure is what squares it up.
      const missing: string[] = Array.isArray(res?.missingSections) ? res.missingSections : [];
      if (missing.length) {
        setError(`${missing.join(', ')} ${missing.length === 1 ? 'does' : 'do'} not have ${openExam.name} — save the sequence tests and exams again to give ${missing.length === 1 ? 'it' : 'them'} one.`);
      }
    } catch (e: any) {
      if (e?.code === 'MARKS_ABOVE_TOTAL') setLowerWarning(e?.message || 'Marks already entered are above one of these totals.');
      else setError(e?.message || 'Failed to save these totals.');
    } finally {
      setSavingTotals(false);
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
        {/* Totals belong to a SAVED assessment, so an unsaved row has nothing to
            hang them on and an unsaved rename would have this screen headed by a
            name the server does not know. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={row.id == null}
          title={row.id == null ? 'Save first, then set what each subject is marked out of.' : undefined}
          onClick={() => { if (!blockedByUnsaved('setting subject totals')) openTotals(row, type, i); }}
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
              ? 'Set what every subject is marked out of for this assessment. A subject left blank is not counted in ranking or scoring for it. Saving writes them all at once, across every section of this class.'
              : 'Choose a class and term, then say how many tests and exams are there.'}
          </DialogDescription>
        </DialogHeader>

        {!openExam && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ flex: '0 0 auto' }}>
            {/* Both pickers refuse to move while there is unsaved work, because
                moving either one re-reads the structure and throws the edit away
                without saying so. The Select is controlled, so declining to set
                the state leaves it showing what is actually loaded. */}
            <div>
              <Label>Class</Label>
              <Select
                value={level}
                onValueChange={(v) => { if (!blockedByUnsaved('switching class')) setLevel(v); }}
              >
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
              <Select
                value={term}
                onValueChange={(v) => { if (!blockedByUnsaved('moving to another term')) setTerm(v); }}
              >
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
            which is what keeps the error banner and the Save button reachable.

            `flex-basis: auto`, NOT 0. DialogContent is capped by max-height and
            has no definite height of its own, so with `flex: 1 1 0` this item
            contributes 0 to the column's intrinsic height, the column sizes
            itself as if the body were not there, and there is then no free space
            to grow back into — the body lays out at zero pixels and `overflow-y:
            auto` clips every row of it. That is not a subtle mis-sizing: it is
            why this dialog opened with the two counts, every name box and every
            subject row invisible, between the class pickers and the footer.
            `auto` contributes the content height, so the column grows with the
            list until max-height stops it and only then does this scroll. */}
        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
          {!openExam ? (
            loadingStructure ? (
              <ContentLoader minHeight={140} />
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

                {/* Said before the block bites, not only when it does. A picker
                    that refuses to move is confusing if the first news of an
                    unsaved edit is the refusal itself. */}
                {dirty && (
                  <p className="text-xs" style={{ color: '#B45309', marginTop: '0.25rem' }}>
                    Unsaved changes to {term}. Save before changing class or term.
                  </p>
                )}
              </>
            )
          ) : loadingSubjects ? (
            <ContentLoader minHeight={140} />
          ) : subjects.length === 0 ? (
            <p className="text-sm text-gray-500">This class level has no subjects configured.</p>
          ) : (
            <>
              {/* Most papers are out of the same number in every subject, so that
                  is one box and one press rather than the same figure typed
                  twelve times. It only fills the boxes — nothing is written until
                  Save, so a subject that differs can still be corrected first. */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap',
                  paddingBottom: '0.6rem', marginBottom: '0.2rem', borderBottom: '1px solid #E5E7EB',
                }}
              >
                <span className="text-sm font-medium">Every subject out of</span>
                <Input
                  type="number"
                  className="w-20"
                  min={1}
                  placeholder="20"
                  value={bulkTotal}
                  onChange={(e) => setBulkTotal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyBulkTotal(); } }}
                  style={{ textAlign: 'center' }}
                  aria-label="Total to give every subject"
                />
                <Button type="button" variant="outline" size="sm" disabled={savingTotals} onClick={applyBulkTotal}>
                  Fill all
                </Button>
                <span className="text-xs text-gray-400" style={{ flex: '1 1 8rem', minWidth: 0 }}>
                  Fills the boxes below. Nothing is saved until you press Save totals.
                </span>
              </div>

              {subjects.map((s) => (
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
                    min={1}
                    placeholder="Not counted"
                    value={totals[s.id] ?? ''}
                    disabled={savingTotals}
                    onChange={(e) => setTotals((v) => ({ ...v, [s.id]: e.target.value }))}
                    aria-label={`${s.name} is out of`}
                  />
                </div>
              ))}
            </>
          )}
        </div>

        {/* Outside the scroller on purpose: a message about the save has to be
            visible from wherever the list happens to be scrolled to. */}
        {(error || notice || deleteWarning || lowerWarning) && (
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
            {/* Nothing is deleted by this one — the marks stay, they are simply
                above what the paper is now out of. So it is a plain confirm and
                not a destructive one. */}
            {lowerWarning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span className="text-sm" style={{ color: '#e0552e', flex: '1 1 12rem', minWidth: 0 }}>
                  {lowerWarning}
                </span>
                <Button size="sm" disabled={savingTotals} onClick={() => saveAllTotals(true)}>
                  {savingTotals ? 'Saving...' : 'Lower it anyway'}
                </Button>
                <Button variant="outline" size="sm" disabled={savingTotals} onClick={() => setLowerWarning(null)}>
                  Leave it
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Button
                variant="outline"
                size="sm"
                disabled={savingTotals}
                onClick={() => {
                  setOpenExam(null);
                  setNotice(null);
                  setError(null);
                  setLowerWarning(null);
                }}
              >
                Back
              </Button>
              <Button size="sm" disabled={savingTotals || loadingSubjects || !subjects.length} onClick={() => saveAllTotals()}>
                {savingTotals ? 'Saving...' : 'Save totals'}
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {/* Copies what is SAVED, and every term of it — so it sits next to
                  Save rather than replacing it, and refuses to run while an edit
                  on screen has not been written yet. */}
              <Button
                variant="outline"
                size="sm"
                disabled={saving || loadingStructure || !level || !academicYear || levels.length < 2}
                title={levels.length < 2 ? 'This school has only one class level.' : undefined}
                onClick={() => { if (!blockedByUnsaved('applying this set-up elsewhere')) setApplyOpen(true); }}
              >
                Apply to other classes
              </Button>
              <Button size="sm" disabled={saving || loadingStructure || !level || !academicYear} onClick={() => saveStructure()}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          )}
        </div>

        {/* No term is passed: it copies every term this class has set up, which
            is a question for the server and not for whichever term happens to be
            showing behind this. */}
        <ApplyAssessmentsToClassesDialog
          open={applyOpen}
          onOpenChange={setApplyOpen}
          sourceLevel={level}
          levels={levels}
          academicYear={academicYear}
          terms={TERMS}
        />
      </DialogContent>
    </Dialog>
  );
}
