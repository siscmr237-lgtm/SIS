'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { StaffAttendanceTab } from './StaffAttendanceTab';
import { StudentAttendanceCalendar } from './StudentAttendanceCalendar';

/**
 * THE SCHOOL'S ATTENDANCE SCREEN — two registers that are not the same register.
 *
 * STUDENTS are a class-shaped, month-shaped question: which days did this class
 * go unrecorded, and who was missing on the ones that did not? So that tab is a
 * calendar, filtered by class, with a day view behind each cell.
 *
 * STAFF is a person-shaped, day-shaped question: who is in today, and does the
 * school accept what they said? So that tab is a list of everybody for one date,
 * with the decisions attached.
 *
 * They were once folded into one date-picker-and-table screen and it served
 * neither: a calendar is useless for approving today's submissions, and a
 * single-day table cannot show a month of gaps. Keeping them apart is what lets
 * each one be shaped like its own question.
 *
 * ONE REGISTER PER THING, which is the other change worth noting. The staff tab
 * used to carry a second, parallel table writing AttendanceRecord rows with
 * type = 'staff' alongside the StaffAttendance submissions — two tables
 * answering "was this person at work", disagreeing freely. There is now one,
 * with markedByAdmin distinguishing what the office recorded from what the
 * person submitted.
 */
export function Attendance() {
  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">Attendance Management</h1>
        <p className="text-gray-600">Track daily attendance for students and staff</p>
      </div>

      <Tabs defaultValue="students" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="students">Student Attendance</TabsTrigger>
          <TabsTrigger value="staff">Staff Attendance</TabsTrigger>
        </TabsList>

        <TabsContent value="students">
          <StudentAttendanceCalendar />
        </TabsContent>

        <TabsContent value="staff">
          <StaffAttendanceTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
