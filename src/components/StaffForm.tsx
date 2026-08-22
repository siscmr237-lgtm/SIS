import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { PhoneInput } from './PhoneInput';
import { DateFilterInput } from './DateFilterInput';
import { isCompleteFullName, joinFullName, splitFullName } from '../utils/fullName';

// The dialog collects ONE name and splits it on the way out. Both the props and
// the payload below still speak firstName/lastName, because the record and the
// API do — see src/utils/fullName.ts. Only the box in the middle changed.
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

/**
 * Teacher-or-not is ONE question, asked once, in the Role field.
 *
 * It used to be two controls that could disagree: a free-text Role box and a
 * separate "this staff member is a teacher" checkbox below it. Nothing stopped
 * someone typing Teacher in the box while leaving the checkbox clear, and the
 * checkbox is the field that actually decides whether the person can be given a
 * teacher account — so the record read Teacher while the system treated them as
 * support staff.
 *
 * Now Role is a select with exactly two answers. Teacher IS the role, and the
 * free-text box only appears for Non-teacher, where the answer genuinely is
 * open — Cleaner, Cook, Bursar. `staffType` starts empty rather than defaulting
 * to Non-teacher, so an unanswered question stays visibly unanswered instead of
 * saving a silent default.
 */
type StaffType = '' | 'teacher' | 'non-teacher';

const EMPTY_FORM = {
  fullName: '',
  idNumber: '',
  staffType: '' as StaffType,
  role: '',
  phone: '',
  email: '',
  hireDate: '',
  salary: '',
};

export function StaffForm({ mode, open, onOpenChange, initialValues, onSubmit }: StaffFormProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form from initialValues each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const seededTeacher = initialValues?.isTeacher ?? false;
    const seededRole = initialValues?.role ?? '';
    setForm({
      fullName: joinFullName(initialValues?.firstName, initialValues?.lastName),
      idNumber: initialValues?.idNumber ?? '',
      // An existing record has already answered the question; a new one has not.
      staffType: seededTeacher ? 'teacher' : seededRole ? 'non-teacher' : '',
      // 'Teacher' is what the select itself stands for, not something to prefill
      // the free-text box with — that box is only ever shown for non-teachers.
      role: seededTeacher ? '' : seededRole,
      phone: initialValues?.phone ?? '',
      email: initialValues?.email ?? '',
      hireDate: (initialValues?.hireDate || '').split('T')[0] || '',
      salary: initialValues?.salary !== undefined && initialValues?.salary !== null ? String(initialValues.salary) : '',
    });
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isTeacher = form.staffType === 'teacher';

  const isValid =
    isCompleteFullName(form.fullName) &&
    form.idNumber.trim() &&
    form.phone.trim() &&
    form.email.trim() &&
    form.hireDate &&
    (isTeacher || (form.staffType === 'non-teacher' && form.role.trim()));

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { firstName, lastName } = splitFullName(form.fullName);
      await onSubmit({
        firstName,
        lastName,
        idNumber: form.idNumber.trim(),
        role: isTeacher ? 'Teacher' : form.role.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        hireDate: form.hireDate,
        salary: Number(form.salary) || 0,
        isTeacher,
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

        {/* One column on a phone. Two columns there are not worth two fields:
            at 360px they leave each one about 150px, narrower than the content
            it has to hold — a full email address, a dialled phone number — so
            the value scrolls out of its own box while it is being typed. Full
            width costs only a little vertical scrolling. Pairing returns at sm. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          <div className="sm:col-span-2">
            <Label>Full Name</Label>
            <Input placeholder="Enter full name" value={form.fullName} onChange={e => setForm(s => ({ ...s, fullName: e.target.value }))} />
          </div>
          <div>
            <Label>ID Number</Label>
            <Input placeholder="Enter ID number" value={form.idNumber} onChange={e => setForm(s => ({ ...s, idNumber: e.target.value }))} />
          </div>
          <div>
            <Label>Role</Label>
            <Select
              value={form.staffType}
              onValueChange={(v: StaffType) => setForm(s => ({ ...s, staffType: v, role: v === 'teacher' ? '' : s.role }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="teacher">Teacher</SelectItem>
                <SelectItem value="non-teacher">Non-teacher</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.staffType === 'non-teacher' && (
            <div className="sm:col-span-2">
              <Label>Specify Role</Label>
              <Input placeholder="e.g., Cleaner, Cook, Bursar" value={form.role} onChange={e => setForm(s => ({ ...s, role: e.target.value }))} />
            </div>
          )}
          <div>
            <Label>Phone</Label>
            <PhoneInput value={form.phone} onChange={v => setForm(s => ({ ...s, phone: v }))} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" placeholder="email@school.cm" value={form.email} onChange={e => setForm(s => ({ ...s, email: e.target.value }))} />
          </div>
          <div>
            <Label>Hire Date</Label>
            {/* The control the finance and attendance date filters already use:
                the native input sits invisible on top, so Chrome's chevron is
                gone and the field wears the same calendar as the rest of the
                app. The chosen date shows as DD/MM/YYYY, clear of the icon. */}
            <DateFilterInput
              value={form.hireDate}
              onChange={v => setForm(s => ({ ...s, hireDate: v }))}
              placeholder="Select hire date"
              aria-label="Hire date"
            />
          </div>
          <div>
            <Label>Salary (FCFA)</Label>
            <Input type="number" placeholder="150000" value={form.salary} onChange={e => setForm(s => ({ ...s, salary: e.target.value }))} />
          </div>
          {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
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
