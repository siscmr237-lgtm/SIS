import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';

export interface StaffFormValues {
  firstName?: string;
  lastName?: string;
  idNumber?: string;
  role?: string;
  phone?: string;
  email?: string;
  hireDate?: string;
  salary?: number | string;
  isTeacher?: boolean;
}

export interface StaffFormPayload {
  firstName: string;
  lastName: string;
  idNumber: string;
  role: string;
  phone: string;
  email: string;
  hireDate: string;
  salary: number;
  isTeacher: boolean;
}

interface StaffFormProps {
  mode: 'add' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: StaffFormValues;
  onSubmit: (payload: StaffFormPayload) => Promise<void>;
}

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  idNumber: '',
  role: '',
  phone: '',
  email: '',
  hireDate: '',
  salary: '',
  isTeacher: false,
};

export function StaffForm({ mode, open, onOpenChange, initialValues, onSubmit }: StaffFormProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form from initialValues each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setForm({
      firstName: initialValues?.firstName ?? '',
      lastName: initialValues?.lastName ?? '',
      idNumber: initialValues?.idNumber ?? '',
      role: initialValues?.role ?? '',
      phone: initialValues?.phone ?? '',
      email: initialValues?.email ?? '',
      hireDate: (initialValues?.hireDate || '').split('T')[0] || '',
      salary: initialValues?.salary !== undefined && initialValues?.salary !== null ? String(initialValues.salary) : '',
      isTeacher: initialValues?.isTeacher ?? false,
    });
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isValid =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.idNumber.trim() &&
    form.phone.trim() &&
    form.email.trim() &&
    form.hireDate &&
    (form.isTeacher || form.role.trim());

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        idNumber: form.idNumber.trim(),
        role: form.isTeacher ? 'Teacher' : form.role.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        hireDate: form.hireDate,
        salary: Number(form.salary) || 0,
        isTeacher: form.isTeacher,
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to save staff member');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setError(null); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? 'Add New Staff Member' : 'Edit Staff Member'}</DialogTitle>
          <DialogDescription>
            {mode === 'add' ? "Enter the staff member's details below" : "Update the staff member's details below"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4">
          <div>
            <Label>First Name</Label>
            <Input placeholder="Enter first name" value={form.firstName} onChange={e => setForm(s => ({ ...s, firstName: e.target.value }))} />
          </div>
          <div>
            <Label>Last Name</Label>
            <Input placeholder="Enter last name" value={form.lastName} onChange={e => setForm(s => ({ ...s, lastName: e.target.value }))} />
          </div>
          <div>
            <Label>ID Number</Label>
            <Input placeholder="Enter ID number" value={form.idNumber} onChange={e => setForm(s => ({ ...s, idNumber: e.target.value }))} />
          </div>
          {!form.isTeacher && (
            <div>
              <Label>Role</Label>
              <Input placeholder="e.g., Cleaner, Cook" value={form.role} onChange={e => setForm(s => ({ ...s, role: e.target.value }))} />
            </div>
          )}
          <div>
            <Label>Phone</Label>
            <Input placeholder="+237 6XX XXX XXX" value={form.phone} onChange={e => setForm(s => ({ ...s, phone: e.target.value }))} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" placeholder="email@school.cm" value={form.email} onChange={e => setForm(s => ({ ...s, email: e.target.value }))} />
          </div>
          <div>
            <Label>Hire Date</Label>
            <Input type="date" value={form.hireDate} onChange={e => setForm(s => ({ ...s, hireDate: e.target.value }))} />
          </div>
          <div>
            <Label>Salary (FCFA)</Label>
            <Input type="number" placeholder="150000" value={form.salary} onChange={e => setForm(s => ({ ...s, salary: e.target.value }))} />
          </div>
          <div className="col-span-2 flex items-center gap-3 pt-2">
            <Checkbox
              id="isTeacher"
              checked={form.isTeacher}
              onCheckedChange={(checked) => setForm(s => ({ ...s, isTeacher: !!checked }))}
            />
            <Label htmlFor="isTeacher">This staff member is a teacher</Label>
          </div>
          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting || !isValid}>
            {submitting ? 'Saving…' : mode === 'add' ? 'Save Staff' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
