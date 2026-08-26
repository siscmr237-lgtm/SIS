"use client";

import { AttendanceSheet } from "@/components/AttendanceSheet";
import { TeacherAttendanceSubmit } from "@/components/TeacherAttendanceSubmit";

/**
 * The teacher's register.
 *
 * Renders the same AttendanceSheet the admin screen does, so the two cannot
 * drift: one set of filters, one marking path, one definition of what a dash in
 * a cell means.
 *
 * Scoping is the server's, not this page's. GET /attendance/sheet narrows the
 * candidate classes to the teacher's own before anything else runs, and
 * /attendance/mark refuses a student outside them — so the class picker here is
 * simply showing what the server already agreed to.
 *
 * TWO CONTROLS, TWO QUESTIONS. TeacherAttendanceSubmit above is how a teacher
 * declares ONE day — themselves and their class, in one submission that the
 * school then approves or rejects and that cannot be edited afterwards. The
 * sheet below is how they look BACK over a range. Folding the two together
 * would mean either giving the submission a date picker that implies it can be
 * revised, or giving the sheet an approval state it has no concept of.
 */
export default function TeacherAttendancePage() {
  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">Attendance</h1>
        <p className="text-gray-600">
          Record your own day and your class register, or look back over a date range
        </p>
      </div>

      <TeacherAttendanceSubmit />

      <AttendanceSheet audience="teacher" />
    </div>
  );
}
