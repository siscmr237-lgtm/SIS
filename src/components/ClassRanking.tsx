import { useEffect, useState } from 'react';
import { NavigationPage } from '../App';
import { api } from '@/lib/api';
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
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState('');
  const [{ term, academicYear }, setPeriod] = useState(() => getDefaultTermFields());
  const [rankings, setRankings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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

  const refresh = async () => {
    if (!classId || !term || !academicYear) return;
    setLoading(true);
    try {
      const data = await api.get(`/test-exams/class-ranking?classId=${classId}&term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear)}`);
      setRankings(data?.rankings || []);
    } catch {
      setRankings([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, term, academicYear]);

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
            <Input
              placeholder="2026/2027"
              value={academicYear}
              onChange={e => setPeriod(p => ({ ...p, academicYear: e.target.value }))}
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
                    <TableCell>{r.rank}</TableCell>
                    <TableCell>{r.firstName} {r.lastName}</TableCell>
                    <TableCell>{r.totalObtained}</TableCell>
                    <TableCell>{r.totalPossible}</TableCell>
                    <TableCell>{r.totalPossible > 0 ? `${Math.round((r.totalObtained / r.totalPossible) * 100)}%` : '—'}</TableCell>
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
