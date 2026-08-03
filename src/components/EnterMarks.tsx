import { useEffect, useMemo, useState } from 'react';
import { PaymentStatusDot, useStudentPaymentStatuses } from './PaymentStatus';
import { NavigationPage } from '../App';
import { api } from '@/lib/api';
import { useCachedResource } from '@/lib/SisCache';
import { formatTermLabel, getDefaultTermFields } from '../utils/academicTerm';
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
  // Rankings and marks rows carry no payment status of their own, so it is
  // resolved by student CODE from the shared students list, which already has it.
  const paymentStatuses = useStudentPaymentStatuses();
  const [classId, setClassId] = useState('');
  const [{ term, academicYear }, setPeriod] = useState(() => getDefaultTermFields());
  const [testExamId, setTestExamId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  // Class list and exam definitions are reference data. The marks themselves
  // are not — two people entering marks for the same subject must not be shown
  // a cached roster that predates the other's save.
  const { data: classList } = useCachedResource<any[]>('classes', () => api.get('/classes'));
  const classes = classList ?? [];

  const periodReady = Boolean(classId && term && academicYear);
  const { data: testExamsData } = useCachedResource<any[]>(
    periodReady ? `test-exams:${classId}|${term}|${academicYear}` : null,
    () => api.get(`/test-exams?classId=${classId}&term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear)}`),
    { enabled: periodReady, deps: [classId, term, academicYear] },
  );
  const testExams = testExamsData ?? [];

  const { data: subjectTotalsData } = useCachedResource<any[]>(
    testExamId ? `subject-totals:${Number(testExamId)}` : null,
    () => api.get(`/test-exams/${testExamId}/subject-totals`),
    { enabled: Boolean(testExamId), deps: [testExamId] },
  );
  const subjectTotals = subjectTotalsData ?? [];

  const marksReady = Boolean(testExamId && subjectId);
  const {
    data: marksData,
    loading: loadingRoster,
    refresh: refreshMarks,
  } = useCachedResource<any>(
    null,
    () => api.get(`/test-exams/${testExamId}/marks?subjectId=${subjectId}`),
    { policy: 'fresh', enabled: marksReady, deps: [testExamId, subjectId] },
  );
  const roster: { studentId: string; firstName: string; lastName: string; marksObtained: number | null }[] =
    marksReady ? marksData?.roster ?? [] : [];
  const totalMarks: number | null = marksReady ? marksData?.totalMarks ?? null : null;

  useEffect(() => {
    if (!classId && classes.length) setClassId(String(classes[0].id));
  }, [classes, classId]);

  // Class/term/year change -> the chosen exam and subject no longer apply.
  useEffect(() => {
    setTestExamId('');
  }, [classId, term, academicYear]);

  useEffect(() => {
    setSubjectId('');
  }, [testExamId]);

  // Changing what is being marked clears any message from the last save. This
  // is keyed on the selection rather than on the data so that re-reading the
  // roster after a save does not wipe that save's own confirmation.
  useEffect(() => {
    setSaveMessage(null);
    setServerErrors({});
  }, [testExamId, subjectId]);

  // Prefill the inputs from whatever is on record for this exam and subject.
  useEffect(() => {
    setValues(
      Object.fromEntries(
        (marksData?.roster ?? []).map((r: any) => [
          r.studentId,
          r.marksObtained != null ? String(r.marksObtained) : '',
        ]),
      ),
    );
  }, [marksData]);

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
      await refreshMarks();
      setSaveMessage(`Saved marks for ${result.count} student${result.count === 1 ? '' : 's'}.`);
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
                <SelectItem value="Term 1">{formatTermLabel('Term 1')}</SelectItem>
                <SelectItem value="Term 2">{formatTermLabel('Term 2')}</SelectItem>
                <SelectItem value="Term 3">{formatTermLabel('Term 3')}</SelectItem>
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
                      <TableCell>{r.firstName} {r.lastName}<PaymentStatusDot status={paymentStatuses.get(String(r.studentId))} /></TableCell>
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
