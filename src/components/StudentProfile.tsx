import { ArrowLeft, Edit, FileText, MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
import { generateFinancialSheet } from '../utils/pdfGenerator';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { api } from '../lib/api';
import { useSisCache } from '../lib/SisCache';
import { useSchoolClassNames } from '../lib/classes';
import { useStudentPaymentStatuses } from './PaymentStatus';
import { toast } from 'sonner';
import { StudentFeeStatusPopover } from './StudentFeeStatusPopover';
import { PhoneInput } from './PhoneInput';
import { FirstInstallmentNotice } from './FirstInstallmentNotice';
import { SettleGroupDialog } from './SettleGroupDialog';
import { ZeroMarkDot, ZERO_MARK_COLOR, useStudentsWithZeroMarks } from './MarkStatus';
import { StudentFlagNotices } from './StudentFlagNotices';
import { AcademicYearSelect, useAcademicYear } from '../lib/academicYear';
import { formatTermLabel } from '../utils/academicTerm';
import { StudentFeeOverrideDialog } from './StudentFeeOverrideDialog';
import { StudentAttendancePanel } from './StudentAttendancePanel';
import { ReportCardTermDialog } from './ReportCardTermDialog';
import { downloadReportCard } from '@/lib/reportCard';
import { NavigationPage } from '../App';
import { Student } from '../types';
import { Card } from './ui/card';
import { Button } from './ui/button';
import {
  Dialog, DialogClose, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { ParentTypeahead, ParentMatch } from './ParentTypeahead';
import { buildParentPayload, ParentBaseline } from '../utils/parentPayload';

interface LedgerEntry {
  id: string;
  type: 'CHARGE' | 'PAYMENT';
  description: string;
  amount: number;
  entryDate: string;
  paymentMethod?: string | null;
  category?: { name: string } | null;
  /**
   * True on the one charge that bills a fee from the student's fee structure —
   * Tuition, Registration, Books and so on. The server has always sent it (the
   * ledger query selects no subset); it simply was not modelled here before.
   * These lines are hidden from the transaction table and shown in the Total
   * Charged breakdown instead.
   */
  isFeeStructureCharge?: boolean;
}

interface LedgerData {
  entries: LedgerEntry[];
  totalCharged: number;
  totalPaid: number;
  balance: number;
}

interface PickupContact {
  id: number;
  studentId: number;
  name: string;
  phone: string;
  relationship: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StudentProfileProps {
  student: Student;
  onNavigate: (page: NavigationPage) => void;
}

type Tab = 'general' | 'finance' | 'marks' | 'attendance';

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Mobile Money', 'Cheque'];

const VALID_TABS: Tab[] = ['general', 'finance', 'marks', 'attendance'];

export function StudentProfile({ student, onNavigate }: StudentProfileProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab: Tab = (VALID_TABS as string[]).includes(tabParam || '') ? (tabParam as Tab) : 'general';
  const [activeTab, setActiveTabState] = useState<Tab>(initialTab);
  // Keeps the active tab in the URL (?tab=) so reloading mid-tab restores it,
  // instead of only living in component state.
  const setActiveTab = (tab: Tab) => {
    setActiveTabState(tab);
    router.replace(`${pathname}?tab=${tab}`, { scroll: false });
  };
  const cache = useSisCache();
  // The class dropdown offers this school's real classes only — see
  // src/lib/classes.ts for why a hardcoded level list can't work here.
  const { classNames: schoolClassNames } = useSchoolClassNames();

  // The status the server computed. The SHARED ROSTER is consulted first and the
  // student prop is the fallback — deliberately that order. The prop is a
  // snapshot taken when this page was opened and never changes again, so reading
  // it first meant a charge or payment recorded here left the dot showing the
  // status from before the write. The roster is a cached resource that
  // 'ledger:write' invalidates, so it re-reads and the dot follows the money.
  // The prop still covers the first paint, before the roster has loaded.
  const paymentStatuses = useStudentPaymentStatuses();
  const zeroMarkStudents = useStudentsWithZeroMarks();
  const feeStatus = paymentStatuses.get(String(student.id)) ?? (student as any).paymentStatus;

  // Both come from GET /students/:id, which is what this page always loads.
  // zeroMarkSubjects is detail-only — the list endpoint returns just the boolean,
  // so a caller passing a lean student gets no banner rather than a wrong one.
  // Same roster-first ordering as feeStatus, for the same staleness reason.
  const hasZeroMark = zeroMarkStudents.size
    ? zeroMarkStudents.has(String(student.id))
    : (student as any).hasZeroMark === true;
  const zeroMarkSubjects: string[] | undefined = (student as any).zeroMarkSubjects;

  // Editable info — local state so updates appear immediately after save
  const [displayInfo, setDisplayInfo] = useState({
    firstName: student.firstName,
    lastName: student.lastName,
    gender: student.gender as string,
    dateOfBirth: student.dateOfBirth || '',
    enrollmentDate: student.enrollmentDate || '',
    address: student.address || '',
    parentId: student.parentId,
    parentName: student.parentName || '',
    parentPhone: student.parentPhone || '',
    class: student.class || '',
    allergies: student.allergies || '',
    medicalConditions: student.medicalConditions || '',
    currentMedications: student.currentMedications || '',
    medicalNotes: student.medicalNotes || '',
  });
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: '', lastName: '', gender: '', dateOfBirth: '',
    enrollmentDate: '', address: '', parentName: '', parentPhone: '', class: '',
    allergies: '', medicalConditions: '', currentMedications: '', medicalNotes: '',
  });
  // Tracks the parent last confirmed for this edit session — the student's
  // existing link when the dialog opens, or whatever was picked via the
  // typeahead since. See buildParentPayload for how this decides between
  // relinking, editing that parent's own record in place, or creating a new one.
  const [parentBaseline, setParentBaseline] = useState<ParentBaseline>({
    id: displayInfo.parentId, name: displayInfo.parentName, phone: displayInfo.parentPhone,
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editShowMedicalHistory, setEditShowMedicalHistory] = useState(false);
  const [editNewContacts, setEditNewContacts] = useState<
    Array<{ name: string; phone: string; relationship: string }>
  >([]);

  // Pickup contacts
  const [pickupContacts, setPickupContacts] = useState<PickupContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [showAddContact, setShowAddContact] = useState(false);
  const [addContactForm, setAddContactForm] = useState({ name: '', phone: '', relationship: '' });
  const [addContactSubmitting, setAddContactSubmitting] = useState(false);
  const [editingContact, setEditingContact] = useState<PickupContact | null>(null);
  const [editContactForm, setEditContactForm] = useState({ name: '', phone: '', relationship: '' });
  const [editContactSubmitting, setEditContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<number | null>(null);

  const [ledgerData, setLedgerData] = useState<LedgerData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [showFeeOverride, setShowFeeOverride] = useState(false);
  // Whether this student is detached from their class level's fee structure.
  // Seeded from the record we were handed and refreshed after an override edit.
  const [feesOverridden, setFeesOverridden] = useState<boolean>(Boolean((student as any).feesOverridden));
  const [showPayment, setShowPayment] = useState(false);
  // The Total Charged breakdown: the only place the fee-structure charges are
  // listed, since the transaction table now hides them.
  const [showChargeBreakdown, setShowChargeBreakdown] = useState(false);
  // The Balance Owed breakdown: what is still outstanding, category by
  // category, against what each category was charged. Reuses loadOwing() and
  // the owingCategories it fills — the same figures the Record Payment dialog
  // caps against, so the two can never quote different amounts for the same
  // category.
  const [showOwingBreakdown, setShowOwingBreakdown] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryEditForm, setEntryEditForm] = useState({ description: '', amount: '' });
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);
  // The record a delete has been asked for but not yet confirmed. Holding the
  // whole entry rather than an id lets the confirmation name the amount and say
  // what removing it will do to the balance.
  const [entryPendingDelete, setEntryPendingDelete] = useState<LedgerEntry | null>(null);
  // The "Custom fees" explanation, which used to be a permanent banner.
  const [feeInfoOpen, setFeeInfoOpen] = useState(false);
  const [reportCardOpen, setReportCardOpen] = useState(false);
  const [reportCardBusy, setReportCardBusy] = useState(false);
  const [reportCardError, setReportCardError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!showActionsMenu) return;
    const handle = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showActionsMenu]);

  const today = new Date().toISOString().split('T')[0];
  /**
   * What this student still owes, per category — the list the Record Payment
   * dialog offers and the ceiling it enforces.
   *
   * Read live from GET /ledger/student/:id/owing every time the dialog opens,
   * never cached: it changes with every charge and payment, and a stale figure
   * here would cap a payment against an amount that is no longer owed.
   */
  const [owingCategories, setOwingCategories] = useState<Array<{
    key: string; kind: string; name: string; charged: number; paid: number;
    owing: number; payable: boolean;
    /** Which fixed fee group this category is in — the server already sends it. */
    group?: 'REGISTRATION' | 'OTHER_FEES';
  }>>([]);
  const [owingLoading, setOwingLoading] = useState(false);
  /** Which group a settle-all has been opened for, if any. */
  const [settleGroup, setSettleGroup] = useState<'REGISTRATION' | 'OTHER_FEES' | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    feeKey: '', description: '', amount: '', entryDate: today, paymentMethod: '',
  });

  /** The category currently selected, and therefore the cap that applies. */
  const selectedOwing = owingCategories.find((c) => c.key === paymentForm.feeKey) ?? null;

  const loadOwing = async () => {
    setOwingLoading(true);
    try {
      const res: any = await api.get(`/ledger/student/${encodeURIComponent(String(student.id))}/owing`);
      setOwingCategories(Array.isArray(res?.categories) ? res.categories : []);
    } catch {
      setOwingCategories([]);
    } finally {
      setOwingLoading(false);
    }
  };

  const openPaymentDialog = async () => {
    setSubmitError(null);
    setPaymentForm({ feeKey: '', description: '', amount: '', entryDate: new Date().toISOString().split('T')[0], paymentMethod: '' });
    setShowPayment(true);
    await loadOwing();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General Info' },
    { id: 'finance', label: 'Finance' },
    { id: 'marks', label: 'Marks' },
    { id: 'attendance', label: 'Attendance' },
  ];

  const formatDate = (value: string | undefined) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return value;
    }
  };

  // Fetch pickup contacts once on mount
  useEffect(() => {
    setContactsLoading(true);
    api.get(`/students/${student.id}/pickup-contacts`)
      .then((data) => setPickupContacts(data || []))
      .catch(() => setPickupContacts([]))
      .finally(() => setContactsLoading(false));
  }, [student.id]);

  const handleAddContact = async () => {
    if (!addContactForm.name.trim()) return;
    setAddContactSubmitting(true);
    setContactError(null);
    try {
      const created: PickupContact = await api.post(
        `/students/${student.id}/pickup-contacts`,
        {
          name: addContactForm.name.trim(),
          phone: addContactForm.phone.trim(),
          relationship: addContactForm.relationship.trim() || null,
        }
      );
      setPickupContacts((prev) => [...prev, created]);
      setShowAddContact(false);
      setAddContactForm({ name: '', phone: '', relationship: '' });
    } catch (e: any) {
      setContactError(e.message || 'Failed to add contact');
    } finally {
      setAddContactSubmitting(false);
    }
  };

  const handleEditContact = async () => {
    if (!editingContact || !editContactForm.name.trim()) return;
    setEditContactSubmitting(true);
    setContactError(null);
    try {
      const updated: PickupContact = await api.put(
        `/students/${student.id}/pickup-contacts/${editingContact.id}`,
        {
          name: editContactForm.name.trim(),
          phone: editContactForm.phone.trim(),
          relationship: editContactForm.relationship.trim() || null,
        }
      );
      setPickupContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditingContact(null);
    } catch (e: any) {
      setContactError(e.message || 'Failed to update contact');
    } finally {
      setEditContactSubmitting(false);
    }
  };

  const handleDeleteContact = async (contactId: number) => {
    if (deletingContactId !== null) return;
    setDeletingContactId(contactId);
    try {
      await api.delete(`/students/${student.id}/pickup-contacts/${contactId}`);
      setPickupContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch {
      // silently ignore — stale item stays in list; page reload will correct it
    } finally {
      setDeletingContactId(null);
    }
  };

  const refreshLedger = async () => {
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const data = await api.get(`/ledger/student/${encodeURIComponent(student.id)}`);
      setLedgerData(data);
    } catch (e: any) {
      setLedgerError(e.message || 'Failed to load finance data');
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'finance') return;
    let cancelled = false;
    const init = async () => {
      setLedgerLoading(true);
      setLedgerError(null);
      try {
        // Only the ledger now. The class level's fee list used to be fetched
        // alongside it for the Record Charge dialog's category picker; charges
        // are raised from the fee-structure dialog instead, which loads its own.
        const data = await api.get(`/ledger/student/${encodeURIComponent(student.id)}`).catch((e: any) => {
          if (!cancelled) setLedgerError(e?.message || 'Failed to load finance data');
          return null;
        });
        if (!cancelled && data) setLedgerData(data);
      } finally {
        if (!cancelled) setLedgerLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [activeTab, student.id]);

  /**
   * The Marks tab. Loaded only when opened, and only for the year/term selected
   * here — a student's whole mark history across every year is not what somebody
   * clicking through from a "has a zero" banner is looking for.
   *
   * Everything shown is computed server-side by /test-exams/student-breakdown,
   * including which assessments count towards the totals. Recomputing any of it
   * here would mean a second implementation of the mark-state rules.
   */
  const [marksYear, setMarksYear] = useState('');
  const [marksTerm, setMarksTerm] = useState<string>('Term 1');
  const [breakdown, setBreakdown] = useState<any[] | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const { status: yearStatus } = useAcademicYear();

  useEffect(() => {
    if (!marksYear && yearStatus?.activeYear) setMarksYear(yearStatus.activeYear);
  }, [yearStatus, marksYear]);

  useEffect(() => {
    if (activeTab !== 'marks' || !marksYear || !marksTerm) return;
    let cancelled = false;
    setBreakdownLoading(true);
    setBreakdownError(null);
    api
      .get(
        `/test-exams/student-breakdown?studentId=${encodeURIComponent(student.id)}` +
          `&term=${encodeURIComponent(marksTerm)}&academicYear=${encodeURIComponent(marksYear)}`,
      )
      .then((r: any) => { if (!cancelled) setBreakdown(r?.subjects ?? []); })
      .catch((e: any) => { if (!cancelled) { setBreakdown(null); setBreakdownError(e?.message || 'Could not load marks.'); } })
      .finally(() => { if (!cancelled) setBreakdownLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, student.id, marksYear, marksTerm]);

  // Fee-structure charges are hidden from the transaction table: they describe
  // what the student is billed rather than activity on the account, and a dozen
  // of them buries the one-off charges and payments somebody opened this tab to
  // see. They are still charged, still counted in Total Charged, and still
  // listed in full behind that card — this is a display filter and nothing more.
  const visibleEntries = useMemo(
    () => (ledgerData?.entries ?? []).filter((e) => e.type === 'PAYMENT' || !e.isFeeStructureCharge),
    [ledgerData],
  );
  const feeStructureCharges = useMemo(
    () => (ledgerData?.entries ?? []).filter((e) => e.type === 'CHARGE' && e.isFeeStructureCharge),
    [ledgerData],
  );
  const oneOffCharges = useMemo(
    () => (ledgerData?.entries ?? []).filter((e) => e.type === 'CHARGE' && !e.isFeeStructureCharge),
    [ledgerData],
  );

  /**
   * Hover-intent for the "Custom fees" popover.
   *
   * The popover sits 6px below the badge, so the pointer leaves the badge before
   * it arrives at the popover. Closing on mouseleave therefore made the "Review
   * or remove" button inside it effectively unclickable — it vanished while the
   * pointer was crossing the gap.
   *
   * So closing is always deferred by a grace period, and anything that counts as
   * intent to interact — re-entering the badge, entering the popover itself,
   * focusing either — cancels a close already in flight. ONE timer ref holds both
   * the close delay and the show-on-load auto-hide, which is what makes hovering
   * during those first seconds cancel the auto-hide instead of racing it.
   */
  const feeInfoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearFeeInfoTimer = () => {
    if (feeInfoTimer.current) {
      clearTimeout(feeInfoTimer.current);
      feeInfoTimer.current = null;
    }
  };
  const openFeeInfo = () => {
    clearFeeInfoTimer();
    setFeeInfoOpen(true);
  };
  const closeFeeInfoSoon = (delay = 400) => {
    clearFeeInfoTimer();
    feeInfoTimer.current = setTimeout(() => {
      feeInfoTimer.current = null;
      setFeeInfoOpen(false);
    }, delay);
  };

  // Surfaces the custom-fee explanation once per page load, then gets out of the
  // way. It replaced a permanent banner: the fact matters when you arrive at the
  // page, not on every subsequent glance, and it stays reachable by hovering the
  // badge.
  useEffect(() => {
    if (!feesOverridden) return;
    openFeeInfo();
    closeFeeInfoSoon(7000);
    return clearFeeInfoTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feesOverridden]);

  const beginEditEntry = (entry: LedgerEntry) => {
    setEntryError(null);
    setEditingEntryId(entry.id);
    setEntryEditForm({ description: entry.description, amount: String(entry.amount) });
  };

  const handleEntrySave = async (entry: LedgerEntry) => {
    const amt = Number(entryEditForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setEntryError('Enter an amount greater than zero.');
      return;
    }
    if (!entryEditForm.description.trim()) {
      setEntryError('Give the charge a description.');
      return;
    }
    setEntryBusy(true);
    setEntryError(null);
    try {
      await api.patch(`/ledger/${encodeURIComponent(entry.id)}`, {
        description: entryEditForm.description.trim(),
        amount: Math.round(amt),
      });
      cache.invalidateOn('ledger:write');
      setEditingEntryId(null);
      await refreshLedger();
    } catch (e: any) {
      setEntryError(e?.message || 'Failed to update the charge.');
    } finally {
      setEntryBusy(false);
    }
  };

  const requestEntryDelete = (entry: LedgerEntry) => {
    setEntryError(null);
    setEntryPendingDelete(entry);
  };

  /**
   * Removing one record from the account.
   *
   * Everything money-derived is recomputed from the server afterwards rather than
   * patched locally, because a deletion moves more than the row that vanished:
   * deleting a PAYMENT pushes the student back toward owing and can change their
   * status dot, and deleting a CHARGE reduces what was owed. Adjusting the totals
   * by hand here would be a second implementation of allocation rules that live
   * in feesStatus.js.
   *
   *  - refreshLedger()          re-reads totalCharged / totalPaid / balance and the rows
   *  - loadOwing()              re-reads the per-category owing the payment dialog caps against
   *  - invalidateOn('ledger:write')  drops the cached students roster, which is where the
   *                             payment-status and zero-mark dots read from — so they
   *                             re-fetch instead of serving the pre-deletion value
   */
  const confirmEntryDelete = async () => {
    const entry = entryPendingDelete;
    if (!entry) return;
    setEntryBusy(true);
    setEntryError(null);
    try {
      await api.delete(`/ledger/${encodeURIComponent(entry.id)}`);
      cache.invalidateOn('ledger:write');
      setEntryPendingDelete(null);
      await Promise.all([refreshLedger(), loadOwing()]);
    } catch (e: any) {
      setEntryError(e?.message || 'Failed to remove this record.');
    } finally {
      setEntryBusy(false);
    }
  };

  // Fee-structure amounts have exactly one editor — the override dialog — so the
  // breakdown routes there rather than offering a second way to change them.
  const editFeeStructure = () => {
    setShowChargeBreakdown(false);
    setActiveTab('finance');
    setShowFeeOverride(true);
  };

  const handlePaymentSubmit = async () => {
    setSubmitError(null);
    // Validated here for a quick answer, and again on the server, which is the
    // authority — this dialog is not the only thing that can reach the endpoint.
    if (!selectedOwing) {
      setSubmitError('Choose which fee this payment is for.');
      return;
    }
    const amt = Number(paymentForm.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setSubmitError('Enter an amount greater than zero.');
      return;
    }
    if (amt > selectedOwing.owing) {
      setSubmitError(`That is more than the ${selectedOwing.owing.toLocaleString()} FCFA still owed for ${selectedOwing.name}.`);
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/ledger/payment', {
        studentId: student.id,
        // What ties the money to the category it settles, so paying Tuition
        // clears Tuition instead of the oldest charge on the account.
        feeKey: selectedOwing.key,
        description: paymentForm.description || `${selectedOwing.name} payment`,
        amount: Math.round(amt),
        entryDate: paymentForm.entryDate,
        paymentMethod: paymentForm.paymentMethod,
      });
      cache.invalidateOn('ledger:write');
      setShowPayment(false);
      setPaymentForm({ feeKey: '', description: '', amount: '', entryDate: new Date().toISOString().split('T')[0], paymentMethod: '' });
      await refreshLedger();
    } catch (e: any) {
      setSubmitError(e.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSave = async () => {
    setEditSubmitting(true);
    setEditError(null);
    try {
      const updated = await api.put(`/students/${student.id}`, {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        gender: editForm.gender,
        dateOfBirth: editForm.dateOfBirth || undefined,
        enrollmentDate: editForm.enrollmentDate || undefined,
        address: editForm.address.trim(),
        ...buildParentPayload(parentBaseline, editForm.parentName, editForm.parentPhone),
        class: editForm.class,
        allergies: editForm.allergies.trim() || null,
        medicalConditions: editForm.medicalConditions.trim() || null,
        currentMedications: editForm.currentMedications.trim() || null,
        medicalNotes: editForm.medicalNotes.trim() || null,
      });
      setDisplayInfo({
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        gender: editForm.gender,
        dateOfBirth: editForm.dateOfBirth,
        enrollmentDate: editForm.enrollmentDate,
        address: editForm.address.trim(),
        parentId: updated.parentId,
        parentName: updated.parentName,
        parentPhone: updated.parentPhone,
        class: editForm.class,
        allergies: editForm.allergies.trim(),
        medicalConditions: editForm.medicalConditions.trim(),
        currentMedications: editForm.currentMedications.trim(),
        medicalNotes: editForm.medicalNotes.trim(),
      });
      setParentBaseline({ id: updated.parentId, name: updated.parentName, phone: updated.parentPhone });
      for (const c of editNewContacts) {
        if (c.name.trim()) {
          const created = await api.post(`/students/${student.id}/pickup-contacts`, {
            name: c.name.trim(),
            phone: c.phone.trim(),
            relationship: c.relationship.trim() || null,
          });
          setPickupContacts(prev => [...prev, created]);
        }
      }
      setEditNewContacts([]);
      cache.invalidateOn('student:write');
      setShowEdit(false);
    } catch (e: any) {
      setEditError(e.message || 'Failed to save');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (deleteSubmitting) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await api.delete(`/students/${student.id}`);
      cache.invalidateOn('student:write');
      onNavigate('students');
    } catch (e: any) {
      setDeleteError(e.message || 'Failed to delete student');
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleDownloadStatement = async () => {
    if (!ledgerData) return;
    let schoolInfo: { name: string; logo?: string } | undefined;
    try {
      const userStr = window.localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user?.School?.[0]) schoolInfo = user.School[0];
      }
    } catch {}
    await generateFinancialSheet(student, ledgerData, schoolInfo);
  };

  return (
    <div className="p-4 md:p-8">
      <button
        onClick={() => onNavigate('students')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-6"
      >
        <ArrowLeft size={18} />
        Back to Students
      </button>

      {/* Layout for the General Information tab.

          A <style> element rather than inline styles because these are media
          queries, which a style attribute cannot express — and rather than
          Tailwind classes because src/index.css is a frozen pre-compiled build:
          a utility that isn't already in it renders as nothing, silently.

          640px is the breakpoint, matching Tailwind's `sm:` — the same one the
          rest of this page already switches on, so the field grids and every
          neighbouring `sm:` class change together instead of stepping at two
          different widths.

          Scoped to data attributes so none of it can leak onto another screen. */}
      <style>{`
        [data-profile-fields] {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          /* Tighter than the 3rem below, because at 390px two columns only have
             about 175px each to live in and a 48px gutter would eat a third of
             one of them. Widened back at 640px, where there is room for it. */
          column-gap: 1.25rem;
          row-gap: 1.75rem;
        }
        /* TWO COLUMNS AT EVERY WIDTH, phones included — deliberately outside the
           media query below. minmax(0, 1fr) is what makes that safe: it lets a
           column be narrower than its content, so a long value wraps inside its
           own cell instead of widening the column and pushing the grid out. The
           section never drops to one column; only the text inside it reflows. */
        [data-profile-fields="two"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        [data-profile-fields] dt { line-height: 1.5; }
        [data-profile-fields] dd { line-height: 1.6; }
        /* Long values — an address, a parent's full name — must break rather
           than run past their cell now that the cell can be this narrow. */
        [data-profile-fields] dd { overflow-wrap: anywhere; }
        [data-contact-grid] {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 0.75rem;
        }
        @media (min-width: 640px) {
          [data-profile-fields] { column-gap: 3rem; }
          [data-contact-grid] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>

      {/* Name on the left, the mobile ⋯ menu right-aligned on the same line.
          items-start rather than items-center so the button stays level with the
          name itself when the class/ID line below wraps on a narrow screen. */}
      <div className="mb-6 flex items-start justify-between gap-3">
        {/* min-width:0 lets this column actually shrink. Without it a flex item
            refuses to go below its content's intrinsic width, and a long name
            would push the ⋯ button off the right edge instead of wrapping. */}
        <div style={{ minWidth: 0 }}>
        {/* hasZeroMark comes off the STUDENT, not displayInfo — displayInfo holds
            only the editable identity fields, so reading it here left the dot
            permanently hidden on this page. */}
        {/* The fees dot carries its own explanation here — tap it. That is why
            this one is StudentFeeStatusPopover and every other screen keeps the
            plain PaymentStatusDot.

            It opens itself when the FINANCE tab is showing, not on page load:
            the banner it replaced lived on that tab, and opening on load meant
            the first click — the one that goes to Finance — dismissed it before
            anyone arrived. The dot stays up here rather than moving into the tab
            because the tab bar is not sticky, so the name is necessarily on
            screen at the moment a tab is clicked. */}
        <h1 className="text-3xl">{displayInfo.firstName} {displayInfo.lastName}<StudentFeeStatusPopover status={feeStatus} autoShowWhen={activeTab === 'finance'} /><ZeroMarkDot hasZero={hasZeroMark} /></h1>
        <p className="text-gray-500 mt-1">
          {student.id} · {displayInfo.class}
          {feesOverridden && (
            <>
              {' · '}
              {/* The explanation lives here now rather than in a permanent banner
                  on the Finance tab. It shows itself once on load, fades, and
                  comes back on hover — everything is a <span> because this sits
                  inside a <p>, where a <div> would be invalid. */}
              <span
                style={{ position: 'relative', display: 'inline-block' }}
                onMouseEnter={openFeeInfo}
                onMouseLeave={() => closeFeeInfoSoon()}
              >
                <span
                  role="button"
                  tabIndex={0}
                  aria-describedby="custom-fees-info"
                  onFocus={openFeeInfo}
                  // Deferred, so tabbing (or clicking) into the popover's button
                  // does not close the popover out from under the click.
                  onBlur={() => closeFeeInfoSoon()}
                  onClick={() => (feeInfoOpen ? closeFeeInfoSoon(0) : openFeeInfo())}
                  style={{
                    color: '#5B21B6', backgroundColor: '#F5F3FF',
                    border: '1px solid #C4B5FD', borderRadius: 999,
                    padding: '1px 8px', fontSize: '0.75rem', fontWeight: 500,
                    cursor: 'help',
                  }}
                >
                  Custom fees
                </span>
                <span
                  id="custom-fees-info"
                  role="tooltip"
                  // Entering the popover cancels the close the gap-crossing
                  // started; leaving it starts a fresh one.
                  onMouseEnter={openFeeInfo}
                  onMouseLeave={() => closeFeeInfoSoon()}
                  style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30,
                    display: 'block', width: 300, padding: '0.7rem 0.8rem',
                    borderRadius: 8, border: '1px solid #C4B5FD',
                    backgroundColor: '#F5F3FF', color: '#5B21B6',
                    fontSize: '0.8125rem', lineHeight: 1.45, fontWeight: 400,
                    boxShadow: '0 6px 18px rgba(0,0,0,0.10)',
                    // Fades rather than unmounting, so the auto-show on load and
                    // the hover use one code path and neither jumps the layout.
                    opacity: feeInfoOpen ? 1 : 0,
                    visibility: feeInfoOpen ? 'visible' : 'hidden',
                    transition: 'opacity 200ms ease, visibility 200ms ease',
                    pointerEvents: feeInfoOpen ? 'auto' : 'none',
                    textAlign: 'left',
                    whiteSpace: 'normal',
                  }}
                >
                  <strong>Custom fee structure.</strong>{' '}
                  {displayInfo.firstName} is billed from their own fees, not the standard{' '}
                  {(student as any).classLevel || displayInfo.class} fees, and class-level fee
                  changes do not apply to them automatically.{' '}
                  <button
                    type="button"
                    onClick={editFeeStructure}
                    className="hover:underline"
                    style={{ color: '#5B21B6', fontWeight: 600, textDecoration: 'underline' }}
                  >
                    Review or remove
                  </button>
                </span>
              </span>
            </>
          )}
        </p>
        </div>

        {/* The mobile action menu, moved up here from inside the Finance tab
            where it sat in a right-aligned row of its own above the summary
            cards. That row is gone rather than emptied, so nothing is left
            holding blank space.

            Still gated on the Finance tab: every item in it acts on this
            student's money, and the desktop equivalent — the three-button row
            further down — only exists on that tab too. Showing it above General
            Information would offer Record Payment from a screen that has nothing
            to do with payments.

            Desktop is untouched: md:hidden keeps this to small screens, and the
            desktop button row still lives in the Finance tab. */}
        {activeTab === 'finance' && (
          <div className="md:hidden shrink-0 relative" ref={actionsMenuRef}>
            <Button variant="outline" size="sm" onClick={() => setShowActionsMenu(v => !v)}>
              <MoreHorizontal size={16} />
            </Button>
            {showActionsMenu && (
              <div className="absolute top-full right-0 mt-1 z-10 bg-white border rounded-md shadow-lg py-1 w-48">
                <button
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                  disabled={!ledgerData}
                  onClick={() => { handleDownloadStatement(); setShowActionsMenu(false); }}
                >
                  Download Financial Sheet
                </button>
                {/* Record Charge lived here. Charges are now raised inside
                    Edit This Student's Fees, which is where their money is
                    arranged — one place instead of two entry points that
                    created different kinds of charge. */}
                <button
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={() => { setShowFeeOverride(true); setShowActionsMenu(false); }}
                >
                  Edit Fees / Add Charge
                </button>
                <button
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                  onClick={() => { openPaymentDialog(); setShowActionsMenu(false); }}
                >
                  Record Payment
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Only the marks flag sits above the tabs now. The payment notice moved to
          the bottom of the Finance tab: it was crowding the top of the page, and
          the tab it points at is where you can act on it anyway. */}
      <StudentFlagNotices
        show="marks"
        paymentStatus={feeStatus}
        zeroMarkSubjects={zeroMarkSubjects}
        onViewFinance={() => setActiveTab('finance')}
        onViewMarks={() => setActiveTab('marks')}
      />

      <div className="flex gap-1 border-b mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <>
          <Card className="p-6">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-base font-medium">Student Information</h2>
              <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={() => { setDeleteError(null); setShowDeleteConfirm(true); }}
              >
                <Trash2 size={14} className="mr-1" />
                Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditForm({
                    firstName: displayInfo.firstName,
                    lastName: displayInfo.lastName,
                    gender: displayInfo.gender,
                    dateOfBirth: displayInfo.dateOfBirth ? displayInfo.dateOfBirth.split('T')[0] : '',
                    enrollmentDate: displayInfo.enrollmentDate ? displayInfo.enrollmentDate.split('T')[0] : '',
                    address: displayInfo.address,
                    parentName: displayInfo.parentName,
                    parentPhone: displayInfo.parentPhone,
                    class: displayInfo.class,
                    allergies: displayInfo.allergies,
                    medicalConditions: displayInfo.medicalConditions,
                    currentMedications: displayInfo.currentMedications,
                    medicalNotes: displayInfo.medicalNotes,
                  });
                  setParentBaseline({ id: displayInfo.parentId, name: displayInfo.parentName, phone: displayInfo.parentPhone });
                  setEditShowMedicalHistory(
                    !!(displayInfo.allergies || displayInfo.medicalConditions ||
                       displayInfo.currentMedications || displayInfo.medicalNotes)
                  );
                  setEditNewContacts([]);
                  setEditError(null);
                  setShowEdit(true);
                }}
              >
                <Edit size={14} className="mr-1" />
                Edit
              </Button>
              </div>
            </div>
            <dl data-profile-fields="two">
              <Field label="Student ID" value={student.id} />
              <Field label="Class" value={displayInfo.class} />
              <Field label="First Name" value={displayInfo.firstName} />
              <Field label="Last Name" value={displayInfo.lastName} />
              <Field label="Gender" value={displayInfo.gender} capitalize />
              <Field label="Date of Birth" value={formatDate(displayInfo.dateOfBirth)} />
              <Field label="Enrollment Date" value={formatDate(displayInfo.enrollmentDate)} />
              <Field label="Address" value={displayInfo.address} />
              <Field label="Parent / Guardian" value={displayInfo.parentName} />
              <Field label="Parent Phone" value={displayInfo.parentPhone} />
            </dl>
          </Card>

          {/* Medical History */}
          <Card className="p-6 mt-4">
            <h2 className="text-base font-medium mb-5">Medical History</h2>
            {/* One column at every width. These four are free text — an allergy
                list or a note runs long and reads badly in a half-width column
                next to another one doing the same. */}
            <dl data-profile-fields="one">
              <MedicalField label="Allergies" value={displayInfo.allergies} />
              <MedicalField label="Existing Medical Conditions" value={displayInfo.medicalConditions} />
              <MedicalField label="Current Medications" value={displayInfo.currentMedications} />
              <MedicalField label="Additional Notes" value={displayInfo.medicalNotes} />
            </dl>
          </Card>

          {/* Pickup / Drop-off Contacts */}
          <Card className="p-6 mt-4">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-base font-medium">Pickup / Drop-off Contacts</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAddContactForm({ name: '', phone: '', relationship: '' });
                  setContactError(null);
                  setShowAddContact(true);
                }}
              >
                <Plus size={14} className="mr-1" />
                Add Contact
              </Button>
            </div>
            {contactsLoading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : pickupContacts.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No pickup contacts recorded.</p>
            ) : (
              /* Two columns of bordered cells rather than one divided list.
                 A divide-y stack only reads correctly in a single column — in a
                 grid the dividing rules run between cells that sit side by
                 side, so each contact carries its own outline instead.

                 A bare block comment, not {/* … *​/}: this sits in the
                 expression slot of a ternary, where braces would open an object
                 literal rather than a JSX comment. */
              <div data-contact-grid="">
                {pickupContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="flex items-start justify-between"
                    style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: '0.75rem' }}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                      <p className="text-sm text-gray-500">{contact.phone}</p>
                      {contact.relationship && (
                        <p className="text-xs text-gray-400 mt-0.5">{contact.relationship}</p>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingContact(contact);
                          setEditContactForm({
                            name: contact.name,
                            phone: contact.phone,
                            relationship: contact.relationship ?? '',
                          });
                          setContactError(null);
                        }}
                      >
                        <Edit size={13} className="mr-1" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDeleteContact(contact.id)}
                        disabled={deletingContactId === contact.id}
                      >
                        {deletingContactId === contact.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Add Pickup Contact dialog */}
          <Dialog
            open={showAddContact}
            onOpenChange={(open) => { setShowAddContact(open); if (!open) setContactError(null); }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add Pickup Contact</DialogTitle>
                <DialogDescription>
                  Someone authorised to pick up {displayInfo.firstName}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={addContactForm.name}
                    onChange={(e) => setAddContactForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Contact name"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <PhoneInput
                    value={addContactForm.phone}
                    onChange={(v) => setAddContactForm((f) => ({ ...f, phone: v }))}
                  />
                </div>
                <div>
                  <Label>
                    Relationship{' '}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </Label>
                  <Input
                    value={addContactForm.relationship}
                    onChange={(e) =>
                      setAddContactForm((f) => ({ ...f, relationship: e.target.value }))
                    }
                    placeholder="e.g. Driver, Grandmother, Uncle"
                  />
                </div>
                {contactError && <p className="text-sm text-red-600">{contactError}</p>}
              </div>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline" disabled={addContactSubmitting}>Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleAddContact}
                  disabled={addContactSubmitting || !addContactForm.name.trim()}
                >
                  {addContactSubmitting ? 'Saving…' : 'Add Contact'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Pickup Contact dialog */}
          <Dialog
            open={!!editingContact}
            onOpenChange={(open) => { if (!open) { setEditingContact(null); setContactError(null); } }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Edit Pickup Contact</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={editContactForm.name}
                    onChange={(e) => setEditContactForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Contact name"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <PhoneInput
                    value={editContactForm.phone}
                    onChange={(v) => setEditContactForm((f) => ({ ...f, phone: v }))}
                  />
                </div>
                <div>
                  <Label>
                    Relationship{' '}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </Label>
                  <Input
                    value={editContactForm.relationship}
                    onChange={(e) =>
                      setEditContactForm((f) => ({ ...f, relationship: e.target.value }))
                    }
                    placeholder="e.g. Driver, Grandmother, Uncle"
                  />
                </div>
                {contactError && <p className="text-sm text-red-600">{contactError}</p>}
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  disabled={editContactSubmitting}
                  onClick={() => { setEditingContact(null); setContactError(null); }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleEditContact}
                  disabled={editContactSubmitting || !editContactForm.name.trim()}
                >
                  {editContactSubmitting ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit student dialog */}
          <Dialog
            open={showEdit}
            onOpenChange={(open) => { setShowEdit(open); if (!open) setEditError(null); }}
          >
            <DialogContent className="max-w-2xl" style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden', padding: 0, gap: 0 }}>
              <div style={{ padding: '1.5rem 1.5rem 1rem' }}>
                <DialogHeader>
                  <DialogTitle>Edit Student</DialogTitle>
                  <DialogDescription>
                    Student ID {student.id} — update general information below.
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="flex-1 overflow-y-auto" style={{ padding: '0 1.5rem 1rem', minHeight: 0 }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name</Label>
                  <Input
                    value={editForm.firstName}
                    onChange={e => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                    placeholder="First name"
                  />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input
                    value={editForm.lastName}
                    onChange={e => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                    placeholder="Last name"
                  />
                </div>
                <div>
                  <Label>Date of Birth</Label>
                  <Input
                    type="date"
                    value={editForm.dateOfBirth}
                    onChange={e => setEditForm(f => ({ ...f, dateOfBirth: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Gender</Label>
                  <Select
                    value={editForm.gender}
                    onValueChange={v => setEditForm(f => ({ ...f, gender: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Class</Label>
                  <Select
                    value={editForm.class}
                    onValueChange={v => setEditForm(f => ({ ...f, class: v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                    <SelectContent>
                      {schoolClassNames.map(cls => (
                        <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Parent / Guardian Name</Label>
                  <ParentTypeahead
                    value={editForm.parentName}
                    onChange={(name) => setEditForm(f => ({ ...f, parentName: name }))}
                    onSelect={(parent: ParentMatch) => {
                      setEditForm(f => ({ ...f, parentName: parent.name, parentPhone: parent.phone }));
                      setParentBaseline({ id: parent.id, name: parent.name, phone: parent.phone });
                    }}
                    placeholder="Parent or guardian name"
                  />
                </div>
                <div>
                  <Label>Parent Phone</Label>
                  <PhoneInput
                    value={editForm.parentPhone}
                    onChange={(v) => setEditForm(f => ({ ...f, parentPhone: v }))}
                  />
                </div>
                <div>
                  <Label>Enrollment Date</Label>
                  <Input
                    type="date"
                    value={editForm.enrollmentDate}
                    onChange={e => setEditForm(f => ({ ...f, enrollmentDate: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Address</Label>
                  <Input
                    value={editForm.address}
                    onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Home address"
                  />
                </div>

                {/* Medical History */}
                <div className="col-span-2 border-t pt-4 mt-1">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gray-700">
                      Medical History{' '}
                      <span className="text-gray-400 font-normal">(optional)</span>
                    </p>
                    {editShowMedicalHistory && (
                      <button
                        type="button"
                        onClick={() => setEditShowMedicalHistory(false)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                {!editShowMedicalHistory ? (
                  <div className="col-span-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setEditShowMedicalHistory(true)}
                    >
                      <Plus size={15} className="mr-1" />
                      Add medical history
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="col-span-2">
                      <Label>Allergies</Label>
                      <Textarea
                        value={editForm.allergies}
                        onChange={e => setEditForm(f => ({ ...f, allergies: e.target.value }))}
                        placeholder="e.g. Penicillin, peanuts, latex..."
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Existing Medical Conditions</Label>
                      <Textarea
                        value={editForm.medicalConditions}
                        onChange={e => setEditForm(f => ({ ...f, medicalConditions: e.target.value }))}
                        placeholder="e.g. Asthma, sickle cell..."
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Current Medications</Label>
                      <Textarea
                        value={editForm.currentMedications}
                        onChange={e => setEditForm(f => ({ ...f, currentMedications: e.target.value }))}
                        placeholder="e.g. Salbutamol inhaler as needed..."
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Additional Notes</Label>
                      <Textarea
                        value={editForm.medicalNotes}
                        onChange={e => setEditForm(f => ({ ...f, medicalNotes: e.target.value }))}
                        placeholder="Any other information the school should know..."
                      />
                    </div>
                  </>
                )}

                {/* Pickup / Drop-off Contacts */}
                <div className="col-span-2 border-t pt-4 mt-1">
                  <p className="text-sm font-medium text-gray-700 mb-3">
                    Pickup / Drop-off Contacts{' '}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </p>
                </div>
                {editNewContacts.map((c, i) => (
                  <div key={i} className="col-span-2">
                    <div className="grid grid-cols-2 gap-3 p-3 border rounded-lg relative">
                      <button
                        type="button"
                        onClick={() => setEditNewContacts(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                        aria-label="Remove contact"
                      >
                        <X size={15} />
                      </button>
                      <div>
                        <Label>Name</Label>
                        <Input
                          placeholder="Contact name"
                          value={c.name}
                          onChange={e => setEditNewContacts(prev =>
                            prev.map((row, idx) => idx === i ? { ...row, name: e.target.value } : row)
                          )}
                        />
                      </div>
                      <div>
                        <Label>Phone</Label>
                        <PhoneInput
                          value={c.phone}
                          onChange={(v) => setEditNewContacts(prev =>
                            prev.map((row, idx) => idx === i ? { ...row, phone: v } : row)
                          )}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>
                          Relationship{' '}
                          <span className="text-gray-400 font-normal">(optional)</span>
                        </Label>
                        <Input
                          placeholder="e.g. Driver, Grandmother, Uncle"
                          value={c.relationship}
                          onChange={e => setEditNewContacts(prev =>
                            prev.map((row, idx) => idx === i ? { ...row, relationship: e.target.value } : row)
                          )}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <div className="col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEditNewContacts(prev => [...prev, { name: '', phone: '', relationship: '' }])}
                  >
                    <Plus size={15} className="mr-1" />
                    Add a pickup contact
                  </Button>
                </div>
              </div>
              </div>
              <div className="border-t" style={{ padding: '1rem 1.5rem' }}>
              {editError && <p className="text-sm text-red-600 mb-3">{editError}</p>}
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline" disabled={editSubmitting}>Cancel</Button>
                </DialogClose>
                <Button
                  onClick={handleEditSave}
                  disabled={editSubmitting || !editForm.firstName.trim() || !editForm.lastName.trim()}
                >
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Delete student confirmation */}
          <Dialog
            open={showDeleteConfirm}
            onOpenChange={(open) => { setShowDeleteConfirm(open); if (!open) setDeleteError(null); }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Delete {displayInfo.firstName} {displayInfo.lastName}?</DialogTitle>
                <DialogDescription>
                  This permanently deletes {displayInfo.firstName} {displayInfo.lastName} ({student.id}) and all of
                  their records — ledger entries, test/exam marks, pickup contacts, attendance records, and report
                  cards. This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline" disabled={deleteSubmitting}>Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={handleDeleteStudent}
                  disabled={deleteSubmitting}
                >
                  {deleteSubmitting ? 'Deleting...' : 'Delete Student'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}

      {activeTab === 'finance' && (
        <div className="space-y-4">
          {/* The mobile ⋯ menu used to sit here in a right-aligned row of its
              own. It is now beside the student's name above the tabs, and the
              row it lived in is deleted rather than left empty — an empty flex
              row still takes a space-y-4 gap and would have left a visible band
              of nothing at the top of this tab. */}

          {/* Why the first installment is unmet, at the top of the tab where
              the money is. It renders nothing when met, or when the level has
              no rule at all — null is "not configured", not "failed". */}
          <FirstInstallmentNotice
            met={(student as any).firstInstallmentMet}
            shortfalls={(student as any).firstInstallmentShortfalls}
          />

          {/* Settle a whole group in one action. Offered per group, and only
              while that group actually has something outstanding — an action
              that is always available but sometimes does nothing is worse than
              one that is absent. The amounts come from the server. */}
          {(['REGISTRATION', 'OTHER_FEES'] as const)
            .filter((g) => owingCategories.some((c) => (c.group ?? 'OTHER_FEES') === g && c.payable && c.owing > 0))
            .length > 0 && (
            <div className="flex gap-2 flex-wrap" style={{ justifyContent: 'flex-end' }}>
              {(['REGISTRATION', 'OTHER_FEES'] as const)
                .filter((g) => owingCategories.some((c) => (c.group ?? 'OTHER_FEES') === g && c.payable && c.owing > 0))
                .map((g) => (
                  <Button key={g} variant="outline" size="sm" onClick={() => setSettleGroup(g)}>
                    Settle {g === 'REGISTRATION' ? 'Registration' : 'Other Fees'}
                  </Button>
                ))}
            </div>
          )}

          {/* Desktop: three-button row */}
          <div className="hidden md:flex gap-2 justify-end flex-wrap">
            <Button variant="outline" onClick={handleDownloadStatement} disabled={!ledgerData}>
              <FileText size={16} className="mr-1" />
              Financial Sheet
            </Button>
            <Button variant="outline" onClick={() => setShowFeeOverride(true)}>
              Edit This Student&apos;s Fees
            </Button>
            <Button onClick={openPaymentDialog}>
              <Plus size={16} className="mr-1" />
              Record Payment
            </Button>
          </div>

          {/* The standalone "Custom fee structure" banner used to sit here. It is
              now a popover on the "Custom fees" badge beside the student's class,
              which shows itself once on load and then stays out of the way. */}

          {ledgerLoading && <Card className="p-6 text-gray-500">Loading...</Card>}
          {ledgerError && (
            <Card className="p-6 text-red-600">
              {/reach database|connect|ECONNREFUSED|ETIMEDOUT/i.test(ledgerError)
                ? 'Unable to connect to the database. Please try again in a moment.'
                : 'Failed to load finance data. Please try again.'}
            </Card>
          )}

          {!ledgerLoading && !ledgerError && ledgerData && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-2 md:gap-4">
                {/* Clickable because the transaction table no longer lists the
                    fee-structure charges — this card is where the full picture
                    lives. The label and figure are untouched; only the wrapper
                    is new. */}
                <Card className="p-2 md:p-4">
                  <button
                    type="button"
                    onClick={() => { setEntryError(null); setEditingEntryId(null); setShowChargeBreakdown(true); }}
                    className="w-full text-left"
                    title="See every charge, including fees"
                    style={{
                      cursor: 'pointer', background: 'none', border: 0, padding: 0,
                      // This is why this card's figure sat higher and tighter to
                      // its title than the other two. Card is `flex flex-col
                      // gap-6`, so in the neighbouring cards the label and the
                      // figure are two flex children with 24px of gap between
                      // them, on top of the label's own mb-1. Here both <p>s are
                      // wrapped in this button, which is a SINGLE child — the
                      // gap has nothing to apply between, leaving only the 4px
                      // margin. Restating the same gap inside the button gives
                      // it the identical 4px + 24px the others get.
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1.5rem',
                    }}
                  >
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Charged</p>
                    <p className="text-xs md:text-xl font-medium text-gray-900">
                      {ledgerData.totalCharged.toLocaleString()} FCFA
                    </p>
                  </button>
                </Card>
                {/* Outlined in the same green as the figure it contains.
                    #16a34a is Tailwind's green-600, the literal value behind the
                    text-green-600 below — written out because a border-green-600
                    utility is not in the frozen build and would render nothing. */}
                <Card className="p-2 md:p-4" style={{ borderColor: '#16a34a' }}>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Paid</p>
                  <p className="text-xs md:text-xl font-medium text-green-600">
                    {ledgerData.totalPaid.toLocaleString()} FCFA
                  </p>
                </Card>
                {/* Clickable for the same reason Total Charged is: the figure
                    alone doesn't say WHICH fees are behind it, and that is the
                    question anyone looking at a balance actually has. */}
                <Card className={`p-2 md:p-4 ${ledgerData.balance > 0 ? 'bg-red-50 border-red-200' : ''}`}>
                  <button
                    type="button"
                    onClick={() => { setShowOwingBreakdown(true); loadOwing(); }}
                    className="w-full text-left"
                    title="See what is owed, category by category"
                    style={{
                      cursor: 'pointer', background: 'none', border: 0, padding: 0,
                      // Same reasoning as Total Charged above: one flex child, so
                      // the Card's gap-6 needs restating inside the button.
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1.5rem',
                    }}
                  >
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Balance Owed</p>
                    <p className={`text-xs md:text-xl font-medium ${ledgerData.balance > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {ledgerData.balance.toLocaleString()} FCFA
                    </p>
                  </button>
                </Card>
              </div>

              {/* Ledger table */}
              <Card>
                {visibleEntries.length === 0 ? (
                  <p className="p-6 text-gray-500">
                    {ledgerData.entries.length === 0
                      ? 'No financial records yet.'
                      : 'No one-off charges or payments yet. Fees charged from the fee structure are listed under Total Charged.'}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wide">
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium">Type</th>
                          <th className="px-4 py-3 font-medium">Category</th>
                          <th className="px-4 py-3 font-medium">Description</th>
                          <th className="px-4 py-3 font-medium text-right">Amount</th>
                          <th className="px-4 py-3 font-medium">Payment Method</th>
                          <th className="px-4 py-3 font-medium">
                            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                              Actions
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleEntries.map((entry) => (
                          <tr key={entry.id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                              {formatDate(entry.entryDate)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                entry.type === 'CHARGE'
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'bg-green-100 text-green-700'
                              }`}>
                                {entry.type === 'CHARGE' ? 'Charge' : 'Payment'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {entry.category?.name ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-gray-900">{entry.description}</td>
                            <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                              entry.type === 'CHARGE' ? 'text-orange-700' : 'text-green-600'
                            }`}>
                              {entry.type === 'PAYMENT' ? '+' : ''}{entry.amount.toLocaleString()} FCFA
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {entry.paymentMethod ?? '—'}
                            </td>
                            {/* Icon-only, and styled inline: src/index.css is a
                                pre-compiled Tailwind build, so a colour utility
                                that isn't already in it renders as nothing. */}
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                title={`Delete this ${entry.type === 'CHARGE' ? 'charge' : 'payment'}`}
                                aria-label={`Delete ${entry.description}, ${entry.amount.toLocaleString()} FCFA`}
                                onClick={() => requestEntryDelete(entry)}
                                disabled={entryBusy}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  padding: 4, borderRadius: 6, border: 'none', background: 'transparent',
                                  color: '#DC2626', cursor: entryBusy ? 'default' : 'pointer',
                                  opacity: entryBusy ? 0.5 : 1,
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}

          {/* What is still owed, category by category, against what each was
              charged. Opened from the Balance Owed card.

              Served entirely by GET /ledger/student/:id/owing, which already
              returns `charged`, `paid` and `owing` per category — no new
              endpoint, and no arithmetic repeated on the client. Doing the
              subtraction here would be a second implementation of the
              allocation rule the server applies (tagged payments settle their
              own category, untagged money fills oldest-first), and the two would
              eventually disagree about the same student. */}
          <Dialog open={showOwingBreakdown} onOpenChange={setShowOwingBreakdown}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>What is owed</DialogTitle>
                <DialogDescription>
                  Each fee category, what {displayInfo.firstName} was charged for it, and
                  what is still outstanding.
                </DialogDescription>
              </DialogHeader>

              <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                {owingLoading ? (
                  <p className="text-sm text-gray-500">Loading…</p>
                ) : owingCategories.length === 0 ? (
                  <p className="text-sm text-gray-500">No fee categories to show.</p>
                ) : (
                  <>
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.375rem 0', borderBottom: '1px solid #E5E7EB',
                      }}
                      className="text-xs text-gray-400 uppercase tracking-wide"
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>Category</span>
                      <span style={{ width: 130, textAlign: 'right' }}>Charged</span>
                      <span style={{ width: 130, textAlign: 'right' }}>Owed</span>
                    </div>
                    {/* Grouped under the two fixed headings. A group with no
                        categories is skipped entirely rather than rendering an
                        empty heading — a school with no registration fee is a
                        normal school, not a missing one. */}
                    {(['REGISTRATION', 'OTHER_FEES'] as const).flatMap((g) => {
                      const inGroup = owingCategories.filter((c) => (c.group ?? 'OTHER_FEES') === g);
                      if (inGroup.length === 0) return [];
                      return [
                        <p
                          key={`hdr-${g}`}
                          className="text-xs"
                          style={{ color: '#6B7280', fontWeight: 600, margin: '0.6rem 0 0.1rem' }}
                        >
                          {g === 'REGISTRATION' ? 'Registration' : 'Other Fees'}
                        </p>,
                        ...inGroup.map((c) => (
                      <div
                        key={c.key}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                          padding: '0.5rem 0', borderBottom: '1px solid #F3F4F6',
                        }}
                      >
                        <span className="text-sm" style={{ flex: 1, minWidth: 0 }}>{c.name}</span>
                        <span
                          className="text-sm"
                          style={{ width: 130, textAlign: 'right', whiteSpace: 'nowrap' }}
                        >
                          {c.charged.toLocaleString()} FCFA
                        </span>
                        {/* Settled categories are greyed rather than hidden.
                            A category that vanished once paid would be
                            indistinguishable from one that never applied. */}
                        <span
                          className="text-sm font-medium"
                          style={{
                            width: 130, textAlign: 'right', whiteSpace: 'nowrap',
                            color: c.owing > 0 ? '#dc2626' : '#9CA3AF',
                          }}
                        >
                          {c.owing.toLocaleString()} FCFA
                        </span>
                      </div>
                        )),
                      ];
                    })}
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.625rem 0', borderTop: '1px solid #E5E7EB',
                      }}
                    >
                      <span className="text-sm font-medium" style={{ flex: 1, minWidth: 0 }}>Total</span>
                      <span
                        className="text-sm font-medium"
                        style={{ width: 130, textAlign: 'right', whiteSpace: 'nowrap' }}
                      >
                        {owingCategories.reduce((n, c) => n + c.charged, 0).toLocaleString()} FCFA
                      </span>
                      <span
                        className="text-sm font-medium"
                        style={{
                          width: 130, textAlign: 'right', whiteSpace: 'nowrap',
                          color: '#dc2626',
                        }}
                      >
                        {owingCategories.reduce((n, c) => n + c.owing, 0).toLocaleString()} FCFA
                      </span>
                    </div>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Every charge, including the fee-structure ones the table hides. */}
          <Dialog
            open={showChargeBreakdown}
            onOpenChange={(open) => {
              setShowChargeBreakdown(open);
              if (!open) { setEditingEntryId(null); setEntryError(null); }
            }}
          >
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>All charges</DialogTitle>
                <DialogDescription>
                  Everything {displayInfo.firstName} has been charged, including the fees the
                  transaction list leaves out.
                </DialogDescription>
              </DialogHeader>

              {entryError && (
                <p className="text-sm" style={{ color: '#e0552e' }}>{entryError}</p>
              )}

              <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                <p className="text-xs text-gray-400 mb-2" style={{ marginTop: 4 }}>
                  From the fee structure
                </p>
                {feeStructureCharges.length === 0 ? (
                  <p className="text-sm text-gray-500 mb-3">No fees charged yet.</p>
                ) : (
                  feeStructureCharges.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.5rem 0', borderBottom: '1px solid #F3F4F6',
                      }}
                    >
                      <span className="text-sm" style={{ flex: 1, minWidth: 0 }}>
                        {entry.category?.name ?? entry.description}
                      </span>
                      <span className="text-sm font-medium" style={{ whiteSpace: 'nowrap' }}>
                        {entry.amount.toLocaleString()} FCFA
                      </span>
                      {/* Routes to the override dialog — the single place fee
                          amounts are edited — rather than editing here. */}
                      <Button variant="outline" size="sm" onClick={editFeeStructure}>Edit</Button>
                    </div>
                  ))
                )}

                <p className="text-xs text-gray-400 mb-2" style={{ marginTop: 16 }}>
                  One-off charges
                </p>
                {oneOffCharges.length === 0 ? (
                  <p className="text-sm text-gray-500">No one-off charges.</p>
                ) : (
                  oneOffCharges.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.5rem 0', borderBottom: '1px solid #F3F4F6', flexWrap: 'wrap',
                      }}
                    >
                      {editingEntryId === entry.id ? (
                        <>
                          <Input
                            value={entryEditForm.description}
                            onChange={(e) => setEntryEditForm((f) => ({ ...f, description: e.target.value }))}
                            placeholder="Description"
                            style={{ flex: 1, minWidth: 160 }}
                          />
                          <Input
                            type="number"
                            value={entryEditForm.amount}
                            onChange={(e) => setEntryEditForm((f) => ({ ...f, amount: e.target.value }))}
                            placeholder="Amount"
                            style={{ width: 120 }}
                          />
                          <Button size="sm" onClick={() => handleEntrySave(entry)} disabled={entryBusy}>
                            {entryBusy ? 'Saving…' : 'Save'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setEditingEntryId(null)} disabled={entryBusy}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-sm" style={{ flex: 1, minWidth: 0 }}>{entry.description}</span>
                          <span className="text-sm font-medium" style={{ whiteSpace: 'nowrap' }}>
                            {entry.amount.toLocaleString()} FCFA
                          </span>
                          <Button variant="outline" size="sm" onClick={() => beginEditEntry(entry)} disabled={entryBusy}>
                            Edit
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => requestEntryDelete(entry)} disabled={entryBusy}>
                            Remove
                          </Button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderTop: '1px solid #E5E7EB', paddingTop: '0.75rem', marginTop: '0.5rem',
                }}
              >
                <span className="text-sm text-gray-600">Total charged</span>
                <span className="text-sm font-medium">
                  {(ledgerData?.totalCharged ?? 0).toLocaleString()} FCFA
                </span>
              </div>
            </DialogContent>
          </Dialog>

          {/* The fee banner that used to close out this tab is gone: its wording
              is now on the popover attached to the dot beside the student's
              name, which is where somebody looks when they want to know what the
              colour means. Saying it in both places would just be saying it
              twice. The marks banner above the tabs is untouched. */}

          {settleGroup && (
            <SettleGroupDialog
              open
              onOpenChange={(o) => { if (!o) setSettleGroup(null); }}
              studentCode={String(student.id)}
              studentName={`${displayInfo.firstName} ${displayInfo.lastName}`}
              group={settleGroup}
              onSettled={(recorded, total) => {
                toast.success(
                  `${recorded} payment${recorded === 1 ? '' : 's'} recorded — ${total.toLocaleString()} FCFA`,
                );
                // Re-read rather than patch: the same reason the dialog does not
                // compute amounts. The server has just changed several figures.
                cache.invalidateOn('ledger:write');
                void loadOwing();
                void refreshLedger();
              }}
            />
          )}

          <StudentFeeOverrideDialog
            open={showFeeOverride}
            onOpenChange={setShowFeeOverride}
            studentCode={String(student.id)}
            studentName={`${displayInfo.firstName} ${displayInfo.lastName}`}
            overridden={feesOverridden}
            onChanged={async () => {
              // Re-read the student so the indicator and the fee figures reflect
              // what was actually saved rather than what we assumed.
              try {
                const fresh: any = await api.get(`/students/${encodeURIComponent(String(student.id))}`);
                setFeesOverridden(Boolean(fresh?.feesOverridden));
              } catch {}
              await refreshLedger();
            }}
          />

          {/* Delete-a-record confirmation. Deliberately not window.confirm: what
              deleting costs differs by row kind, and saying so is the point of
              asking at all. */}
          <Dialog
            open={entryPendingDelete !== null}
            onOpenChange={(open) => {
              if (!open && !entryBusy) { setEntryPendingDelete(null); setEntryError(null); }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  Delete this {entryPendingDelete?.type === 'CHARGE' ? 'charge' : 'payment'}?
                </DialogTitle>
                <DialogDescription>
                  {entryPendingDelete && (
                    <>
                      <strong>{entryPendingDelete.description}</strong>{' '}
                      — {entryPendingDelete.amount.toLocaleString()} FCFA on{' '}
                      {formatDate(entryPendingDelete.entryDate)}.{' '}
                      {entryPendingDelete.type === 'PAYMENT'
                        ? `Removing it means ${displayInfo.firstName} is treated as never having paid it, so the balance goes back up and the fee status may change.`
                        : `Removing it takes that amount off what ${displayInfo.firstName} owes.`}
                      {' '}This cannot be undone.
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              {entryError && <p className="text-sm" style={{ color: '#e0552e' }}>{entryError}</p>}
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline" disabled={entryBusy}>Cancel</Button>
                </DialogClose>
                <Button variant="destructive" onClick={confirmEntryDelete} disabled={entryBusy}>
                  {entryBusy ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Record Payment dialog */}
          <Dialog open={showPayment} onOpenChange={(open) => { setShowPayment(open); if (!open) setSubmitError(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
              </DialogHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingTop: '0.5rem' }}>
                {/* Category FIRST: the amount has no meaning, and no ceiling,
                    until we know which fee the money is for. */}
                <div>
                  <Label>Paying for</Label>
                  <Select
                    value={paymentForm.feeKey}
                    onValueChange={(v) => {
                      setSubmitError(null);
                      // Deliberately does NOT pre-fill the amount. A pre-filled
                      // figure gets accepted without being read, and "the whole
                      // outstanding balance" is a guess about what was handed
                      // over. The amount owed is shown as guidance instead.
                      setPaymentForm(f => ({ ...f, feeKey: v, amount: '' }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={owingLoading ? 'Loading…' : 'Select fee'} />
                    </SelectTrigger>
                    {/* EVERY category in this student's fee structure is listed,
                        including the ones with nothing to pay. Hiding those was
                        what made a class of five categories show three, with no
                        way to tell "already paid" from "never charged" from
                        "this class has no such fee". The ones that cannot take
                        money are greyed and explain themselves when picked
                        rather than being disabled, since a row that does not
                        respond to a click reads as broken. */}
                    <SelectContent>
                      {/* Grouped, and a group with no categories renders nothing
                          at all rather than a heading over an empty list — a
                          school with no registration fee is perfectly valid. */}
                      {(['REGISTRATION', 'OTHER_FEES'] as const).flatMap((g) => {
                        const inGroup = owingCategories.filter((c) => (c.group ?? 'OTHER_FEES') === g);
                        if (inGroup.length === 0) return [];
                        return [
                          <div
                            key={`hdr-${g}`}
                            className="text-xs"
                            style={{ color: '#6B7280', fontWeight: 600, padding: '6px 8px 2px' }}
                          >
                            {g === 'REGISTRATION' ? 'Registration' : 'Other Fees'}
                          </div>,
                          ...inGroup.map(c => (
                            <SelectItem
                              key={c.key}
                              value={c.key}
                              style={c.owing > 0 ? undefined : { color: '#9CA3AF' }}
                            >
                              {c.owing > 0
                                ? `${c.name} — ${c.owing.toLocaleString()} owing`
                                : `${c.name} — ${c.charged > 0 ? 'fully paid' : 'nothing charged'}`}
                            </SelectItem>
                          )),
                        ];
                      })}
                    </SelectContent>
                  </Select>
                  {!owingLoading && owingCategories.length === 0 && (
                    <p className="text-sm text-gray-500" style={{ marginTop: 4 }}>
                      This student has no fee categories yet.
                    </p>
                  )}
                  {/* Why the category that was just picked cannot take money. */}
                  {selectedOwing && selectedOwing.owing <= 0 && (
                    <p className="text-sm" style={{ marginTop: 4, color: '#e0552e' }}>
                      {selectedOwing.charged > 0
                        ? `${displayInfo.firstName} has fully paid ${selectedOwing.name}. There is nothing left to pay against it.`
                        : `${selectedOwing.name} does not have a charged amount, so there is nothing to pay toward it yet.`}
                    </p>
                  )}
                </div>
                <div>
                  <Label>Amount (FCFA)</Label>
                  <Input
                    type="number"
                    min="1"
                    max={selectedOwing ? selectedOwing.owing : undefined}
                    value={paymentForm.amount}
                    onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                    // The owed figure lives here, as guidance rather than as a
                    // value that would be submitted unread.
                    placeholder={selectedOwing && selectedOwing.owing > 0
                      ? `${selectedOwing.owing.toLocaleString()} still owing for ${selectedOwing.name}`
                      : '0'}
                    disabled={!selectedOwing || selectedOwing.owing <= 0}
                  />
                  {selectedOwing && selectedOwing.owing > 0 && Number(paymentForm.amount) > selectedOwing.owing && (
                    <p className="text-xs" style={{ marginTop: 4, color: '#B91C1C' }}>
                      Above the {selectedOwing.owing.toLocaleString()} owing for {selectedOwing.name}
                    </p>
                  )}
                </div>
                <div>
                  <Label>Notes</Label>
                  <Input
                    value={paymentForm.description}
                    onChange={e => setPaymentForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={paymentForm.entryDate}
                    onChange={e => setPaymentForm(f => ({ ...f, entryDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <Select value={paymentForm.paymentMethod} onValueChange={(v) => setPaymentForm(f => ({ ...f, paymentMethod: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {submitError && <p className="text-sm text-red-600">{submitError}</p>}
              </div>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline" disabled={submitting}>Cancel</Button>
                </DialogClose>
                {/* A category with nothing owing is listed and selectable so it
                    can explain itself, but it can never be paid against. */}
                <Button
                  onClick={handlePaymentSubmit}
                  disabled={submitting || !selectedOwing || selectedOwing.owing <= 0}
                >
                  {submitting ? 'Saving...' : 'Record Payment'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {activeTab === 'marks' && (
        <Card className="p-6">
          {/* The same report card the Report Cards page produces, reachable from
              the marks it is generated from. */}
          <div className="flex items-center justify-end" style={{ marginBottom: '0.75rem' }}>
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={() => setReportCardOpen(true)}
            >
              <FileText size={16} />
              Download report card
            </Button>
          </div>
          <ReportCardTermDialog
            open={reportCardOpen}
            onOpenChange={(v) => { if (!v) { setReportCardOpen(false); setReportCardError(null); } }}
            busy={reportCardBusy}
            progress={reportCardError}
            title={`Report card — ${displayInfo.firstName} ${displayInfo.lastName}`}
            onConfirm={async (terms) => {
              setReportCardBusy(true);
              setReportCardError(null);
              try {
                await downloadReportCard(
                  {
                    code: String(student.id),
                    firstName: displayInfo.firstName,
                    lastName: displayInfo.lastName,
                    class: displayInfo.class,
                  },
                  terms,
                  marksYear || yearStatus?.activeYear || '',
                );
                setReportCardOpen(false);
              } catch (e: any) {
                setReportCardError(e?.message || 'Could not generate the report card.');
              } finally {
                setReportCardBusy(false);
              }
            }}
          />
          <div className="flex items-end gap-3" style={{ marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 160 }}>
              <Label>Academic Year</Label>
              <AcademicYearSelect
                value={marksYear}
                onChange={setMarksYear}
                years={yearStatus?.years ?? []}
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <Label>Term</Label>
              <Select value={marksTerm} onValueChange={setMarksTerm}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Term 1', 'Term 2', 'Term 3'].map(t => (
                    <SelectItem key={t} value={t}>{formatTermLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {breakdownError && <p className="text-sm" style={{ color: '#B91C1C' }}>{breakdownError}</p>}
          {breakdownLoading ? (
            <p className="text-sm text-gray-500">Loading marks...</p>
          ) : !breakdown || breakdown.length === 0 ? (
            <p className="text-sm text-gray-500">
              No tests or exams recorded for {marksYear} {formatTermLabel(marksTerm)}.
            </p>
          ) : (
            <div className="space-y-4">
              {breakdown.map((subject: any) => (
                <div key={subject.subjectId} style={{ border: '1px solid #E5E7EB', borderRadius: 6, padding: '0.75rem' }}>
                  <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
                    <p style={{ fontWeight: 600 }}>{subject.subjectName}</p>
                    {/* Only the counted assessments make up the total; exempt and
                        still-unmarked ones are shown in the rows but contribute to
                        neither side, so "0/0" would be a lie about a real score. */}
                    <p className="text-sm text-gray-600">
                      {subject.counted > 0
                        ? `${subject.marksObtained} / ${subject.totalMarks}`
                        : 'Not yet marked'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {(subject.testExams ?? []).map((t: any) => (
                      <div key={t.testExamId} className="flex items-center gap-2">
                        <span className="text-sm" style={{ flex: 1 }}>
                          {t.name}
                          <span className="text-sm text-gray-400"> · {t.type === 'EXAM' ? 'Exam' : 'Test'}</span>
                        </span>
                        {t.state === 'EXEMPT' ? (
                          <span className="text-sm" style={{ color: '#05603D', fontWeight: 500 }}>Exempt</span>
                        ) : t.state === 'UNMARKED' ? (
                          <span className="text-sm text-gray-400">Not marked</span>
                        ) : (
                          <span
                            className="text-sm"
                            style={{
                              fontWeight: 500,
                              // A zero is the thing the banner sent them here to
                              // find, so it is the one value worth colouring.
                              color: t.marksObtained === 0 ? ZERO_MARK_COLOR : undefined,
                            }}
                          >
                            {t.marksObtained} / {t.totalMarks}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'attendance' && (
        <StudentAttendancePanel
          studentCode={String(student.id)}
          studentName={`${displayInfo.firstName} ${displayInfo.lastName}`}
          className={displayInfo.class}
        />
      )}
    </div>
  );
}

function Field({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string | undefined;
  capitalize?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</dt>
      <dd className={`text-sm text-gray-900 ${capitalize ? 'capitalize' : ''}`}>
        {value || '—'}
      </dd>
    </div>
  );
}

function MedicalField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-sm text-gray-900 whitespace-pre-wrap">
        {value && value.trim() ? value.trim() : (
          <span className="text-gray-400 italic">None recorded</span>
        )}
      </dd>
    </div>
  );
}
