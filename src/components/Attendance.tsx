import { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Calendar, FileText, Save } from 'lucide-react';
import { generateAttendanceSheet } from '../utils/pdfGenerator';
import { api } from '@/lib/api';
import { SCHOOL_CLASSES } from "@/lib/classes";

export function Attendance() {
  const [attendance, setAttendance] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState<string>('Class 3');
  const [studentStatus, setStudentStatus] = useState<Record<string, string>>({});
  const [staffStatus, setStaffStatus] = useState<Record<string, string>>({});

  const classes = SCHOOL_CLASSES;

  const studentAttendance = attendance.filter(record => record.type === 'student' && record.date?.startsWith(selectedDate));
  const staffAttendance = attendance.filter(record => record.type === 'staff' && record.date?.startsWith(selectedDate));

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [sList, stList, att] = await Promise.all([
          api.get('/students'),
          api.get('/staff'),
          api.get(`/attendance?date=${encodeURIComponent(selectedDate)}`),
        ]);
        if (mounted) {
          setStudents(sList || []);
          setStaff(stList || []);
          setAttendance(att || []);
          const stuMap: Record<string,string> = {};
          const stfMap: Record<string,string> = {};
          (att||[]).forEach((a:any)=>{
            if (a.type==='student') stuMap[a.personId] = a.status;
            if (a.type==='staff') stfMap[a.personId] = a.status;
          });
          setStudentStatus(stuMap);
          setStaffStatus(stfMap);
        }
      } catch {}
    };
    load();
    return () => { mounted = false; };
  }, [selectedDate]);

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

  const handleGenerateAttendanceSheet = () => {
    const classStudents = students.filter((student: any) => student.class === selectedClass);
    generateAttendanceSheet(selectedDate, selectedClass, classStudents);
  };

  const saveStudentAttendance = async () => {
    const classStudents = students.filter((s:any)=>s.class===selectedClass);
    for (const s of classStudents) {
      const existing = attendance.find(a=>a.type==='student' && a.personId===s.id && a.date?.startsWith(selectedDate));
      const status = studentStatus[s.id] || 'present';
      try {
        if (existing) {
          await api.put(`/attendance/${existing.id}`, { status });
        } else {
          await api.post('/attendance', {
            date: selectedDate,
            type: 'student',
            personId: s.id,
            personName: `${s.firstName} ${s.lastName}`,
            status,
          });
        }
      } catch {}
    }
    const att = await api.get(`/attendance?date=${encodeURIComponent(selectedDate)}`);
    setAttendance(att||[]);
  };

  const saveStaffAttendance = async () => {
    for (const t of staff) {
      const existing = attendance.find(a=>a.type==='staff' && a.personId===t.id && a.date?.startsWith(selectedDate));
      const status = staffStatus[t.id] || 'present';
      try {
        if (existing) {
          await api.put(`/attendance/${existing.id}`, { status });
        } else {
          await api.post('/attendance', {
            date: selectedDate,
            type: 'staff',
            personId: t.id,
            personName: `${t.firstName} ${t.lastName}`,
            status,
          });
        }
      } catch {}
    }
    const att = await api.get(`/attendance?date=${encodeURIComponent(selectedDate)}`);
    setAttendance(att||[]);
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">Attendance Management</h1>
        <p className="text-gray-600">Track daily attendance for students and staff</p>
      </div>

      <Card className="p-6 mb-6">
        <div className="flex gap-4 items-end">
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
          <div className="flex-1">
            <Label>Class (for students)</Label>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map(cls => (
                  <SelectItem key={cls} value={cls}>{cls}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerateAttendanceSheet} className="flex items-center gap-2">
            <FileText size={20} />
            Generate Sheet
          </Button>
        </div>
      </Card>

      <Tabs defaultValue="students" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="students">Student Attendance</TabsTrigger>
          <TabsTrigger value="staff">Staff Attendance</TabsTrigger>
        </TabsList>

        <TabsContent value="students">
          <Card className="mb-4 p-4">
            <div className="flex gap-4 items-center">
              <p className="text-sm text-gray-600">Mark attendance for {selectedClass} on {selectedDate}</p>
              <Button size="sm" variant="outline" className="ml-auto flex items-center gap-2" onClick={saveStudentAttendance}>
                <Save size={16} />
                Save Attendance
              </Button>
            </div>
          </Card>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.filter((s: any) => s.class === selectedClass).map((student: any) => {
                  const record = studentAttendance.find(a => a.personId === student.id);
                  const status = record?.status || 'present';
                  
                  return (
                    <TableRow key={student.id}>
                      <TableCell>{student.id}</TableCell>
                      <TableCell>{student.firstName} {student.lastName}</TableCell>
                      <TableCell>{student.class}</TableCell>
                      <TableCell>{getStatusBadge(studentStatus[student.id] || status)}</TableCell>
                      <TableCell>{record?.remarks || '-'}</TableCell>
                      <TableCell>
                        <Select value={studentStatus[student.id] || status} onValueChange={(v:string)=>setStudentStatus(s=>({...s, [student.id]: v}))}>
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
          </Card>
        </TabsContent>

        <TabsContent value="staff">
          <Card className="mb-4 p-4">
            <div className="flex gap-4 items-center">
              <p className="text-sm text-gray-600">Mark staff attendance for {selectedDate}</p>
              <Button size="sm" variant="outline" className="ml-auto flex items-center gap-2">
                <Save size={16} />
                Save Attendance
              </Button>
            </div>
          </Card>

          <Card>
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
                  const record = staffAttendance.find(a => a.personId === staff.id);
                  const status = record?.status || 'present';
                  
                  return (
                    <TableRow key={staff.id}>
                      <TableCell>{staff.id}</TableCell>
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
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
