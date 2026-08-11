'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { generateClassAttendanceSheet } from '../utils/pdfGenerator';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

/**
 * The class register, shared by the admin screen and the teacher portal.
 *
 * One implementation for both, as with EnterMarksFlow: the only difference is
 * which classes are offered, and that is decided by the SERVER — GET
 * /attendance/sheet filters the candidate classes by the teacher's own before
 * anything else, so a teacher cannot reach another class's register by editing
 * the query. Nothing here widens that; the class list is simply what the server
 * agreed to return.
 *
 * Filters: class LEVEL, term, and a From/To range.
 *   class only      -> the whole academic year to date
 *   From only       -> that single day
 *   From + To       -> that range
 * The table refetches as any of them changes.
 *
 * Marking is per DAY, so checkboxes are only offered when exactly one day is in
 * view. Over a range the grid is a read of what was recorded — which is the
 * honest presentation, since a tick would otherwise have no unambiguous date to
 * attach itself to.
 *
 * Inline styles for layout: src/index.css is a pre-compiled Tailwind build, so a
 * utility class not already in it renders as nothing at all.
 */

const TERMS = ['Term 1', 'Term 2', 'Term 3'];

interface Cell { date: string; status: string | null; present: boolean | null }
interface SheetStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  cells: Cell[];
  recorded: number;
  present: number;
  percentage: number | null;
  consistent: boolean | null;
  label: string;
}
interface Sheet {
  classLevel: string;
  section: { id: number; name: string; code: string };
  sectionChoices: Array<{ id: number; name: string; studentCount: number }>;
  academicYear: string;
  term: string | null;
  from: string;
  to: string;
  truncated: boolean;
  days: string[];
  students: SheetStudent[];
}

function levelOf(className: string): string {
  const name = String(className || '').trim();
  const m = /^(.+) ([A-Z])$/.exec(name);
  return m ? m[1] : name;
}

