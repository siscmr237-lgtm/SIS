import { api } from "@/lib/api";
import { useCachedResource, useSisCache } from "@/lib/SisCache";
import { NavigationPage } from '../App';

interface StudentsManagementProps {
  onNavigate?: (page: NavigationPage) => void;
  onViewStudent?: (student: Student, tab?: string) => void;
}
import { useSchoolClassNames } from "@/lib/classes";
import { PaymentStatusDot, PaymentStatusLabel } from "./PaymentStatus";
import { ZeroMarkDot } from "./MarkStatus";
import { RevalidatingBadge, useResourceError } from "./ResourceStatus";
import { Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Student } from "../types";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { PhoneInput } from "./PhoneInput";
import { ThreePartDateInput } from "./ThreePartDateInput";
import { Textarea } from "./ui/textarea";

/**
 * The Add New Student form grid.
 *
 * A scoped block rather than utilities, because the two things this needs are
 * not in src/index.css and that file is frozen: a grid that is one column on a
 * phone and two from 40rem up, and a way for a field to span the full width in
 * BOTH of those states.
 *
 * grid-column: 1 / -1 is what makes the second one work. The utility for it,
 * sis-form-full, is written as `span 2` — a span of two columns in a grid that
 * only has one, which does not clamp: it makes an implicit second column and
 * every "full width" field lands in a half-width grid of its own. `1 / -1` says
 * first line to last line instead, so it is exactly as wide as the grid is,
 * whatever the grid currently is.
 *
 * The pairing is a CONTAINER query, not a media query. What decides whether two
 * inputs fit side by side is the width of the dialog, and the dialog is no
 * longer as wide as the screen — on a large monitor a 36rem dialog would have
 * passed a `min-width: 40rem` screen test and paired its fields inside a box
 * far too narrow for them. Asking the scroll area itself removes the guess:
 * below 30rem of actual room the fields stack, wherever that happens.
 *
 * Two inputs side by side under 30rem leave about 150px each — narrower than a
 * phone number or a parent's full name, so the value scrolls out of its own box
 * while it is being typed. Stacking costs a little vertical scrolling and
 * nothing else, and this form is meant to be scrolled.
 */
