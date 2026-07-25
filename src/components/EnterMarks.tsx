import { useEffect, useMemo, useState } from 'react';
import { NavigationPage } from '../App';
import { api } from '@/lib/api';
import { getDefaultTermFields } from '../utils/academicTerm';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from './ui/table';

interface EnterMarksProps {
  onNavigate?: (page: NavigationPage) => void;
}

export function EnterMarks({ onNavigate }: EnterMarksProps) {
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState('');
  const [{ term, academicYear }, setPeriod] = useState(() => getDefaultTermFields());

  const [testExams, setTestExams] = useState<any[]>([]);
  const [testExamId, setTestExamId] = useState('');

  const [subjectTotals, setSubjectTotals] = useState<any[]>([]);
  const [subjectId, setSubjectId] = useState('');

  const [roster, setRoster] = useState<{ studentId: string; firstName: string; lastName: string; marksObtained: number | null }[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [totalMarks, setTotalMarks] = useState<number | null>(null);

  const [loadingRoster, setLoadingRoster] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/classes');
        setClasses(data || []);
        if (Array.isArray(data) && data.length && !classId) setClassId(String(data[0].id));
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Class/term/year change -> reload the test/exam list, reset downstream selections.
  useEffect(() => {
    setTestExamId('');
    setSubjectId('');
    setSubjectTotals([]);
    setRoster([]);
    setValues({});
    setTotalMarks(null);
    if (!classId || !term || !academicYear) { setTestExams([]); return; }
    (async () => {
      try {
        const rows = await api.get(`/test-exams?classId=${classId}&term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear)}`);
        setTestExams(rows || []);
      } catch {
        setTestExams([]);
      }
    })();
  }, [classId, term, academicYear]);

  // Test/exam change -> reload subjects that have a configured total for it.
  useEffect(() => {
    setSubjectId('');
    setRoster([]);
    setValues({});
    setTotalMarks(null);
    if (!testExamId) { setSubjectTotals([]); return; }
    (async () => {
      try {
        const rows = await api.get(`/test-exams/${testExamId}/subject-totals`);
        setSubjectTotals(rows || []);
      } catch {
        setSubjectTotals([]);
      }
    })();
  }, [testExamId]);

  // Test/exam + subject chosen -> load the roster with prefilled marks.
  useEffect(() => {
    setSaveMessage(null);
    setServerErrors({});
    if (!testExamId || !subjectId) { setRoster([]); setValues({}); setTotalMarks(null); return; }
    setLoadingRoster(true);
    (async () => {
      try {
        const data = await api.get(`/test-exams/${testExamId}/marks?subjectId=${subjectId}`);
        setRoster(data?.roster || []);
        setTotalMarks(data?.totalMarks ?? null);
        setValues(Object.fromEntries((data?.roster || []).map((r: any) => [r.studentId, r.marksObtained != null ? String(r.marksObtained) : ''])));
      } catch {
        setRoster([]);
        setValues({});
        setTotalMarks(null);
      }
      setLoadingRoster(false);
    })();
  }, [testExamId, subjectId]);

  const rowError = (studentId: string): string | null => {
    const raw = values[studentId];
    if (raw === undefined || raw === '') return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) return 'Must be a whole number, 0 or more';
    if (totalMarks != null && n > totalMarks) return `Cannot exceed ${totalMarks}`;
    return serverErrors[studentId] || null;
  };

  const hasAnyError = useMemo(
    () => roster.some(r => rowError(r.studentId) != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roster, values, totalMarks, serverErrors]
  );

  const hasAnyValue = useMemo(() => roster.some(r => (values[r.studentId] ?? '') !== ''), [roster, values]);

  const handleSave = async () => {
    if (!testExamId || !subjectId) return;
    const marks = roster
      .filter(r => (values[r.studentId] ?? '') !== '')
      .map(r => ({ studentId: r.studentId, marksObtained: Number(values[r.studentId]) }));
    if (!marks.length) return;

    setSaving(true);
    setSaveMessage(null);
    setServerErrors({});
    try {
      const result = await api.post(`/test-exams/${testExamId}/marks/bulk`, { subjectId: Number(subjectId), marks });
      setSaveMessage(`Saved marks for ${result.count} student${result.count === 1 ? '' : 's'}.`);
      const data = await api.get(`/test-exams/${testExamId}/marks?subjectId=${subjectId}`);
      setRoster(data?.roster || []);
      setValues(Object.fromEntries((data?.roster || []).map((r: any) => [r.studentId, r.marksObtained != null ? String(r.marksObtained) : ''])));
    } catch (e: any) {
      const details = e?.message ? e.message : 'Failed to save marks.';
      setSaveMessage(details);
      // The backend's per-row `details` array (studentId + error) isn't
      // surfaced through api.ts's Error wrapper, so we can only show the
      // top-level message here — good enough since inputs are re-validated
      // live client-side against the same total before submit is ever enabled.
    }
    setSaving(false);
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <button
          onClick={() => onNavigate?.('report-cards')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-600 transition-colors mb-3"
        >
          <ArrowLeft size={16} />
          Back to Report Cards
        </button>
        <h1 className="text-3xl mb-2">Enter Marks</h1>
        <p className="text-gray-600">Pick a class, subject, and test/exam, then enter each student's score</p>
      </div>

      <Card className="p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Term</Label>
            <Select value={term} onValueChange={(v: string) => setPeriod(p => ({ ...p, term: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select term" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Term 1">Term 1</SelectItem>
                <SelectItem value="Term 2">Term 2</SelectItem>
                <SelectItem value="Term 3">Term 3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Academic Year</Label>
            <Input
              placeholder="2026/2027"
              value={academicYear}
              onChange={e => setPeriod(p => ({ ...p, academicYear: e.target.value }))}
            />
          </div>
          <div>
            <Label>Test/Exam</Label>
            <Select value={testExamId} onValueChange={setTestExamId}>
              <SelectTrigger>
                <SelectValue placeholder={testExams.length ? 'Select test/exam' : 'None for this class/term'} />
              </SelectTrigger>
              <SelectContent>
                {testExams.map((t: any) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {testExamId && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            <div>
              <Label>Subject</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger>
                  <SelectValue placeholder={subjectTotals.length ? 'Select subject' : 'No totals configured yet'} />
                </SelectTrigger>
                <SelectContent>
                  {subjectTotals.map((t: any) => (
                    <SelectItem key={t.subjectId} value={String(t.subjectId)}>
                      {t.subject?.name} (Total: {t.totalMarks})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </Card>

      {!testExamId || !subjectId ? (
        <Card className="p-6">
          <p className="text-gray-500">Select a class, term, academic year, test/exam, and subject to enter marks.</p>
        </Card>
      ) : loadingRoster ? (
        <p className="p-4 text-gray-500">Loading roster...</p>
      ) : roster.length === 0 ? (
        <Card className="p-6">
          <p className="text-gray-500">No students found in this class.</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Marks Obtained (out of {totalMarks})</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map(r => {
                  const err = rowError(r.studentId);
                  return (
                    <TableRow key={r.studentId}>
                      <TableCell>{r.firstName} {r.lastName}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="w-24"
                          value={values[r.studentId] ?? ''}
                          style={err ? { borderColor: 'var(--color-red-500)' } : undefined}
                          onChange={e => setValues(v => ({ ...v, [r.studentId]: e.target.value }))}
                        />
                        {err && <p className="text-red-600 text-xs mt-1">{err}</p>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="p-4 flex items-center justify-end gap-4 border-t">
            {saveMessage && <p className="text-sm text-gray-600">{saveMessage}</p>}
            <Button
              className="flex items-center gap-2"
              onClick={handleSave}
              disabled={saving || hasAnyError || !hasAnyValue}
            >
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Marks'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
