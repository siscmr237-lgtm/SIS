import { ArrowLeft, Edit, FileText, MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { NavigationPage } from '../App';
import { api } from '../lib/api';
import { useSisCache } from '../lib/SisCache';
import { Staff } from '../types';
import { generateStaffFinancialSheet } from '../utils/pdfGenerator';
import { Button } from './ui/button';
import { Card } from './ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { ThreePartDateInput } from './ThreePartDateInput';
import { DoneBy } from './DoneBy';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { StaffForm, StaffFormPayload } from './StaffForm';
import { RecordPayrollDialog } from './RecordPayrollDialog';
import { StaffChargeDot } from './StaffChargeStatus';
import { ContentLoader } from './ContentLoader';
import { getUser } from '../lib/session';

interface LedgerEntry {
  id: string;
  type: 'CHARGE' | 'PAYMENT';
  description: string;
  amount: number;
  entryDate: string;
  paymentMethod?: string | null;
  category?: { name: string } | null;
  /**
   * Who recorded this entry, as it read at the moment they did. NULL on every
   * row written before attribution existed, and on the fee-structure charges the
   * server writes by itself — neither has a person behind it to name.
   */
  createdByName?: string | null;
}

interface OutstandingCharge {
  id: string;
  category: string | null;
  description: string;
  note: string | null;
  amount: number;
  settled: number;
  outstanding: number;
  entryDate: string;
}

interface LedgerData {
  entries: LedgerEntry[];
  /**
   * The two directions of staff money, kept apart.
   *
   * `balance` is what the SCHOOL still owes this person — salary accrued less
   * salary paid. It deliberately excludes fines: a broken window is money owed
   * the other way, and folding it in here would read as the school owing them
   * more for having broken something.
   *
   * `outstandingCharges` is that other direction — what they owe the school and
   * have not yet had netted off their pay. It is what the red dot reads.
   */
  totalCharged: number;
  totalPaid: number;
  balance: number;
  chargesOwed: number;
  chargesSettled: number;
  outstandingCharges: number;
  charges: OutstandingCharge[];
}

interface ChargeCategory {
  id: number;
  name: string;
  limit: number;
  isBuiltIn: boolean;
  /** True for the categories that mean the staff member owes the SCHOOL. */
  staffOwes?: boolean;
}

interface StaffProfileProps {
  staff: Staff;
  onNavigate: (page: NavigationPage) => void;
}

type Tab = 'general' | 'finance' | 'attendance';

const TABS: { id: Tab; label: string }[] = [
  { id: 'general', label: 'General Info' },
  { id: 'finance', label: 'Finance' },
  { id: 'attendance', label: 'Attendance' },
];

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
 * Teacher sign-in status, derived entirely from two server fields plus one
 * session-only fact.
 *
 * `invited` cannot be recovered from the API: the invite token is stateless by
 * design (sis-backend/src/utils/teacherInviteToken.js — "a token is considered
 * already-used once staff.passwordHash is no longer null"), and no column
 * records that one was sent. So a teacher who has been invited but has not yet
 * chosen a password is indistinguishable from one never invited: both are
 * hasLogin === false. We show `invited` only for an invite sent in THIS session,
 * which is what makes the Resend button reachable; after a reload it reads as
 * "Not Invited" again. Persisting it needs a backend field.
 */
type AccessStatus = 'not-invited' | 'invited' | 'active' | 'deactivated';

/**
 * Colours are inline rather than utility classes because src/index.css is a
 * pre-compiled Tailwind artifact with no build step behind it — it carries only
 * 24 colour utilities, none of them these. The same reason PaymentStatus.tsx and
 * MarkStatus.tsx style their indicators inline. All four are brand palette.
 */
const ACCESS_BADGE: Record<AccessStatus, { label: string; background: string; color: string }> = {
  'not-invited': { label: 'Not Invited', background: '#F3F4F6', color: '#6B7280' },
  invited: { label: 'Invited', background: '#e6c482', color: '#0f2345' },
  active: { label: 'Active', background: '#05603d', color: '#FFFFFF' },
  deactivated: { label: 'Deactivated', background: '#e0552e', color: '#FFFFFF' },
};

const ACCESS_DESCRIPTION: Record<AccessStatus, string> = {
  'not-invited': 'This teacher has not been invited yet and cannot sign in.',
  invited: 'Invitation sent. The link expires in 72 hours; sign-in starts once they set a password.',
  active: 'This teacher can sign in to their own portal.',
  deactivated: 'Sign-in is disabled for this teacher. Their record and history are unaffected.',
};

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-sm text-gray-900">{value || '—'}</dd>
    </div>
  );
}

