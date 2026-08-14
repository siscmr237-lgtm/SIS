import { AlertTriangle, Filter, Info, Receipt, Search, Trash2 } from 'lucide-react';
import { AcademicYearSelect, useAcademicYear } from '@/lib/academicYear';
import { PaymentStatusDot, useStudentPaymentStatuses } from './PaymentStatus';
import { ZeroMarkDot, useStudentsWithZeroMarks } from './MarkStatus';
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
import { DateFilterInput } from './DateFilterInput';
import { statValueFontSize } from '../utils/statFigure';

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
  type: 'CHARGE' | 'PAYMENT' | 'EXPENSE' | 'PAYROLL' | 'STAFF_PAYMENT' | 'STAFF_CHARGE';
  category: string | null;
  description: string;
  partyName: string | null;
  amount: number;
  entryDate: string;
  paymentMethod: string | null;
  partyType?: 'student' | 'staff' | 'vendor' | null;
  partyCode?: string | null;
  partyClass?: string | null;
  note?: string | null;
  payrollMonth?: string | null;
  payrollBonus?: number | null;
  academicYear?: string | null;
  term?: string | null;
  settlesCode?: string | null;
  settlesDescription?: string | null;
  // True for the charges billed from a class level's fee structure. They are
  // owned by syncLevelFeeCharges, so deleting one is undone the next time that
  // level's fees are saved — the confirmation says so rather than pretending.
  isFeeStructureCharge?: boolean;
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

/**
 * How each transaction type reads, and which way the money went.
 *
 * The five here are the ones the DATA can actually distinguish. Refund is not
 * among them and cannot be: nothing in the schema records one. Every amount is
 * validated strictly positive on the way in, there is no negative counter-entry,
 * and there is no refund/reversal/credit column anywhere on LedgerEntry —
 * "Overpaid" is a computed STATUS meaning a refund may be due, not a record that
 * one happened. Inventing a Refund label would mean labelling something that is
 * not a refund.
 *
 * Staff rows are named separately from student ones because a staff CHARGE and a
 * student CHARGE run in opposite directions — one is money the school owes, the
 * other money owed to it — and a single "Charge" pill would flatten that.
 */
