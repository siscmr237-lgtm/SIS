import { ArrowLeft, Edit, FileText, Megaphone, MessageCircle, MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { popMotionCss } from './ui/motionCss';
import * as Popover from '@radix-ui/react-popover';
import { generateFeeDriveNotice, generateFinancialSheet } from '../utils/pdfGenerator';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ThreePartDateInput } from './ThreePartDateInput';
import { PaymentConfirmationDialog } from './PaymentConfirmationDialog';
import { PayFeesDialog, PayFeesSubmission } from './PayFeesDialog';
import { DoneBy } from './DoneBy';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from './ui/select';
import { ParentTypeahead, ParentMatch } from './ParentTypeahead';
import { buildParentPayload, ParentBaseline } from '../utils/parentPayload';
import { isCompleteFullName, joinFullName, splitFullName } from '../utils/fullName';
import { PAYMENT_METHODS } from '../utils/paymentMethods';
import { ContentLoader } from './ContentLoader';

interface LedgerEntry {
  id: string;
  type: 'CHARGE' | 'PAYMENT';
  description: string;
  amount: number;
  entryDate: string;
  paymentMethod?: string | null;
  /**
   * The receipt number, "2026/2027-0042". Payments only — null on every charge,
   * for good, since payments are LedgerEntry rows rather than a table of their
   * own. Issued once and never reissued, so this is what a parent quotes.
   */
  receiptNumber?: string | null;
  category?: { name: string } | null;
  /**
   * True on the one charge that bills a fee from the student's fee structure —
   * Tuition, Registration, Books and so on. The server has always sent it (the
   * ledger query selects no subset); it simply was not modelled here before.
   * These lines are hidden from the transaction table and shown in the Total
   * Charged breakdown instead.
   */
  isFeeStructureCharge?: boolean;
  /**
   * Which fee this row settles, by name, resolved by the server.
   *
   * Not interchangeable with `category`: a fee payment is tagged through
   * classLevelFeeId / studentFeeOverrideId / settlesEntryId and carries
   * categoryId: null, so category is empty on every payment. Read by the
   * financial-sheet PDF's Fee column.
   */
  feeName?: string | null;
  /**
   * Who recorded this entry, as it read at the moment they did. NULL on every
   * row written before attribution existed, and on the fee-structure charges the
   * server writes by itself — neither has a person behind it to name.
   */
  createdByName?: string | null;
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

/**
 * WHY A REMINDER WAS REFUSED, IN WORDS A SCHOOL SECRETARY CAN ACT ON.
 *
 * One map, read both by the button that goes disabled BEFORE a send and by the
 * dialog that reports a refusal AFTER one, so the same situation is never
 * described two different ways depending on when it was noticed.
 *
 * It exists because every non-success used to collapse into "The reminder could
 * not be sent." A send the provider had refused was reported with that sentence
 * and no more, and finding out what had actually happened meant reading the
 * hosting provider's request log. Whatever the server refuses for, it says so by
 * name; this turns the name into a sentence and nothing is thrown away.
 */
function feeReminderReason(
  reason: string | null | undefined,
  row?: { lastSentAt?: string | null; nextEligibleAt?: string | null; storedPhone?: string | null } | null,
  fallback?: string | null,
): string {
  const onDay = (v?: string | null) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? null
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  switch (reason) {
    case 'cooldown_active': {
      const sent = onDay(row?.lastSentAt);
      const next = onDay(row?.nextEligibleAt);
      if (sent && next) return `Already reminded on ${sent}. Next reminder available ${next}.`;
      if (sent) return `Already reminded on ${sent}.`;
      return 'This guardian was reminded recently.';
    }
    case 'duplicate_same_day':
      return 'A reminder was already sent today.';
    case 'no_consent':
      return 'This guardian has not agreed to WhatsApp messages.';
    case 'no_number':
      return row?.storedPhone
        ? `"${row.storedPhone}" is not a number this can send to — it needs its country code.`
        : 'No phone number is on file for this guardian.';
    case 'nothing_outstanding':
      return 'Nothing outstanding.';
    case 'NOT_CONFIGURED':
      return 'WhatsApp is not set up on the server yet.';
    case 'NO_TEMPLATE':
      return 'No approved message template is configured.';
    case 'TIMEOUT':
      return 'WhatsApp did not answer in time. It may still have been sent — check before resending.';
    case 'NETWORK':
      return 'Could not reach WhatsApp. Try again shortly.';
    default:
      // Anything else is a provider refusal, and its own message is more
      // specific than any sentence written here — Twilio names the actual
      // problem, and discarding that is what made this hard to diagnose.
      return fallback || 'The reminder could not be sent.';
  }
}

/** One student's answer from GET /whatsapp/fee-reminder/eligibility. */
/**
 * WHETHER THE PAYMENT-RECEIPT MESSAGE IS AVAILABLE. It is not.
 *
 * The server route answers 503 unless WHATSAPP_PAYMENT_CONFIRMATION_ENABLED is
 * set, because it still composes free TEXT — which WhatsApp does not accept for
 * a message a business starts — and the approved template that would replace it
 * (fee_payment_received) is still PENDING review. This constant keeps the UI
 * honest about that instead of offering a button whose only outcome is an error
 * dialog seconds after somebody recorded a payment.
 *
 * A button that throws is worse than a button that is not there: the payment
 * WAS recorded, and an error at that moment reads as though it was not.
 *
 * Flip this to true at the same time as the server variable.
 */
const PAYMENT_RECEIPT_ENABLED = false;

/**
 * FEE OUTREACH — the Fee Drive Letter and the Send Fee Reminder controls.
 *
 * Hidden for now, at the request of the school. Both work: the letter is a PDF
 * this screen already generates, and the reminder is the WhatsApp template
 * route. Neither is being removed, and nothing below them has been deleted —
 * the handlers, the eligibility fetch and the confirmation dialog are all still
 * here, so bringing them back is this one line.
 *
 * HIDDEN RATHER THAN DISABLED, which is the opposite of what the reminder
 * button does for its own per-student reasons. That distinction is deliberate:
 * a DISABLED button says "not for this student, and here is why", which is
 * information the office needs. This is "not available to anyone yet", which is
 * not about the student in front of them and would only be noise on every row.
 */
const FEE_OUTREACH_ENABLED = false;

interface FeeReminderRow {
  studentId: string;
  studentName: string;
  guardianName: string;
  /** Post-normalisation, exactly the digits the message will be sent to. */
  phone: string | null;
  /** What is on file, so an unusable number can be shown and corrected. */
  storedPhone: string | null;
  balance: number;
  state: 'ready' | 'no_consent' | 'no_number' | 'nothing_outstanding'
    | 'cooldown_active' | 'duplicate_same_day';
  daysAgo?: number;
  lastSentAt?: string | null;
  nextEligibleAt?: string | null;
}

interface FeeReminderEligibility {
  schoolName: string;
  /** "1st Term 2026/2027" — appears in the message as {{3}}. */
  termLabel: string;
  cooldownDays: number;
  configured: boolean;
  students: FeeReminderRow[];
}

interface StudentProfileProps {
  student: Student;
  onNavigate: (page: NavigationPage) => void;
}

type Tab = 'general' | 'finance' | 'marks' | 'attendance';

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
    parentWhatsappConsent: Boolean((student as any).parentWhatsappConsent),
    class: student.class || '',
    allergies: student.allergies || '',
    medicalConditions: student.medicalConditions || '',
    currentMedications: student.currentMedications || '',
    medicalNotes: student.medicalNotes || '',
  });
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '', gender: '', dateOfBirth: '',
    enrollmentDate: '', address: '', parentName: '', parentPhone: '', class: '',
    parentWhatsappConsent: false,
    allergies: '', medicalConditions: '', currentMedications: '', medicalNotes: '',
  });
  // Tracks the parent last confirmed for this edit session — the student's
  // existing link when the dialog opens, or whatever was picked via the
  // typeahead since. See buildParentPayload for how this decides between
  // relinking, editing that parent's own record in place, or creating a new one.
  const [parentBaseline, setParentBaseline] = useState<ParentBaseline>({
    id: displayInfo.parentId, name: displayInfo.parentName, phone: displayInfo.parentPhone,
    whatsappConsent: displayInfo.parentWhatsappConsent,
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
  // The finance ⋯ menu keeps no state here: Radix owns open/closed, dismissal
  // and focus. What used to live here was a boolean plus a document-level
  // mousedown listener to close on an outside click — see the menu itself for
  // why that is now Radix's job.

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /**
   * The WhatsApp message that has been ASKED for but not yet sent, or null.
   *
   * One piece of state for both messages, and one dialog rendered from it, so
   * the reminder and the receipt cannot drift apart in how they confirm, how
   * they report a failure or what they do while in flight. The variant carries
   * the only thing that differs: a receipt names the amount just recorded.
   *
   * Nothing here is sent without passing through this state first. Both flows
   * reach a parent's phone with a figure from the ledger on it and neither can
   * be undone, so the confirmation step is not a courtesy.
   */
  const [waAction, setWaAction] = useState<{ kind: 'reminder' } | { kind: 'receipt'; amount: number } | null>(null);
  const [waBusy, setWaBusy] = useState(false);
  const [waError, setWaError] = useState<string | null>(null);
  /** The text the server actually sent, shown back verbatim once it has. */
  const [waSent, setWaSent] = useState<string | null>(null);
  /**
   * Defers the post-payment receipt prompt. See scheduleReceiptPrompt below for
   * why the delay exists; the ref is here so an unmount can cancel it.
   */
  /**
   * WHETHER A FEE REMINDER MAY BE SENT, ANSWERED BY THE SERVER.
   *
   * Not derived here from the balance. The server applies four rules — consent,
   * a number that can actually be dialled, something outstanding, and a 14-day
   * cooldown — and only it can see the last one, because the cooldown lives in
   * the message log. Computing a different answer on this side would let the
   * button offer a send the server then refuses, which is the failure the whole
   * confirmation step exists to avoid.
   */
  const [feeElig, setFeeElig] = useState<FeeReminderEligibility | null>(null);
  /**
   * The fee-drive date the message will quote. Required: the approved template
   * states that the school WILL hold a drive on this day, and there is no such
   * date stored anywhere, so the person sending has to supply the one they know.
   */
  const [feeDriveDate, setFeeDriveDate] = useState('');
  /** The payment whose WhatsApp receipt is being confirmed, or null. */
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const waPromptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (waPromptTimer.current) clearTimeout(waPromptTimer.current);
  }, []);

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
    // PayFeesDialog clears its own amounts, date and method whenever it opens,
    // so there is nothing to reset here beyond the error.
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

  /**
   * Radix drives the popover too — the badge's own click, a click anywhere
   * outside, Escape — and every one of those has to cancel a close already in
   * flight. Without this the 400ms timer a hover left behind fires after a
   * deliberate reopen and shuts it again a moment later.
   */
  const setFeeInfoOpenNow = (next: boolean) => {
    clearFeeInfoTimer();
    setFeeInfoOpen(next);
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

  /**
   * Record every fee the table has an amount against, as ONE act.
   *
   * Sent to POST /ledger/payments, which writes the rows inside a single
   * transaction. Looping POST /ledger/payment from here would put each fee in
   * its own request, so a cap rejection or a dropped connection partway through
   * would leave some fees paid, some not, and nothing on screen saying which —
   * the one outcome that must not be possible with money.
   *
   * Rows left empty are skipped, and so are rows already settled: `owing <= 0`
   * disables the input, so a fully-paid fee cannot contribute an amount at all.
   */
  const handlePaymentSubmit = async ({ entries, entryDate, paymentMethod, total }: PayFeesSubmission) => {
    setSubmitError(null);

    if (entries.length === 0) {
      setSubmitError('Enter an amount against at least one fee.');
      return;
    }
    // Belt and braces. The dialog's inputs clamp as they are typed and the
    // server caps again, but an owing figure that went stale between load and
    // submit would slip past the first, and a message naming the fee is more use
    // than a 400. Checked HERE because owingCategories lives here — the dialog
    // is handed the figures, it does not own them.
    const byKey = new Map(owingCategories.map((c) => [c.key, c]));
    for (const e of entries) {
      const fee = byKey.get(e.feeKey);
      if (!fee) {
        setSubmitError('That fee is no longer on this student\'s account.');
        return;
      }
      if (e.amount > fee.owing) {
        setSubmitError(`${fee.name} has only ${fee.owing.toLocaleString()} FCFA outstanding.`);
        return;
      }
    }
    if (!entryDate) {
      setSubmitError('Choose the date the money was received.');
      return;
    }

    setSubmitting(true);
    try {
      const res: any = await api.post('/ledger/payments', {
        studentId: student.id,
        entryDate,
        paymentMethod: paymentMethod || undefined,
        // Each row names the fee it settles, which is what makes paying Tuition
        // clear Tuition instead of the oldest charge on the account.
        entries,
      });
      cache.invalidateOn('ledger:write');
      setShowPayment(false);
      const recorded = res?.recorded ?? entries.length;
      // The server's figure, not the dialog's: it caps each row against what is
      // actually owed, so the total banked can be less than the total typed — and
      // this number is about to be read out to a parent as money received.
      const paidTotal: number = res?.total ?? total;
      toast.success(
        `${recorded} payment${recorded === 1 ? '' : 's'} recorded — ${paidTotal.toLocaleString()} FCFA`,
      );
      // BOTH, and loadOwing is the one that used to be missing here. This dialog
      // caps against owingCategories, so leaving them stale after a payment left
      // the next open offering a fee that had just been settled — and left the
      // Settle Registration button showing for a group that no longer owed
      // anything, since that button reads the same list.
      await Promise.all([refreshLedger(), loadOwing()]);
      // NOT OFFERED AT PRESENT. The payment-confirmation endpoint is switched
      // off behind WHATSAPP_PAYMENT_CONFIRMATION_ENABLED — it still sends free
      // text, which WhatsApp refuses for a message a business starts, and the
      // fee_payment_received template that would replace it is still pending
      // approval. Prompting here would open a dialog whose only outcome is a
      // 503, immediately after somebody recorded money.
      //
      // Deliberately left as a call site rather than deleted, so turning the
      // feature on is one line here and one environment variable.
      if (PAYMENT_RECEIPT_ENABLED && canWhatsApp) scheduleReceiptPrompt(paidTotal);
    } catch (e: any) {
      setSubmitError(e.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * WHETHER THIS STUDENT CAN BE MESSAGED AT ALL.
   *
   * Read from displayInfo rather than the `student` prop, and that is the whole
   * reason this is derived on every render instead of held in state: editing the
   * guardian on the General tab writes to displayInfo, so a number added while
   * this page is open makes the buttons appear without a reload — and a number
   * removed makes them go away, which matters more.
   *
   * No phone means no buttons ANYWHERE, rather than a disabled button or a
   * dialog that fails on submit: the server refuses the send in that case, and
   * an action offered only to be refused is worse than one that is absent.
   */
  const waParentPhone = String(displayInfo.parentPhone ?? '').trim();
  const waParentName = String(displayInfo.parentName ?? '').trim();
  const canWhatsApp = waParentPhone.length > 0;

  /**
   * Ask the server whether a reminder may be sent, and re-ask whenever the
   * ledger changes.
   *
   * The ledger dependency is the point: recording a payment can clear the
   * balance, and the button must stop offering to chase a family who has just
   * paid without anyone reloading the page. Editing the guardian re-runs it too,
   * since consent and the phone number both live on that record.
   */
  const feeEligRow = feeElig?.students?.[0] ?? null;
  const loadFeeEligibility = useCallback(async () => {
    try {
      const res: any = await api.get(
        `/whatsapp/fee-reminder/eligibility?studentId=${encodeURIComponent(student.id)}`,
      );
      setFeeElig(res);
    } catch {
      // A failure here must not break the page. The control simply stays
      // disabled, which is the safe direction: an unknown answer is not a yes.
      setFeeElig(null);
    }
  }, [student.id]);

  useEffect(() => {
    loadFeeEligibility();
  }, [loadFeeEligibility, ledgerData, displayInfo.parentId, displayInfo.parentWhatsappConsent, displayInfo.parentPhone]);

  /**
   * WHY THE REMINDER CANNOT BE SENT, in the words the office needs.
   *
   * Null when it can. Everything here mirrors a rule the SERVER applies, so the
   * button and the endpoint always agree — the wording is this side's business,
   * the decision is not.
   */
  const feeReminderBlockedReason: string | null = (() => {
    if (!feeElig) return 'Checking…';
    if (!feeElig.configured) return 'WhatsApp is not set up on the server yet.';
    if (!feeEligRow) return 'Unavailable for this student.';
    if (feeEligRow.state === 'ready') return null;
    // Same map the post-send failure uses, so a refusal is worded identically
    // whether it was caught before the tap or after it.
    return feeReminderReason(feeEligRow.state, feeEligRow);
  })();
  const canSendReminder = feeReminderBlockedReason === null;
  /** How the confirmation and the sent notice refer to the recipient. */
  const waRecipientLabel = waParentName || "this student's guardian";
  /**
   * The number AS IT WILL BE DIALLED, from the server's own normaliser — not the
   * stored text. These differ ("679379134" is dialled as "+237679379134"), and
   * the dialled form is the one worth checking against the child's name.
   */
  const waDialled = feeEligRow?.phone ?? null;

  const openWhatsAppReminder = () => {
    setWaError(null);
    setWaSent(null);
    setWaAction({ kind: 'reminder' });
  };

  const closeWhatsApp = () => {
    setWaAction(null);
    setWaError(null);
    setWaSent(null);
  };

  /**
   * Ask about the receipt only AFTER the Pay Fees dialog has finished closing.
   *
   * The delay is not cosmetic. DialogOverlay carries
   * `data-[state=closed]:animate-out`, which src/index.css resolves to a real
   * 0.15s `exit` animation (see the rule near index.css:1787), and Radix keeps a
   * closing dialog MOUNTED until that animation ends. Opening this one in the
   * same tick therefore puts two modal layers up at once, and the payment
   * dialog's teardown then runs last — undoing the scroll lock and the
   * `pointer-events: none` bookkeeping that the surviving dialog still needs.
   * The symptom is a dialog nobody can click, on the screen where money was
   * just recorded.
   *
   * 250ms clears the 150ms animation with room to spare. The handle is kept on
   * a ref so leaving the page mid-wait cancels it instead of setting state on an
   * unmounted component.
   */
  const scheduleReceiptPrompt = (amount: number) => {
    if (waPromptTimer.current) clearTimeout(waPromptTimer.current);
    waPromptTimer.current = setTimeout(() => {
      waPromptTimer.current = null;
      setWaError(null);
      setWaSent(null);
      setWaAction({ kind: 'receipt', amount });
    }, 250);
  };

  /**
   * Send whichever message was confirmed.
   *
   * The amount is the only figure this sends; every other number in the message
   * — the balance especially — is computed by the server from the ledger. That
   * is deliberate: this tab holds a balance that was correct when it loaded, and
   * quoting a stale one to a parent is exactly the failure worth avoiding.
   *
   * On success the dialog STAYS OPEN and shows the text that went out, because
   * "what did we actually say to them?" is the question anyone asks next, and a
   * toast is gone before it can be read.
   */
  const sendWhatsApp = async () => {
    if (!waAction) return;
    setWaBusy(true);
    setWaError(null);
    try {
      if (waAction.kind === 'reminder') {
        const res: any = await api.post('/whatsapp/fee-reminder', {
          studentIds: [student.id],
          driveDate: feeDriveDate,
        });
        // A BATCH RESPONSE, even for one student — the endpoint takes a list so
        // a fee drive can go out in one call, and a single send is a list of
        // one. So the per-student outcome has to be unpacked: the request
        // succeeded as an HTTP call even when the one message in it did not.
        const row = res?.results?.[0];
        if (!row?.sent) {
          // THE ACTUAL REASON, not a flattened sentence. row.reason is the
          // server's own name for the refusal — cooldown_active,
          // duplicate_same_day, no_consent, a Twilio error code — and
          // feeReminderReason turns it into something a school secretary can act
          // on, falling back to the provider's own wording when it is more
          // specific than anything we could write. Collapsing all of this into
          // "could not be sent" is what made the last failure take a hosting
          // log to diagnose.
          setWaError(feeReminderReason(row?.reason, row, row?.errorMessage));
        } else {
          setWaSent(
            `Sent to ${row.guardianName || 'the guardian'} at ${row.phone}.

`
            + `Regarding the outstanding fees for ${row.studentName} (${res.termLabel}), `
            + `ahead of the fee drive on ${res.driveDate}.`,
          );
          toast.success('Fee reminder sent');
        }
        // Re-ask the server: this send has just started the cooldown, so the
        // button must go disabled with the new reason rather than invite a
        // second one.
        await loadFeeEligibility();
      } else {
        const res: any = await api.post('/whatsapp/payment-confirmation', {
          studentId: student.id,
          amount: waAction.amount,
        });
        setWaSent(String(res?.message ?? ''));
        toast.success('WhatsApp message sent');
      }
    } catch (e: any) {
      // The server's own wording, which names the actual problem — an
      // unreachable number, a guardian with no phone, a provider refusal. A
      // generic "failed to send" would throw away the only useful part.
      setWaError(e?.message || 'The WhatsApp message could not be sent.');
    } finally {
      setWaBusy(false);
    }
  };

  const handleEditSave = async () => {
    setEditSubmitting(true);
    setEditError(null);
    try {
      const { firstName, lastName } = splitFullName(editForm.fullName);
      const updated = await api.put(`/students/${student.id}`, {
        firstName,
        lastName,
        gender: editForm.gender,
        dateOfBirth: editForm.dateOfBirth || undefined,
        enrollmentDate: editForm.enrollmentDate || undefined,
        address: editForm.address.trim(),
        ...buildParentPayload(
          parentBaseline, editForm.parentName, editForm.parentPhone, editForm.parentWhatsappConsent,
        ),
        class: editForm.class,
        allergies: editForm.allergies.trim() || null,
        medicalConditions: editForm.medicalConditions.trim() || null,
        currentMedications: editForm.currentMedications.trim() || null,
        medicalNotes: editForm.medicalNotes.trim() || null,
      });
      setDisplayInfo({
        firstName,
        lastName,
        gender: editForm.gender,
        dateOfBirth: editForm.dateOfBirth,
        enrollmentDate: editForm.enrollmentDate,
        address: editForm.address.trim(),
        parentId: updated.parentId,
        parentName: updated.parentName,
        parentPhone: updated.parentPhone,
        parentWhatsappConsent: Boolean(updated.parentWhatsappConsent),
        class: editForm.class,
        allergies: editForm.allergies.trim(),
        medicalConditions: editForm.medicalConditions.trim(),
        currentMedications: editForm.currentMedications.trim(),
        medicalNotes: editForm.medicalNotes.trim(),
      });
      setParentBaseline({
        id: updated.parentId, name: updated.parentName, phone: updated.parentPhone,
        whatsappConsent: Boolean(updated.parentWhatsappConsent),
      });
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
    let schoolInfo: { name: string; logo?: string; motto?: string; academicYear?: string } | undefined;
    try {
      const userStr = window.localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user?.School?.[0]) schoolInfo = user.School[0];
      }
    } catch {}
    await generateFinancialSheet(student, ledgerData, schoolInfo);
  };

  /**
   * This student's Fee Drive letter — the same letter the Fee Drive page would
   * print for them, alone on the top half of a sheet.
   *
   * EVERY VALUE COMES FROM GET /ledger/fee-drive, not from localStorage and not
   * from `ledgerData` already loaded on this screen. That endpoint is what the
   * batch letters are drawn from, so asking it for one student is what guarantees
   * the two say the same thing: the same balance, the same academic year and
   * term, and the same signature. Reading the school out of localStorage — which
   * handleDownloadStatement above does — would take a copy written at login, so a
   * session left open across a term change would print last term on the letter;
   * and the proprietor's name is not in that copy at all.
   */
  const [feeDriveBusy, setFeeDriveBusy] = useState(false);
  const handleDownloadFeeDriveLetter = async () => {
    if (feeDriveBusy) return;
    setFeeDriveBusy(true);
    try {
      const res = await api.get(`/ledger/fee-drive?student=${encodeURIComponent(student.id)}`);
      const row = res?.students?.[0];
      // The endpoint only ever returns students who owe something. An empty list
      // means the balance was cleared while this page was open, which is good
      // news and not an error — so it is said plainly rather than thrown.
      if (!row) {
        toast.info('This student has no outstanding balance to write about.');
        return;
      }
      await generateFeeDriveNotice(
        {
          school: { name: res.school.name, motto: res.school.motto, logo: res.school.logo },
          academicYear: res.academicYear,
          term: res.term,
          proprietorSignature: res.proprietor.signature,
        },
        {
          firstName: row.firstName,
          lastName: row.lastName,
          class: row.class,
          balance: row.balance,
        },
      );
    } catch (e: any) {
      toast.error(e?.message || 'The fee drive letter could not be generated.');
    } finally {
      setFeeDriveBusy(false);
    }
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

        /* The tab strip. Four tabs need 378px to sit on one line; a 360px
           phone gives them 328 after the page padding, so they used to wrap to
           two lines and then, below ~375px, overflow <main> — which is a
           scroll container in BOTH axes (overflow-y: auto forces overflow-x
           from visible to auto), so the whole content area panned sideways.
           Now only the strip scrolls.

           The scrollbar is hidden rather than left visible: on the phones
           where this triggers it is an overlay scrollbar nobody sees anyway,
           while on a narrow desktop window a permanent 15px classic track
           under a four-item tab bar reads as broken chrome. The tab clipped
           at the right edge is the affordance. */
        [data-student-tabs] {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        [data-student-tabs]::-webkit-scrollbar { display: none; }
        /* max-content, so the underline rule runs the full scrolled width
           instead of stopping at the visible edge; min-width keeps it
           spanning the strip when the tabs already fit. Written here because
           src/index.css is a frozen build with no w-max or min-w-full in it. */
        [data-student-tabs-row] {
          width: max-content;
          min-width: 100%;
        }

        /* The "Custom fees" bubble.
        
           KEYFRAMES, NOT THE TRANSITION THIS REPLACES. Radix unmounts the
           content when it closes and holds a closing element in the DOM only
           until its animationend fires, so a transition would be discarded the
           instant state flipped and the bubble would vanish rather than fade.
           Keyframes cannot be written in a style attribute, and src/index.css
           is a frozen build, so they live here. Same approach, same timings as
           StudentFeeStatusPopover on the line above. */
        @keyframes sis-custom-fees-in {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes sis-custom-fees-out {
          from { opacity: 1; transform: scale(1); }
          to   { opacity: 0; transform: scale(0.96); }
        }
        [data-custom-fees-popover][data-state="open"] {
          animation: sis-custom-fees-in 150ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        [data-custom-fees-popover][data-state="closed"] {
          animation: sis-custom-fees-out 150ms ease-in;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-custom-fees-popover][data-state="open"],
          [data-custom-fees-popover][data-state="closed"] { animation-duration: 1ms; }
        }

        /* The mobile ⋯ finance menu, further down this file, gets the app's
           standard surface animation. The rules are HERE rather than in the
           scoped block inside the menu itself, and that placement is the whole
           point: Radix keeps a closing menu mounted only until its animation
           ends, so a stylesheet that closes with the menu takes the animation's
           own rule away and the menu is dropped instead of faded. This block is
           on the page, so it outlives every open and close.

           (Nothing in this comment may spell an opening style tag literally —
           it is stylesheet text, which the server escapes and the client does
           not, and the difference hydrates as a text mismatch.) */
${popMotionCss('[data-sis-finance-menu]')}
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
        {/* Popover.Root renders no DOM of its own — it is a context provider —
            so wrapping the paragraph in it costs nothing structurally, and it is
            what lets the bubble live OUTSIDE the <p>. Two reasons it has to:
            Popover.Content is a <div>, which is invalid inside a <p>, and DOM
            order immediately after the badge is what keeps "Review or remove"
            the next tab stop. */}
        <Popover.Root open={feeInfoOpen} onOpenChange={setFeeInfoOpenNow}>
          <p className="text-gray-500 mt-1">
            {student.id} · {displayInfo.class}
            {feesOverridden && (
              <>
                {' · '}
                {/* The explanation lives here rather than in a permanent banner on
                    the Finance tab. It shows itself once on load, fades, and comes
                    back on hover.

                    IT USED TO BE A HAND-ROLLED ABSOLUTE BOX, and that is what made
                    the page wider than the screen. A 300px bubble anchored at the
                    badge, kept mounted and merely visibility:hidden between
                    showings — and a hidden box still generates a box, and a
                    generated box still counts toward scrollable overflow. <main>
                    is a scroll container in both axes, so the CLOSED bubble pushed
                    its scrollWidth past the viewport at every width measured —
                    27px over at 504, 171px over at 360 — and the whole content
                    area panned sideways.

                    Radix positions with strategy:"fixed", so the bubble's
                    containing block is the viewport: it cannot contribute to any
                    ancestor's scroll width, and no ancestor's overflow clips it.
                    It is also only in the DOM while open. Not portalled — it needs
                    a portal for neither of those, and staying in place is what
                    preserves the tab order. */}
                <Popover.Trigger asChild>
                  <button
                    type="button"
                    // Hover opens it on a real pointer, and deliberately NOT on
                    // touch: a tap fires a synthetic mouseenter first, which would
                    // open the bubble a moment before the tap's own click toggled
                    // it shut again — so the badge would do nothing at all on a
                    // phone. That is what it does today, via the old wrapper's
                    // onMouseEnter, and pointerType is what fixes it.
                    onPointerEnter={(e) => { if (e.pointerType !== 'touch') openFeeInfo(); }}
                    onPointerLeave={(e) => { if (e.pointerType !== 'touch') closeFeeInfoSoon(); }}
                    // Keyboard focus reveals it; a tap's focus must not, for the
                    // same toggle-cancels-itself reason as above. :focus-visible is
                    // exactly that distinction, already computed by the browser.
                    onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) openFeeInfo(); }}
                    // Deferred, so tabbing into the bubble's own button does not
                    // close it out from under the focus that is arriving.
                    onBlur={() => closeFeeInfoSoon()}
                    style={{
                      // A real <button> now rather than a role="button" span, so
                      // Radix has something focusable and keyboard-operable to
                      // anchor to, and so Enter and Space work without being
                      // reimplemented. Stripped back first, then the badge is
                      // drawn exactly as it was.
                      appearance: 'none',
                      margin: 0,
                      fontFamily: 'inherit',
                      lineHeight: 'inherit',
                      color: '#5B21B6', backgroundColor: '#F5F3FF',
                      border: '1px solid #C4B5FD', borderRadius: 999,
                      padding: '1px 8px', fontSize: '0.75rem', fontWeight: 500,
                      cursor: 'help',
                    }}
                  >
                    Custom fees
                  </button>
                </Popover.Trigger>
              </>
            )}
          </p>
          {feesOverridden && (
            <Popover.Content
              data-custom-fees-popover=""
              side="bottom"
              align="start"
              sideOffset={6}
              // Never within 16px of a screen edge, and it flips above the badge
              // by itself when the badge is near the bottom of the viewport.
              collisionPadding={16}
              onPointerEnter={(e) => { if (e.pointerType !== 'touch') openFeeInfo(); }}
              onPointerLeave={(e) => { if (e.pointerType !== 'touch') closeFeeInfoSoon(); }}
              // Focus arriving anywhere inside cancels the close the badge's blur
              // started; focus leaving the bubble starts a fresh one.
              onFocusCapture={openFeeInfo}
              onBlurCapture={() => closeFeeInfoSoon()}
              // An explanation, not a task: opening it must not pull the caret out
              // of whatever the admin was doing — least of all on load, where this
              // opens by itself.
              onOpenAutoFocus={(e) => e.preventDefault()}
              onCloseAutoFocus={(e) => e.preventDefault()}
              style={{
                // Was a flat 300px. Sized to its own words now, and capped so it
                // keeps a 16px gutter either side of the narrowest screen instead
                // of being most of the width of a phone regardless of the sentence.
                width: 'max-content',
                maxWidth: 'min(300px, calc(100vw - 32px))',
                padding: '0.7rem 0.8rem',
                borderRadius: 8, border: '1px solid #C4B5FD',
                backgroundColor: '#F5F3FF', color: '#5B21B6',
                fontSize: '0.8125rem', lineHeight: 1.45, fontWeight: 400,
                boxShadow: '0 6px 18px rgba(0,0,0,0.10)',
                textAlign: 'left',
                // Grows out of whichever corner the badge ended up on, including
                // after a collision flip.
                transformOrigin: 'var(--radix-popover-content-transform-origin)',
                // Was 30, which tied the mobile header and sat under the sidebar
                // (50) and the support button (60). Radix copies this onto the
                // fixed wrapper it positions, so setting it here is enough.
                zIndex: 70,
              }}
            >
              <strong>Custom fee structure.</strong>{' '}
              {displayInfo.firstName} is billed from their own fees, not the standard{' '}
              {(student as any).classLevel || displayInfo.class} fees, and class-level fee
              changes do not apply to them automatically.{' '}
              <button
                type="button"
                // Closed explicitly, because this opens a dialog. At z-index 70 the
                // bubble would otherwise float on top of the dialog it just opened.
                onClick={() => { setFeeInfoOpenNow(false); editFeeStructure(); }}
                className="hover:underline"
                style={{ color: '#5B21B6', fontWeight: 600, textDecoration: 'underline' }}
              >
                Review or remove
              </button>
            </Popover.Content>
          )}
        </Popover.Root>
        </div>

      {/* TOP LEVEL, not inside a tab. The trigger lives on the finance tab's
          ledger rows, so a dialog mounted inside another tab's block would
          never exist at the moment it is opened. Radix portals it out of this
          subtree anyway, so layout.tsx's overflow-hidden cannot clip it. */}
      <PaymentConfirmationDialog
        open={receiptFor !== null}
        onOpenChange={(v) => { if (!v) setReceiptFor(null); }}
        ledgerEntryId={receiptFor}
        onSent={() => { void refreshLedger(); }}
      />

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
          <div className="md:hidden shrink-0">
            {/* RADIX PRIMITIVES DIRECTLY, not ui/dropdown-menu.tsx. That wrapper
                leans on utilities the frozen src/index.css does not contain:
                focus:bg-accent, focus:text-accent-foreground,
                data-[disabled]:pointer-events-none / :opacity-50 and
                max-h-(--radix-dropdown-menu-content-available-height) are all
                absent, so its items would have no highlight, no disabled state
                and no height cap — and would fail silently, which is the whole
                hazard of that stylesheet. Checked before writing.

                PORTALLED, which is the reason this replaces a hand-rolled
                panel rather than just restyling one. The old menu was an
                absolutely-positioned div inside <main>, and <main> is
                overflow-y-auto — setting one axis makes the other compute to
                auto too, so it clipped its own dropdown. A portal puts the menu
                on document.body, outside every ancestor that scrolls or hides
                overflow. Radix also brings the dismissal the old version
                hand-rolled with a document mousedown listener: outside click,
                Escape, focus return, and touch behaviour that a mousedown
                listener does not reliably get on a phone.

                zIndex 70 clears everything this app stacks — mobile header 30,
                sidebar overlay 64, drawer 65, support button 60 — matching
                ThreePartDateInput's portalled list. */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                {/* data-no-press: icon-only, so the shared button press is off.
                    A 32px square holding a 16px glyph shrinks by less than a
                    pixel at scale 0.96 — too little to read as a press, and
                    enough to land the three dots on a half-pixel and blur them
                    while it runs. See src/components/ui/button.tsx. */}
                <Button variant="outline" size="sm" aria-label="Finance actions" data-no-press="">
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  data-sis-finance-menu=""
                  align="end"
                  sideOffset={6}
                  collisionPadding={12}
                  style={{
                    minWidth: 208,
                    padding: 4,
                    borderRadius: 8,
                    border: '1px solid #E5E7EB',
                    background: '#FFFFFF',
                    boxShadow: '0 10px 28px rgba(15,35,69,.18)',
                    zIndex: 70,
                  }}
                >
                  {/* One scoped <style>, because a highlight is a STATE and no
                      style attribute can express [data-highlighted] or
                      [data-disabled]. Radix stamps both on the item itself, so
                      this is two rules rather than any layout. Same arrangement
                      as [data-profile-fields] further down this file. */}
                  <style>{`
                    [data-sis-finance-item] {
                      display: block; width: 100%; text-align: left;
                      padding: 8px 12px; border-radius: 6px;
                      font-size: .875rem; color: #111827;
                      cursor: pointer; user-select: none; outline: none;
                    }
                    [data-sis-finance-item][data-highlighted] { background: #F3F4F6; }
                    [data-sis-finance-item][data-disabled] {
                      color: #9CA3AF; cursor: not-allowed;
                    }
                  `}</style>
                  <DropdownMenu.Item
                    data-sis-finance-item=""
                    disabled={!ledgerData}
                    onSelect={() => { void handleDownloadStatement(); }}
                  >
                    Download Financial Sheet
                  </DropdownMenu.Item>
                  {/* Same balance gate as the desktop row, so the two menus
                      offer the same actions rather than one hiding a button the
                      other shows. */}
                  {FEE_OUTREACH_ENABLED && (ledgerData?.balance ?? 0) > 0 && (
                    <DropdownMenu.Item
                      data-sis-finance-item=""
                      disabled={feeDriveBusy}
                      onSelect={() => { void handleDownloadFeeDriveLetter(); }}
                    >
                      Fee Drive Letter
                    </DropdownMenu.Item>
                  )}
                  {/* Mirrors the desktop button exactly, including the reason —
                      this menu and that row must offer the same actions in the
                      same state, or the app appears to disagree with itself
                      depending on window width. */}
                  {FEE_OUTREACH_ENABLED && (
                    <DropdownMenu.Item
                      data-sis-finance-item=""
                      disabled={!canSendReminder}
                      onSelect={() => openWhatsAppReminder()}
                    >
                      {canSendReminder
                        ? 'Send Fee Reminder'
                        : `Send Fee Reminder — ${feeReminderBlockedReason}`}
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Item
                    data-sis-finance-item=""
                    onSelect={() => setShowFeeOverride(true)}
                  >
                    Edit Fees
                  </DropdownMenu.Item>
                  {/* The same handler the desktop row calls, so the two cannot
                      drift: it resets the form, opens the dialog and re-reads
                      what is owed. */}
                  <DropdownMenu.Item
                    data-sis-finance-item=""
                    onSelect={() => { void openPaymentDialog(); }}
                  >
                    Pay Fees
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
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

      {/* Scrolls itself rather than pushing the page wide — see
          [data-student-tabs] in the stylesheet above for why. shrink-0 and
          whitespace-nowrap are what make it a scroller instead of a wrapper:
          without them the buttons shrink to min-content and "General Info"
          breaks across two lines before the strip ever overflows. */}
      <div data-student-tabs="" className="overflow-x-auto mb-6">
        <div data-student-tabs-row="" className="flex gap-1 border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px shrink-0 whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
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
                    fullName: joinFullName(displayInfo.firstName, displayInfo.lastName),
                    gender: displayInfo.gender,
                    dateOfBirth: displayInfo.dateOfBirth ? displayInfo.dateOfBirth.split('T')[0] : '',
                    enrollmentDate: displayInfo.enrollmentDate ? displayInfo.enrollmentDate.split('T')[0] : '',
                    address: displayInfo.address,
                    parentName: displayInfo.parentName,
                    parentPhone: displayInfo.parentPhone,
                    parentWhatsappConsent: displayInfo.parentWhatsappConsent,
                    class: displayInfo.class,
                    allergies: displayInfo.allergies,
                    medicalConditions: displayInfo.medicalConditions,
                    currentMedications: displayInfo.currentMedications,
                    medicalNotes: displayInfo.medicalNotes,
                  });
                  setParentBaseline({
                    id: displayInfo.parentId, name: displayInfo.parentName,
                    phone: displayInfo.parentPhone,
                    whatsappConsent: displayInfo.parentWhatsappConsent,
                  });
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
              {/* Shown on the profile, not only in the edit dialog: whether a
                  family can be messaged is something the office needs to see
                  while looking at the child, not something to go hunting for. */}
              <Field
                label="WhatsApp messages"
                value={displayInfo.parentWhatsappConsent ? 'Agreed' : 'Not agreed'}
              />
            </dl>

            {/* Who enrolled this student. Renders nothing for a record that
                predates attribution, which is every student enrolled before this
                shipped — see DoneBy. */}
            <DoneBy name={(student as any).createdByName} />
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
              <ContentLoader minHeight={120} />
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
            <DialogContent style={{ maxWidth: 'min(448px, calc(100vw - 2rem))', overflowY: 'auto' }}>
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
            <DialogContent style={{ maxWidth: 'min(448px, calc(100vw - 2rem))', overflowY: 'auto' }}>
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
            <DialogContent style={{ maxWidth: 'min(672px, calc(100vw - 2rem))', padding: 0, gap: 0 }}>
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
                <div className="col-span-2">
                  <Label>Full Name</Label>
                  <Input
                    value={editForm.fullName}
                    onChange={e => setEditForm(f => ({ ...f, fullName: e.target.value }))}
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <Label>Date of Birth</Label>
                  <ThreePartDateInput
                    value={editForm.dateOfBirth}
                    onChange={v => setEditForm(f => ({ ...f, dateOfBirth: v ?? '' }))}
                    aria-label="Date of birth"
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
                      // Adopt the consent this guardian has already given, so
                      // picking their name cannot quietly revoke it on save.
                      const consent = Boolean(parent.whatsappConsent);
                      setEditForm(f => ({
                        ...f, parentName: parent.name, parentPhone: parent.phone,
                        parentWhatsappConsent: consent,
                      }));
                      setParentBaseline({
                        id: parent.id, name: parent.name, phone: parent.phone,
                        whatsappConsent: consent,
                      });
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
                {/* WhatsApp consent — see the matching box on the enrolment
                    form. Native input, because ui/checkbox is barely used here
                    and the frozen stylesheet may not carry its classes. */}
                <div className="col-span-2">
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editForm.parentWhatsappConsent}
                      onChange={(e) => setEditForm(f => ({ ...f, parentWhatsappConsent: e.target.checked }))}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <span style={{ color: '#0f2345' }}>
                        This guardian agrees to receive WhatsApp messages from the school
                      </span>
                      <span className="text-xs text-gray-500" style={{ display: 'block', marginTop: 2 }}>
                        Needed before absence notices can be sent to them. The agreement is
                        the guardian’s, so it applies to all of their children at this school.
                      </span>
                    </span>
                  </label>
                </div>
                <div>
                  <Label>Enrollment Date</Label>
                  <ThreePartDateInput
                    value={editForm.enrollmentDate}
                    onChange={v => setEditForm(f => ({ ...f, enrollmentDate: v ?? '' }))}
                    aria-label="Enrollment date"
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
                  disabled={editSubmitting || !isCompleteFullName(editForm.fullName)}
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
            <DialogContent style={{ maxWidth: 'min(448px, calc(100vw - 2rem))', overflowY: 'auto' }}>
              <DialogHeader>
                <DialogTitle>Delete {displayInfo.firstName} {displayInfo.lastName}?</DialogTitle>
                <DialogDescription>
                  This permanently deletes {displayInfo.firstName} {displayInfo.lastName} ({student.id}) and all of
                  their records — ledger entries, assessment marks, pickup contacts, attendance records, and report
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
          <FirstInstallmentNotice met={(student as any).firstInstallmentMet} />

          {/* Settle a whole group in one action — REGISTRATION only. The
              companion "Settle Other Fees" button is gone, so this is no longer
              a list over both groups: Other Fees are paid from the Pay Fees
              table, which can take every one of them in a single submit.

              Still offered only while Registration actually has something
              outstanding — an action that is always available but sometimes does
              nothing is worse than one that is absent. Amounts come from the
              server. */}
          {owingCategories.some((c) => (c.group ?? 'OTHER_FEES') === 'REGISTRATION' && c.payable && c.owing > 0) && (
            <div className="flex gap-2 flex-wrap" style={{ justifyContent: 'flex-end' }}>
              <Button variant="outline" size="sm" onClick={() => setSettleGroup('REGISTRATION')}>
                Settle Registration
              </Button>
            </div>
          )}

          {/* Desktop: action row. Wraps, so a long school name or a narrow
              window cannot push a button off the edge. */}
          <div className="hidden md:flex gap-2 justify-end flex-wrap">
            <Button variant="outline" onClick={handleDownloadStatement} disabled={!ledgerData}>
              <FileText size={16} className="mr-1" />
              Financial Sheet
            </Button>
            {/* Only while there is actually a balance to write about. An action
                that is always present but sometimes produces a letter saying
                nothing is worse than one that is absent — the same reasoning as
                Settle Registration above. */}
            {FEE_OUTREACH_ENABLED && (ledgerData?.balance ?? 0) > 0 && (
              <Button variant="outline" onClick={handleDownloadFeeDriveLetter} disabled={feeDriveBusy}>
                <Megaphone size={16} className="mr-1" />
                {feeDriveBusy ? 'Preparing…' : 'Fee Drive Letter'}
              </Button>
            )}
            {/* DISABLED WITH THE REASON, rather than hidden.
                A control that vanishes leaves the office guessing which of four
                things is wrong — no consent, no usable number, nothing owed, or
                a reminder already sent this fortnight — and the reason is
                exactly what tells them what to fix. It used to disappear
                whenever there was no phone number, which read as the feature
                being broken.

                The title is on the wrapping span, not the button: a disabled
                button does not fire mouse events in every browser, so a title on
                it would be silently unreachable for some users. */}
            {FEE_OUTREACH_ENABLED && (
              <span title={feeReminderBlockedReason ?? undefined} style={{ display: 'inline-flex' }}>
                <Button
                  variant="outline"
                  onClick={openWhatsAppReminder}
                  disabled={!canSendReminder}
                >
                  <MessageCircle size={16} className="mr-1" />
                  Send Fee Reminder
                </Button>
              </span>
            )}
            {/* The per-student reason only makes sense beside the button it
                explains. With the button hidden it would be a bare sentence
                about a feature nobody can see. */}
            {FEE_OUTREACH_ENABLED && feeReminderBlockedReason && feeReminderBlockedReason !== 'Checking…' && (
              <span className="text-xs text-gray-500" style={{ alignSelf: 'center' }}>
                {feeReminderBlockedReason}
              </span>
            )}
            <Button variant="outline" onClick={() => setShowFeeOverride(true)}>
              Edit This Student&apos;s Fees
            </Button>
            <Button onClick={openPaymentDialog}>
              <Plus size={16} className="mr-1" />
              Pay Fees
            </Button>
          </div>

          {/* The standalone "Custom fee structure" banner used to sit here. It is
              now a popover on the "Custom fees" badge beside the student's class,
              which shows itself once on load and then stays out of the way. */}

          {ledgerLoading && <Card><ContentLoader minHeight={160} /></Card>}
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
                          {/* `relative` is load-bearing, not decoration. The span below is the
                              sr-only pattern — `position: absolute`, 1x1, clipped — and an
                              absolutely positioned box is only clipped by an ancestor's
                              `overflow` when that ancestor is in its CONTAINING BLOCK chain.
                              With no positioned ancestor the containing block was the initial
                              one — the document — so the span was laid out at this header's
                              static position, out at the far right of a table wider than the
                              screen, while escaping overflow-x-auto here, overflow-y-auto on
                              <main> and overflow-hidden on the h-screen shell alike. That grew
                              the DOCUMENT past 100% width, and the root horizontal scrollbar it
                              earned then ate ~15px of viewport height that h-screen's 100vh does
                              not know about, so the page overflowed vertically as well — which
                              is why the symptom only showed on screens too narrow for the table.
                              Positioning the cell makes the cell the containing block, so the
                              scroller clips the span like any other descendant. */}
                          <th className="px-4 py-3 font-medium relative">
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
                            <td className="px-4 py-3 text-gray-900">
                              {entry.description}
                              {/* THE RECEIPT NUMBER, on payments only.
                                  Under the description rather than in a column
                                  of its own: this table is already six wide and
                                  a seventh would wrap on a phone, and the number
                                  is part of what this row IS rather than
                                  something to scan down. Monospaced because it
                                  gets checked digit by digit against a slip a
                                  parent is holding. */}
                              {entry.receiptNumber && (
                                <span
                                  className="text-xs text-gray-500"
                                  style={{ display: 'block', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                                >
                                  Receipt {entry.receiptNumber}
                                </span>
                              )}
                              {/* Per row, not per table: a ledger row IS the
                                  record here, and a single footer under the
                                  whole table would be answering a question
                                  nobody asked about a list. */}
                              <DoneBy name={entry.createdByName} variant="inline" />
                            </td>
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
                              {/* SEND RECEIPT. Payments only, and only when the
                                  row actually has a receipt number to quote —
                                  the message is built around that number, so
                                  offering it on a row without one would open a
                                  dialog whose only outcome is a refusal.

                                  Admin-triggered from here, deliberately: the
                                  payment-recording path must never appear to
                                  fail because WhatsApp is down. */}
                              {entry.type === 'PAYMENT' && entry.receiptNumber && (
                                <button
                                  type="button"
                                  title="Send a WhatsApp receipt for this payment"
                                  aria-label={`Send a WhatsApp receipt for ${entry.description}, ${entry.amount.toLocaleString()} FCFA`}
                                  onClick={() => setReceiptFor(entry.id)}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    padding: 4, borderRadius: 6, border: 'none', background: 'transparent',
                                    color: '#0f2345', cursor: 'pointer', marginRight: 2,
                                  }}
                                >
                                  <MessageCircle size={15} />
                                </button>
                              )}
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
            <DialogContent style={{ maxWidth: 'min(672px, calc(100vw - 2rem))', overflowY: 'auto' }}>
              <DialogHeader>
                <DialogTitle>What is owed</DialogTitle>
                <DialogDescription>
                  Each fee category, what {displayInfo.firstName} was charged for it, and
                  what is still outstanding.
                </DialogDescription>
              </DialogHeader>

              <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                {owingLoading ? (
                  <ContentLoader minHeight={120} />
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
                        {/* Settled categories stay listed rather than being
                            hidden — one that vanished once paid would be
                            indistinguishable from one that never applied — and
                            they say "Paid" rather than showing a red 0. Three
                            states have to be told apart here:
                              owing > 0     outstanding, red, the figure itself
                              charged > 0   billed and fully settled -> "Paid"
                              charged == 0  never billed, so nothing to settle
                            Reading a red "0 FCFA" against a fee somebody has
                            finished paying is what made a settled account look
                            like an unpaid one. */}
                        <span
                          className="text-sm font-medium"
                          style={{
                            width: 130, textAlign: 'right', whiteSpace: 'nowrap',
                            color: c.owing > 0 ? '#dc2626' : c.charged > 0 ? '#05603d' : '#9CA3AF',
                          }}
                        >
                          {c.owing > 0
                            ? `${c.owing.toLocaleString()} FCFA`
                            : c.charged > 0
                              ? 'Paid'
                              : '0 FCFA'}
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
                      {/* The total follows the same rule as the rows above it.
                          A student who owes nothing used to get a red 0 here,
                          which read as a problem rather than as a cleared
                          account. */}
                      {(() => {
                        const totalOwing = owingCategories.reduce((n, c) => n + c.owing, 0);
                        const totalCharged = owingCategories.reduce((n, c) => n + c.charged, 0);
                        return (
                          <span
                            className="text-sm font-medium"
                            style={{
                              width: 130, textAlign: 'right', whiteSpace: 'nowrap',
                              color: totalOwing > 0 ? '#dc2626' : totalCharged > 0 ? '#05603d' : '#9CA3AF',
                            }}
                          >
                            {totalOwing > 0
                              ? `${totalOwing.toLocaleString()} FCFA`
                              : totalCharged > 0
                                ? 'Paid'
                                : '0 FCFA'}
                          </span>
                        );
                      })()}
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
            <DialogContent style={{ maxWidth: 'min(672px, calc(100vw - 2rem))', overflowY: 'auto' }}>
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
                          <span className="text-sm" style={{ flex: 1, minWidth: 0 }}>
                            {entry.description}
                            <DoneBy name={entry.createdByName} variant="inline" />
                          </span>
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
            <DialogContent style={{ maxWidth: 'min(448px, calc(100vw - 2rem))', overflowY: 'auto' }}>
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

          {/* Pay Fees — a table of this student's fees, paid together.

              Its own component now, and not only for size. The dialog needs a
              pinned header, a scrolling middle and a pinned footer of its own,
              which is a layout with real structure rather than a form inlined
              into this file — and having it standalone is what lets it be
              measured directly at a phone viewport instead of through a copy.

              The figures stay here: owingCategories is what the cap is checked
              against and what the server recomputes from, so the dialog is
              handed them rather than fetching its own. */}
          <PayFeesDialog
            open={showPayment}
            onOpenChange={(open) => { setShowPayment(open); if (!open) setSubmitError(null); }}
            categories={owingCategories}
            loading={owingLoading}
            submitting={submitting}
            error={submitError}
            methods={PAYMENT_METHODS}
            onSubmit={handlePaymentSubmit}
          />

          {/* WhatsApp — confirmation, progress, result and failure, in one place.

              ONE dialog for both messages rather than two nearly-identical ones.
              The reminder and the receipt ask the same question about the same
              recipient and can fail in exactly the same ways, so sharing the
              body is what stops the two drifting; only the wording and the
              button labels switch on the variant.

              It does NOT close on success. The requirement is to show the text
              that was sent, and a message to a parent about money is worth
              reading back — a toast is gone in four seconds and cannot hold two
              lines of prose. The toast still fires as the at-a-glance signal,
              matching every other write on this tab. */}
          <Dialog
            open={waAction !== null}
            onOpenChange={(open) => {
              // Not while a send is in flight: the request cannot be recalled, and
              // dismissing its dialog would leave nobody looking at the outcome.
              if (!open && !waBusy) closeWhatsApp();
            }}
          >
            <DialogContent style={{ maxWidth: 'min(448px, calc(100vw - 2rem))', overflowY: 'auto' }}>
              <DialogHeader>
                <DialogTitle>
                  {waSent
                    ? 'WhatsApp message sent'
                    : waAction?.kind === 'receipt'
                      ? 'Send payment receipt via WhatsApp?'
                      : 'Send fee reminder?'}
                </DialogTitle>
                <DialogDescription>
                  {waSent
                    ? 'This is what was sent:'
                    : waAction?.kind === 'receipt'
                      ? `Send a WhatsApp receipt for the ${waAction.amount.toLocaleString()} FCFA just recorded?`
                      : 'Check these details before sending. A WhatsApp cannot be unsent.'}
                </DialogDescription>
              </DialogHeader>

              {/* WHO IT IS ACTUALLY GOING TO.
                  The guardian's name beside the number AS IT WILL BE DIALLED —
                  which is not the stored text: "679379134" is dialled as
                  "+237679379134", and the server's own normaliser produced this
                  string, so what is read here is what is used. This pairing is
                  the last chance to notice that a message about a named child's
                  fees is about to reach a stranger. */}
              {!waSent && waAction?.kind === 'reminder' && feeEligRow && (
                <div
                  style={{
                    border: '1px solid #E5E7EB', borderRadius: 8, background: '#F9FAFB',
                    padding: '0.75rem', fontSize: '0.8125rem', lineHeight: 1.6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span style={{ color: '#6B7280' }}>Guardian</span>
                    <span style={{ color: '#0f2345', fontWeight: 600, textAlign: 'right' }}>
                      {feeEligRow.guardianName || 'Not recorded'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span style={{ color: '#6B7280' }}>Will be sent to</span>
                    {/* Monospaced and spaced: this is read digit by digit, not
                        recognised at a glance. */}
                    <span style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      letterSpacing: '0.02em', color: '#0f2345', fontWeight: 600,
                    }}>
                      {waDialled ?? '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span style={{ color: '#6B7280' }}>Outstanding</span>
                    <span style={{ color: '#0f2345', fontWeight: 600 }}>
                      {feeEligRow.balance.toLocaleString()} FCFA
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                    <span style={{ color: '#6B7280' }}>Term in message</span>
                    <span style={{ color: '#0f2345' }}>{feeElig?.termLabel || '—'}</span>
                  </div>
                  {/* Said out loud because it is genuinely surprising: the
                      approved template has no amount slot, so the figure above
                      decides WHETHER the family is chased but is never quoted to
                      them. Somebody will otherwise assume the parent was told a
                      number and be wrong about what the school said. */}
                  <p className="text-xs text-gray-500" style={{ marginTop: '0.5rem' }}>
                    The message does not quote the amount — it asks them to settle the
                    outstanding fees before the drive.
                  </p>
                </div>
              )}

              {/* THE DRIVE DATE, required.
                  The template states the school WILL hold a fee drive on this
                  day. No such date is stored anywhere, so it is asked for here
                  rather than invented — a wrong one is a promise to every parent
                  in the message. */}
              {!waSent && waAction?.kind === 'reminder' && (
                <div>
                  <Label>Fee drive date</Label>
                  <ThreePartDateInput
                    value={feeDriveDate}
                    onChange={(v) => setFeeDriveDate(v ?? '')}
                    aria-label="Fee drive date"
                  />
                  <p className="text-xs text-gray-500" style={{ marginTop: 2 }}>
                    Appears in the message as the day of the drive. Must be today or later.
                  </p>
                </div>
              )}

              {/* The sent text, verbatim. Its own scroll rather than the dialog's,
                  so a long school name cannot push the Done button off a phone
                  screen — the same head/body/foot arrangement DialogContent is
                  built for. pre-wrap because the server composes one paragraph and
                  the wrapping should be the reader's, not ours. */}
              {waSent && (
                <div
                  style={{
                    border: '1px solid #E5E7EB',
                    borderRadius: 8,
                    background: '#F9FAFB',
                    padding: '0.75rem',
                    fontSize: '0.8125rem',
                    lineHeight: 1.55,
                    color: '#111827',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: '10rem',
                    overflowY: 'auto',
                  }}
                >
                  {waSent}
                </div>
              )}

              {/* Burnt orange, matching the entry-delete dialog above rather than
                  the Tailwind red used elsewhere in this file: index.css is frozen,
                  and an inline colour cannot silently resolve to nothing. */}
              {waError && <p className="text-sm" style={{ color: '#e0552e' }}>{waError}</p>}

              <div className="flex justify-end gap-2">
                {waSent ? (
                  <Button onClick={closeWhatsApp}>Done</Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={closeWhatsApp} disabled={waBusy}>
                      {waAction?.kind === 'receipt' ? 'No' : 'Cancel'}
                    </Button>
                    <Button
                      onClick={sendWhatsApp}
                      disabled={waBusy || (waAction?.kind === 'reminder' && !feeDriveDate)}
                    >
                      {waBusy
                        ? 'Sending…'
                        : waAction?.kind === 'receipt' ? 'Yes, send receipt' : 'Send reminder'}
                    </Button>
                  </>
                )}
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
            <ContentLoader minHeight={160} />
          ) : !breakdown || breakdown.length === 0 ? (
            <p className="text-sm text-gray-500">
              No sequence tests or exams recorded for {marksYear} {formatTermLabel(marksTerm)}.
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
                          <span className="text-sm text-gray-400"> · {t.type === 'EXAM' ? 'Exam' : 'Sequence Test'}</span>
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
