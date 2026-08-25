'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
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
 * Managing the assessment structure for a class LEVEL and term.
 *
 * Filters on the LEVEL ("Class 1"), never a section ("Class 1 A"), because the
 * structure is a property of the level: every section of it sits the same tests,
 * out of the same totals, from the same subject list (ClassLevelSubject). A
 * TestExam row is nonetheless per SECTION — that is what the schema keys on
 * (classId, academicYear, term, name) — so this screen reads one section as the
 * representative and fans every edit out across all sections of the level, which
 * is what keeps them from drifting apart.
 */

const TERMS = ['Term 1', 'Term 2', 'Term 3'];

interface ClassRow { id: number; code?: string; name: string }
interface TestExamRow { id: number; name: string; type: 'TEST' | 'EXAM'; order?: number }
interface SubjectRow { id: number; subjectId?: number; name: string }

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
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [level, setLevel] = useState('');
  const [term, setTerm] = useState(TERMS[0]);

  const [testExams, setTestExams] = useState<TestExamRow[]>([]);
  const [loadingExams, setLoadingExams] = useState(false);

  // The assessment being configured, or null while showing the list.
  const [openExam, setOpenExam] = useState<TestExamRow | null>(null);
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

  // Every section of the chosen level. The first is the one we read from; all of
  // them receive each edit.
  const sections = useMemo(
    () => classes.filter((c) => levelOf(c.name) === level),
    [classes, level],
  );
  const representative = sections[0] ?? null;

  useEffect(() => {
    if (!level && levels.length) setLevel(levels[0]);
  }, [levels, level]);

  // Back to the list whenever the filters move — the open assessment belongs to
  // the level and term that were showing when it was opened.
  useEffect(() => {
    setOpenExam(null);
    setNotice(null);
  }, [level, term]);

  useEffect(() => {
    setTestExams([]);
    if (!open || !representative || !term || !academicYear) return;
    let alive = true;
    setLoadingExams(true);
    api
      .get(`/test-exams?classId=${representative.id}&term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear)}`)
      .then((res: any) => {
        if (alive) setTestExams(Array.isArray(res) ? res : []);
      })
      .catch((e: any) => {
        if (alive) setError(e?.message || 'Failed to load tests and exams.');
      })
      .finally(() => {
        if (alive) setLoadingExams(false);
      });
    return () => { alive = false; };
  }, [open, representative?.id, term, academicYear]);

  const openAssessment = async (exam: TestExamRow) => {
    setOpenExam(exam);
    setError(null);
    setNotice(null);
    setSubjects([]);
    setTotals({});
    if (!representative) return;
    setLoadingSubjects(true);
    try {
      const [subjectRes, totalsRes] = await Promise.all([
        api.get(`/classes/${representative.id}/subjects`),
        api.get(`/test-exams/${exam.id}/subject-totals`),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 'min(672px, calc(100vw - 2rem))' }}>
        <DialogHeader>
          <DialogTitle>
            {openExam ? `${openExam.name} — subject totals` : 'Manage Tests & Exams'}
          </DialogTitle>
          <DialogDescription>
            {openExam
              ? 'Set the total marks each subject is out of for this assessment. A subject left blank is not counted in ranking or scoring for it.'
              : 'Choose a class and term to see its tests and exams. Click one to set what each subject is marked out of.'}
          </DialogDescription>
        </DialogHeader>

        {!openExam && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        <div style={{ maxHeight: '48vh', overflowY: 'auto', marginTop: 8 }}>
          {error && <p className="text-sm" style={{ color: '#e0552e', marginBottom: 8 }}>{error}</p>}
          {notice && <p className="text-sm" style={{ color: '#05603d', marginBottom: 8 }}>{notice}</p>}

          {!openExam ? (
            loadingExams ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : !level ? (
              <p className="text-sm text-gray-500">Choose a class to begin.</p>
            ) : testExams.length === 0 ? (
              <p className="text-sm text-gray-500">No tests or exams for {level}, {term} yet.</p>
            ) : (
              testExams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openAssessment(t)}
                  className="w-full text-left"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: '0.75rem', padding: '0.6rem 0.25rem',
                    borderBottom: '1px solid #F3F4F6', background: 'none', border: 0,
                    borderBottomWidth: 1, borderBottomStyle: 'solid', cursor: 'pointer',
                  }}
                >
                  <span className="text-sm">{t.name}</span>
                  <span className="text-xs text-gray-400">
                    {t.type === 'EXAM' ? 'Exam' : 'Test'}
                  </span>
                </button>
              ))
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

        {/* Academic year, bottom-left and not editable: the structure always
            belongs to the school's active year, which is changed in Settings. */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '0.75rem', borderTop: '1px solid #E5E7EB', paddingTop: '0.75rem', marginTop: '0.5rem',
          }}
        >
          <span className="text-xs text-gray-500">Academic year: {academicYear || '—'}</span>
          {openExam && (
            <Button variant="outline" size="sm" onClick={() => { setOpenExam(null); setNotice(null); }}>
              Back to list
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
