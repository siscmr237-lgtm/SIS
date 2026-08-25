import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { PhoneInput } from './PhoneInput';
import { ThreePartDateInput } from './ThreePartDateInput';
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
  /**
   * NULL when left blank, never ''. Staff.idNumber and Staff.email are unique
   * per school, and two rows holding the same empty string collide on that
   * index — so a blank saved as '' would work for the first staff member
   * without one and then 409 for every one after. NULLs do not collide.
   */
  idNumber: string | null;
  role: string;
  phone: string;
  email: string | null;
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

/** One key per box that can be wrong, so a message can be put UNDER that box. */
type FieldKey = 'fullName' | 'idNumber' | 'staffType' | 'role' | 'phone' | 'email' | 'hireDate' | 'salary';

type FieldErrors = Partial<Record<FieldKey, string>>;

/**
 * WHAT WENT WRONG HERE, AND WHY THIS IS ALL INLINE STYLE.
 *
 * The Save button "did nothing" once a school had a few staff on file. It was in
 * fact failing properly: a staff member entered with an ID number already on
 * file trips @@unique([schoolId, idNumber]), POST /staff answers 409 with the
 * sentence to show, and this dialog already caught it and rendered it. The bug
 * was that the rendering was invisible.
 *
 * The message was a `<p className="sm:col-span-2 ...">` inside the field grid.
 * src/index.css is a frozen, pre-compiled Tailwind build and `sm:col-span-2` is
 * NOT IN IT — while `sm:grid-cols-2` is (and, sitting outside any media query,
 * applies at every width). So the grid was always two columns and the message,
 * unable to span them, landed in the right-hand cell of the last row beside the
 * Salary box: 223px wide, mid-form, and — measured — adding exactly 0px to the
 * dialog's height, because that row was already taller than the text. Pressing
 * Save moved nothing on screen. That is indistinguishable from a dead button.
 *
 * So the reporting moved OUT of the grid: a banner pinned between the scrolling
 * field area and the buttons, where it cannot be laid out into a corner and is
 * on screen whatever the fields above it are doing. Every style below is inline
 * for the same reason the bug existed in the first place — a utility class that
 * is not already in the frozen stylesheet renders as nothing at all, silently.
 */
const ERROR_INK = '#e0552e';

const bannerStyle: React.CSSProperties = {
  flex: '0 0 auto',
  border: `1px solid ${ERROR_INK}`,
  borderLeftWidth: 4,
  borderRadius: 6,
  background: '#fdf1ed',
  color: '#8a2c14',
  padding: '0.625rem 0.75rem',
  fontSize: '0.875rem',
  lineHeight: 1.45,
};

/** A ring, not a border swap: the controls own their borders, this sits outside. */
const fieldRingStyle: React.CSSProperties = {
  borderRadius: 8,
  boxShadow: `0 0 0 2px ${ERROR_INK}`,
};

const fieldMessageStyle: React.CSSProperties = {
  marginTop: '0.25rem',
  fontSize: '0.75rem',
  lineHeight: 1.4,
  color: ERROR_INK,
};

/**
 * The field area scrolls; the banner and the buttons do not.
 *
 * DialogContent is a flex column capped to the viewport, and its docblock asks
 * the caller to hand the scrolling to ONE child. Nothing here did, which was
 * survivable only while the dialog never grew. Per-field messages make it grow,
 * and an uncapped flex column pushes its last children straight off the bottom
 * of the screen — here, the error banner and the Save button — with body scroll
 * locked behind the modal. That is the same class of bug as the one above.
 */
const scrollingFieldsStyle: React.CSSProperties = {
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
};

/**
 * Which box the server is complaining about.
 *
 * POST/PUT /staff send a machine-readable `field` alongside the sentence, so
 * this is a lookup rather than a guess at the prose — the wording can be
 * reworded without silently detaching the highlight from the box. firstName and
 * lastName both land on the single Full Name box, and a duplicate `role` belongs
 * on whichever control actually holds the role for this kind of staff member.
 */
