"use client";

import { Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { useTeacherAssignments } from "@/lib/teacherAssignments";

interface RosterRow {
  studentId: string;
  firstName: string;
  lastName: string;
  marksObtained: number | null;
}

export default function TeacherMarksPage() {
  const { data: assignments, loading: loadingAssignments } = useTeacherAssignments();
  const subjectAssignments = useMemo(
    () => assignments?.subjectAssignments ?? [],
    [assignments],
  );

  // One select drives both classId and subjectId, because a teacher is
  // authorized on the PAIR, not on either half — offering them separately
  // would let someone build a combination they aren't assigned to and only
  // find out when the server refuses it.
  const [assignmentKey, setAssignmentKey] = useState("");
  const selected = subjectAssignments.find(
    (a) => `${a.classId}:${a.subjectId}` === assignmentKey,
  );

  const [testExams, setTestExams] = useState<any[]>([]);
  const [testExamId, setTestExamId] = useState("");
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [totalMarks, setTotalMarks] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const [loadingExams, setLoadingExams] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Settle on the teacher's first assignment so the page is usable on arrival
  // rather than showing three empty dropdowns.
  useEffect(() => {
    if (!assignmentKey && subjectAssignments.length) {
      const first = subjectAssignments[0];
      setAssignmentKey(`${first.classId}:${first.subjectId}`);
    }
  }, [subjectAssignments, assignmentKey]);

  // A different class means a different set of tests/exams.
  useEffect(() => {
    setTestExamId("");
    setTestExams([]);
    if (!selected) return;
    let alive = true;
    setLoadingExams(true);
    api
      .get(`/test-exams?classId=${selected.classId}`)
      .then((res: any) => {
        if (alive) setTestExams(res ?? []);
      })
      .catch((e: any) => {
        if (alive) setError(e?.message || "Failed to load tests and exams.");
      })
      .finally(() => {
        if (alive) setLoadingExams(false);
      });
    return () => {
      alive = false;
    };
  }, [selected?.classId, selected?.subjectId]);

  // Marks are never cached — two people marking the same subject must not be
  // shown a roster that predates the other's save.
  useEffect(() => {
    setRoster([]);
    setTotalMarks(null);
    setValues({});
    setMessage(null);
    if (!testExamId || !selected) return;
    let alive = true;
    setLoadingRoster(true);
    api
      .get(`/test-exams/${testExamId}/marks?subjectId=${selected.subjectId}`)
      .then((res: any) => {
        if (!alive) return;
        const rows: RosterRow[] = res?.roster ?? [];
        setRoster(rows);
        setTotalMarks(res?.totalMarks ?? null);
        setValues(
          Object.fromEntries(
            rows.map((r) => [r.studentId, r.marksObtained != null ? String(r.marksObtained) : ""]),
          ),
        );
        setError(null);
      })
      .catch((e: any) => {
        if (alive) setError(e?.message || "Failed to load the roster.");
      })
      .finally(() => {
        if (alive) setLoadingRoster(false);
      });
    return () => {
      alive = false;
    };
  }, [testExamId, selected?.subjectId]);

  const rowError = (studentId: string): string | null => {
    const raw = values[studentId];
    if (raw === undefined || raw === "") return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) return "Must be a whole number, 0 or more";
    if (totalMarks != null && n > totalMarks) return `Cannot exceed ${totalMarks}`;
    return null;
  };

  const hasAnyError = roster.some((r) => rowError(r.studentId) != null);
  const hasAnyValue = roster.some((r) => (values[r.studentId] ?? "") !== "");

  const save = async () => {
    if (!testExamId || !selected) return;
    const marks = roster
      .filter((r) => (values[r.studentId] ?? "") !== "")
      .map((r) => ({ studentId: r.studentId, marksObtained: Number(values[r.studentId]) }));
    if (!marks.length) return;

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result: any = await api.post(`/test-exams/${testExamId}/marks/bulk`, {
        subjectId: selected.subjectId,
        marks,
      });
      setMessage(
        `Saved marks for ${result?.count ?? marks.length} student${
          (result?.count ?? marks.length) === 1 ? "" : "s"
        }.`,
      );
    } catch (e: any) {
      setError(e?.message || "Failed to save marks.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">Enter Marks</h1>
        <p className="text-gray-600">
          Pick one of your subjects and a test or exam, then enter each student's score
        </p>
      </div>

      <Card className="p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Class &amp; Subject</Label>
            <Select value={assignmentKey} onValueChange={setAssignmentKey}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingAssignments
                      ? "Loading..."
                      : subjectAssignments.length
                        ? "Select class and subject"
                        : "No subjects assigned to you"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {subjectAssignments.map((a) => (
                  <SelectItem key={`${a.classId}:${a.subjectId}`} value={`${a.classId}:${a.subjectId}`}>
                    {a.className ?? `Class ${a.classId}`} — {a.subjectName ?? `Subject ${a.subjectId}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Test/Exam</Label>
            <Select value={testExamId} onValueChange={setTestExamId} disabled={!selected}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingExams
                      ? "Loading..."
                      : testExams.length
                        ? "Select test/exam"
                        : "None for this class"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {testExams.map((t: any) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </Card>

      {!subjectAssignments.length && !loadingAssignments ? (
        <Card className="p-6 text-gray-500">
          You have no subject assignments yet. Your school admin assigns these.
        </Card>
      ) : !testExamId ? (
        <Card className="p-6 text-gray-500">Select a class, subject, and test/exam to enter marks.</Card>
      ) : loadingRoster ? (
        <Card className="p-6 text-gray-500">Loading roster...</Card>
      ) : roster.length === 0 ? (
        <Card className="p-6 text-gray-500">No students found for this class.</Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>
                    Marks Obtained{totalMarks != null ? ` (out of ${totalMarks})` : ""}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((r) => {
                  const err = rowError(r.studentId);
                  return (
                    <TableRow key={r.studentId}>
                      <TableCell>
                        {r.firstName} {r.lastName}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          className="w-24"
                          value={values[r.studentId] ?? ""}
                          style={err ? { borderColor: "var(--color-red-500)" } : undefined}
                          onChange={(e) =>
                            setValues((v) => ({ ...v, [r.studentId]: e.target.value }))
                          }
                        />
                        {err && <p className="text-red-600 text-xs mt-1">{err}</p>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="p-4 flex items-center justify-end gap-4 border-t">
            {message && <p className="text-sm text-gray-600">{message}</p>}
            <Button
              className="flex items-center gap-2"
              onClick={save}
              disabled={saving || hasAnyError || !hasAnyValue}
            >
              <Save size={18} />
              {saving ? "Saving..." : "Save Marks"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
