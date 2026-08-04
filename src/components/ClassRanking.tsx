import { useEffect, useState } from 'react';
import { AcademicYearSelect, useAcademicYear } from '@/lib/academicYear';
import { PaymentStatusDot, useStudentPaymentStatuses } from './PaymentStatus';
import { ZeroMarkDot, useStudentsWithZeroMarks } from './MarkStatus';
import { NavigationPage } from '../App';
import { api } from '@/lib/api';
import { useCachedResource } from '@/lib/SisCache';
import { formatTermLabel, getDefaultTermFields } from '../utils/academicTerm';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from './ui/table';

interface ClassRankingProps {
  onNavigate?: (page: NavigationPage) => void;
}

export function ClassRanking({ onNavigate }: ClassRankingProps) {
  const { status: yearStatus } = useAcademicYear();
  // Rankings and marks rows carry no payment status of their own, so it is
  // resolved by student CODE from the shared students list, which already has it.
  const paymentStatuses = useStudentPaymentStatuses();
  const zeroMarks = useStudentsWithZeroMarks();
  const [classId, setClassId] = useState('');
  const [{ term, academicYear }, setPeriod] = useState(() => getDefaultTermFields());

  const { data: classList } = useCachedResource<any[]>('classes', () => api.get('/classes'));
  const classes = classList ?? [];

  useEffect(() => {
    if (!classId && classes.length) setClassId(String(classes[0].id));
  }, [classes, classId]);

  // Rankings are derived from marks and shift as marks are entered, so they
  // are always fetched fresh — a stale position is exactly the kind of number
  // someone would act on.
  const {
    data: rankingData,
    loading,
    refresh,
  } = useCachedResource<any>(
    null,
    () => api.get(`/test-exams/class-ranking?classId=${classId}&term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear)}`),
    {
      policy: 'fresh',
      enabled: Boolean(classId && term && academicYear),
      deps: [classId, term, academicYear],
    },
  );
  const rankings = rankingData?.rankings ?? [];

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex-1">
          <button
            onClick={() => onNavigate?.('report-cards')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-600 transition-colors mb-3"
          >
            <ArrowLeft size={16} />
            Back to Report Cards
          </button>
          <h1 className="text-3xl mb-2">Class Ranking</h1>
          <p className="text-gray-600">Live-computed overall standing for a class, for one term</p>
        </div>
        <Button variant="outline" className="flex items-center gap-2" onClick={refresh} disabled={loading}>
          <RefreshCw size={16} />
          Refresh
        </Button>
      </div>

      <Card className="p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <AcademicYearSelect
              value={academicYear}
              onChange={v => setPeriod(p => ({ ...p, academicYear: v }))}
              years={yearStatus?.years ?? []}
            />
          </div>
        </div>
      </Card>

      {loading ? (
        <p className="p-4 text-gray-500">Loading...</p>
      ) : rankings.length === 0 ? (
        <Card className="p-6">
          <p className="text-gray-500">No students found for this class.</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Total Obtained</TableHead>
                  <TableHead>Total Possible</TableHead>
                  <TableHead>Percentage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankings.map((r: any) => (
                  <TableRow key={r.studentId}>
                    {/* A student with nothing counted yet is unranked rather than
                        last — the server sends a null rank for them. */}
                    <TableCell>{r.rank ?? '—'}</TableCell>
                    <TableCell>{r.firstName} {r.lastName}<PaymentStatusDot status={paymentStatuses.get(String(r.studentId))} /><ZeroMarkDot hasZero={zeroMarks.has(String(r.studentId))} /></TableCell>
                    <TableCell>{r.totalPossible > 0 ? r.totalObtained : '—'}</TableCell>
                    <TableCell>{r.totalPossible > 0 ? r.totalPossible : '—'}</TableCell>
                    {/* The server's percentage, not a re-derived one: ranking is
                        sorted on it, and rounding it differently here would show
                        two students as equal while ranking them apart. */}
                    <TableCell>{r.percentage == null ? '—' : `${r.percentage}%`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
