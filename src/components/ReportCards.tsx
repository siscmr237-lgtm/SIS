import { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Textarea } from './ui/textarea';
import { Plus, FileText, Search } from 'lucide-react';
import { generateReportCard } from '../utils/pdfGenerator';
import { api } from '@/lib/api';

export function ReportCards() {
  const [reportCards, setReportCards] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({
    studentId: '',
    academicYear: '',
    term: '',
    attendance: '',
    position: '',
    totalStudents: '',
    averageScore: '',
    headTeacherComment: '',
    subjects: [] as { name: string; score: string; grade: string; teacherComment: string }[],
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [rc, st] = await Promise.all([
          api.get('/report-cards'),
          api.get('/students'),
        ]);
        if (mounted) {
          setReportCards(rc || []);
          setStudents(st || []);
        }
      } catch {}
    };
    load();
    return () => { mounted = false; };
  }, []);

  const filteredReportCards = reportCards.filter(report => {
    const searchLower = searchTerm.toLowerCase();
    return (
      report.studentName.toLowerCase().includes(searchLower) ||
      report.id.toLowerCase().includes(searchLower) ||
      report.class.toLowerCase().includes(searchLower)
    );
  });

  const subjects = ['Mathematics', 'English', 'French', 'Science', 'Social Studies', 'ICT', 'Physical Education', 'Art'];

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl mb-2">Report Cards</h1>
          <p className="text-gray-600">Manage and generate student report cards</p>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus size={20} />
              Create Report Card
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Student Report Card</DialogTitle>
              <DialogDescription>Enter student grades and assessment details</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Student</Label>
                  <Select value={form.studentId} onValueChange={(v: string)=>setForm(s=>({...s, studentId:v}))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select student" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((student: any) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.firstName} {student.lastName} - {student.class}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Academic Year</Label>
                  <Input placeholder="2024/2025" value={form.academicYear} onChange={e=>setForm(s=>({...s, academicYear:e.target.value}))} />
                </div>
                <div>
                  <Label>Term</Label>
                  <Select value={form.term} onValueChange={(v: string)=>setForm(s=>({...s, term:v}))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select term" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Term 1">Term 1</SelectItem>
                      <SelectItem value="Term 2">Term 2</SelectItem>
                      <SelectItem value="Term 3">Term 3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Attendance (%)</Label>
                  <Input type="number" placeholder="95" max="100" value={form.attendance} onChange={e=>setForm(s=>({...s, attendance:e.target.value}))} />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="mb-3">Subject Scores</h3>
                <div className="space-y-3">
                  {subjects.slice(0, 5).map((subject, idx) => (
                    <div key={subject} className="grid grid-cols-4 gap-3 items-center">
                      <Label className="col-span-1">{subject}</Label>
                      <Input type="number" placeholder="Score" max="100" onChange={e=>{
                        const arr = [...form.subjects];
                        arr[idx] = { ...(arr[idx]||{ name: subject, score:'', grade:'', teacherComment:'' }), score: e.target.value };
                        setForm(s=>({...s, subjects: arr}));
                      }} />
                      <Input placeholder="Grade (A-F)" onChange={e=>{
                        const arr = [...form.subjects];
                        arr[idx] = { ...(arr[idx]||{ name: subject, score:'', grade:'', teacherComment:'' }), grade: e.target.value };
                        setForm(s=>({...s, subjects: arr}));
                      }} />
                      <Input placeholder="Teacher comment" onChange={e=>{
                        const arr = [...form.subjects];
                        arr[idx] = { ...(arr[idx]||{ name: subject, score:'', grade:'', teacherComment:'' }), teacherComment: e.target.value };
                        setForm(s=>({...s, subjects: arr}));
                      }} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Position</Label>
                    <Input type="number" placeholder="1" value={form.position} onChange={e=>setForm(s=>({...s, position:e.target.value}))} />
                  </div>
                  <div>
                    <Label>Total Students</Label>
                    <Input type="number" placeholder="35" value={form.totalStudents} onChange={e=>setForm(s=>({...s, totalStudents:e.target.value}))} />
                  </div>
                  <div>
                    <Label>Average Score</Label>
                    <Input type="number" placeholder="82" value={form.averageScore} onChange={e=>setForm(s=>({...s, averageScore:e.target.value}))} />
                  </div>
                </div>
              </div>

              <div>
                <Label>Head Teacher Comment</Label>
                <Textarea placeholder="Overall assessment and recommendations..." rows={3} value={form.headTeacherComment} onChange={e=>setForm(s=>({...s, headTeacherComment:e.target.value}))} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={async ()=>{
                try {
                  const st = students.find((s:any)=>s.id===form.studentId);
                  await api.post('/report-cards', {
                    studentId: form.studentId,
                    studentName: st ? `${st.firstName} ${st.lastName}` : '',
                    class: st?.class,
                    term: form.term,
                    academicYear: form.academicYear,
                    subjects: (form.subjects||[]).map(s=>({ name: s.name, score: Number(s.score)||0, grade: s.grade, teacherComment: s.teacherComment })),
                    averageScore: Number(form.averageScore)||0,
                    position: Number(form.position)||0,
                    totalStudents: Number(form.totalStudents)||0,
                    attendance: Number(form.attendance)||0,
                    headTeacherComment: form.headTeacherComment,
                  });
                  const rc = await api.get('/report-cards');
                  setReportCards(rc||[]);
                  setOpenCreate(false);
                  setForm({ studentId:'', academicYear:'', term:'', attendance:'', position:'', totalStudents:'', averageScore:'', headTeacherComment:'', subjects:[] });
                } catch {}
              }}>Create Report Card</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-6 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <Input
            placeholder="Search by student name, class, or report ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Report ID</TableHead>
              <TableHead>Student Name</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Term</TableHead>
              <TableHead>Academic Year</TableHead>
              <TableHead>Average Score</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Attendance</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredReportCards.map((report) => (
              <TableRow key={report.id}>
                <TableCell>{report.id}</TableCell>
                <TableCell>{report.studentName}</TableCell>
                <TableCell>{report.class}</TableCell>
                <TableCell>{report.term}</TableCell>
                <TableCell>{report.academicYear}</TableCell>
                <TableCell>{report.averageScore}%</TableCell>
                <TableCell>{report.position} of {report.totalStudents}</TableCell>
                <TableCell>{report.attendance}%</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const full = await api.get(`/report-cards/${report.id}`);
                        generateReportCard(full);
                      } catch {}
                    }}
                    className="flex items-center gap-2"
                  >
                    <FileText size={16} />
                    Generate PDF
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
