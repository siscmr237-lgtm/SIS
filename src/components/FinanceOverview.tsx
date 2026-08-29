import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Download, Filter, Info, Megaphone, Receipt, Search, Trash2 } from 'lucide-react';
import { AcademicYearSelect, useAcademicYear } from '@/lib/academicYear';
import { PaymentStatusDot, useStudentPaymentStatuses } from './PaymentStatus';
import { ZeroMarkDot, useStudentsWithZeroMarks } from './MarkStatus';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { TableLoader } from './ContentLoader';
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
import { ThreePartDateInput } from './ThreePartDateInput';
import { statValueFontSize } from '../utils/statFigure';
import { PAYMENT_METHODS } from '../utils/paymentMethods';
import { PaymentConfirmationDialog } from './PaymentConfirmationDialog';
import { generateTransactionInvoice } from '../utils/pdfGenerator';

interface FinanceOverviewProps {
  onNavigate: (page: NavigationPage) => void;
  onViewStudent: (student: Student, tab?: string) => void;
}

/**
 * One row of the Student Transactions table — a single ledger entry against a
 * single student, not that student's rollup. `student` is the whole record
 * because the Student cell links through to the profile, and that screen reads
 * the student it is handed rather than refetching it.
 */
interface StudentTransactionRow {
  id: string;
  type: 'CHARGE' | 'PAYMENT';
  student: Student;
  studentClass: string | null;
  category: string | null;
  description: string;
  amount: number;
  entryDate: string;
  paymentMethod: string | null;
  /** "2026/2027-0042". Payments only; null on every charge. */
  receiptNumber: string | null;
}

/**
 * One row of the School Transactions table — the school's own OUTGOINGS, which
 * is payroll and expenses and nothing else.
 *
 * Student fees are not here at all: they are money coming in, they are
 * per-student, and the Student Transactions table directly above is already
 * their log. That is why there is no student party type and no fee-structure
 * flag on this shape — neither can occur in a row this table can hold.
 */
interface Transaction {
  id: string;
  type: 'CHARGE' | 'PAYMENT' | 'EXPENSE' | 'PAYROLL' | 'STAFF_PAYMENT' | 'STAFF_CHARGE';
  category: string | null;
  description: string;
  partyName: string | null;
  amount: number;
  entryDate: string;
  paymentMethod: string | null;
  partyType?: 'staff' | 'vendor' | null;
  partyCode?: string | null;
  note?: string | null;
  payrollMonth?: string | null;
  payrollBonus?: number | null;
  academicYear?: string | null;
  term?: string | null;
  settlesCode?: string | null;
  settlesDescription?: string | null;
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
}

const TERM_OPTIONS = ['Term 1', 'Term 2', 'Term 3'];
// Ten rows a page, in both tables. Each is a transaction log read a screenful
// at a time, and ten is short enough to take in at once — the two arrows under
// the table are how the rest is reached.
const STUDENT_PAGE_SIZE = 10;
const PAGE_SIZE = 10;

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

/**
 * dd/mm/yyyy, read off the UTC parts rather than the viewer's local ones.
 *
 * A ledger entryDate is a DATE, not a moment: every writer builds it from a
 * date-only field, so it arrives as midnight UTC. Handing that to
 * toLocaleDateString — which is what the rest of the app does — reads it in the
 * viewer's zone, and anywhere behind UTC midnight rolls back to the previous
 * day, so a payment taken on the 21st displays as the 20th. Formatting the UTC
 * parts gives the date that was actually recorded, wherever it is being read.
 */
