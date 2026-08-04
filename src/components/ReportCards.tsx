import { useState } from 'react';
import { AcademicYearSelect, useAcademicYear } from '@/lib/academicYear';
import { EnterMarksDialog } from './EnterMarksDialog';
import { PaymentStatusDot } from './PaymentStatus';
import { ZeroMarkDot } from './MarkStatus';
import { NavigationPage } from '../App';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Textarea } from './ui/textarea';
import { Plus, FileText, Search, ClipboardList, PenLine, Trophy } from 'lucide-react';
import { generateReportCard } from '../utils/pdfGenerator';
import { api } from '@/lib/api';
import { useCachedResource, useSisCache } from '@/lib/SisCache';
import { RevalidatingBadge, useResourceError } from './ResourceStatus';
import { formatTermLabel, getDefaultTermFields } from '../utils/academicTerm';

interface ReportCardsProps {
  onNavigate?: (page: NavigationPage) => void;
}

export function ReportCards({ onNavigate }: ReportCardsProps) {
  const { status: yearStatus } = useAcademicYear();
  const cache = useSisCache();
  // The index of generated cards is cached. Rendering an individual card is
  // not — see the per-card fetches further down, which pull the marks and
  // ranking fresh every time, because that output gets printed and handed out.
  const {
    data: reportCardsData,
    revalidating,
    error: reportCardsError,
    refresh: refreshReportCards,
  } = useCachedResource<any[]>('report-cards', () => api.get('/report-cards'));
  const { data: studentsData } = useCachedResource<any[]>('students', () => api.get('/students'));
  const { data: classesData } = useCachedResource<any[]>('classes', () => api.get('/classes'));
  useResourceError(reportCardsError, 'report cards', reportCardsData !== null);
  const reportCards = reportCardsData ?? [];
  const students = studentsData ?? [];
  const classes = classesData ?? [];
  const [searchTerm, setSearchTerm] = useState('');
  const [openCreate, setOpenCreate] = useState(false);
  const [openEnterMarks, setOpenEnterMarks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(() => ({
    studentId: '',
    ...getDefaultTermFields(),
    attendance: '',
    position: '',
    totalStudents: '',
    averageScore: '',
    headTeacherComment: '',
    subjects: [] as { name: string; score: string; grade: string; teacherComment: string }[],
  }));

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
    <div className="p-4 md:p-8">
      {/* Rendered at the top level, not inside the header row: a Dialog only
          portals content when open, but keeping it out of a flex container avoids
          it ever being treated as a layout child. */}
      <EnterMarksDialog open={openEnterMarks} onOpenChange={setOpenEnterMarks} />

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl mb-2">Report Cards</h1>
          <p className="text-gray-600">
            Manage and generate student report cards <RevalidatingBadge active={revalidating} />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={() => onNavigate?.('tests-exams')}
          >
            <ClipboardList size={20} />
            Manage Tests &amp; Exams
          </Button>
          {/* Opens a dialog rather than navigating: entering a class's marks is one
              task, and leaving the page for each subject was the page-hopping this
              replaces. */}
          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={() => setOpenEnterMarks(true)}
          >
            <PenLine size={20} />
            Enter Marks
          </Button>
          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={() => onNavigate?.('class-ranking')}
          >
            <Trophy size={20} />
            Class Ranking
          </Button>
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
                          {student.firstName} {student.lastName}<PaymentStatusDot status={(student as any).paymentStatus} /><ZeroMarkDot hasZero={(student as any).hasZeroMark} /> - {student.class}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Academic Year</Label>
                  <AcademicYearSelect value={form.academicYear} onChange={v=>setForm(s=>({...s, academicYear:v}))} years={yearStatus?.years ?? []} />
                </div>
                <div>
                  <Label>Term</Label>
                  <Select value={form.term} onValueChange={(v: string)=>setForm(s=>({...s, term:v}))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select term" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Term 1">{formatTermLabel('Term 1')}</SelectItem>
                      <SelectItem value="Term 2">{formatTermLabel('Term 2')}</SelectItem>
                      <SelectItem value="Term 3">{formatTermLabel('Term 3')}</SelectItem>
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
                <Button variant="outline" disabled={submitting}>Cancel</Button>
              </DialogClose>
              <Button disabled={submitting} onClick={async ()=>{
                if (submitting) return;
                setSubmitting(true);
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
                  cache.invalidateOn('report-card:write');
                  await refreshReportCards();
                  setOpenCreate(false);
                  setForm({ studentId:'', ...getDefaultTermFields(), attendance:'', position:'', totalStudents:'', averageScore:'', headTeacherComment:'', subjects:[] });
                } catch {} finally {
                  setSubmitting(false);
                }
              }}>{submitting ? 'Saving...' : 'Create Report Card'}</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
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
        <div className="overflow-x-auto">
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
                <TableCell>{formatTermLabel(report.term)}</TableCell>
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

                        // Tests & Exams data is optional/best-effort here — an
                        // older report card (or one with no Tests & Exams set
                        // up yet) should still produce a PDF, just without
                        // this section.
                        let breakdown: any[] | undefined;
                        try {
                          const data = await api.get(
                            `/test-exams/student-breakdown?studentId=${full.studentId}&term=${encodeURIComponent(full.term)}&academicYear=${encodeURIComponent(full.academicYear)}`
                          );
                          breakdown = data?.subjects;
                        } catch {}

                        let rank: { rank: number; totalStudents: number } | undefined;
                        try {
                          const cls = classes.find((c: any) => c.name === full.class);
                          if (cls) {
                            const rankingData = await api.get(
                              `/test-exams/class-ranking?classId=${cls.id}&term=${encodeURIComponent(full.term)}&academicYear=${encodeURIComponent(full.academicYear)}`
                            );
                            const row = rankingData?.rankings?.find((r: any) => r.studentId === full.studentId);
                            if (row) rank = { rank: row.rank, totalStudents: rankingData.totalStudents };
                          }
                        } catch {}

                        generateReportCard(full, { breakdown, rank });
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
        </div>
      </Card>
    </div>
  );
}
