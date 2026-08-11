import { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Calendar, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useCachedResource } from '@/lib/SisCache';
import { AttendanceSheet } from './AttendanceSheet';

export function Attendance() {
  // Still here because STAFF attendance is a single-day register and this is the
  // only control that picks its date. It used to live in a panel above the tabs,
  // alongside a class picker and a Generate Sheet button that the student
  // register replaced; those are gone, so the date moved down into the tab that
  // still needs it rather than floating above a tab it no longer applies to.
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // The staff roster is reference data and is cached. The attendance records are
  // not: they are what this screen is actively writing, and a stale copy would
  // mean marking someone against a register that has already moved on.
  const { data: staffData } = useCachedResource<any[]>('staff', () => api.get('/staff'));
  const { data: attendanceData, refresh: refreshAttendance } = useCachedResource<any[]>(
    null,
    () => api.get(`/attendance?date=${encodeURIComponent(selectedDate)}`),
    { policy: 'fresh', deps: [selectedDate] },
  );
  const staff = staffData ?? [];
  const attendance = attendanceData ?? [];
  const [staffStatus, setStaffStatus] = useState<Record<string, string>>({});
  const [savingStaffAttendance, setSavingStaffAttendance] = useState(false);

  const staffAttendance = attendance.filter(record => record.type === 'staff' && record.date?.startsWith(selectedDate));

  // Seed the per-person dropdowns from whatever is on record for this date.
  useEffect(() => {
    if (!attendanceData) return;
    const stfMap: Record<string, string> = {};
    attendanceData.forEach((a: any) => {
      if (a.type === 'staff') stfMap[a.personId] = a.status;
    });
    setStaffStatus(stfMap);
  }, [attendanceData]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'present':
        return <Badge className="bg-green-500">Present</Badge>;
      case 'absent':
        return <Badge className="bg-red-500">Absent</Badge>;
      case 'late':
        return <Badge className="bg-orange-500">Late</Badge>;
      case 'excused':
        return <Badge className="bg-blue-500">Excused</Badge>;
      default:
        return <Badge>Unknown</Badge>;
    }
  };

  const saveStaffAttendance = async () => {
    if (savingStaffAttendance) return;
    setSavingStaffAttendance(true);
    try {
      const records = staff.map((t: any) => {
        const existing = attendance.find(
          a => a.type === 'staff' && a.personId === String(t.id) && a.date?.startsWith(selectedDate)
        );
        return existing
          ? { existingCode: existing.id, status: staffStatus[t.id] || 'present' }
          : { date: selectedDate, type: 'staff', personId: String(t.id), personName: `${t.firstName} ${t.lastName}`, status: staffStatus[t.id] || 'present' };
      });
      await api.post('/attendance/bulk', { records });
      await refreshAttendance();
    } catch {
    } finally {
      setSavingStaffAttendance(false);
    }
  };

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

        {/* The student register is the shared AttendanceSheet, which the teacher
            portal renders too — one implementation, so the two cannot drift. It
            carries its own class, section, term and date-range filters and its
            own Download, which is what made the panel that used to sit above
            these tabs redundant for students.

            Staff attendance below is deliberately untouched: it is a different
            register with its own statuses and no class or section, and folding
            it into the student sheet would have meant inventing both. */}
        <TabsContent value="students">
          <AttendanceSheet audience="admin" />
        </TabsContent>

        <TabsContent value="staff">
          <Card className="mb-4 p-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <Label>Select Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Button size="sm" variant="outline" className="flex items-center gap-2" onClick={saveStaffAttendance} disabled={savingStaffAttendance}>
                <Save size={16} />
                {savingStaffAttendance ? 'Saving...' : 'Save Attendance'}
              </Button>
            </div>
          </Card>

          <Card>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((staff: any) => {
                  const record = staffAttendance.find(a => a.personId === String(staff.id));
                  const status = record?.status || 'present';

                  return (
                    <TableRow key={staff.id}>
                      <TableCell>{staff.code}</TableCell>
                      <TableCell>{staff.firstName} {staff.lastName}</TableCell>
                      <TableCell>{staff.role}</TableCell>
                      <TableCell>{getStatusBadge(status)}</TableCell>
                      <TableCell>{record?.remarks || '-'}</TableCell>
                      <TableCell>
                        <Select defaultValue={status}>
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="present">Present</SelectItem>
                            <SelectItem value="absent">Absent</SelectItem>
                            <SelectItem value="late">Late</SelectItem>
                            <SelectItem value="excused">Excused</SelectItem>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
