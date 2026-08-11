"use client";

import { AttendanceSheet } from "@/components/AttendanceSheet";

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
 */
export default function TeacherAttendancePage() {
  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">Attendance</h1>
        <p className="text-gray-600">
          Take the register for your class, or look back over a date range
        </p>
      </div>

      <AttendanceSheet audience="teacher" />
    </div>
  );
}
