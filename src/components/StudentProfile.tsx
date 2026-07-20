import { ArrowLeft, Edit, FileText, MoreHorizontal, Plus } from 'lucide-react';
import { generateFinancialSheet } from '../utils/pdfGenerator';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useSisCache } from '../lib/SisCache';
import { SCHOOL_CLASSES } from '../lib/classes';
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

type Tab = 'general' | 'finance' | 'attendance';

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Mobile Money', 'Cheque'];

export function StudentProfile({ student, onNavigate }: StudentProfileProps) {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const cache = useSisCache();

  // Editable info — local state so updates appear immediately after save
  const [displayInfo, setDisplayInfo] = useState({
    firstName: student.firstName,
    lastName: student.lastName,
    gender: student.gender as string,
    dateOfBirth: student.dateOfBirth || '',
    enrollmentDate: student.enrollmentDate || '',
    address: student.address || '',
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
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
    try {
      await api.delete(`/students/${student.id}/pickup-contacts/${contactId}`);
      setPickupContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch {
      // silently ignore — stale item stays in list; page reload will correct it
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
      cache.invalidate('ledger-summary', 'dashboard');
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
      cache.invalidate('ledger-summary', 'dashboard');
      setShowPayment(false);
      setPaymentForm({ description: '', amount: '', entryDate: new Date().toISOString().split('T')[0], paymentMethod: '' });
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
      await api.put(`/students/${student.id}`, {
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        gender: editForm.gender,
        dateOfBirth: editForm.dateOfBirth || undefined,
        enrollmentDate: editForm.enrollmentDate || undefined,
        address: editForm.address.trim(),
        parentName: editForm.parentName.trim(),
        parentPhone: editForm.parentPhone.trim(),
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
        parentName: editForm.parentName.trim(),
        parentPhone: editForm.parentPhone.trim(),
        class: editForm.class,
        allergies: editForm.allergies.trim(),
        medicalConditions: editForm.medicalConditions.trim(),
        currentMedications: editForm.currentMedications.trim(),
        medicalNotes: editForm.medicalNotes.trim(),
      });
      cache.invalidate('students', 'dashboard');
      setShowEdit(false);
    } catch (e: any) {
      setEditError(e.message || 'Failed to save');
    } finally {
      setEditSubmitting(false);
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

      <div className="mb-6">
        <h1 className="text-3xl">{displayInfo.firstName} {displayInfo.lastName}</h1>
        <p className="text-gray-500 mt-1">{student.id} · {displayInfo.class}</p>
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
        <>
          <Card className="p-6">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-base font-medium">Student Information</h2>
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
                  setEditError(null);
                  setShowEdit(true);
                }}
              >
                <Edit size={14} className="mr-1" />
                Edit
              </Button>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-5">
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
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-5">
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
              <div className="divide-y">
                {pickupContacts.map((contact) => (
                  <div key={contact.id} className="flex items-start justify-between py-3 first:pt-0 last:pb-0">
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
                      >
                        Delete
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
                  <Input
                    value={addContactForm.phone}
                    onChange={(e) => setAddContactForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+237 6XX XXX XXX"
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
                  <Input
                    value={editContactForm.phone}
                    onChange={(e) => setEditContactForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+237 6XX XXX XXX"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      {SCHOOL_CLASSES.map(cls => (
                        <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Label>Enrollment Date</Label>
                  <Input
                    type="date"
                    value={editForm.enrollmentDate}
                    onChange={e => setEditForm(f => ({ ...f, enrollmentDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Parent / Guardian Name</Label>
                  <Input
                    value={editForm.parentName}
                    onChange={e => setEditForm(f => ({ ...f, parentName: e.target.value }))}
                    placeholder="Parent or guardian name"
                  />
                </div>
                <div>
                  <Label>Parent Phone</Label>
                  <Input
                    value={editForm.parentPhone}
                    onChange={e => setEditForm(f => ({ ...f, parentPhone: e.target.value }))}
                    placeholder="+237 6XX XXX XXX"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Address</Label>
                  <Input
                    value={editForm.address}
                    onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Home address"
                  />
                </div>

                {/* Medical History */}
                <div className="sm:col-span-2 border-t pt-4 mt-1">
                  <p className="text-sm font-medium text-gray-700 mb-3">
                    Medical History{' '}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <Label>Allergies</Label>
                  <Textarea
                    value={editForm.allergies}
                    onChange={e => setEditForm(f => ({ ...f, allergies: e.target.value }))}
                    placeholder="e.g. Penicillin, peanuts, latex..."
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Existing Medical Conditions</Label>
                  <Textarea
                    value={editForm.medicalConditions}
                    onChange={e => setEditForm(f => ({ ...f, medicalConditions: e.target.value }))}
                    placeholder="e.g. Asthma, sickle cell..."
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Current Medications</Label>
                  <Textarea
                    value={editForm.currentMedications}
                    onChange={e => setEditForm(f => ({ ...f, currentMedications: e.target.value }))}
                    placeholder="e.g. Salbutamol inhaler as needed..."
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Additional Notes</Label>
                  <Textarea
                    value={editForm.medicalNotes}
                    onChange={e => setEditForm(f => ({ ...f, medicalNotes: e.target.value }))}
                    placeholder="Any other information the school should know..."
                  />
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
        </>
      )}

      {activeTab === 'finance' && (
        <div className="space-y-4">
          {/* Mobile: ⋯ action menu */}
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

          {/* Desktop: three-button row */}
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
              {/* Summary */}
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
