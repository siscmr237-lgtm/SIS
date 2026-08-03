import { api } from "@/lib/api";
import { useCachedResource, useSisCache } from "@/lib/SisCache";
import { NavigationPage } from '../App';

interface StudentsManagementProps {
  onNavigate?: (page: NavigationPage) => void;
  onViewStudent?: (student: Student, tab?: string) => void;
}
import { useSchoolClassNames } from "@/lib/classes";
import { PaymentStatusDot, PaymentStatusLabel } from "./PaymentStatus";
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
import { Textarea } from "./ui/textarea";
import { ParentTypeahead, ParentMatch } from "./ParentTypeahead";
import { buildParentPayload, ParentBaseline } from "@/utils/parentPayload";
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
    firstName: "",
    lastName: "",
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
              Add Student
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden', padding: 0, gap: 0 }}>
            <div style={{ padding: '1.5rem 1.5rem 1rem' }}>
              <DialogHeader>
                <DialogTitle>Add New Student</DialogTitle>
                <DialogDescription>
                  Enter the student's information below
                </DialogDescription>
              </DialogHeader>
            </div>
            <div className="flex-1 overflow-y-auto" style={{ padding: '0 1.5rem 1rem', minHeight: 0 }}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>First Name</Label>
                <Input
                  placeholder="Enter first name"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, firstName: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input
                  placeholder="Enter last name"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, lastName: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Date of Birth</Label>
                <Input
                  type="date"
                  value={form.dateOfBirth}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, dateOfBirth: e.target.value }))
                  }
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
                <Input
                  placeholder="+237 6XX XXX XXX"
                  value={form.parentPhone}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, parentPhone: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Enrollment Date</Label>
                <Input
                  type="date"
                  value={form.enrollmentDate}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, enrollmentDate: e.target.value }))
                  }
                />
              </div>
              <div className="col-span-2">
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
              <div className="col-span-2 border-t pt-4 mt-1">
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
                <div className="col-span-2">
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
                  <div className="col-span-2">
                    <Label>Allergies</Label>
                    <Textarea
                      placeholder="e.g. Penicillin, peanuts, latex..."
                      value={form.allergies}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, allergies: e.target.value }))
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Existing Medical Conditions</Label>
                    <Textarea
                      placeholder="e.g. Asthma, sickle cell..."
                      value={form.medicalConditions}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, medicalConditions: e.target.value }))
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Current Medications</Label>
                    <Textarea
                      placeholder="e.g. Salbutamol inhaler as needed..."
                      value={form.currentMedications}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, currentMedications: e.target.value }))
                      }
                    />
                  </div>
                  <div className="col-span-2">
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
              <div className="col-span-2 border-t pt-4 mt-1">
                <p className="text-sm font-medium text-gray-700 mb-3">
                  Pickup / Drop-off Contacts{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </p>
              </div>
              {newContacts.map((c, i) => (
                <div key={i} className="col-span-2">
                  <div className="grid grid-cols-2 gap-3 p-3 border rounded-lg relative">
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
                      <Input
                        placeholder="+237 6XX XXX XXX"
                        value={c.phone}
                        onChange={(e) => updateContactRow(i, "phone", e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
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
              <div className="col-span-2">
                <Button type="button" variant="outline" onClick={addContactRow}>
                  <Plus size={15} className="mr-1" />
                  Add a pickup contact
                </Button>
              </div>
            </div>
            </div>
            <div style={{ padding: '0 1.5rem' }}>
              {submitError && <p className="text-sm text-red-600 mb-3">{submitError}</p>}
            </div>
            <div className="border-t" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
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
                    const created = await api.post("/students", {
                      firstName: form.firstName,
                      lastName: form.lastName,
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
                      firstName: "",
                      lastName: "",
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