function fieldKeyFromServer(field: unknown, isTeacher: boolean): FieldKey | null {
  switch (field) {
    case 'firstName':
    case 'lastName':
      return 'fullName';
    case 'idNumber':
      return 'idNumber';
    case 'phone':
      return 'phone';
    case 'email':
      return 'email';
    case 'role':
      return isTeacher ? 'staffType' : 'role';
    default:
      return null;
  }
}

export function StaffForm({ mode, open, onOpenChange, initialValues, onSubmit }: StaffFormProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const fieldsRef = useRef<HTMLDivElement>(null);

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
    setFieldErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isTeacher = form.staffType === 'teacher';

  /**
   * ID Number, Email and Salary are optional: a school taking on a cook or a
   * cleaner often has none of the three to hand on the day, and blocking the
   * record until it does means the staff member does not exist in the system at
   * all. Name, Role, Phone and Hire Date stay required — phone because it is
   * how anyone is actually reached, and hire date because payroll counts from it.
   *
   * These now run ON CLICK and answer with a message per box, instead of feeding
   * a `disabled` on the Save button. A disabled button is the OTHER way this
   * form failed silently: it says that something is wrong without ever saying
   * what, so an unfilled Hire Date presented as exactly the same dead button as
   * a duplicate ID number. The button is always live now, and pressing it always
   * produces an answer.
   */
  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!form.fullName.trim()) {
      next.fullName = 'Enter the staff member’s full name.';
    } else if (!isCompleteFullName(form.fullName)) {
      next.fullName = 'Enter both a first and a last name.';
    }
    if (form.staffType === '') {
      next.staffType = 'Choose whether this staff member is a teacher.';
    } else if (form.staffType === 'non-teacher' && !form.role.trim()) {
      next.role = 'Enter the role, for example Cleaner or Bursar.';
    }
    if (!form.phone.trim()) next.phone = 'Enter a phone number.';
    if (!form.hireDate) next.hireDate = 'Enter the hire date.';
    return next;
  };

  /** Brings the first offending box into view; the banner covers the rest. */
  const revealField = (key: FieldKey) => {
    fieldsRef.current
      ?.querySelector<HTMLElement>(`[data-field="${key}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  const handleSubmit = async () => {
    const problems = validate();
    const problemKeys = Object.keys(problems) as FieldKey[];
    if (problemKeys.length) {
      setFieldErrors(problems);
      setError(
        problemKeys.length === 1
          ? problems[problemKeys[0]]!
          : `Nothing has been saved. ${problemKeys.length} fields still need attention — they are marked below.`,
      );
      revealField(problemKeys[0]);
      return;
    }

    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const { firstName, lastName } = splitFullName(form.fullName);
      await onSubmit({
        firstName,
        lastName,
        // || null, not the trimmed '' — see StaffFormPayload for why an empty
        // string cannot be stored in either of these columns more than once.
        idNumber: form.idNumber.trim() || null,
        role: isTeacher ? 'Teacher' : form.role.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        hireDate: form.hireDate,
        salary: Number(form.salary) || 0,
        isTeacher,
      });
    } catch (e: any) {
      // The api layer hangs the parsed response body off the error, so a 409 or
      // a 400 arrives carrying both the sentence to show and the field it is
      // about. Anything without a field — a 500, a dropped connection — still
      // reaches the banner, because the one thing this must never do is nothing.
      const message = e?.message || 'This staff member could not be saved.';
      const key = fieldKeyFromServer(e?.body?.field, isTeacher);
      setError(message);
      if (key) {
        setFieldErrors({ [key]: message });
        revealField(key);
      } else {
        setFieldErrors({});
      }
    } finally {
      setSubmitting(false);
    }
  };

  /** Clears as the user types, so a corrected box stops looking wrong. */
  const update = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K], field: FieldKey) => {
    setForm((s) => ({ ...s, [key]: value }));
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setError(null);
          setFieldErrors({});
        }
      }}
    >
      <DialogContent style={{ maxWidth: 'min(672px, calc(100vw - 2rem))' }}>
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
        <div ref={fieldsRef} className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4" style={scrollingFieldsStyle}>
          <div className="sm:col-span-2" data-field="fullName">
            <Label>Full Name</Label>
            <div style={fieldErrors.fullName ? fieldRingStyle : undefined}>
              <Input
                placeholder="Enter full name"
                value={form.fullName}
                onChange={e => update('fullName', e.target.value, 'fullName')}
              />
            </div>
            {fieldErrors.fullName && <p style={fieldMessageStyle}>{fieldErrors.fullName}</p>}
          </div>
          <div data-field="idNumber">
            <Label>ID Number (optional)</Label>
            <div style={fieldErrors.idNumber ? fieldRingStyle : undefined}>
              <Input
                placeholder="Enter ID number"
                value={form.idNumber}
                onChange={e => update('idNumber', e.target.value, 'idNumber')}
              />
            </div>
            {fieldErrors.idNumber && <p style={fieldMessageStyle}>{fieldErrors.idNumber}</p>}
          </div>
          <div data-field="staffType">
            <Label>Role</Label>
            <div style={fieldErrors.staffType ? fieldRingStyle : undefined}>
              <Select
                value={form.staffType}
                onValueChange={(v: StaffType) => {
                  setForm(s => ({ ...s, staffType: v, role: v === 'teacher' ? '' : s.role }));
                  setFieldErrors(prev => (prev.staffType ? { ...prev, staffType: undefined } : prev));
                }}
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
            {fieldErrors.staffType && <p style={fieldMessageStyle}>{fieldErrors.staffType}</p>}
          </div>
          {form.staffType === 'non-teacher' && (
            <div className="sm:col-span-2" data-field="role">
              <Label>Specify Role</Label>
              <div style={fieldErrors.role ? fieldRingStyle : undefined}>
                <Input
                  placeholder="e.g., Cleaner, Cook, Bursar"
                  value={form.role}
                  onChange={e => update('role', e.target.value, 'role')}
                />
              </div>
              {fieldErrors.role && <p style={fieldMessageStyle}>{fieldErrors.role}</p>}
            </div>
          )}
          <div data-field="phone">
            <Label>Phone</Label>
            <div style={fieldErrors.phone ? fieldRingStyle : undefined}>
              <PhoneInput value={form.phone} onChange={v => update('phone', v, 'phone')} />
            </div>
            {fieldErrors.phone && <p style={fieldMessageStyle}>{fieldErrors.phone}</p>}
          </div>
          <div data-field="email">
            <Label>Email (optional)</Label>
            <div style={fieldErrors.email ? fieldRingStyle : undefined}>
              <Input
                type="email"
                placeholder="email@school.cm"
                value={form.email}
                onChange={e => update('email', e.target.value, 'email')}
              />
            </div>
            {fieldErrors.email && <p style={fieldMessageStyle}>{fieldErrors.email}</p>}
          </div>
          <div data-field="hireDate">
            <Label>Hire Date</Label>
            {/* Month | Day | Year, the one date control this app has. */}
            <div style={fieldErrors.hireDate ? fieldRingStyle : undefined}>
              <ThreePartDateInput
                value={form.hireDate}
                onChange={v => update('hireDate', v ?? '', 'hireDate')}
                aria-label="Hire date"
              />
            </div>
            {fieldErrors.hireDate && <p style={fieldMessageStyle}>{fieldErrors.hireDate}</p>}
          </div>
          <div data-field="salary">
            <Label>Salary (FCFA, optional)</Label>
            <div style={fieldErrors.salary ? fieldRingStyle : undefined}>
              <Input
                type="number"
                placeholder="150000"
                value={form.salary}
                onChange={e => update('salary', e.target.value, 'salary')}
              />
            </div>
            {fieldErrors.salary && <p style={fieldMessageStyle}>{fieldErrors.salary}</p>}
          </div>
        </div>

        {/* Between the fields and the buttons, so it is the last thing read
            before Save is pressed again — and it STAYS there while the field
            area above it scrolls. role="alert" so it is announced, not merely
            drawn. */}
        {error && (
          <div role="alert" style={bannerStyle}>
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2" style={{ flex: '0 0 auto' }}>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : mode === 'add' ? 'Save Staff' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
