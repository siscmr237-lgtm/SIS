"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { EnterMarksFlow } from "@/components/EnterMarksFlow";
import { useAcademicYear } from "@/lib/academicYear";

/**
 * The teacher's mark entry.
 *
 * Renders the same EnterMarksFlow the admin dialog does, so the two cannot drift:
 * one selection order, one set of mark-state rules, one save path. The only
 * difference is the audience, which decides where the class and subject lists
 * come from — for a teacher, GET /staff/me/teaching, which the server scopes by
 * the same canTeacherRecordMarks rule it enforces on the roster read and the mark
 * write. Nothing on this page widens that.
 *
 * A teacher always works in the school's active year, so there is no year picker.
 */
export default function TeacherMarksPage() {
  const { status: yearStatus } = useAcademicYear();
  const [academicYear, setAcademicYear] = useState("");

  useEffect(() => {
    if (!academicYear && yearStatus?.activeYear) setAcademicYear(yearStatus.activeYear);
  }, [yearStatus, academicYear]);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">Enter Marks</h1>
        <p className="text-gray-600">
          Choose a class, term, test or exam and subject, then enter each student's score
        </p>
      </div>

      <Card className="p-6">
        {academicYear ? (
          <EnterMarksFlow audience="teacher" academicYear={academicYear} />
        ) : (
          <p className="text-sm text-gray-500">Loading...</p>
        )}
      </Card>
    </div>
  );
}