const VALID_TABS: Tab[] = ['general', 'finance', 'attendance'];

export function StaffProfile({ staff, onNavigate }: StaffProfileProps) {
  const cache = useSisCache();
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

  // Editable info — local state so updates appear immediately after save
  const [displayInfo, setDisplayInfo] = useState({
    firstName: staff.firstName,
    lastName: staff.lastName,
    idNumber: staff.idNumber,
    role: staff.role,
    phone: staff.phone,
    email: staff.email,
    hireDate: staff.hireDate,
    salary: staff.salary,
    isTeacher: staff.isTeacher,
  });
  const [showEdit, setShowEdit] = useState(false);

  // Teacher sign-in access. Held locally so the badge and buttons update the
  // moment an action succeeds, without reloading the page.
  const [access, setAccess] = useState({
    hasLogin: staff.hasLogin === true,
    isActive: staff.isActive !== false,
  });
  const [invitedThisSession, setInvitedThisSession] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessNotice, setAccessNotice] = useState<string | null>(null);

  const [ledgerData, setLedgerData] = useState<LedgerData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ChargeCategory[]>([]);

  const [showCharge, setShowCharge] = useState(false);
  const [showPayroll, setShowPayroll] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [showActionsMenu, setShowActionsMenu] = useState(false);

  // Deleting this staff member. `deleteError` is rendered inside the confirm
  // dialog rather than raised as a toast: the failure the user needs to read is
  // the one that explains why the person is still there, and a toast that has
  // already faded explains nothing.
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split('T')[0];
  const [chargeForm, setChargeForm] = useState({
    categoryId: '', description: '', note: '', amount: '', entryDate: today,
  });

  /**
   * Only the categories that mean "this staff member owes the school" — broken
   * property, late coming, uniform, misconduct, other.
   *
   * The rest (Salary, Bonus, Transportation Allowance, Staff Expense) run the
   * other way: they are money the school owes THEM. Offering those here would
   * invite a charge that increases what the school appears to owe someone for
   * having broken something, and the server refuses them for that reason —
   * so the form should not be offering what the server will reject.
   */
  const chargeCategories = categories.filter((c) => c.staffOwes);

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

  /**
   * Removes the staff member and everything hanging off them, then leaves.
   *
   * DELETE /staff/:code does the work in one transaction — attendance, work
   * records, subject assignments and every ledger row, including payroll. It
   * needs to: two of those relations are ON DELETE RESTRICT in the database, so
   * a plain delete threw a foreign-key error for anyone who had ever been given
   * a subject, and attendance has no foreign key at all and would simply have
   * been left behind pointing at a person who no longer exists.
   *
   * The teacher login needs no separate step. A teacher account IS the staff row
   * — passwordHash, isActive and isTeacher are columns on it, and teacher
   * sign-in looks accounts up there — so deleting the row takes the credentials
   * with it. See the endpoint's docblock.
   *
   * Navigation happens only after the call resolves. Leaving first would take
   * the user to a list still showing the row and give a failure nowhere to be
   * reported.
   */
  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/staff/${staff.code}`);
      // Work records are deleted alongside the person, so that list is stale too.
      cache.invalidateOn('staff:write');
      cache.invalidateOn('work-record:write');
      setShowDelete(false);
      onNavigate('staff');
    } catch (e: any) {
      setDeleteError(e?.message || 'This staff member could not be deleted.');
    } finally {
      setDeleting(false);
    }
  };

  const refreshLedger = async () => {
    setLedgerLoading(true);
    setLedgerError(null);
    try {
      const data = await api.get(`/ledger/staff/${encodeURIComponent(staff.code)}`);
      setLedgerData(data);
    } catch (e: any) {
      setLedgerError(e.message || 'Failed to load finance data');
    } finally {
      setLedgerLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'finance') return;
    const controller = new AbortController();
    setLedgerLoading(true);
    setLedgerError(null);
    Promise.allSettled([
      api.get(`/ledger/staff/${encodeURIComponent(staff.code)}`, { signal: controller.signal }),
      api.get('/charge-categories?forStaff=true', { signal: controller.signal }),
    ]).then(([ledgerRes, catsRes]) => {
      if (controller.signal.aborted) return;
      if (ledgerRes.status === 'fulfilled') setLedgerData(ledgerRes.value);
      else setLedgerError(ledgerRes.reason?.message || 'Failed to load finance data');
      if (catsRes.status === 'fulfilled') setCategories(catsRes.value || []);
      setLedgerLoading(false);
    });
    return () => controller.abort();
  }, [activeTab, staff.code]);

  const handleChargeSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.post('/ledger/staff-charge', {
        staffId: staff.code,
        categoryId: parseInt(chargeForm.categoryId),
        description: chargeForm.description,
        ...(chargeForm.note.trim() ? { note: chargeForm.note.trim() } : {}),
        amount: parseInt(chargeForm.amount),
        entryDate: chargeForm.entryDate,
      });
      // Refreshes the staff roster the red dot reads — see INVALIDATES in
      // lib/SisCache.tsx — as well as this page's own figures below.
      cache.invalidateOn('ledger:write');
      setShowCharge(false);
      setChargeForm({ categoryId: '', description: '', note: '', amount: '', entryDate: new Date().toISOString().split('T')[0] });
      await refreshLedger();
    } catch (e: any) {
      setSubmitError(e.message || 'Failed to record charge');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Sends (or re-sends) the activation email. The admin never sees or chooses a
   * password — the backend only emails a link.
   *
   * Re-sending is safe only while no password is set: POST /staff/:id/invite
   * answers 409 ALREADY_HAS_LOGIN once one is, which is why no resend is offered
   * in the `active` state.
   */
  const handleInvite = async () => {
    setAccessBusy(true);
    setAccessError(null);
    setAccessNotice(null);
    try {
      const res = await api.post(`/staff/${encodeURIComponent(staff.code)}/invite`, {});
      setInvitedThisSession(true);
      setAccessNotice(res?.message || `Invitation sent to ${displayInfo.email}.`);
      cache.invalidateOn('staff:write');
      // Re-read rather than assuming: an invite does not itself change hasLogin
      // (no password yet), but this keeps the badge honest if anything else has
      // moved, and is what refreshes the state without a page reload.
      try {
        const fresh = await api.get(`/staff/${encodeURIComponent(staff.code)}`);
        setAccess({ hasLogin: fresh?.hasLogin === true, isActive: fresh?.isActive !== false });
      } catch {
        // A failed refresh must not look like a failed invite — the email went.
      }
    } catch (e: any) {
      setAccessError(e?.message || 'Failed to send the invitation.');
    } finally {
      setAccessBusy(false);
    }
  };

  /**
   * Turns sign-in on or off. Revocation bites immediately — the backend re-reads
   * isActive on every authenticated request — so a teacher who is deactivated
   * while logged in is refused on their next call rather than at next login.
   *
   * The endpoint returns the full publicStaff() record, so the badge refreshes
   * straight from the response with no follow-up read.
   */
  const handleAccessToggle = async (nextIsActive: boolean) => {
    setAccessBusy(true);
    setAccessError(null);
    setAccessNotice(null);
    try {
      const updated = await api.patch(`/staff/${encodeURIComponent(staff.code)}/access`, {
        isActive: nextIsActive,
      });
      setAccess({
        hasLogin: updated?.hasLogin === true,
        isActive: updated?.isActive !== false,
      });
      setAccessNotice(
        nextIsActive
          ? 'Sign-in re-enabled for this teacher.'
          : 'Sign-in disabled. Their record, work history and ledger are unaffected.',
      );
      cache.invalidateOn('staff:write');
    } catch (e: any) {
      setAccessError(
        e?.message || (nextIsActive ? 'Failed to reactivate access.' : 'Failed to deactivate access.'),
      );
    } finally {
      setAccessBusy(false);
    }
  };

  const handleDownloadStatement = async () => {
    if (!ledgerData) return;
    let schoolInfo: { name: string; logo?: string; motto?: string; academicYear?: string } | undefined;
    try {
      const user = getUser();
      if (user?.School?.[0]) schoolInfo = user.School[0];
    } catch {}
    await generateStaffFinancialSheet(staff, ledgerData, schoolInfo);
  };

  // Deactivated first: a revoked teacher cannot sign in whether or not they ever
  // set a password, so that fact outranks the rest.
  const accessStatus: AccessStatus = !access.isActive
    ? 'deactivated'
    : access.hasLogin
      ? 'active'
      : invitedThisSession
        ? 'invited'
        : 'not-invited';
  const accessBadge = ACCESS_BADGE[accessStatus];
  // Only offered while no password exists — see handleInvite on the 409.
  const canInvite = accessStatus === 'not-invited' || accessStatus === 'invited';
  // An email address is what the invitation is sent TO, so without one there is
  // nothing this panel can do.
  const showTeacherAccess = displayInfo.isTeacher && Boolean(displayInfo.email);

  return (
    <div className="p-4 md:p-8">
      <button
        onClick={() => onNavigate('staff')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-6"
      >
        <ArrowLeft size={18} />
        Back to Staff
      </button>

      <div className="mb-6">
        {/* The dot reads the figure the SERVER computed: from the ledger once
            the Finance tab has loaded it, otherwise from the record this page
            was opened with. Never recalculated here — see StaffChargeStatus. */}
        <h1 className="text-3xl">
          {displayInfo.firstName} {displayInfo.lastName}
          <StaffChargeDot outstanding={ledgerData?.outstandingCharges ?? (staff as any).outstandingCharges} />
        </h1>
        <p className="text-gray-500 mt-1">{displayInfo.isTeacher ? 'Teacher' : displayInfo.role}</p>
      </div>

      <div className="flex gap-1 border-b mb-6">
        {TABS.map((tab) => (
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
        <Card className="p-6">
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-base font-medium">Staff Information</h2>
            <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
              <Edit size={14} className="mr-1" />
              Edit
            </Button>
          </div>
          <dl className="grid grid-cols-2 gap-4">
            <Field label="ID Number" value={displayInfo.idNumber} />
            <Field label="Role" value={displayInfo.isTeacher ? 'Teacher' : displayInfo.role} />
            <Field label="First Name" value={displayInfo.firstName} />
            <Field label="Last Name" value={displayInfo.lastName} />
            <Field label="Phone" value={displayInfo.phone} />
            <Field label="Email" value={displayInfo.email} />
            <Field label="Hire Date" value={formatDate(displayInfo.hireDate)} />
            <Field label="Salary" value={displayInfo.salary ? `${displayInfo.salary.toLocaleString()} FCFA` : '—'} />
            <Field label="Type" value={displayInfo.isTeacher ? 'Teaching Staff' : 'Non-Teaching Staff'} />
          </dl>

          {/* Who added this staff member. Renders nothing for a record written
              before attribution existed — see DoneBy. */}
          <DoneBy name={(staff as any).createdByName} />

          <StaffForm
            mode="edit"
            open={showEdit}
            onOpenChange={setShowEdit}
            initialValues={displayInfo}
            onSubmit={async (payload: StaffFormPayload) => {
              await api.put(`/staff/${staff.code}`, payload);
              // The API gets the nulls; this local copy holds '' for the two
              // optional fields, because it only feeds the display and <Field>
              // already renders an empty value as an em-dash. Widening the state
              // to string|null would buy nothing and touch every reader of it.
              setDisplayInfo({
                ...payload,
                idNumber: payload.idNumber ?? '',
                email: payload.email ?? '',
              });
              cache.invalidateOn('staff:write');
              setShowEdit(false);
            }}
          />
        </Card>
      )}

      {activeTab === 'general' && showTeacherAccess && (
        <Card className="p-6 mt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div>
              <h2 className="text-base font-medium">Teacher Access</h2>
              <p className="text-xs text-gray-500 mt-1">
                Lets {displayInfo.firstName} sign in to the teacher portal.
              </p>
            </div>
            <span
              className="inline-flex items-center w-fit whitespace-nowrap shrink-0 rounded-md px-2 py-1 text-xs font-medium"
              style={{ background: accessBadge.background, color: accessBadge.color }}
            >
              {accessBadge.label}
            </span>
          </div>

          <p className="text-sm text-gray-600">{ACCESS_DESCRIPTION[accessStatus]}</p>

          {/* The three action states are mutually exclusive, so one shared busy
              flag is enough to guard whichever button is on screen. */}
          {canInvite && (
            <div className="flex items-center gap-3 flex-wrap mt-4">
              <Button variant="outline" size="sm" onClick={handleInvite} disabled={accessBusy}>
                {accessBusy
                  ? (accessStatus === 'invited' ? 'Resending…' : 'Sending…')
                  : (accessStatus === 'invited' ? 'Resend Invite' : 'Invite')}
              </Button>
              <span className="text-xs text-gray-400">{displayInfo.email}</span>
            </div>
          )}

          {accessStatus === 'active' && (
            <div className="flex items-center gap-3 flex-wrap mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAccessToggle(false)}
                disabled={accessBusy}
              >
                {accessBusy ? 'Deactivating…' : 'Deactivate'}
              </Button>
              <span className="text-xs text-gray-400">Blocks sign-in without deleting anything.</span>
            </div>
          )}

          {accessStatus === 'deactivated' && (
            <div className="flex items-center gap-3 flex-wrap mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAccessToggle(true)}
                disabled={accessBusy}
              >
                {accessBusy ? 'Reactivating…' : 'Reactivate'}
              </Button>
            </div>
          )}

          {accessNotice && (
            <p className="text-xs mt-2" style={{ color: '#05603d' }}>{accessNotice}</p>
          )}
          {accessError && (
            <p className="text-xs mt-2" style={{ color: '#e0552e' }}>{accessError}</p>
          )}
        </Card>
      )}

      {activeTab === 'finance' && (
        <div className="space-y-4">
          <div className="flex justify-end md:hidden">
            <div className="relative" ref={actionsMenuRef}>
              {/* data-no-press: icon-only, excluded from the shared button
                  press — see src/components/ui/button.tsx. */}
              <Button variant="outline" size="sm" data-no-press="" onClick={() => setShowActionsMenu(v => !v)}>
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
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => { setSubmitError(null); setShowCharge(true); setShowActionsMenu(false); }}
                  >
                    Record Charge
                  </button>
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => { setSubmitError(null); setShowPayroll(true); setShowActionsMenu(false); }}
                  >
                    Record Payroll
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="hidden md:flex gap-2 justify-end flex-wrap">
            <Button variant="outline" onClick={handleDownloadStatement} disabled={!ledgerData}>
              <FileText size={16} className="mr-1" />
              Financial Sheet
            </Button>
            <Button variant="outline" onClick={() => { setSubmitError(null); setShowCharge(true); }}>
              <Plus size={16} className="mr-1" />
              Record Charge
            </Button>
            <Button onClick={() => { setSubmitError(null); setShowPayroll(true); }}>
              <Plus size={16} className="mr-1" />
              Record Payroll
            </Button>
          </div>

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
              <div className="grid grid-cols-3 gap-2 md:gap-4">
                <Card className="p-2 md:p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Charged</p>
                  <p className="text-xs md:text-xl font-medium text-gray-900">
                    {ledgerData.totalCharged.toLocaleString()} FCFA
                  </p>
                </Card>
                <Card className="p-2 md:p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Paid</p>
                  <p className="text-xs md:text-xl font-medium text-green-600">
                    {ledgerData.totalPaid.toLocaleString()} FCFA
                  </p>
                </Card>
                {/* What THEY owe the school, kept as its own figure. It is not
                    folded into Balance Owed above, which means the opposite
                    thing: what the school still owes them. */}
                <Card className={`p-2 md:p-4 ${ledgerData.outstandingCharges > 0 ? 'bg-red-50 border-red-200' : ''}`}>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Owes School</p>
                  <p className={`text-xs md:text-xl font-medium ${ledgerData.outstandingCharges > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {ledgerData.outstandingCharges.toLocaleString()} FCFA
                  </p>
                </Card>
              </div>

              {ledgerData.charges.length > 0 && (
                <Card className="p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Outstanding charges</p>
                  <p className="text-xs text-gray-500" style={{ marginBottom: '0.6rem' }}>
                    Cleared by deducting them from a month&apos;s pay — open Record Payroll and
                    tick the ones being settled.
                  </p>
                  {ledgerData.charges.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                        padding: '0.4rem 0', borderTop: '1px solid #F3F4F6',
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="text-sm" style={{ display: 'block' }}>{c.description}</span>
                        <span className="text-xs" style={{ color: '#6B7280' }}>
                          {c.category ?? 'Charge'}
                          {c.note ? ` · ${c.note}` : ''}
                          {c.settled > 0 ? ` · ${c.settled.toLocaleString()} of ${c.amount.toLocaleString()} already settled` : ''}
                        </span>
                      </span>
                      <span className="text-sm font-medium" style={{ whiteSpace: 'nowrap', color: '#DC2626' }}>
                        {c.outstanding.toLocaleString()} FCFA
                      </span>
                    </div>
                  ))}
                </Card>
              )}

              <Card>
                {ledgerData.entries.length === 0 ? (
                  <p className="p-6 text-gray-500">No financial records yet.</p>
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
                          <th className="px-4 py-3 font-medium">Method</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerData.entries.map((entry) => (
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
                            <td className="px-4 py-3 text-gray-600">{entry.category?.name ?? '—'}</td>
                            <td className="px-4 py-3 text-gray-900">
                              {entry.description}
                              {/* Per row: each salary, bonus, fine and payroll
                                  run is its own record, recorded by one person. */}
                              <DoneBy name={entry.createdByName} variant="inline" />
                            </td>
                            <td className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                              entry.type === 'CHARGE' ? 'text-orange-700' : 'text-green-600'
                            }`}>
                              {entry.type === 'PAYMENT' ? '+' : ''}{entry.amount.toLocaleString()} FCFA
                            </td>
                            <td className="px-4 py-3 text-gray-500">{entry.paymentMethod ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}

          {/* Record Charge — a fine against the staff member. No payment method
              is asked for: nothing changes hands when a fine is raised, and it
              is settled only by being netted off a payroll run. */}
          <Dialog open={showCharge} onOpenChange={(open) => { setShowCharge(open); if (!open) setSubmitError(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Charge</DialogTitle>
                <DialogDescription>
                  Charge {displayInfo.firstName} for something they owe the school. It stays on
                  their account until it is deducted from a month's pay.
                </DialogDescription>
              </DialogHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem', paddingTop: '0.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <Label>Category</Label>
                  <Select value={chargeForm.categoryId} onValueChange={(v) => setChargeForm(f => ({ ...f, categoryId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    {/* Only the categories that mean "the staff member owes the
                        school". Salary, Bonus and the allowances run the other
                        way and the server refuses a charge under them. */}
                    <SelectContent>
                      {chargeCategories.map(cat => (
                        <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <Label>Amount (FCFA)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={chargeForm.amount}
                      onChange={e => setChargeForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <Label>Date</Label>
                    <ThreePartDateInput
                      value={chargeForm.entryDate}
                      onChange={v => setChargeForm(f => ({ ...f, entryDate: v ?? '' }))}
                      aria-label="Charge date"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <Label>Reason</Label>
                  <Input
                    value={chargeForm.description}
                    onChange={e => setChargeForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="e.g. Broken projector"
                  />
                  <span className="text-xs" style={{ color: '#6B7280' }}>
                    Shown wherever this charge is listed.
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <Label>Note <span className="text-gray-400 font-normal">(optional)</span></Label>
                  <Input
                    value={chargeForm.note}
                    onChange={e => setChargeForm(f => ({ ...f, note: e.target.value }))}
                    placeholder="Any detail behind it"
                  />
                </div>
                {submitError && <p className="text-sm" style={{ color: '#e0552e' }}>{submitError}</p>}
              </div>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline" disabled={submitting}>Cancel</Button>
                </DialogClose>
                <Button onClick={handleChargeSubmit} disabled={submitting}>
                  {submitting ? 'Saving...' : 'Record Charge'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Replaces Record Payment. Staff money now goes out one month at a
              time, against the month it pays for, with charges netted off it. */}
          <RecordPayrollDialog
            open={showPayroll}
            onOpenChange={setShowPayroll}
            staffCode={staff.code}
            staffName={`${displayInfo.firstName} ${displayInfo.lastName}`}
            onRecorded={refreshLedger}
          />
        </div>
      )}

      {activeTab === 'attendance' && (
        <Card className="p-6 text-gray-500">Attendance tracking coming soon.</Card>
      )}

      {/*
        Danger zone — last thing on the page, on every tab, and fenced off from
        the actions above it by a rule and a wide margin. Deliberately NOT in the
        header beside Edit: an irreversible action does not belong one slip away
        from the button people press most.

        Inline styles because src/index.css is a frozen pre-compiled Tailwind
        build — a utility class that is not already in it renders as nothing at
        all, which is how the Add Staff error message came to be invisible.
      */}
      <div
        style={{
          marginTop: '3rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <p style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827' }}>
            Delete this staff member
          </p>
          <p style={{ fontSize: '0.8125rem', color: '#6B7280', marginTop: '0.125rem' }}>
            Removes {displayInfo.firstName} {displayInfo.lastName} along with their attendance and
            payroll records. This cannot be undone.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setDeleteError(null);
            setShowDelete(true);
          }}
          style={{ borderColor: '#e0552e', color: '#e0552e' }}
        >
          <Trash2 size={14} className="mr-1" />
          Delete Staff Member
        </Button>
      </div>

      <Dialog
        open={showDelete}
        onOpenChange={(next) => {
          // Never while the request is in flight: closing mid-delete would hide
          // the outcome of something already happening.
          if (deleting) return;
          setShowDelete(next);
          if (!next) setDeleteError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {displayInfo.firstName} {displayInfo.lastName}?
            </DialogTitle>
            <DialogDescription>
              This cannot be undone. Their attendance and payroll records will also be removed.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <div
              role="alert"
              style={{
                border: '1px solid #e0552e',
                borderLeftWidth: 4,
                borderRadius: 6,
                background: '#fdf1ed',
                color: '#8a2c14',
                padding: '0.625rem 0.75rem',
                fontSize: '0.875rem',
                lineHeight: 1.45,
              }}
            >
              {deleteError}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={deleting}>Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              style={{ background: '#e0552e', color: '#FFFFFF' }}
            >
              {deleting ? 'Deleting…' : 'Delete Permanently'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
