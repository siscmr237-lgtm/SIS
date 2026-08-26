'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAcademicYear } from '@/lib/academicYear';
import { PaymentStatusDot, useStudentPaymentStatuses } from './PaymentStatus';
import { ZeroMarkDot, useStudentsWithZeroMarks } from './MarkStatus';
import { NavigationPage } from '../App';
import { api } from '@/lib/api';
import { useCachedResource } from '@/lib/SisCache';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from './ui/table';

/**
 * Class ranking.
 *
 * Four filters, of which only the class is single — a ranking is a comparison
 * within one class, but it can span any combination of terms, assessments and
 * subjects. Each filter NARROWS: leaving one empty means "all of it", so the
 * screen opens on the whole active year and every selection restricts from there.
 *
 * The class is a LEVEL, and the ranking spans its sections: the students of
 * "Class 1" are all of them, not just section A's. Safe to span here in a way
 * mark entry is not, because nothing is written.
 *
 * The metric follows the subject filter, which the server decides and echoes
 * back: with no subjects it is the AVERAGE across everything in scope; with
 * subjects it is the TOTAL of those subjects. Both ORDER on percentage of what
 * each student was actually out of, which is the only exemption-fair ordering —
 * a student excused from a paper must not be ranked down for marks they never
 * had the chance to earn.
 *
 * Inline styles for layout: src/index.css is a pre-compiled Tailwind build, so a
 * utility class not already in it renders as nothing at all.
 */

const TERMS = ['Term 1', 'Term 2', 'Term 3'];

interface ClassRankingProps {
  onNavigate?: (page: NavigationPage) => void;
}

/** The level a class name belongs to; mirrors classLevelOf on the server. */
function levelOf(className: string): string {
  const name = String(className || '').trim();
  const m = /^(.+) ([A-Z])$/.exec(name);
  return m ? m[1] : name;
}

