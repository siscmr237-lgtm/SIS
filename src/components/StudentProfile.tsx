import { ArrowLeft, FileText, Plus } from 'lucide-react';
import { generateFinancialSheet } from '../utils/pdfGenerator';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
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

interface StudentProfileProps {
  student: Student;
  onNavigate: (page: NavigationPage) => void;
}

type Tab = 'general' | 'finance' | 'attendance';

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Mobile Money', 'Cheque'];

export function StudentProfile({ student, onNavigate }: StudentProfileProps) {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [ledgerData, setLedgerData] = useState<LedgerData | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ChargeCategory[]>([]);
  const [showCharge, setShowCharge] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];
  const [chargeForm, setChargeForm] = useState({
    categoryId: '', description: '', amount: '', entryDate: today, paymentMethod: '',
  });
  const [paymentForm, setPaymentForm] = useState({
    description: '', amount: '', entryDate: today, paymentMethod: '',
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General Info' },
    { id: 'finance', label: 'Finance' },
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
        const [ledgerRes, catsRes] = await Promise.allSettled([
          api.get(`/ledger/student/${encodeURIComponent(student.id)}`),
          api.get('/charge-categories'),
        ]);
        if (!cancelled) {
          if (ledgerRes.status === 'fulfilled') setLedgerData(ledgerRes.value);
          else setLedgerError(ledgerRes.reason?.message || 'Failed to load finance data');
          if (catsRes.status === 'fulfilled') setCategories(catsRes.value || []);
        }
      } finally {
        if (!cancelled) setLedgerLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [activeTab, student.id]);

  const handleChargeSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.post('/ledger/charge', {
        studentId: student.id,
        categoryId: parseInt(chargeForm.categoryId),
        description: chargeForm.description,
        amount: parseInt(chargeForm.amount),
        entryDate: chargeForm.entryDate,
        ...(chargeForm.paymentMethod ? { paymentMethod: chargeForm.paymentMethod } : {}),
      });
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
      await api.post('/ledger/payment', {
        studentId: student.id,
        description: paymentForm.description,
        amount: parseInt(paymentForm.amount),
        entryDate: paymentForm.entryDate,
        paymentMethod: paymentForm.paymentMethod,
      });
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
    <div className="p-8">
      <button
        onClick={() => onNavigate('students')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-6"
      >
        <ArrowLeft size={18} />
        Back to Students
      </button>

      <div className="mb-6">
        <h1 className="text-3xl">{student.firstName} {student.lastName}</h1>
        <p className="text-gray-500 mt-1">{student.id} · {student.class}</p>
      </div>

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
        <Card className="p-6">
          <h2 className="text-base font-medium mb-5">Student Information</h2>
          <dl className="grid grid-cols-2 gap-x-12 gap-y-5">
            <Field label="Student ID" value={student.id} />
            <Field label="Class" value={student.class} />
            <Field label="First Name" value={student.firstName} />
            <Field label="Last Name" value={student.lastName} />
            <Field label="Gender" value={student.gender} capitalize />
            <Field label="Date of Birth" value={formatDate(student.dateOfBirth)} />
            <Field label="Enrollment Date" value={formatDate(student.enrollmentDate)} />
            <Field label="Address" value={student.address} />
            <Field label="Parent / Guardian" value={student.parentName} />
            <Field label="Parent Phone" value={student.parentPhone} />
          </dl>
        </Card>
      )}

      {activeTab === 'finance' && (
        <div className="space-y-6">
          {/* Action buttons */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={handleDownloadStatement} disabled={!ledgerData}>
              <FileText size={16} className="mr-1" />
              Download Statement
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
          {ledgerError && <Card className="p-6 text-red-600">{ledgerError}</Card>}

          {!ledgerLoading && !ledgerError && ledgerData && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Charged</p>
                  <p className="text-xl font-medium text-gray-900">
                    {ledgerData.totalCharged.toLocaleString()} FCFA
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Paid</p>
                  <p className="text-xl font-medium text-green-600">
                    {ledgerData.totalPaid.toLocaleString()} FCFA
                  </p>
                </Card>
                <Card className={`p-4 ${ledgerData.balance > 0 ? 'bg-red-50 border-red-200' : ''}`}>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Balance Owed</p>
                  <p className={`text-xl font-medium ${ledgerData.balance > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {ledgerData.balance.toLocaleString()} FCFA
                  </p>
                </Card>
              </div>

              {/* Ledger table */}
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
                          <th className="px-4 py-3 font-medium">Payment Method</th>
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}

          {/* Record Charge dialog */}
          <Dialog open={showCharge} onOpenChange={(open) => { setShowCharge(open); if (!open) setSubmitError(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Record Charge</DialogTitle>
                <DialogDescription>Add a charge to this student's account.</DialogDescription>
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
                    placeholder="e.g. Term 1 tuition fee"
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

          {/* Record Payment dialog */}
          <Dialog open={showPayment} onOpenChange={(open) => { setShowPayment(open); if (!open) setSubmitError(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
                <DialogDescription>Record a payment received from this student.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Description</Label>
                  <Input
                    value={paymentForm.description}
                    onChange={e => setPaymentForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="e.g. Term 1 payment"
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
        <Card className="p-6 text-gray-500">Coming soon</Card>
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