const ADD_STUDENT_FORM_CSS = `
  .sis-student-scroll { container-type: inline-size; }
  .sis-student-form,
  .sis-student-contact {
    display: grid;
    grid-template-columns: 1fr;
  }
  .sis-student-form { gap: 0.875rem; }
  .sis-student-contact { gap: 0.75rem; }
  .sis-form-full { grid-column: 1 / -1; }
  @container (min-width: 30rem) {
    .sis-student-form,
    .sis-student-contact {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;
import { ParentTypeahead, ParentMatch } from "./ParentTypeahead";
import { buildParentPayload, ParentBaseline } from "@/utils/parentPayload";
import { splitFullName } from "@/utils/fullName";
import { todayIso } from "@/utils/dateOnly";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

export function StudentsManagement({ onNavigate, onViewStudent }: StudentsManagementProps) {
  const cache = useSisCache();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    dateOfBirth: "",
    gender: "",
    class: "",
    parentName: "",
    parentPhone: "",
    enrollmentDate: "",
    address: "",
    allergies: "",
    medicalConditions: "",
    currentMedications: "",
    medicalNotes: "",
  });

  // This school's real classes, not a master list of every possible level: a
  // Daycare–Nursery school must never be offered Class 1–6, and sections only
  // exist as actual Class rows.
  const { classNames: classes } = useSchoolClassNames();

  const [appliedSearch, setAppliedSearch] = useState("");
  const isDefaultQuery = !appliedSearch && selectedClass === "all";

  // The unfiltered roster is reference data, so it is cached and revalidated in
  // the background. Any searched or class-filtered view is a one-off query and
  // is fetched fresh under a null key so it never lands in the store.
  const {
    data: studentsData,
    revalidating,
    error: studentsError,
    refresh: refreshStudents,
  } = useCachedResource<Student[]>(
    isDefaultQuery ? "students" : null,
    () => {
      const params = new URLSearchParams();
      if (appliedSearch) params.set("q", appliedSearch);
      if (selectedClass && selectedClass !== "all") params.set("class", selectedClass);
      return api.get(`/students${params.toString() ? `?${params.toString()}` : ""}`);
    },
    {
      policy: isDefaultQuery ? "swr" : "fresh",
      deps: [appliedSearch, selectedClass],
    },
  );
  const students = studentsData ?? [];

  useResourceError(studentsError, "the student list", studentsData !== null);

  // Tracks the parent last confirmed via the typeahead (or null if the admin
  // is still free-typing) — see buildParentPayload for how this decides
  // whether to relink, edit-in-place, or create a new Parent on submit.
  const [parentBaseline, setParentBaseline] = useState<ParentBaseline>({ id: null, name: '', phone: '' });

  // Pickup contacts collected during Add Student
  const [showMedicalHistory, setShowMedicalHistory] = useState(false);

  const [newContacts, setNewContacts] = useState<
    Array<{ name: string; phone: string; relationship: string }>
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const addContactRow = () =>
    setNewContacts((prev) => [...prev, { name: "", phone: "", relationship: "" }]);
  const removeContactRow = (i: number) =>
    setNewContacts((prev) => prev.filter((_, idx) => idx !== i));
  const updateContactRow = (
    i: number,
    field: "name" | "phone" | "relationship",
    value: string
  ) =>
    setNewContacts((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c))
    );

  // Sorted alphabetically by displayed name, because the row numbers are a
  // count down the visible list — they only make sense if the order is stable
  // and predictable. Sorting on the same "First Last" string that is rendered
  // keeps the numbering consistent with what the eye reads.
  //
  // Searching by student ID still works even though the column is gone: the
  // code is no longer on screen, but an admin who has one to hand can still
  // paste it in.
  const filteredStudents = students
    .filter((student) => {
      const matchesSearch =
        student.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesClass =
        selectedClass === "all" || student.class === selectedClass;

      return matchesSearch && matchesClass;
    })
    .sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(
        `${b.firstName} ${b.lastName}`,
        undefined,
        { sensitivity: 'base', numeric: true },
      ),
    );

  /**
   * Opening the dialog fills the enrolment date with today.
   *
   * Here rather than in the useState initialiser above, because that also runs
   * during the server render — a date computed there can disagree with the one
   * the browser computes and take the hydration with it. Reopening resets it to
   * today, which is the point of a default: the save handler clears the field
   * back to '' and this refills it on the next open. Same arrangement the Add
   * Expense dialog uses.
   *
   * todayIso() rather than an ISO slice, so a school ahead of UTC recording just
   * after midnight is not offered yesterday. ThreePartDateInput reads
   * 'YYYY-MM-DD', which is what this returns, so all three dropdowns come up
   * filled and the admission can be saved without touching them.
   */
  useEffect(() => {
    if (!openAdd) return;
    setForm((s) => ({ ...s, enrollmentDate: todayIso() }));
  }, [openAdd]);

  // Debounce typing so a request is not issued per keystroke; class filter
  // changes apply immediately.
  useEffect(() => {
    if (searchTerm === appliedSearch) return;
    const timer = setTimeout(() => setAppliedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm, appliedSearch]);

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl mb-2">Students Management</h1>
          <p className="text-gray-600">
            Manage student records and information <RevalidatingBadge active={revalidating} />
          </p>
        </div>
        <Dialog open={openAdd} onOpenChange={setOpenAdd}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus size={20} />
              Admit Student
            </Button>
          </DialogTrigger>
          {/* SIZED TO CLEAR THE SUPPORT BUTTON, NOT TO FIT THE FORM.
              At 90vh the dialog is the screen, and because it is centred its
              bottom edge lands 5vh up — inside the 54px support button fixed
              1.25rem from the bottom at z-index 60, above this dialog's z-50.
              The button sat on top of Save.

              A centred box of height H on a viewport of height V leaves
              (V - H) / 2 below it, so H = 100vh - 11rem keeps 88px clear of the
              button's 74px on EVERY screen height rather than on the one this
              was checked at. 38rem then caps it on a tall monitor, where the
              subtraction alone would still allow an 800px-tall dialog.

              The form does not have to fit. It scrolls — that is what the
              middle section is for, and a form this long was always going to. */}
          <DialogContent
            className="max-w-xl"
            style={{
              display: 'flex',
              flexDirection: 'column',
              maxHeight: 'min(calc(100vh - 11rem), 38rem)',
              overflow: 'hidden',
              padding: 0,
              gap: 0,
            }}
          >
            <div style={{ padding: '1.25rem 1.25rem 0.75rem' }}>
              <DialogHeader>
                <DialogTitle>Add New Student</DialogTitle>
                <DialogDescription>
                  Enter the student's information below
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="sis-student-scroll flex-1 overflow-y-auto" style={{ padding: '0 1.25rem 1rem', minHeight: 0 }}>
            <style>{ADD_STUDENT_FORM_CSS}</style>
            <div className="sis-student-form">
              <div className="sis-form-full">
                <Label>Full Name</Label>
                <Input
                  placeholder="Enter full name"
                  value={form.fullName}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, fullName: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Date of Birth</Label>
                <ThreePartDateInput
                  value={form.dateOfBirth}
                  onChange={(v) => setForm((s) => ({ ...s, dateOfBirth: v ?? "" }))}
                  aria-label="Date of birth"
                />
              </div>
              <div>
                <Label>Gender</Label>
                <Select
                  value={form.gender}
                  onValueChange={(v: string) =>
                    setForm((s) => ({ ...s, gender: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Class</Label>
                <Select
                  value={form.class}
                  onValueChange={(v: string) =>
                    setForm((s) => ({ ...s, class: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((cls) => (
                      <SelectItem key={cls} value={cls}>
                        {cls}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Enrollment Date</Label>
                {/* The one date control this app has, shared with the Add New
                    Staff dialog and every filter. Day | Month | Year rather
                    than a native date input, which cannot be made to match the
                    selects beside it. See ThreePartDateInput. */}
                <ThreePartDateInput
                  value={form.enrollmentDate}
                  onChange={(v) => setForm((s) => ({ ...s, enrollmentDate: v ?? "" }))}
                  aria-label="Enrollment date"
                />
              </div>
              <div>
                <Label>Parent Name</Label>
                <ParentTypeahead
                  value={form.parentName}
                  onChange={(name) => setForm((s) => ({ ...s, parentName: name }))}
                  onSelect={(parent: ParentMatch) => {
                    setForm((s) => ({ ...s, parentName: parent.name, parentPhone: parent.phone }));
                    setParentBaseline({ id: parent.id, name: parent.name, phone: parent.phone });
                  }}
                  placeholder="Enter parent name"
                />
              </div>
              <div>
                <Label>Parent Phone</Label>
                <PhoneInput
                  value={form.parentPhone}
                  onChange={(v) => setForm((s) => ({ ...s, parentPhone: v }))}
                />
              </div>
              <div className="sis-form-full">
                <Label>Address</Label>
                <Input
                  placeholder="Enter address"
                  value={form.address}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, address: e.target.value }))
                  }
                />
              </div>

              {/* Medical History */}
              <div className="sis-form-full border-t pt-4 mt-1">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-700">
                    Medical History{" "}
                    <span className="text-gray-400 font-normal">(optional)</span>
                  </p>
                  {showMedicalHistory && (
                    <button
                      type="button"
                      onClick={() => setShowMedicalHistory(false)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {!showMedicalHistory ? (
                <div className="sis-form-full">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowMedicalHistory(true)}
                  >
                    <Plus size={15} className="mr-1" />
                    Add medical history
                  </Button>
                </div>
              ) : (
                <>
                  <div className="sis-form-full">
                    <Label>Allergies</Label>
                    <Textarea
                      placeholder="e.g. Penicillin, peanuts, latex..."
                      value={form.allergies}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, allergies: e.target.value }))
                      }
                    />
                  </div>
                  <div className="sis-form-full">
                    <Label>Existing Medical Conditions</Label>
                    <Textarea
                      placeholder="e.g. Asthma, sickle cell..."
                      value={form.medicalConditions}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, medicalConditions: e.target.value }))
                      }
                    />
                  </div>
                  <div className="sis-form-full">
                    <Label>Current Medications</Label>
                    <Textarea
                      placeholder="e.g. Salbutamol inhaler as needed..."
                      value={form.currentMedications}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, currentMedications: e.target.value }))
                      }
                    />
                  </div>
                  <div className="sis-form-full">
                    <Label>Additional Notes</Label>
                    <Textarea
                      placeholder="Any other information the school should know..."
                      value={form.medicalNotes}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, medicalNotes: e.target.value }))
                      }
                    />
                  </div>
                </>
              )}

              {/* Pickup / Drop-off Contacts */}
              <div className="sis-form-full border-t pt-4 mt-1">
                <p className="text-sm font-medium text-gray-700 mb-3">
                  Pickup / Drop-off Contacts{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </p>
              </div>
              {newContacts.map((c, i) => (
                <div key={i} className="sis-form-full">
                  <div className="sis-student-contact p-3 border rounded-lg relative">
                    <button
                      type="button"
                      onClick={() => removeContactRow(i)}
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
                        onChange={(e) => updateContactRow(i, "name", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <PhoneInput
                        value={c.phone}
                        onChange={(v) => updateContactRow(i, "phone", v)}
                      />
                    </div>
                    <div className="sis-form-full">
                      <Label>
                        Relationship{" "}
                        <span className="text-gray-400 font-normal">(optional)</span>
                      </Label>
                      <Input
                        placeholder="e.g. Driver, Grandmother, Uncle"
                        value={c.relationship}
                        onChange={(e) =>
                          updateContactRow(i, "relationship", e.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div className="sis-form-full">
                <Button type="button" variant="outline" onClick={addContactRow}>
                  <Plus size={15} className="mr-1" />
                  Add a pickup contact
                </Button>
              </div>
            </div>
            </div>
            <div style={{ padding: '0 1.25rem' }}>
              {submitError && <p className="text-sm text-red-600 mb-3">{submitError}</p>}
            </div>
            <div className="border-t" style={{ padding: '0.875rem 1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <DialogClose asChild>
                <Button variant="outline" disabled={submitting}>Cancel</Button>
              </DialogClose>
              <Button
                disabled={submitting}
                onClick={async () => {
                  if (submitting) return;
                  setSubmitting(true);
                  setSubmitError(null);
                  try {
                    const { firstName, lastName } = splitFullName(form.fullName);
                    const created = await api.post("/students", {
                      firstName,
                      lastName,
                      dateOfBirth: form.dateOfBirth,
                      gender: form.gender,
                      class: form.class,
                      ...buildParentPayload(parentBaseline, form.parentName, form.parentPhone),
                      enrollmentDate: form.enrollmentDate,
                      address: form.address,
                      allergies: form.allergies || null,
                      medicalConditions: form.medicalConditions || null,
                      currentMedications: form.currentMedications || null,
                      medicalNotes: form.medicalNotes || null,
                    });
                    // Post pickup contacts sequentially
                    for (const c of newContacts) {
                      if (c.name.trim()) {
                        await api.post(
                          `/students/${created.id}/pickup-contacts`,
                          {
                            name: c.name.trim(),
                            phone: c.phone.trim(),
                            relationship: c.relationship.trim() || null,
                          }
                        );
                      }
                    }
                    cache.invalidateOn('student:write');
                    await refreshStudents();
                    setOpenAdd(false);
                    setForm({
                      fullName: "",
                      dateOfBirth: "",
                      gender: "",
                      class: "",
                      parentName: "",
                      parentPhone: "",
                      enrollmentDate: "",
                      address: "",
                      allergies: "",
                      medicalConditions: "",
                      currentMedications: "",
                      medicalNotes: "",
                    });
                    setParentBaseline({ id: null, name: '', phone: '' });
                    setShowMedicalHistory(false);
                    setNewContacts([]);
                  } catch (e: any) {
                    setSubmitError(e.message || 'Failed to save student');
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {submitting ? 'Saving...' : 'Save Student'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-6 mb-6">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={20}
            />
            <Input
              placeholder="Search students by name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Classes</SelectItem>
              {classes.map((cls) => (
                <SelectItem key={cls} value={cls}>
                  {cls}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {/* Row number, not an identifier — the sequence follows the
                  alphabetical sort, so it renumbers as the list is filtered.
                  Student ID lives on the detail page now. */}
              <TableHead style={{ width: 56 }}>#</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Parent Name</TableHead>
              <TableHead>Parent Phone</TableHead>
              <TableHead>Fees</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStudents.map((student, index) => (
              <TableRow key={student.id}>
                <TableCell style={{ color: '#6B7280' }}>{index + 1}</TableCell>
                <TableCell>
                  <button
                    onClick={() => onViewStudent?.(student)}
                    className="text-blue-600 hover:underline text-left font-medium"
                  >
                    {student.firstName} {student.lastName}
                  </button>
                  <PaymentStatusDot status={(student as any).paymentStatus} />
                  <ZeroMarkDot hasZero={(student as any).hasZeroMark} />
                </TableCell>
                <TableCell>{student.class}</TableCell>
                <TableCell className="capitalize">{student.gender}</TableCell>
                <TableCell>{student.parentName}</TableCell>
                <TableCell>{student.parentPhone}</TableCell>
                <TableCell>
                  {/* Straight to this student's Finance tab — the status is a
                      question about their fees, so the click should land where
                      the answer is. */}
                  <button
                    type="button"
                    onClick={() => onViewStudent?.(student, 'finance')}
                    className="text-left hover:underline"
                    title="View this student's finance record"
                  >
                    <PaymentStatusLabel status={(student as any).paymentStatus} />
                  </button>
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onViewStudent?.(student)}
                  >
                    Details
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      </Card>
    </div>
  );
}
