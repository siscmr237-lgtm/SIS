"use client";

import { TeacherAttendance } from "@/components/TeacherAttendance";

/**
 * The teacher's register.
 *
 * ONE COMPONENT, TWO SECTIONS — the teacher's own day, then their class. What
 * used to sit here as well was the shared AttendanceSheet, a class-and-range
 * grid for looking BACK over past days; it has gone from this page on purpose.
 *
 * A teacher's attendance is now a today-only act: they indicate their presence,
 * the register unlocks, and at midnight the day closes. A backward-looking grid
 * beside that invites the one thing the model no longer permits — editing a day
 * that is already settled — and a teacher who tried would only meet a refusal
 * from the server. Past days are the school's to correct, from
 * /school/attendance, where the calendar and the admin-override path live.
 *
 * Scoping remains the server's. GET /staff-attendance/today resolves the roster
 * from the teacher's own class-teacher assignments and POST
 * /staff-attendance/students refuses anybody outside them, so this page never
 * decides who a teacher may mark.
 */
export default function TeacherAttendancePage() {
  return <TeacherAttendance />;
}
