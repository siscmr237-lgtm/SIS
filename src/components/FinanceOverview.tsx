import { AlertTriangle, Calendar, Filter, Receipt, Search } from 'lucide-react';
import { PaymentStatusDot, useStudentPaymentStatuses } from './PaymentStatus';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useCachedResource, useSisCache } from '../lib/SisCache';
import { formatTermLabel } from '../utils/academicTerm';
import { NavigationPage } from '../App';
import { Student } from '../types';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface FinanceOverviewProps {
  onNavigate: (page: NavigationPage) => void;
  onViewStudent: (student: Student, tab?: string) => void;
}

interface StudentRow {
  student: Student;
  totalCharged: number;
  totalPaid: number;
  balance: number;
}

type Bucket = 'fees' | 'payroll' | 'others';

interface Transaction {
  id: string;
  bucket: Bucket;
  type: 'CHARGE' | 'PAYMENT' | 'EXPENSE';
  category: string | null;
  description: string;
  partyName: string | null;
  amount: number;
  entryDate: string;
  paymentMethod: string | null;
}

interface StudentQuery {
  page: number;
  search: string;
  classFilter: string;
  dateFrom: string;
  dateTo: string;
  academicYear: string;
  term: string;
}

interface TransactionQuery {
  page: number;
  bucket: Bucket;
}

const BUCKETS: { id: Bucket; label: string }[] = [
  { id: 'fees', label: 'Fees' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'others', label: 'Others' },
];

const TERM_OPTIONS = ['Term 1', 'Term 2', 'Term 3'];
const PAGE_SIZE = 25;

function formatDate(value: string | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch {
    return value;
  }
}