/** A narrowing multi-select. Nothing ticked means "all", which is stated. */
function MultiFilter({
  label, options, selected, onToggle, emptyMeans, disabled,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: Set<string>;
  onToggle: (value: string) => void;
  emptyMeans: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div
        style={{
          border: '1px solid #E5E7EB', borderRadius: 6, padding: '0.4rem 0.5rem',
          maxHeight: 132, overflowY: 'auto', marginTop: 4,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {options.length === 0 ? (
          <p className="text-sm text-gray-400">None available</p>
        ) : (
          options.map((o) => (
            <label
              key={o.value}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', cursor: disabled ? 'default' : 'pointer' }}
            >
              <input
                type="checkbox"
                checked={selected.has(o.value)}
                onChange={() => onToggle(o.value)}
                disabled={disabled}
              />
              <span className="text-sm">{o.label}</span>
            </label>
          ))
        )}
      </div>
      <p className="text-xs text-gray-400" style={{ marginTop: 2 }}>
        {selected.size === 0 ? emptyMeans : `${selected.size} selected`}
      </p>
    </div>
  );
}

export function ClassRanking({ onNavigate }: ClassRankingProps) {
  const { status: yearStatus } = useAcademicYear();
  const academicYear = yearStatus?.activeYear ?? '';

  // Rankings carry no payment status of their own, so it is resolved by student
  // CODE from the shared students list, which already has it.
  const paymentStatuses = useStudentPaymentStatuses();
  const zeroMarks = useStudentsWithZeroMarks();

  const { data: classList } = useCachedResource<any[]>('classes', () => api.get('/classes'));
  const classes = useMemo(() => classList ?? [], [classList]);

  const [level, setLevel] = useState('');
  const [terms, setTerms] = useState<Set<string>>(new Set());
  const [examNames, setExamNames] = useState<Set<string>>(new Set());
  const [subjectIds, setSubjectIds] = useState<Set<string>>(new Set());

  const [exams, setExams] = useState<Array<{ name: string; term: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: number; name: string }>>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const levels = useMemo(() => {
    const set = new Set(classes.map((c: any) => levelOf(c.name)));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [classes]);

  useEffect(() => {
    if (!level && levels.length) setLevel(levels[0]);
  }, [levels, level]);

  // A representative section of the level, for reading the option lists. The
  // assessments and subjects are level-wide, so any section answers for all.
  const representative = useMemo(
    () => classes.find((c: any) => levelOf(c.name) === level) ?? null,
    [classes, level],
  );

  // Changing the class invalidates the narrower filters, which named things that
  // belonged to the old one.
  useEffect(() => { setExamNames(new Set()); setSubjectIds(new Set()); }, [level]);

  useEffect(() => {
    setExams([]); setSubjects([]);
    if (!representative || !academicYear) return;
    let alive = true;
    Promise.all([
      api.get(`/test-exams?classId=${representative.id}&academicYear=${encodeURIComponent(academicYear)}`).catch(() => []),
      api.get(`/classes/${representative.id}/subjects`).catch(() => []),
    ]).then(([examRes, subjectRes]: any[]) => {
      if (!alive) return;
      const seen = new Set<string>();
      setExams((Array.isArray(examRes) ? examRes : [])
        .filter((e: any) => e?.name && !seen.has(e.name) && seen.add(e.name))
        .map((e: any) => ({ name: e.name, term: e.term })));
      setSubjects((Array.isArray(subjectRes) ? subjectRes : [])
        .map((s: any) => ({ id: s.subjectId ?? s.id, name: s.name }))
        .filter((s: any) => s.id && s.name));
    });
    return () => { alive = false; };
  }, [representative?.id, academicYear]);

  // Only assessments belonging to a selected term are offerable once terms are
  // chosen — otherwise the two filters can contradict each other on screen.
  const offerableExams = useMemo(
    () => (terms.size === 0 ? exams : exams.filter((e) => terms.has(e.term))),
    [exams, terms],
  );

  const load = useMemo(() => async () => {
    if (!level || !academicYear) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('classLevel', level);
      qs.set('academicYear', academicYear);
      // Always sent, even when empty: an empty value is what tells the server
      // "no term restriction" rather than falling back to the current term.
      qs.set('terms', [...terms].join(','));
      if (examNames.size) qs.set('testExams', [...examNames].join(','));
      if (subjectIds.size) qs.set('subjectIds', [...subjectIds].join(','));
      const res: any = await api.get(`/test-exams/class-ranking?${qs.toString()}`);
      setData(res);
    } catch (e: any) {
      setError(e?.message || 'Could not load the ranking.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [level, academicYear, terms, examNames, subjectIds]);

  useEffect(() => { load(); }, [load]);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void) => (v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    setter(next);
  };

  const rows: any[] = data?.rankings ?? [];
  const metric: 'average' | 'total' = data?.metric === 'total' ? 'total' : 'average';

  const scopeLine = [
    level,
    terms.size ? [...terms].join(', ') : 'all terms',
    examNames.size ? [...examNames].join(', ') : 'all sequence tests & exams',
    subjectIds.size
      ? subjects.filter((s) => subjectIds.has(String(s.id))).map((s) => s.name).join(', ')
      : 'all subjects',
  ].join(' · ');

  return (
    <div className="p-4 md:p-8">
      {/* A self-contained print rule: index.css is pre-compiled, so print styling
          cannot be added as utility classes. Everything but the ranking itself is
          hidden, so what prints is what the filters currently show. */}
      <style>{`@media print {
        .cr-noprint { display: none !important; }
        .cr-print-only { display: block !important; }
      }`}</style>

      <div className="flex items-center gap-2 mb-6 cr-noprint">
        <Button variant="outline" onClick={() => onNavigate?.('report-cards')} className="flex items-center gap-2">
          <ArrowLeft size={16} />
          Back
        </Button>
        <Button variant="outline" onClick={() => window.print()} className="flex items-center gap-2">
          <Printer size={16} />
          Print
        </Button>
        <Button variant="outline" onClick={() => load()} disabled={loading} className="flex items-center gap-2">
          <RefreshCw size={16} />
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl mb-2">Class Ranking</h1>
        <p className="text-gray-600">{scopeLine}</p>
        <p className="text-sm text-gray-500" style={{ marginTop: 2 }}>
          Academic year: {academicYear || '—'} · Ranked by{' '}
          {metric === 'total' ? 'total across the selected subjects' : 'average across all subjects'}
        </p>
      </div>

      <Card className="p-6 mb-6 cr-noprint">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label>Class</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger>
                <SelectValue placeholder={levels.length ? 'Select class' : 'No classes'} />
              </SelectTrigger>
              <SelectContent>
                {levels.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400" style={{ marginTop: 2 }}>
              Ranked across all sections
            </p>
          </div>

          <MultiFilter
            label="Term"
            options={TERMS.map((t) => ({ value: t, label: t }))}
            selected={terms}
            onToggle={toggle(terms, setTerms)}
            emptyMeans="All terms"
          />

          <MultiFilter
            label="Sequence Test / Exam"
            options={offerableExams.map((e) => ({ value: e.name, label: e.name }))}
            selected={examNames}
            onToggle={toggle(examNames, setExamNames)}
            emptyMeans="All sequence tests & exams"
          />

          <MultiFilter
            label="Subject"
            options={subjects.map((s) => ({ value: String(s.id), label: s.name }))}
            selected={subjectIds}
            onToggle={toggle(subjectIds, setSubjectIds)}
            emptyMeans="All subjects (ranks by average)"
          />
        </div>
      </Card>

      {error && <Card className="p-6 mb-6 text-red-600 text-sm cr-noprint">{error}</Card>}

      <Card>
        {loading ? (
          <p className="p-6 text-gray-500">Loading ranking...</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-gray-500">No students in {level || 'this class'}.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>{metric === 'total' ? 'Total' : 'Average'}</TableHead>
                  <TableHead>Counted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.studentId}>
                    <TableCell>
                      {/* Unranked, not last: a student with nothing counted has
                          no position, and a 0 there would read as one earned. */}
                      {r.rank ?? <span className="text-gray-400">—</span>}
                    </TableCell>
                    <TableCell>
                      {r.firstName} {r.lastName}
                      <PaymentStatusDot status={paymentStatuses.get(r.studentId)} />
                      <ZeroMarkDot hasZero={zeroMarks.has(r.studentId)} />
                    </TableCell>
                    <TableCell>
                      {r.percentage == null ? (
                        <span className="text-gray-400">Not yet ranked</span>
                      ) : metric === 'total' ? (
                        <>{r.totalObtained} / {r.totalPossible} <span className="text-gray-400">({r.percentage}%)</span></>
                      ) : (
                        <>{r.percentage}%</>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {r.assessmentsCounted}
                      {r.assessmentsExempt ? ` · ${r.assessmentsExempt} exempt` : ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <p className="text-sm text-gray-500" style={{ marginTop: '0.75rem' }}>
        Exempt assessments are left out of both the score and what it is out of, so nobody is ranked
        down for a paper they were excused from.
      </p>
    </div>
  );
}
