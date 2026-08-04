"use client";

import { Calendar, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";

interface StudentRow {
  id: string;
  firstName: string;
  lastName: string;
  class?: string;
}

interface AttendanceRow {
  id: string;
  personId: string;
  status: string;
  date?: string;
  type?: string;
  remarks?: string | null;
}

const STATUSES = [
  { value: "present", label: "Present", className: "bg-green-500" },
  { value: "absent", label: "Absent", className: "bg-red-500" },
  { value: "late", label: "Late", className: "bg-orange-500" },
];

function statusBadge(status: string) {
  const match = STATUSES.find((s) => s.value === status);
  return <Badge className={match?.className ?? ""}>{match?.label ?? "Unknown"}</Badge>;
}

export default function TeacherAttendancePage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // /students is already scoped server-side to this teacher's own class, so
  // there is no class picker here and nothing to filter client-side — the
  // roster that comes back IS the roster they may mark.
  useEffect(() => {
    let alive = true;
    api
      .get("/students")
      .then((res: any) => {
        if (alive) setStudents(res ?? []);
      })
      .catch((e: any) => {
        if (alive) setError(e?.message || "Failed to load your students.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const loadAttendance = useCallback(async (date: string) => {
    // Never cached: this screen is actively writing the register, and a stale
    // copy would mean marking someone against one that has already moved on.
    const res = await api.get(`/attendance?date=${encodeURIComponent(date)}&type=student`);
    return (res ?? []) as AttendanceRow[];
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMessage(null);
    loadAttendance(selectedDate)
      .then((rows) => {
        if (!alive) return;
        setRecords(rows);
        // Seed each dropdown from what is on record, defaulting the rest to
        // present — the same convention the admin screen saves with.
        const seeded: Record<string, string> = {};
        rows.forEach((r) => {
          seeded[r.personId] = r.status;
        });
        setStatus(seeded);
        setError(null);
      })
      .catch((e: any) => {
        if (alive) setError(e?.message || "Failed to load attendance.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selectedDate, loadAttendance]);

  const save = async () => {
    if (saving || !students.length) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const payload = students.map((s) => {
        const existing = records.find((r) => r.personId === s.id);
        return existing
          ? { existingCode: existing.id, status: status[s.id] || "present" }
          : {
              date: selectedDate,
              type: "student",
              personId: s.id,
              personName: `${s.firstName} ${s.lastName}`,
              status: status[s.id] || "present",
            };
      });
      await api.post("/attendance/bulk", { records: payload });
      // Re-read rather than patching local state: a row created just now has a
      // server-assigned code, and the next save has to update it instead of
      // creating a duplicate for the same person and date.
      setRecords(await loadAttendance(selectedDate));
      setMessage(`Attendance saved for ${payload.length} student${payload.length === 1 ? "" : "s"}.`);
    } catch (e: any) {
      setError(e?.message || "Failed to save attendance.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">Attendance</h1>
        <p className="text-gray-600">Mark the daily register for your class</p>
      </div>

      <Card className="p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <Label>Select Date</Label>
            <div className="relative">
              <Calendar
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                size={20}
              />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Button
            onClick={save}
            disabled={saving || loading || !students.length}
            className="flex items-center gap-2"
          >
            <Save size={18} />
            {saving ? "Saving..." : "Save Attendance"}
          </Button>
        </div>
        {message && <p className="text-sm text-green-700 mt-3">{message}</p>}
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </Card>

      {loading ? (
        <Card className="p-6 text-gray-500">Loading...</Card>
      ) : students.length === 0 ? (
        <Card className="p-6 text-gray-500">
          No students are assigned to you. Your school admin sets the class you are class teacher of.
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Set Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => {
                  const value = status[student.id] || "present";
                  return (
                    <TableRow key={student.id}>
                      <TableCell>{student.id}</TableCell>
                      <TableCell>
                        {student.firstName} {student.lastName}
                      </TableCell>
                      <TableCell>{student.class ?? "—"}</TableCell>
                      <TableCell>{statusBadge(value)}</TableCell>
                      <TableCell>
                        <Select
                          value={value}
                          onValueChange={(v: string) =>
                            setStatus((s) => ({ ...s, [student.id]: v }))
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
