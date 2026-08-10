import { ArrowLeft, Edit, FileText, MoreHorizontal, Plus } from 'lucide-react';
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
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { StaffForm, StaffFormPayload } from './StaffForm';

interface LedgerEntry {
  id: string;
  type: 'CHARGE' | 'PAYMENT';
  description: string;
  amount: number;
  entryDate: string;
  paymentMethod?: string | null;
  category?: { name: string } | null;
}

interface LedgerData {
  entries: LedgerEntry[];
  totalCharged: number;
  totalPaid: number;
  balance: number;
}

interface ChargeCategory {
  id: number;
  name: string;
  limit: number;
  isBuiltIn: boolean;
}

interface StaffProfileProps {
  staff: Staff;
  onNavigate: (page: NavigationPage) => void;
}

type Tab = 'general' | 'finance' | 'attendance';

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Mobile Money', 'Cheque'];

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
  const [showPayment, setShowPayment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split('T')[0];
  const [chargeForm, setChargeForm] = useState({
    categoryId: '', description: '', amount: '', entryDate: today, paymentMethod: '',
  });
  const [paymentForm, setPaymentForm] = useState({
    description: '', amount: '', entryDate: today, paymentMethod: '',
  });

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
        amount: parseInt(chargeForm.amount),
        entryDate: chargeForm.entryDate,
        ...(chargeForm.paymentMethod ? { paymentMethod: chargeForm.paymentMethod } : {}),
      });
      cache.invalidateOn('ledger:write');
      setShowCharge(false);
      setChargeForm({ categoryId: '', description: '', amount: '', entryDate: new Date().toISOString().split('T')[0], paymentMethod: '' });
      await refreshLedger();
    } catch (e: any) {
      setSubmitError(e.message || 'Failed to record charge');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.post('/ledger/staff-payment', {
        staffId: staff.code,
        description: paymentForm.description,
        amount: parseInt(paymentForm.amount),
        entryDate: paymentForm.entryDate,
        paymentMethod: paymentForm.paymentMethod,
      });
      cache.invalidateOn('ledger:write');
      setShowPayment(false);
      setPaymentForm({ description: '', amount: '', entryDate: new Date().toISOString().split('T')[0], paymentMethod: '' });
      await refreshLedger();
    } catch (e: any) {
      setSubmitError(e.message || 'Failed to record payment');
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
      const userStr = window.localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user?.School?.[0]) schoolInfo = user.School[0];
      }
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
        <h1 className="text-3xl">{displayInfo.firstName} {displayInfo.lastName}</h1>
        <p className="text-gray-500 mt-1">{staff.code} · {displayInfo.isTeacher ? 'Teacher' : displayInfo.role}</p>
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
            <Field label="Staff ID" value={staff.code} />
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

          <StaffForm
            mode="edit"
            open={showEdit}
            onOpenChange={setShowEdit}
            initialValues={displayInfo}
            onSubmit={async (payload: StaffFormPayload) => {
              await api.put(`/staff/${staff.code}`, payload);
              setDisplayInfo(payload);
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
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => { setSubmitError(null); setShowCharge(true); setShowActionsMenu(false); }}
                  >
                    Record Charge
                  </button>
                  <button
                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                    onClick={() => { setSubmitError(null); setShowPayment(true); setShowActionsMenu(false); }}
                  >
                    Record Payment
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
            <Button onClick={() => { setSubmitError(null); setShowPayment(true); }}>
              <Plus size={16} className="mr-1" />
              Record Payment
            </Button>
          </div>

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
                <Card className={`p-2 md:p-4 ${ledgerData.balance > 0 ? 'bg-red-50 border-red-200' : ''}`}>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Balance Owed</p>
                  <p className={`text-xs md:text-xl font-medium ${ledgerData.balance > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {ledgerData.balance.toLocaleString()} FCFA
                  </p>
                </Card>
              </div>

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
                            <td className="px-4 py-3 text-gray-900">{entry.description}</td>
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

          <Dialog open={showCharge} onOpenChange={(open) => { setShowCharge(open); if (!open) setSubmitError(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Record Charge</DialogTitle>
                <DialogDescription>Add a charge to this staff member's account.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Category</Label>
                  <Select value={chargeForm.categoryId} onValueChange={(v) => setChargeForm(f => ({ ...f, categoryId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={chargeForm.description}
                    onChange={e => setChargeForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="e.g. Monthly salary"
                  />
                </div>
                <div>
                  <Label>Amount (FCFA)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={chargeForm.amount}
                    onChange={e => setChargeForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={chargeForm.entryDate}
                    onChange={e => setChargeForm(f => ({ ...f, entryDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Payment Method <span className="text-gray-400 font-normal">(optional)</span></Label>
                  <Select value={chargeForm.paymentMethod} onValueChange={(v) => setChargeForm(f => ({ ...f, paymentMethod: v }))}>
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
                <Button onClick={handleChargeSubmit} disabled={submitting}>
                  {submitting ? 'Saving...' : 'Record Charge'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showPayment} onOpenChange={(open) => { setShowPayment(open); if (!open) setSubmitError(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
                <DialogDescription>Record a payment for this staff member.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Description</Label>
                  <Input
                    value={paymentForm.description}
                    onChange={e => setPaymentForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="e.g. June salary payment"
                  />
                </div>
                <div>
                  <Label>Amount (FCFA)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={paymentForm.amount}
                    onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0"
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
                <Button onClick={handlePaymentSubmit} disabled={submitting}>
                  {submitting ? 'Saving...' : 'Record Payment'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {activeTab === 'attendance' && (
        <Card className="p-6 text-gray-500">Attendance tracking coming soon.</Card>
      )}
    </div>
  );
}
