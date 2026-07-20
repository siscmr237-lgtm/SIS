import { ArrowLeft, FileText, MoreHorizontal, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-sm text-gray-900">{value || '—'}</dd>
    </div>
  );
}

export function StaffProfile({ staff, onNavigate }: StaffProfileProps) {
  const cache = useSisCache();
  const [activeTab, setActiveTab] = useState<Tab>('general');

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
      cache.invalidate('dashboard');
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
      cache.invalidate('dashboard');
      setShowPayment(false);
      setPaymentForm({ description: '', amount: '', entryDate: new Date().toISOString().split('T')[0], paymentMethod: '' });
      await refreshLedger();
    } catch (e: any) {
      setSubmitError(e.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
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
        <h1 className="text-3xl">{staff.firstName} {staff.lastName}</h1>
        <p className="text-gray-500 mt-1">{staff.code} · {staff.isTeacher ? 'Teacher' : staff.role}</p>
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
          <h2 className="text-base font-medium mb-5">Staff Information</h2>
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Staff ID" value={staff.code} />
            <Field label="Role" value={staff.isTeacher ? 'Teacher' : staff.role} />
            <Field label="First Name" value={staff.firstName} />
            <Field label="Last Name" value={staff.lastName} />
            <Field label="Phone" value={staff.phone} />
            <Field label="Email" value={staff.email} />
            <Field label="Hire Date" value={formatDate(staff.hireDate)} />
            <Field label="Salary" value={staff.salary ? `${staff.salary.toLocaleString()} FCFA` : '—'} />
            <Field label="Type" value={staff.isTeacher ? 'Teaching Staff' : 'Non-Teaching Staff'} />
          </dl>
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