export function AttendanceSheet({ audience }: { audience: 'admin' | 'teacher' }) {
  const [levels, setLevels] = useState<string[]>([]);
  const [level, setLevel] = useState('');
  const [section, setSection] = useState('');
  const [term, setTerm] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only the newest request may write state: changing a filter twice quickly
  // would otherwise let the earlier register land last, and a tick then goes to
  // whichever class the response happened to belong to.
  const loadSeq = useRef(0);

  // Which classes this viewer may open. A teacher's list comes from their own
  // teaching record, so the picker cannot offer a class the server would refuse.
  useEffect(() => {
    let alive = true;
    const source = audience === 'teacher'
      ? api.get('/staff/me/teaching').then((r: any) => (r?.classes ?? []).map((c: any) => c.name))
      : api.get('/classes').then((r: any) => (Array.isArray(r) ? r : []).map((c: any) => c.name));
    source
      .then((names: string[]) => {
        if (!alive) return;
        const set = new Set(names.map(levelOf));
        const list = [...set].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        setLevels(list);
        setLevel((prev) => (prev && list.includes(prev) ? prev : list[0] ?? ''));
      })
      .catch((e: any) => { if (alive) setError(e?.message || 'Could not load your classes.'); });
    return () => { alive = false; };
  }, [audience]);

  // A different class means a different section choice.
  useEffect(() => { setSection(''); }, [level]);

  const load = useCallback(async () => {
    if (!level) { setSheet(null); return; }
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ classLevel: level });
      if (section) qs.set('section', section);
      if (term) qs.set('term', term);
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const res: any = await api.get(`/attendance/sheet?${qs.toString()}`);
      if (seq !== loadSeq.current) return;
      setSheet(res);
      // The server resolves the section; adopt its answer so the picker agrees
      // with what is on screen.
      if (!section && res?.section?.id) setSection(String(res.section.id));
    } catch (e: any) {
      if (seq !== loadSeq.current) return;
      setSheet(null);
      setError(e?.message || 'Could not load the register.');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [level, section, term, from, to]);

  useEffect(() => { load(); }, [load]);

  const days = sheet?.days ?? [];
  const singleDay = days.length === 1;

  /** Marking is per day, so this is only reachable with one day in view. */
  const mark = async (studentId: string, present: boolean) => {
    if (!singleDay || !sheet) return;
    const date = days[0];
    setSaving(true);
    setError(null);
    // Optimistic: a register is ticked in a rhythm and waiting on each round
    // trip breaks it. Reverted below if the save fails.
    const before = sheet;
    setSheet({
      ...sheet,
      students: sheet.students.map((s) =>
        s.studentId === studentId
          ? { ...s, cells: s.cells.map((c) => (c.date === date ? { ...c, present, status: present ? 'present' : 'absent' } : c)) }
          : s,
      ),
    });
    try {
      await api.post('/attendance/mark', { date, records: [{ studentId, present }] });
    } catch (e: any) {
      setSheet(before);
      setError(e?.message || 'Could not save that mark.');
      toast.error('Attendance not saved');
    } finally {
      setSaving(false);
    }
  };

  const markAll = async (present: boolean) => {
    if (!singleDay || !sheet || !sheet.students.length) return;
    const date = days[0];
    setSaving(true);
    setError(null);
    try {
      await api.post('/attendance/mark', {
        date,
        records: sheet.students.map((s) => ({ studentId: s.studentId, present })),
      });
      await load();
      toast.success(present ? 'All marked present' : 'All marked absent');
    } catch (e: any) {
      setError(e?.message || 'Could not save the register.');
    } finally {
      setSaving(false);
    }
  };

  const download = () => {
    if (!sheet) return;
    generateClassAttendanceSheet({
      className: sheet.section?.name ?? sheet.classLevel,
      academicYear: sheet.academicYear,
      term: sheet.term,
      from: sheet.from,
      to: sheet.to,
      days: sheet.days,
      students: sheet.students,
    });
  };

  const sectionChoices = sheet?.sectionChoices ?? [];

  return (
    <div>
      <Card className="p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label>Class</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger>
                <SelectValue placeholder={levels.length ? 'Select class' : 'No classes available'} />
              </SelectTrigger>
              <SelectContent>
                {levels.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Offered only when the level genuinely has more than one populated
              section — the same rule the marks flow uses. */}
          {sectionChoices.length > 1 && (
            <div>
              <Label>Section</Label>
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                <SelectContent>
                  {sectionChoices.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name} ({s.studentCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Term</Label>
            <Select value={term || '__all'} onValueChange={(v) => setTerm(v === '__all' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Whole year" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Whole year to date</SelectItem>
                {TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <p className="text-xs text-gray-400" style={{ marginTop: 2 }}>
              A date on its own shows that one day
            </p>
          </div>

          <div>
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={!from} />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: '0.75rem' }}>
          <Button variant="outline" onClick={download} disabled={!sheet || loading} className="flex items-center gap-2">
            <Download size={16} />
            Download
          </Button>
          {(from || to || term) && (
            <Button variant="outline" onClick={() => { setFrom(''); setTo(''); setTerm(''); }}>
              Clear dates
            </Button>
          )}
          {singleDay && sheet?.students.length ? (
            <>
              <Button variant="outline" onClick={() => markAll(true)} disabled={saving}>Mark all present</Button>
              <Button variant="outline" onClick={() => markAll(false)} disabled={saving}>Mark all absent</Button>
            </>
          ) : null}
        </div>

        {error && <p className="text-sm" style={{ color: '#B91C1C', marginTop: '0.5rem' }}>{error}</p>}
        {sheet?.truncated && (
          <p className="text-sm" style={{ color: '#B45309', marginTop: '0.5rem' }}>
            This range is long, so only the first stretch of days is shown. Narrow the dates to see the rest.
          </p>
        )}
      </Card>

      <Card>
        {loading ? (
          <p className="p-6 text-gray-500">Loading register...</p>
        ) : !sheet ? (
          <p className="p-6 text-gray-500">Choose a class to see its register.</p>
        ) : sheet.students.length === 0 ? (
          <p className="p-6 text-gray-500">No students enrolled in {sheet.section?.name ?? level}.</p>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ padding: '0.75rem 1rem 0' }}>
              <p className="text-sm text-gray-500">
                {sheet.section?.name} · {sheet.from === sheet.to ? sheet.from : `${sheet.from} to ${sheet.to}`}
                {singleDay ? ' · tick to mark' : ' · read-only over a range; pick one day to mark'}
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="px-4 py-3 font-medium">Student</th>
                  {days.map((d) => (
                    <th key={d} className="px-2 py-3 font-medium" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {singleDay ? d : d.slice(5)}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium" style={{ whiteSpace: 'nowrap' }}>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {sheet.students.map((s) => (
                  <tr key={s.studentId} className="border-b">
                    <td className="px-4 py-3">
                      {/* Every name is a link to the student, so the register is
                          a way into the record rather than a dead end. */}
                      {/* Underlined outright rather than on hover: hover:underline
                          is not in the pre-compiled stylesheet, so it would style
                          nothing and the name would not read as a link at all. */}
                      <Link
                        href={`/students/${encodeURIComponent(s.studentId)}`}
                        style={{ textDecoration: 'underline' }}
                      >
                        {s.firstName} {s.lastName}
                      </Link>
                    </td>
                    {s.cells.map((c) => (
                      <td key={c.date} className="px-2 py-3" style={{ textAlign: 'center' }}>
                        {singleDay ? (
                          <input
                            type="checkbox"
                            checked={c.present === true}
                            disabled={saving}
                            onChange={(e) => mark(s.studentId, e.target.checked)}
                            aria-label={`${s.firstName} ${s.lastName} present on ${c.date}`}
                          />
                        ) : c.present === true ? (
                          <span style={{ color: '#05603D', fontWeight: 600 }}>P</span>
                        ) : c.present === false ? (
                          <span style={{ color: '#E0552E', fontWeight: 600 }}>A</span>
                        ) : (
                          // Not an absence — nobody took the register that day.
                          <span className="text-gray-400">–</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3" style={{ whiteSpace: 'nowrap' }}>
                      {s.percentage == null ? (
                        <span className="text-gray-400">No records</span>
                      ) : (
                        <>
                          {s.present}/{s.recorded}{' '}
                          <span style={{ color: s.consistent ? '#05603D' : '#E0552E' }}>
                            ({s.percentage}%)
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-sm text-gray-500" style={{ marginTop: '0.75rem' }}>
        A dash means no register was taken that day — it does not count as an absence.
      </p>
    </div>
  );
}