function formatDateNumeric(value: string | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
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
  const [studentTxRows, setStudentTxRows] = useState<StudentTransactionRow[]>([]);
  /** The payment whose WhatsApp receipt is being confirmed, or null. */
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const [studentLoading, setStudentLoading] = useState(true);
  const [studentTotalPages, setStudentTotalPages] = useState(1);
  // The filters start collapsed behind their own button. The height the panel
  // opens to is measured, not guessed: it is five filters on one line at lg and
  // three stacked rows on a phone, so a fixed max-height would either clip the
  // tall case or let the ease coast to a stop early in the short one. The
  // observer keeps that number honest across breakpoint changes, and stays
  // cheap because the inner box's own height never moves while the wrapper
  // around it is the thing animating.
  const [studentFiltersOpen, setStudentFiltersOpen] = useState(false);
  const [studentFiltersHeight, setStudentFiltersHeight] = useState(0);
  const studentFiltersInnerRef = useRef<HTMLDivElement | null>(null);
  // Class names are reference data, cached and shared with the other sections.
  // The money on this screen is not — see fetchDashboard and the two table
  // fetchers below, all of which go straight to the network every time.
  const { data: classList } = useCachedResource<any[]>('classes', () => api.get('/classes'));
  const classOptions = (classList ?? []).map((c: any) => c.name);
  const [academicYearOptions, setAcademicYearOptions] = useState<string[]>([]);

  // --- School Transactions table: pagination, data ---
  const [txQuery, setTxQuery] = useState<TransactionQuery>({ page: 1 });
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
  // Building the invoice can await the school's logo, so the button says so
  // rather than appearing to have done nothing for a moment.
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

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
      params.set('pageSize', String(STUDENT_PAGE_SIZE));
      if (query.search) params.set('q', query.search);
      if (query.classFilter !== 'all') params.set('class', query.classFilter);
      if (query.dateFrom) params.set('dateFrom', query.dateFrom);
      if (query.dateTo) params.set('dateTo', query.dateTo);
      if (query.academicYear !== 'all') params.set('academicYear', query.academicYear);
      if (query.term !== 'all') params.set('term', query.term);
      const data = await api.get(`/ledger/student-transactions?${params.toString()}`);
      setStudentTxRows(data?.rows || []);
      setStudentTotalPages(data?.totalPages || 1);
    } catch {
      setStudentTxRows([]);
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

  // Track the filter panel's natural height so the open/close transition has a
  // real pixel target to ease toward. The inner box is always in the layout —
  // the wrapper around it is what collapses — so this reads correctly even while
  // the panel is closed, and re-reads itself when the grid reflows from five
  // columns to two.
  useEffect(() => {
    const el = studentFiltersInnerRef.current;
    if (!el) return;
    const measure = () => setStudentFiltersHeight(Math.ceil(el.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-fetch the Student Transactions page whenever its page or any filter changes.
  useEffect(() => {
    if (!defaultsReady) return;
    fetchStudentPage(studentQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultsReady, studentQuery]);

  // Re-fetch the School Transactions page whenever the page changes.
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
   * destination is the party's own finances — which is where that entry is
   * listed. Navigating to an invented per-entry URL would only 404.
   *
   * Only staff have such a screen. The other party this table can carry is a
   * vendor on an expense row, and a vendor is a name on an Expense, not a record
   * with a page of its own — those rows offer the expense book instead, in the
   * Details panel below.
   */
  const openParty = (t: Transaction) => {
    if (!t.partyCode) return;
    if (t.partyType === 'staff') onNavigate('staff');
  };

  /**
   * The invoice for one transaction, built in the browser from the row already
   * on screen — so it costs no request and is ready as soon as it is asked for.
   *
   * The letterhead comes off the signed-in user, which is where every other
   * generator in this app reads it from. A school that has never set one still
   * gets a valid sheet, just under the app's default heading.
   */
  const downloadInvoice = async (t: Transaction) => {
    setInvoiceBusy(true);
    setInvoiceError(null);
    try {
      let schoolInfo: { name: string; logo?: string; motto?: string; academicYear?: string } | undefined;
      try {
        const userStr = window.localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user?.School?.[0]) schoolInfo = user.School[0];
        }
      } catch {}
      await generateTransactionInvoice(t, schoolInfo);
    } catch (e: any) {
      setInvoiceError(e?.message || 'Could not build the invoice.');
    } finally {
      setInvoiceBusy(false);
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
      {/* Radix portals this out of the subtree, so it is safe anywhere inside
          the root element and cannot be clipped by an overflow-hidden
          ancestor. Kept at the top so it is not buried in the table markup. */}
      <PaymentConfirmationDialog
        open={receiptFor !== null}
        onOpenChange={(v) => { if (!v) setReceiptFor(null); }}
        ledgerEntryId={receiptFor}
      />
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
          <Button variant="outline" onClick={() => onNavigate('fee-drive')}>
            <Megaphone size={20} className="mr-2" />
            Fee Drive
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
        /* THE FILTERS REVEAL. Height comes from React (measured, so the ease
           lands exactly on the panel's own height); everything else is here.
           visibility is what keeps a collapsed panel out of the tab order and
           away from screen readers, and it is delayed by the full length of the
           collapse so the content cannot blank out mid-animation. The inner box
           slides its last few pixels down into place, which reads as the panel
           unfolding rather than a box simply getting taller. */
        [data-fin-filter-panel] {
          overflow: hidden;
          opacity: 0;
          visibility: hidden;
          transition:
            height 300ms cubic-bezier(0.4, 0, 0.2, 1),
            opacity 160ms ease,
            visibility 0s linear 300ms;
        }
        [data-fin-filter-panel] > div {
          transform: translateY(-6px);
          transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        [data-fin-filter-panel][data-open="true"] {
          opacity: 1;
          visibility: visible;
          transition:
            height 300ms cubic-bezier(0.4, 0, 0.2, 1),
            opacity 220ms ease 60ms,
            visibility 0s;
        }
        [data-fin-filter-panel][data-open="true"] > div { transform: none; }
        /* The toggle's own hover, open and focus states, written out rather
           than as classes because the Tailwind stylesheet this app ships is
           pre-compiled: hover:bg-gray-50 is not in it, so the class would be
           silently dead. */
        [data-fin-filters-toggle] { background-color: #FFFFFF; cursor: pointer; }
        [data-fin-filters-toggle]:hover { background-color: #F9FAFB; }
        [data-fin-filters-toggle][data-open="true"] { background-color: #F3F4F6; }
        [data-fin-filters-toggle]:focus-visible {
          outline: 2px solid rgba(15, 35, 69, 0.45);
          outline-offset: 2px;
        }
        [data-fin-filters-chevron] {
          transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        [data-fin-filters-toggle][data-open="true"] [data-fin-filters-chevron] {
          transform: rotate(180deg);
        }
        @media (prefers-reduced-motion: reduce) {
          [data-fin-filter-panel],
          [data-fin-filter-panel] > div,
          [data-fin-filters-chevron] { transition: none; }
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
        {/* Filters, search box and table share one 1rem rhythm. The gap on
            this column sets title -> Filters button -> search box, and the
            block's own p-4 sets search box -> the rule the table starts at,
            so the three sit evenly apart. The filter panel is nested inside
            the button's own wrapper, which is what lets it open and close
            without moving the search box out of that rhythm. */}
        <div className="p-4 border-b" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 className="text-base font-medium">Student Transactions</h2>

          <div>
            <button
              type="button"
              onClick={() => setStudentFiltersOpen(o => !o)}
              aria-expanded={studentFiltersOpen}
              aria-controls="student-filters"
              data-fin-filters-toggle=""
              data-open={studentFiltersOpen ? 'true' : 'false'}
              className="inline-flex items-center gap-2 h-9 px-3 border rounded-lg text-sm font-medium text-gray-600 transition-colors"
            >
              <Filter size={16} className="text-gray-400" />
              Filters
              <ChevronDown size={16} className="text-gray-400" data-fin-filters-chevron="" />
            </button>

            <div
              id="student-filters"
              data-fin-filter-panel=""
              data-open={studentFiltersOpen ? 'true' : 'false'}
              /* The one thing the stylesheet cannot know: how tall this
                 particular panel is at this particular width. */
              style={{ height: studentFiltersOpen ? studentFiltersHeight : 0 }}
            >
              {/* Two nested wrappers on purpose: the outer one is measured and
                  animated, this inner one carries the gap under the button so
                  that gap collapses along with everything else. */}
              <div ref={studentFiltersInnerRef} style={{ paddingTop: '0.75rem' }}>
                <div className="border rounded-lg p-3">
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" style={{ minWidth: 0 }} data-fin-filters="">
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
                    {/* These two are the one date control on this screen that is
                        NOT the shared Day | Month | Year group: asked for as a
                        single field wearing nothing but the calendar at its right
                        corner, matching the pill selects beside it. DateFilterInput
                        is that design — see its own file for what the transparent
                        native input costs, which is why the rest of the app does
                        not use it. */}
                    <div>
                      <Label className="text-xs text-gray-500 mb-1">From Date</Label>
                      <DateFilterInput
                        value={studentQuery.dateFrom}
                        onChange={(v) => updateStudentFilter({ dateFrom: v })}
                        /* The pill the three selects beside it wear. */
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
          </div>

          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <Input
              placeholder="Search by name, ID, class, or receipt no..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {(
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
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Payment Method</th>
                  {/* The number a parent reads out over the phone. Last, because
                      it is looked UP rather than scanned down — the search box
                      above matches it, so this column is for confirming you have
                      the right row once you land on it. */}
                  <th className="px-4 py-3 font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {studentLoading ? (
                  <TableLoader colSpan={7} />
                ) : studentTxRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                      No transactions found.
                    </td>
                  </tr>
                ) : studentTxRows.map((t) => {
                  // There is no Type column, so the direction of the money has
                  // to live in the Amount cell — otherwise a charge and a
                  // payment for the same figure read identically. Same
                  // convention as School Transactions below: inbound money is
                  // green and signed, everything else is plain.
                  const kind = TX_TYPES[t.type] ?? TX_TYPES.CHARGE;
                  return (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                      {/* The date the transaction was recorded for — the same
                          field the list is ordered by, so the column the eye
                          runs down is the one that explains the order. */}
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDateNumeric(t.entryDate)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onViewStudent(t.student)}
                          className="text-blue-600 hover:underline font-medium text-left"
                        >
                          {t.student.firstName} {t.student.lastName}
                        </button>
                        <PaymentStatusDot status={paymentStatuses.get(String(t.student.id))} /><ZeroMarkDot hasZero={zeroMarks.has(String(t.student.id))} />
                      </td>
                      <td className="px-4 py-3 text-gray-600">{t.studentClass ?? t.student.class}</td>
                      {/* The fee this row is for, resolved server-side, where a
                          hand-raised charge already falls back to its own name.
                          What reaches the second fallback here is therefore an
                          untagged PAYMENT — money recorded before payments named
                          the fee they settle — whose description is the only
                          label it has. */}
                      <td className="px-4 py-3 text-gray-600">{t.category ?? t.description ?? '—'}</td>
                      <td
                        className="px-4 py-3 text-right font-medium whitespace-nowrap"
                        style={{ color: kind.inbound ? '#059669' : '#111827' }}
                      >
                        {kind.inbound ? '+' : ''}{t.amount.toLocaleString()} FCFA
                      </td>
                      {/* Optional on the row, so the dash is ordinary rather
                          than a data error: a charge is usually raised without
                          one, and a payment taken before the field was asked
                          for has none either. */}
                      <td className="px-4 py-3 text-gray-600">{t.paymentMethod ?? '—'}</td>
                      {/* Payments only. A charge has no receipt number and never
                          will — the dash is the ordinary state of this cell for
                          half the table, not a gap in the data. Monospaced
                          because it gets read digit by digit against something
                          a parent is holding. */}
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {/* The number doubles as the trigger for its own WhatsApp
                            receipt — the thing an admin wants to do from this row
                            is send the parent the number they are looking at, and
                            a separate icon column for it would cost a seventh
                            column on a table already wide enough to scroll.

                            A charge has no number and never will, so the dash is
                            plain text rather than a dead button. */}
                        {t.receiptNumber ? (
                          <button
                            type="button"
                            onClick={() => setReceiptFor(t.id)}
                            title="Send a WhatsApp receipt for this payment"
                            style={{
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                              background: 'none', border: 0, padding: 0, cursor: 'pointer',
                              color: '#0f2345', textDecoration: 'underline',
                            }}
                          >
                            {t.receiptNumber}
                          </button>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* No "Page x of y" line any more, so the arrows are the whole control
            and keep the right edge the Previous/Next pair used to hold. The
            label each one has lost is on it as aria-label and title, so the
            disabled state still says which direction is unavailable. */}
        <div className="p-4 border-t flex items-center justify-end">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous page"
              title="Previous page"
              disabled={studentQuery.page <= 1}
              onClick={() => setStudentQuery(q => ({ ...q, page: q.page - 1 }))}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next page"
              title="Next page"
              disabled={studentQuery.page >= studentTotalPages}
              onClick={() => setStudentQuery(q => ({ ...q, page: q.page + 1 }))}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        {/* The Fees / Payroll / Others tabs that used to sit here are gone with
            the fees. What is left is one chronological list of the school's
            outgoings, so there is no longer a choice to offer — the line under
            the heading says what the list is instead. */}
        <div className="p-4 border-b">
          <h2 className="text-base font-medium">School Transactions</h2>
          <p className="text-sm text-gray-500" style={{ marginTop: 2 }}>
            Payroll and expenses, newest first
          </p>
        </div>

        {(
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
                  <th className="px-4 py-3 font-medium">Party</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                  <th className="px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {transactionsLoading ? (
                  <TableLoader colSpan={5} />
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                      No payroll or expense transactions recorded yet.
                    </td>
                  </tr>
                ) : transactions.map((t) => {
                  const kind = TX_TYPES[t.type] ?? TX_TYPES.CHARGE;
                  return (
                    <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(t.entryDate)}</td>
                      {/* No class beside the name: the only parties this table
                          can hold are staff and vendors, and neither has one.
                          Category has moved into Details along with the other
                          fields that were widening the table for no gain. */}
                      <td className="px-4 py-3 text-gray-900">{t.partyName ?? '—'}</td>
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

        {/* Same pager as Student Transactions above: no "Page x of y", the two
            arrows holding the right edge, and the direction each one means kept
            on it as aria-label and title. */}
        <div className="p-4 border-t flex items-center justify-end">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous page"
              title="Previous page"
              disabled={txQuery.page <= 1}
              onClick={() => setTxQuery(q => ({ ...q, page: q.page - 1 }))}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next page"
              title="Next page"
              disabled={txQuery.page >= txTotalPages}
              onClick={() => setTxQuery(q => ({ ...q, page: q.page + 1 }))}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Details for one transaction. Everything shown here already came down
          with the row, so opening it costs no request — and the columns can stay
          narrow enough to read on a phone precisely because the long fields live
          in here rather than in the table. */}
      <Dialog open={txDetail !== null} onOpenChange={(open) => { if (!open) { setTxDetail(null); setInvoiceError(null); } }}>
        <DialogContent style={{ maxWidth: 'min(448px, calc(100vw - 2rem))' }}>
          <DialogHeader>
            <DialogTitle>Transaction details</DialogTitle>
            <DialogDescription>
              {txDetail ? (TX_TYPES[txDetail.type]?.label ?? txDetail.type) : ''} · {txDetail ? formatDate(txDetail.entryDate) : ''}
            </DialogDescription>
          </DialogHeader>

          {txDetail && (
            /* The nominated scrolling child: DialogContent is a capped flex
               column, so exactly one child has to take the overflow or a long
               panel pushes its own buttons off the bottom of the screen. */
            <div
              style={{
                display: 'flex', flexDirection: 'column', gap: '0.6rem',
                flex: '1 1 auto', minHeight: 0, overflowY: 'auto',
              }}
            >
              {([
                ['Description', txDetail.description],
                ['Party', txDetail.partyName],
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

              {/* Every row in this table is money the school paid out, and
                  every one of them is something it may have to show on paper —
                  so the invoice is offered on all of them, not only on the
                  expenses that happen to carry a supplier's number. The sheet is
                  built from this row alone, so nothing is fetched to make it. */}
              <Button
                style={{ marginTop: '0.35rem' }}
                disabled={invoiceBusy}
                onClick={() => downloadInvoice(txDetail)}
              >
                <Download size={16} className="mr-2" />
                {invoiceBusy ? 'Preparing invoice...' : 'Download invoice'}
              </Button>
              {invoiceError && <p className="text-sm" style={{ color: '#e0552e' }}>{invoiceError}</p>}

              {txDetail.partyType === 'staff' ? (
                <Button
                  variant="outline"
                  onClick={() => { const t = txDetail; setTxDetail(null); openParty(t); }}
                >
                  Open staff member&apos;s finances
                </Button>
              ) : txDetail.type === 'EXPENSE' ? (
                <Button
                  variant="outline"
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
        <DialogContent style={{ maxWidth: 'min(448px, calc(100vw - 2rem))' }}>
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
                    <ThreePartDateInput value={damageForm.entryDate} onChange={v => setDamageForm(f => ({ ...f, entryDate: v ?? '' }))} aria-label="Charge date" />
                  </div>
                </div>
                <div>
                  <Label>Payment Method <span className="text-gray-400 font-normal">(optional)</span></Label>
                  <Select value={damageForm.paymentMethod} onValueChange={v => setDamageForm(f => ({ ...f, paymentMethod: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
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
          {/* The fee-structure warning that used to sit here is gone with the
              fee rows themselves: a charge billed from a class level's fee
              structure is by definition a student row, and this table no longer
              holds one. Student Transactions above still warns about them. */}
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
