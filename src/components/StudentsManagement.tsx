import { api } from "@/lib/api";
import { NavigationPage } from '../App';

interface StudentsManagementProps {
  onNavigate?: (page: NavigationPage) => void;
  onViewStudent?: (student: Student) => void;
}
import { SCHOOL_CLASSES } from "@/lib/classes";
import { FileText, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Student } from "../types";
import { generateFinancialSheet } from "../utils/pdfGenerator";
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
  const [students, setStudents] = useState<Student[]>([]);
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
  });

  const classes = SCHOOL_CLASSES;

  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      student.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      student.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesClass =
      selectedClass === "all" || student.class === selectedClass;

    return matchesSearch && matchesClass;
  });

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (searchTerm) params.set("q", searchTerm);
        if (selectedClass && selectedClass !== "all")
          params.set("class", selectedClass);
        const data = await api.get(
          `/students${params.toString() ? `?${params.toString()}` : ""}`
        );
        if (isMounted) setStudents(data || []);
      } catch (e) {
        // noop UI: keep empty
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [searchTerm, selectedClass]);

  const handleGenerateFinancialSheet = async (student: Student) => {
    let schoolInfo: { name: string; logo?: string } | undefined;
    try {
      const userStr = window.localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user?.School?.[0]) schoolInfo = user.School[0];
      }
    } catch {}

    const empty = { entries: [], totalCharged: 0, totalPaid: 0, balance: 0 };
    try {
      const data = await api.get(`/ledger/student/${encodeURIComponent(student.id)}`);
      await generateFinancialSheet(student, data || empty, schoolInfo);
    } catch {
      await generateFinancialSheet(student, empty, schoolInfo);
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl mb-2">Students Management</h1>
          <p className="text-gray-600">
            Manage student records and information
          </p>
        </div>
        <Dialog open={openAdd} onOpenChange={setOpenAdd}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus size={20} />
              Add Student
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Student</DialogTitle>
              <DialogDescription>
                Enter the student's information below
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
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
                <Input
                  placeholder="Enter parent name"
                  value={form.parentName}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, parentName: e.target.value }))
                  }
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
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                onClick={async () => {
                  try {
                    await api.post("/students", {
                      firstName: form.firstName,
                      lastName: form.lastName,
                      dateOfBirth: form.dateOfBirth,
                      gender: form.gender,
                      class: form.class,
                      parentName: form.parentName,
                      parentPhone: form.parentPhone,
                      enrollmentDate: form.enrollmentDate,
                      address: form.address,
                    });
                    const params = new URLSearchParams();
                    if (searchTerm) params.set("q", searchTerm);
                    if (selectedClass && selectedClass !== "all")
                      params.set("class", selectedClass);
                    const data = await api.get(
                      `/students${
                        params.toString() ? `?${params.toString()}` : ""
                      }`
                    );
                    setStudents(data || []);
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
                    });
                  } catch (e) {
                    console.log(e);
                  }
                }}
              >
                Save Student
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Parent Name</TableHead>
              <TableHead>Parent Phone</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStudents.map((student) => (
              <TableRow key={student.id}>
                <TableCell>{student.id}</TableCell>
                <TableCell>
                  <button
                    onClick={() => onViewStudent?.(student)}
                    className="text-blue-600 hover:underline text-left font-medium"
                  >
                    {student.firstName} {student.lastName}
                  </button>
                </TableCell>
                <TableCell>{student.class}</TableCell>
                <TableCell className="capitalize">{student.gender}</TableCell>
                <TableCell>{student.parentName}</TableCell>
                <TableCell>{student.parentPhone}</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGenerateFinancialSheet(student)}
                    className="flex items-center gap-2"
                  >
                    <FileText size={16} />
                    Financial Sheet
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