const TX_TYPES: Record<string, { label: string; bg: string; fg: string; inbound: boolean }> = {
  CHARGE: { label: 'Charge', bg: '#EFF6FF', fg: '#1D4ED8', inbound: false },
  PAYMENT: { label: 'Payment', bg: '#ECFDF5', fg: '#05603D', inbound: true },
  EXPENSE: { label: 'Expense', bg: '#FDF3EF', fg: '#C2410C', inbound: false },
  PAYROLL: { label: 'Payroll', bg: '#F5F3FF', fg: '#6D28D9', inbound: false },
  STAFF_PAYMENT: { label: 'Staff payment', bg: '#F5F3FF', fg: '#6D28D9', inbound: false },
  STAFF_CHARGE: { label: 'Staff charge', bg: '#FEF3C7', fg: '#92400E', inbound: false },
};

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
  // Year options come from the school's real range, not just years that happen
  // to have ledger rows, so the filter is consistent with every other screen.
  const { status: yearStatus } = useAcademicYear();
  // Summary rows come from the ledger, which has no payment status on them —
  // resolved by student CODE from the shared students list.
  const paymentStatuses = useStudentPaymentStatuses();
  const zeroMarks = useStudentsWithZeroMarks();
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
  // The row a delete has been asked for but not yet confirmed. The whole row is
  // held, not just its id, so the confirmation can name the amount and party.
  const [txPendingDelete, setTxPendingDelete] = useState<Transaction | null>(null);
  const [txDeleting, setTxDeleting] = useState(false);
  const [txDeleteError, setTxDeleteError] = useState<string | null>(null);
  /** The row whose Details panel is open. Whole row, so the panel needs no refetch. */
  const [txDetail, setTxDetail] = useState<Transaction | null>(null);

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

  /**
   * Deleting one row out of the School Transactions table.
   *
   * The table is a UNION of two different tables, so the row id carries which
   * one it came from — 'ledger-<code>' or 'expense-<code>' — and the delete has
   * to be routed accordingly. Guessing wrong would 404, and hardcoding one
   * endpoint would make the Others bucket (where both kinds sit side by side)
   * half-broken.
   *
   * The refresh afterwards is the same set the damage dialog does, for the same
   * reason: a deleted row moves the stat cards, the per-student balances, and —
   * via the invalidated students roster — the payment-status and zero-mark dots.
   * Nothing is patched locally, so nothing can disagree with the server.
   */
  const txTarget = (t: Transaction): { path: string; kind: 'ledger' | 'expense' } | null => {
    if (t.id.startsWith('ledger-')) return { path: `/ledger/${encodeURIComponent(t.id.slice(7))}`, kind: 'ledger' };
    if (t.id.startsWith('expense-')) return { path: `/expenses/${encodeURIComponent(t.id.slice(8))}`, kind: 'expense' };
    return null;
  };

  /**
   * Where a transaction's record actually lives.
   *
   * No screen in this app addresses a single ledger entry, so the closest real
   * destination is the party's own Finance tab — which is where that entry is
   * listed. ?tab= is the existing deep-link both profiles already read.
   * Navigating to an invented per-entry URL would only 404.
   */
  const openParty = (t: Transaction) => {
    if (!t.partyCode) return;
    if (t.partyType === 'student') {
      onViewStudent({ id: t.partyCode } as Student, 'finance');
    } else if (t.partyType === 'staff') {
      onNavigate('staff');
    }
  };

  const confirmTxDelete = async () => {
    if (!txPendingDelete) return;
    const target = txTarget(txPendingDelete);
    if (!target) {
      setTxDeleteError('This row cannot be deleted from here.');
      return;
    }
    setTxDeleting(true);
    setTxDeleteError(null);
    try {
      await api.delete(target.path);
      // Both events, as the damage dialog does: a ledger delete moves a
      // student's balance and an expense delete moves the school's outgoings,
      // and this table mixes the two, so reporting both is cheaper than
      // reasoning about which screens each one feeds.
      cache.invalidateOn('ledger:write');
      cache.invalidateOn('expense:write');
      setTxPendingDelete(null);
      await Promise.all([fetchDashboard(), fetchStudentPage(studentQuery), fetchTransactionsPage(txQuery)]);
    } catch (e: any) {
      setTxDeleteError(e?.message || 'Failed to delete this record.');
    } finally {
      setTxDeleting(false);
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

      {/* Both finance tables: one line per row, and an edge shadow showing there
          is more to scroll to.

          A <style> block because neither part is expressible inline — one needs
          a descendant selector across every th/td, the other needs multiple
          background layers with different attachments.

          WHY THIS DOES NOT REPRODUCE THE PAGE-WIDE SCROLL. nowrap makes these
          tables wider than the phone, which is exactly the condition that caused
          it last time. The difference is where that width is allowed to land.
          [data-fin-scroll] is a plain block div, so it is 100% of the Card and
          cannot be widened by its contents; the table overflows INSIDE it and
          that div scrolls. What broke before was <main> being a flex item with
          the default min-width:auto, which meant it refused to shrink below its
          content and grew past the viewport instead — fixed by min-w-0 in
          app/(app)/layout.tsx, which still has to hold for this to stay
          contained. Nothing here is a flex or grid item, so nothing re-opens it.

          The shadow is the two-gradient scroll-shadow trick, no JS: the white
          cover layers are `local` so they travel with the content, while the
          dark radial layers are `scroll` so they stay pinned to the container.
          At the far right the cover sits over the shadow and hides it, so the
          hint disappears precisely when there is nothing left to scroll to. */}
      <style>{`
        [data-fin-table] th,
        [data-fin-table] td { white-space: nowrap; }
        /* FILTER PAIRING. Five filters in a two-column grid fell as
           Class|Year, Term|From, To|— which split the date range across two
           rows and left a hole. Letting Term take the whole of its row pushes
           From and To onto one row together: Class|Year, Term, From|To.
           Only below lg, where the grid is two columns; at lg it is five
           across on one line and there is nothing to pair. */
        @media (max-width: 1023.98px) {
          [data-fin-filters] > [data-fin-filter="term"] { grid-column: span 2; }
        }
        [data-fin-scroll] {
          overflow-x: auto;
          background:
            linear-gradient(to right, #FFFFFF 30%, rgba(255, 255, 255, 0)) left center,
            linear-gradient(to left,  #FFFFFF 30%, rgba(255, 255, 255, 0)) right center,
            radial-gradient(farthest-side at 0 50%, rgba(15, 35, 69, 0.16), rgba(15, 35, 69, 0)) left center,
            radial-gradient(farthest-side at 100% 50%, rgba(15, 35, 69, 0.16), rgba(15, 35, 69, 0)) right center;
          background-repeat: no-repeat;
          background-size: 34px 100%, 34px 100%, 12px 100%, 12px 100%;
          background-attachment: local, local, scroll, scroll;
        }
      `}</style>

      {/* One line at every width. Three across on a phone leaves roughly 87px
          of usable card, so the figure has to size itself down rather than the
          row breaking — same treatment as the dashboard tiles, and the same
          shared sizer so the two cannot drift apart. `compact` is the tighter
          scale three-up needs; FCFA is a separate span so the only place a line
          may break is between the number and its unit, never mid-figure. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '0.5rem',
          marginBottom: '2rem',
        }}
      >
        {[
          { label: 'Total Charged', value: totalCharged, color: '#111827', highlight: false },
          { label: 'Total Collected', value: totalCollected, color: '#059669', highlight: false },
          {
            label: 'Outstanding',
            value: totalOutstanding,
            color: totalOutstanding > 0 ? '#DC2626' : '#111827',
            highlight: totalOutstanding > 0,
          },
        ].map((c) => {
          const figure = c.value.toLocaleString();
          return (
            <Card
              key={c.label}
              style={{
                padding: '0.625rem 0.75rem',
                minWidth: 0,
                ...(c.highlight ? { backgroundColor: '#FEF2F2', borderColor: '#FECACA' } : {}),
              }}
            >
              <p
                className="text-gray-400 uppercase tracking-wide"
                style={{ fontSize: '0.625rem', marginBottom: 2, lineHeight: 1.2 }}
              >
                {c.label}
              </p>
              <p style={{ margin: 0, lineHeight: 1.15, overflow: 'hidden' }}>
                <span
                  title={`${figure} FCFA`}
                  style={{
                    fontSize: statValueFontSize(figure, { compact: true }),
                    fontWeight: 500,
                    color: c.color,
                    whiteSpace: 'nowrap',
                    display: 'inline-block',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    verticalAlign: 'bottom',
                  }}
                >
                  {figure}
                </span>
                <span
                  className="text-gray-500"
                  style={{ fontSize: '0.625rem', marginLeft: 3, display: 'inline-block', verticalAlign: 'bottom' }}
                >
                  FCFA
                </span>
              </p>
            </Card>
          );
        })}
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
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 flex-1" style={{ minWidth: 0 }} data-fin-filters="">
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
                  <AcademicYearSelect
                    value={studentQuery.academicYear}
                    onChange={(v) => updateStudentFilter({ academicYear: v })}
                    years={yearStatus?.years ?? academicYearOptions}
                    includeAll
                    allLabel="All"
                    style={{ borderRadius: 9999 }}
                  />
                </div>
                <div data-fin-filter="term">
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
                {/* Matched to the three selects above: same pill radius, same
                    h-9 px-3 box, and the calendar 12px in from the right where
                    their chevrons sit. Before this the icon was a size-20 on the
                    LEFT at left-3 with the browser's own arrow crowding the
                    right edge, so these two read as a different kind of control
                    from the three beside them. */}
                <div>
                  <Label className="text-xs text-gray-500 mb-1">From Date</Label>
                  <DateFilterInput
                    value={studentQuery.dateFrom}
                    onChange={(v) => updateStudentFilter({ dateFrom: v })}
                    style={{ borderRadius: 9999 }}
                    /* The real input is invisible, so it cannot be reached by
                       its visible Label the way a normal field would be. */
                    aria-label="From date"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-1">To Date</Label>
                  <DateFilterInput
                    value={studentQuery.dateTo}
                    onChange={(v) => updateStudentFilter({ dateTo: v })}
                    style={{ borderRadius: 9999 }}
                    aria-label="To date"
                  />
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
          /* The class is what actually guarantees the scroll container (it is
             already in the pre-compiled build and was doing this job before);
             the data attribute only adds the edge shadow. Keeping the class
             means a problem with the style block can never silently turn
             overflow off and let the table push the page wide again.

             A bare block comment, not {@literal /*…*​/} in braces: this sits in
             the expression slot of a ternary, where braces open an object
             literal rather than a JSX comment. */
          <div className="overflow-x-auto" data-fin-scroll="">
            <table className="w-full text-sm" data-fin-table="">
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
                      <PaymentStatusDot status={paymentStatuses.get(String(student.id))} /><ZeroMarkDot hasZero={zeroMarks.has(String(student.id))} />
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
          /* The class is what actually guarantees the scroll container (it is
             already in the pre-compiled build and was doing this job before);
             the data attribute only adds the edge shadow. Keeping the class
             means a problem with the style block can never silently turn
             overflow off and let the table push the page wide again.

             A bare block comment, not {@literal /*…*​/} in braces: this sits in
             the expression slot of a ternary, where braces open an object
             literal rather than a JSX comment. */
          <div className="overflow-x-auto" data-fin-scroll="">
            <table className="w-full text-sm" data-fin-table="">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Party</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      No {BUCKETS.find(b => b.id === txQuery.bucket)?.label.toLowerCase()} transactions found.
                    </td>
                  </tr>
                ) : transactions.map((t) => {
                  const kind = TX_TYPES[t.type] ?? TX_TYPES.CHARGE;
                  return (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(t.entryDate)}</td>
                      <td className="px-4 py-3 text-gray-600">{t.category ?? '—'}</td>
                      {/* Name and class on ONE line, separated by a middot. The
                          class used to be a display:block span underneath, which
                          was the only deliberate two-line cell in either table.
                          It stays visually secondary — smaller and grey — so the
                          name is still what the eye lands on. */}
                      <td className="px-4 py-3 text-gray-900">
                        {t.partyName ?? '—'}
                        {t.partyClass && (
                          <span className="text-xs text-gray-400" style={{ marginLeft: 6 }}>
                            · {t.partyClass}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {/* Inline colours: src/index.css is a pre-compiled
                            Tailwind build, so a utility not already in it
                            renders as nothing at all. */}
                        <span
                          style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                            fontSize: '0.75rem', fontWeight: 500, whiteSpace: 'nowrap',
                            backgroundColor: kind.bg, color: kind.fg,
                          }}
                        >
                          {kind.label}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-right font-medium whitespace-nowrap"
                        style={{ color: kind.inbound ? '#059669' : '#111827' }}
                      >
                        {kind.inbound ? '+' : ''}{t.amount.toLocaleString()} FCFA
                      </td>
                      <td className="px-4 py-3">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => setTxDetail(t)}
                            aria-label={`Details for ${t.description}, ${t.amount.toLocaleString()} FCFA`}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '3px 9px', borderRadius: 6,
                              border: '1px solid #D1D5DB', background: '#FFFFFF',
                              color: '#0f2345', fontSize: '0.75rem', fontWeight: 500,
                              cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                          >
                            <Info size={13} />
                            Details
                          </button>
                          {txTarget(t) && (
                            <button
                              type="button"
                              title="Delete this record"
                              aria-label={`Delete ${t.description}, ${t.amount.toLocaleString()} FCFA`}
                              onClick={() => { setTxDeleteError(null); setTxPendingDelete(t); }}
                              disabled={txDeleting}
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                padding: 4, borderRadius: 6, border: 'none', background: 'transparent',
                                color: '#DC2626', cursor: txDeleting ? 'default' : 'pointer',
                                opacity: txDeleting ? 0.5 : 1,
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

      {/* Details for one transaction. Everything shown here already came down
          with the row, so opening it costs no request — and the columns can stay
          narrow enough to read on a phone precisely because the long fields live
          in here rather than in the table. */}
      <Dialog open={txDetail !== null} onOpenChange={(open) => { if (!open) setTxDetail(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transaction details</DialogTitle>
            <DialogDescription>
              {txDetail ? (TX_TYPES[txDetail.type]?.label ?? txDetail.type) : ''} · {txDetail ? formatDate(txDetail.entryDate) : ''}
            </DialogDescription>
          </DialogHeader>

          {txDetail && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {([
                ['Description', txDetail.description],
                ['Party', txDetail.partyName],
                ['Class', txDetail.partyClass],
                ['Category', txDetail.category],
                ['Amount', `${txDetail.amount.toLocaleString()} FCFA`],
                ['Payment method', txDetail.paymentMethod],
                ['Payroll month', txDetail.payrollMonth],
                ['Of which bonus', txDetail.payrollBonus ? `${txDetail.payrollBonus.toLocaleString()} FCFA` : null],
                ['Academic year', txDetail.academicYear],
                ['Term', txDetail.term],
                ['Note', txDetail.note],
                ['Reference', String(txDetail.id).replace(/^(ledger|expense)-/, '')],
              ] as [string, string | null | undefined][])
                // Absent fields are dropped rather than shown as a dash: a panel
                // of em-dashes reads as missing data instead of as not applicable.
                .filter(([, v]) => v !== null && v !== undefined && v !== '')
                .map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', gap: '1rem', alignItems: 'baseline' }}>
                    <span className="text-xs text-gray-500" style={{ width: 118, flexShrink: 0 }}>{label}</span>
                    <span className="text-sm" style={{ minWidth: 0, wordBreak: 'break-word' }}>{value}</span>
                  </div>
                ))}

              {/* Where this record involves a payment, link through to it. The
                  ledger has no per-entry screen, so the destination is the
                  party's own Finance tab, which is where the entry is listed —
                  see openParty. A payment that settled a specific charge names
                  that charge, since the pair is the whole story. */}
              {txDetail.settlesCode && (
                <div
                  style={{
                    marginTop: '0.25rem', padding: '0.55rem 0.7rem', borderRadius: 6,
                    border: '1px solid #A7F3D0', backgroundColor: '#ECFDF5', color: '#05603D',
                  }}
                >
                  <p className="text-xs" style={{ fontWeight: 600 }}>Settles a specific charge</p>
                  <p className="text-xs" style={{ marginTop: 2 }}>
                    {txDetail.settlesDescription ?? txDetail.settlesCode} ({txDetail.settlesCode})
                  </p>
                </div>
              )}

              {txDetail.partyType === 'student' || txDetail.partyType === 'staff' ? (
                <Button
                  variant="outline"
                  style={{ marginTop: '0.35rem' }}
                  onClick={() => { const t = txDetail; setTxDetail(null); openParty(t); }}
                >
                  Open {txDetail.partyType === 'student' ? "student's" : "staff member's"} finances
                </Button>
              ) : txDetail.type === 'EXPENSE' ? (
                <Button
                  variant="outline"
                  style={{ marginTop: '0.35rem' }}
                  onClick={() => { setTxDetail(null); onNavigate('expenses'); }}
                >
                  Open expenses
                </Button>
              ) : null}
            </div>
          )}

          <div className="flex justify-end">
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>

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
                          <SelectItem key={s.id} value={s.id}>{s.firstName} {s.lastName}<PaymentStatusDot status={paymentStatuses.get(String(s.id))} /><ZeroMarkDot hasZero={zeroMarks.has(String(s.id))} /> — {s.class}</SelectItem>
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

      {/* Delete confirmation for a School Transactions row. Not window.confirm:
          what the deletion costs depends on the row, and saying so is the whole
          reason for asking. */}
      <Dialog
        open={txPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !txDeleting) { setTxPendingDelete(null); setTxDeleteError(null); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete this {txPendingDelete?.type === 'PAYMENT' ? 'payment' : txPendingDelete?.type === 'EXPENSE' ? 'expense' : 'charge'}?
            </DialogTitle>
            <DialogDescription>
              {txPendingDelete && (
                <>
                  <strong>{txPendingDelete.description}</strong>{' '}
                  — {txPendingDelete.amount.toLocaleString()} FCFA on{' '}
                  {formatDate(txPendingDelete.entryDate)}
                  {txPendingDelete.partyName ? `, ${txPendingDelete.partyName}` : ''}.{' '}
                  {txPendingDelete.type === 'PAYMENT'
                    ? 'Removing it means the money is treated as never received, so the balance it settled goes back up and the fee status may change.'
                    : txPendingDelete.type === 'EXPENSE'
                    ? 'Removing it takes the amount back out of the school’s recorded spending.'
                    : 'Removing it takes the amount off what was owed.'}
                  {' '}This cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {/* Honest about the one case where "deleted" does not mean gone. */}
          {txPendingDelete?.isFeeStructureCharge && (
            <p className="text-sm" style={{ color: '#e0552e' }}>
              This charge is billed from the class level&apos;s fee structure. Deleting it here
              un-bills the student for now, but it will be re-created the next time that level&apos;s
              fees are saved. To stop billing it, change the fee structure instead.
            </p>
          )}
          {txDeleteError && <p className="text-sm" style={{ color: '#e0552e' }}>{txDeleteError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={txDeleting} onClick={() => setTxPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmTxDelete} disabled={txDeleting}>
              {txDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
