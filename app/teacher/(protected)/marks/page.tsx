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
import { useTeacherTeaching } from "@/lib/teacherAssignments";

interface RosterRow {
  studentId: string;
  firstName: string;
  lastName: string;
  marksObtained: number | null;
}

export default function TeacherMarksPage() {
  // Every class this teacher may work in, each carrying the subjects they may
  // mark in it. Both the list and the per-class subjects come from the server,
  // which applies the same rule its marks endpoints enforce, so anything offered
  // here is something the server will accept.
  const { data: classes, loading: loadingClasses, error: classesError } = useTeacherTeaching();
  const teachingClasses = useMemo(() => classes ?? [], [classes]);

  const [classId, setClassId] = useState("");
  const [testExamId, setTestExamId] = useState("");
  const [subjectId, setSubjectId] = useState("");

  const selectedClass = teachingClasses.find((c) => String(c.id) === classId);
  const subjects = selectedClass?.subjects ?? [];

  const [testExams, setTestExams] = useState<any[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [totalMarks, setTotalMarks] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const [loadingExams, setLoadingExams] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Settle on the only class when there is only one, so the common case is not
  // an empty dropdown. The selector still renders: a teacher should always be
  // able to see which class they are marking, not infer it.
  useEffect(() => {
    if (!classId && teachingClasses.length === 1) {
      setClassId(String(teachingClasses[0].id));
    }
  }, [teachingClasses, classId]);

  // A different class means different assessments and a different subject list.
  useEffect(() => {
    setTestExamId("");
    setSubjectId("");
    setTestExams([]);
    if (!classId) return;
    let alive = true;
    setLoadingExams(true);
    api
      .get(`/test-exams?classId=${encodeURIComponent(classId)}`)
      .then((res: any) => {
        if (alive) setTestExams(Array.isArray(res) ? res : []);
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
  }, [classId]);

  // Marks are never cached: two people marking the same subject must not be
  // shown a roster that predates the other's save.
  useEffect(() => {
    setRoster([]);
    setTotalMarks(null);
    setValues({});
    setMessage(null);
    if (!testExamId || !subjectId) return;
    let alive = true;
    setLoadingRoster(true);
    api
      .get(`/test-exams/${encodeURIComponent(testExamId)}/marks?subjectId=${encodeURIComponent(subjectId)}`)
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
  }, [testExamId, subjectId]);

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
    if (!testExamId || !subjectId) return;
    const marks = roster
      .filter((r) => (values[r.studentId] ?? "") !== "")
      .map((r) => ({ studentId: r.studentId, marksObtained: Number(values[r.studentId]) }));
    if (!marks.length) return;

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result: any = await api.post(`/test-exams/${encodeURIComponent(testExamId)}/marks/bulk`, {
        subjectId: Number(subjectId),
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
          Choose a class, then a test or exam and a subject, and enter each student's score
        </p>
      </div>

      <Card className="p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    loadingClasses
                      ? "Loading..."
                      : teachingClasses.length
                        ? "Select class"
                        : "No classes assigned to you"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {teachingClasses.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                    {c.isClassTeacher ? " (class teacher)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Test/Exam</Label>
            <Select value={testExamId} onValueChange={setTestExamId} disabled={!classId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !classId
                      ? "Select a class first"
                      : loadingExams
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

          <div>
            <Label>Subject</Label>
            <Select value={subjectId} onValueChange={setSubjectId} disabled={!classId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !classId
                      ? "Select a class first"
                      : subjects.length
                        ? "Select subject"
                        : "No subjects for this class"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {selectedClass && (
          <p className="text-xs text-gray-500 mt-2">
            {selectedClass.isClassTeacher
              ? `You are the class teacher of ${selectedClass.name}, so you can mark all ${subjects.length} of its subjects.`
              : `You teach ${subjects.length} subject${subjects.length === 1 ? "" : "s"} in ${selectedClass.name}.`}
          </p>
        )}
        {(error || classesError) && (
          <p className="text-sm text-red-600 mt-2">{error || classesError}</p>
        )}
      </Card>

      {!teachingClasses.length && !loadingClasses ? (
        <Card className="p-6 text-gray-500">
          You are not the class teacher of any class and have no subject assignments yet. Your
          school admin sets these up.
        </Card>
      ) : !testExamId || !subjectId ? (
        <Card className="p-6 text-gray-500">
          Select a class, test/exam, and subject to enter marks.
        </Card>
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
