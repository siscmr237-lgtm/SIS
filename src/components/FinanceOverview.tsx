import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSisCache } from '../lib/SisCache';
import { NavigationPage } from '../App';
import { Student } from '../types';
import { Card } from './ui/card';
import { Input } from './ui/input';

interface FinanceOverviewProps {
  onNavigate: (page: NavigationPage) => void;
  onViewStudent: (student: Student) => void;
}

interface StudentRow {
  student: Student;
  totalCharged: number;
  totalPaid: number;
  balance: number | null; // null = still loading
}

export function FinanceOverview({ onNavigate, onViewStudent }: FinanceOverviewProps) {
  const [summary, setSummary] = useState<{ feesCollected: number; outstandingFees: number } | null>(null);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const cache = useSisCache();

  useEffect(() => {
    let cancelled = false;

    const cachedDash     = cache.get<any>('dashboard');
    const cachedStudents = cache.get<Student[]>('students');
    const cachedSummary  = cache.get<any[]>('ledger-summary');
    if (cachedDash && cachedStudents && cachedSummary) {
      setSummary(cachedDash);
      const map: Record<string, any> = {};
      for (const e of cachedSummary) map[e.studentId] = e;
      setRows(cachedStudents.map(s => {
        const fin = map[s.id] ?? { totalCharged: 0, totalPaid: 0, balance: 0 };
        return { student: s, totalCharged: fin.totalCharged, totalPaid: fin.totalPaid, balance: fin.balance };
      }));
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const [dashRes, studentsRes, summaryRes] = await Promise.allSettled([
          api.get('/dashboard'),
          api.get('/students'),
          api.get('/ledger/summary'),
        ]);
        if (cancelled) return;

        const dashData = dashRes.status === 'fulfilled' ? dashRes.value : null;
        if (dashData) { cache.set('dashboard', dashData); setSummary(dashData); }

        const students: Student[] = studentsRes.status === 'fulfilled' && Array.isArray(studentsRes.value) && studentsRes.value.length > 0
          ? studentsRes.value
          : [];
        if (students.length > 0) cache.set('students', students);

        const summaryData: any[] = summaryRes.status === 'fulfilled' && Array.isArray(summaryRes.value)
          ? summaryRes.value
          : [];
        if (summaryData.length > 0) cache.set('ledger-summary', summaryData);

        const map: Record<string, any> = {};
        for (const e of summaryData) map[e.studentId] = e;
        setRows(students.map(s => {
          const fin = map[s.id] ?? { totalCharged: 0, totalPaid: 0, balance: 0 };
          return { student: s, totalCharged: fin.totalCharged, totalPaid: fin.totalPaid, balance: fin.balance };
        }));
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    return (
      r.student.firstName.toLowerCase().includes(q) ||
      r.student.lastName.toLowerCase().includes(q) ||
      r.student.id.toLowerCase().includes(q) ||
      r.student.class.toLowerCase().includes(q)
    );
  });

  const totalCharged = summary ? summary.feesCollected + summary.outstandingFees : 0;
  const totalCollected = summary?.feesCollected ?? 0;
  const totalOutstanding = summary?.outstandingFees ?? 0;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">Finance</h1>
        <p className="text-gray-600">School-wide financial overview</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Charged</p>
          <p className="text-2xl font-medium text-gray-900">{totalCharged.toLocaleString()} FCFA</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Collected</p>
          <p className="text-2xl font-medium text-green-600">{totalCollected.toLocaleString()} FCFA</p>
        </Card>
        <Card className={`p-4 ${totalOutstanding > 0 ? 'bg-red-50 border-red-200' : ''}`}>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Outstanding</p>
          <p className={`text-2xl font-medium ${totalOutstanding > 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {totalOutstanding.toLocaleString()} FCFA
          </p>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <Input
              placeholder="Search by name, ID, or class..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {loading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium text-right">Charged</th>
                  <th className="px-4 py-3 font-medium text-right">Paid</th>
                  <th className="px-4 py-3 font-medium text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                      No students found.
                    </td>
                  </tr>
                ) : filtered.map(({ student, totalCharged, totalPaid, balance }) => (
                  <tr
                    key={student.id}
                    className={`border-b last:border-0 hover:bg-gray-50 ${
                      balance !== null && balance > 0 ? 'bg-red-50/40' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onViewStudent(student)}
                        className="text-blue-600 hover:underline font-medium text-left"
                      >
                        {student.firstName} {student.lastName}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{student.class}</td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {balance === null ? '—' : `${totalCharged.toLocaleString()} FCFA`}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600">
                      {balance === null ? '—' : `${totalPaid.toLocaleString()} FCFA`}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${
                      balance === null
                        ? 'text-gray-400'
                        : balance > 0 ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {balance === null ? '...' : `${balance.toLocaleString()} FCFA`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