export function FinanceOverview({ onNavigate, onViewStudent }: FinanceOverviewProps) {
  // Summary rows come from the ledger, which has no payment status on them —
  // resolved by student CODE from the shared students list.
  const paymentStatuses = useStudentPaymentStatuses();
  const [summary, setSummary] = useState<{ feesCollected: number; outstandingFees: number } | null>(null);
  const cache = useSisCache();

  // --- Student Transactions table: filters, pagination, data ---
  const [defaultsReady, setDefaultsReady] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [studentQuery, setStudentQuery] = useState<StudentQuery>({
    page: 1, search: '', classFilter: 'all', dateFrom: '', dateTo: '', academicYear: 'all', term: 'all',
  });
  const [studentRows, setStudentRows] = useState<StudentRow[]>([]);
  const [studentLoading, setStudentLoading] = useState(true);
  const [studentTotalPages, setStudentTotalPages] = useState(1);
  // Class names are reference data, cached and shared with the other sections.
  // The money on this screen is not — see fetchDashboard and the two table
  // fetchers below, all of which go straight to the network every time.
  const { data: classList } = useCachedResource<any[]>('classes', () => api.get('/classes'));
  const classOptions = (classList ?? []).map((c: any) => c.name);
  const [academicYearOptions, setAcademicYearOptions] = useState<string[]>([]);

  // --- School Transactions table: filter, pagination, data ---
  const [txQuery, setTxQuery] = useState<TransactionQuery>({ page: 1, bucket: 'fees' });
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [txTotalPages, setTxTotalPages] = useState(1);

  const today = new Date().toISOString().split('T')[0];
  const [openDamage, setOpenDamage] = useState(false);
  const [damageStudents, setDamageStudents] = useState<any[]>([]);
  const [damageStaff, setDamageStaff] = useState<any[]>([]);
  const [damageForm, setDamageForm] = useState({
    responsibleType: 'student',
    studentId: '',
    staffName: '',
    description: '',
    amount: '',
    entryDate: today,
    paymentMethod: '',
  });
  const [damageSubmitting, setDamageSubmitting] = useState(false);
  const [damageError, setDamageError] = useState<string | null>(null);
  const [damageResult, setDamageResult] = useState<string | null>(null);

  function updateStudentFilter(patch: Partial<Omit<StudentQuery, 'page'>>) {
    setStudentQuery(q => ({ ...q, ...patch, page: 1 }));
  }

  // Debounce the search box so every keystroke doesn't re-query the backend.
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== studentQuery.search) updateStudentFilter({ search: searchInput });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const fetchStudentPage = async (query: StudentQuery) => {
    setStudentLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(query.page));
      params.set('pageSize', String(PAGE_SIZE));
      if (query.search) params.set('q', query.search);
      if (query.classFilter !== 'all') params.set('class', query.classFilter);
      if (query.dateFrom) params.set('dateFrom', query.dateFrom);
      if (query.dateTo) params.set('dateTo', query.dateTo);
      if (query.academicYear !== 'all') params.set('academicYear', query.academicYear);
      if (query.term !== 'all') params.set('term', query.term);
      const data = await api.get(`/ledger/student-summary?${params.toString()}`);
      setStudentRows(data?.rows || []);
      setStudentTotalPages(data?.totalPages || 1);
    } catch {
      setStudentRows([]);
      setStudentTotalPages(1);
    } finally {
      setStudentLoading(false);
    }
  };

  const fetchTransactionsPage = async (query: TransactionQuery) => {
    setTransactionsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(query.page));
      params.set('pageSize', String(PAGE_SIZE));
      params.set('bucket', query.bucket);
      const data = await api.get(`/ledger/transactions?${params.toString()}`);
      setTransactions(data?.transactions || []);
      setTxTotalPages(data?.totalPages || 1);
    } catch {
      setTransactions([]);
      setTxTotalPages(1);
    } finally {
      setTransactionsLoading(false);
    }
  };

  // The stat cards are money, so they are fetched on every visit and never
  // stored — see the 'fresh' policy in SisCache.
  const fetchDashboard = async () => {
    try {
      const data = await api.get('/dashboard');
      setSummary(data);
    } catch {}
  };

  // One-time setup: stat cards, class options, academic year options, and the
  // school's current academic year/term (the filters default to these, not "All").
  useEffect(() => {
    let cancelled = false;

    fetchDashboard();

    Promise.all([
      api.get('/ledger/current-period').catch(() => ({ academicYear: null, term: null })),
      api.get('/ledger/academic-years').catch(() => []),
    ]).then(([current, years]) => {
      if (cancelled) return;
      const currentYear = current?.academicYear ?? null;
      const currentTerm = current?.term ?? null;
      setAcademicYearOptions(Array.from(new Set([currentYear, ...(Array.isArray(years) ? years : [])].filter(Boolean))) as string[]);
      setStudentQuery(q => ({ ...q, academicYear: currentYear ?? 'all', term: currentTerm ?? 'all' }));
      setDefaultsReady(true);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch the Student Transactions page whenever its page or any filter changes.
  useEffect(() => {
    if (!defaultsReady) return;
    fetchStudentPage(studentQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultsReady, studentQuery]);

  // Re-fetch the School Transactions page whenever its page or bucket filter changes.
  useEffect(() => {
    fetchTransactionsPage(txQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txQuery]);

  useEffect(() => {
    if (!openDamage) return;
    api.get('/students').then(data => setDamageStudents(data || [])).catch(() => {});
    api.get('/staff').then(data => setDamageStaff(data || [])).catch(() => {});
  }, [openDamage]);

  const handleDamageSubmit = async () => {
    setDamageSubmitting(true);
    setDamageError(null);
    setDamageResult(null);
    try {
      const body: any = {
        responsibleType: damageForm.responsibleType,
        description: damageForm.description,
        amount: Number(damageForm.amount),
        entryDate: damageForm.entryDate,
        ...(damageForm.paymentMethod ? { paymentMethod: damageForm.paymentMethod } : {}),
      };
      if (damageForm.responsibleType === 'student') body.studentId = damageForm.studentId;
      if (damageForm.responsibleType === 'staff') body.staffName = damageForm.staffName;

      const result = await api.post('/expenses/damage', body);
      if (result.type === 'ledger_charge') {
        const s = result.record.student;
        setDamageResult(`Damage charged to ${s.firstName} ${s.lastName}.`);
      } else {
        setDamageResult('Damage expense recorded.');
      }
      // Damage lands as either a student ledger charge or a school expense
      // depending on who is responsible, so report both.
      cache.invalidateOn('expense:write');
      cache.invalidateOn('ledger:write');
      await Promise.all([fetchDashboard(), fetchStudentPage(studentQuery), fetchTransactionsPage(txQuery)]);
    } catch (e: any) {
      setDamageError(e.message || 'Failed to record damage');
    } finally {
      setDamageSubmitting(false);
    }
  };

  const totalCharged = summary ? summary.feesCollected + summary.outstandingFees : 0;
  const totalCollected = summary?.feesCollected ?? 0;
  const totalOutstanding = summary?.outstandingFees ?? 0;

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl mb-2">Finance</h1>
          <p className="text-gray-600">School-wide financial overview</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => { setOpenDamage(true); setDamageResult(null); setDamageError(null); }}
          >
            <AlertTriangle size={20} className="mr-2" />
            Add Damage
          </Button>
          <Button variant="outline" onClick={() => onNavigate('expenses')}>
            <Receipt size={20} className="mr-2" />
            Expenses
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
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

      <Card className="mb-8">
        <div className="p-4 border-b">
          <h2 className="text-base font-medium mb-3">Student Transactions</h2>
          <div className="border rounded-lg p-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-2 shrink-0">
                <Filter size={16} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-600">Filters</span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 flex-1">
                <div>
                  <Label className="text-xs text-gray-500 mb-1">Class</Label>
                  <Select value={studentQuery.classFilter} onValueChange={(v: string) => updateStudentFilter({ classFilter: v })}>
                    <SelectTrigger style={{ borderRadius: 9999 }}><SelectValue placeholder="All Classes" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classes</SelectItem>
                      {classOptions.map(name => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1">Academic Year</Label>
                  <Select value={studentQuery.academicYear} onValueChange={(v: string) => updateStudentFilter({ academicYear: v })}>
                    <SelectTrigger style={{ borderRadius: 9999 }}><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {academicYearOptions.map(y => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1">Term</Label>
                  <Select value={studentQuery.term} onValueChange={(v: string) => updateStudentFilter({ term: v })}>
                    <SelectTrigger style={{ borderRadius: 9999 }}><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {TERM_OPTIONS.map(t => (
                        <SelectItem key={t} value={t}>{formatTermLabel(t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1">From Date</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <Input
                      type="date"
                      value={studentQuery.dateFrom}
                      onChange={e => updateStudentFilter({ dateFrom: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1">To Date</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                    <Input
                      type="date"
                      value={studentQuery.dateTo}
                      onChange={e => updateStudentFilter({ dateTo: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <Input
              placeholder="Search by name, ID, or class..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {studentLoading ? (
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
                {studentRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                      No students found.
                    </td>
                  </tr>
                ) : studentRows.map(({ student, totalCharged, totalPaid, balance }) => (
                  <tr
                    key={student.id}
                    className={`border-b last:border-0 hover:bg-gray-50 ${balance > 0 ? 'bg-red-50/40' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onViewStudent(student)}
                        className="text-blue-600 hover:underline font-medium text-left"
                      >
                        {student.firstName} {student.lastName}
                      </button>
                      <PaymentStatusDot status={paymentStatuses.get(String(student.id))} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{student.class}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{totalCharged.toLocaleString()} FCFA</td>
                    <td className="px-4 py-3 text-right text-green-600">{totalPaid.toLocaleString()} FCFA</td>
                    <td className={`px-4 py-3 text-right font-medium ${balance > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {balance.toLocaleString()} FCFA
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-4 border-t flex items-center justify-between">
          <p className="text-sm text-gray-500">Page {studentQuery.page} of {studentTotalPages}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={studentQuery.page <= 1}
              onClick={() => setStudentQuery(q => ({ ...q, page: q.page - 1 }))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={studentQuery.page >= studentTotalPages}
              onClick={() => setStudentQuery(q => ({ ...q, page: q.page + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-medium">School Transactions</h2>
          <div className="flex gap-2">
            {BUCKETS.map(b => (
              <button
                key={b.id}
                onClick={() => setTxQuery({ page: 1, bucket: b.id })}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  txQuery.bucket === b.id
                    ? 'bg-blue-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {transactionsLoading ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Party</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                      No {BUCKETS.find(b => b.id === txQuery.bucket)?.label.toLowerCase()} transactions found.
                    </td>
                  </tr>
                ) : transactions.map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(t.entryDate)}</td>
                    <td className="px-4 py-3 text-gray-900">{t.description}</td>
                    <td className="px-4 py-3 text-gray-600">{t.partyName ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{t.category ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        t.type === 'PAYMENT'
                          ? 'bg-green-100 text-green-700'
                          : t.type === 'EXPENSE'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {t.type === 'CHARGE' ? 'Charge' : t.type === 'PAYMENT' ? 'Payment' : 'Expense'}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                      t.type === 'PAYMENT' ? 'text-green-600' : 'text-gray-900'
                    }`}>
                      {t.type === 'PAYMENT' ? '+' : ''}{t.amount.toLocaleString()} FCFA
                    </td>
                    <td className="px-4 py-3 text-gray-500">{t.paymentMethod ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-4 border-t flex items-center justify-between">
          <p className="text-sm text-gray-500">Page {txQuery.page} of {txTotalPages}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={txQuery.page <= 1}
              onClick={() => setTxQuery(q => ({ ...q, page: q.page - 1 }))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={txQuery.page >= txTotalPages}
              onClick={() => setTxQuery(q => ({ ...q, page: q.page + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={openDamage} onOpenChange={(open) => { setOpenDamage(open); if (!open) { setDamageResult(null); setDamageError(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Damage</DialogTitle>
            <DialogDescription>
              Routes to the student's ledger (if student) or records a school expense (if staff/general).
            </DialogDescription>
          </DialogHeader>
          {damageResult ? (
            <div className="py-4 space-y-4">
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">{damageResult}</p>
              <div className="flex justify-end">
                <Button onClick={() => { setOpenDamage(false); setDamageResult(null); }}>Done</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Responsible Party</Label>
                  <Select value={damageForm.responsibleType} onValueChange={v => setDamageForm(f => ({ ...f, responsibleType: v, studentId: '', staffName: '' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                      <SelectItem value="general">General (no responsible party)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {damageForm.responsibleType === 'student' && (
                  <div>
                    <Label>Student</Label>
                    <Select value={damageForm.studentId} onValueChange={v => setDamageForm(f => ({ ...f, studentId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                      <SelectContent>
                        {damageStudents.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}<PaymentStatusDot status={paymentStatuses.get(String(s.id))} /> — {s.class}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {damageForm.responsibleType === 'staff' && (
                  <div>
                    <Label>Staff Member</Label>
                    <Select value={damageForm.staffName} onValueChange={v => setDamageForm(f => ({ ...f, staffName: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                      <SelectContent>
                        {damageStaff.map((s: any) => (
                          <SelectItem key={s.id} value={`${s.firstName} ${s.lastName}`}>
                            {s.firstName} {s.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Description</Label>
                  <Input value={damageForm.description} onChange={e => setDamageForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Broken window in classroom 3B" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Amount (FCFA)</Label>
                    <Input type="number" min="1" value={damageForm.amount} onChange={e => setDamageForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={damageForm.entryDate} onChange={e => setDamageForm(f => ({ ...f, entryDate: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Payment Method <span className="text-gray-400 font-normal">(optional)</span></Label>
                  <Select value={damageForm.paymentMethod} onValueChange={v => setDamageForm(f => ({ ...f, paymentMethod: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {damageError && <p className="text-sm text-red-600">{damageError}</p>}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={damageSubmitting} onClick={() => setOpenDamage(false)}>Cancel</Button>
                <Button onClick={handleDamageSubmit} disabled={damageSubmitting}>
                  {damageSubmitting ? 'Saving...' : 'Record Damage'}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
