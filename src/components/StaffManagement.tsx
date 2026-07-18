import { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import { Plus, FileText, Search } from 'lucide-react';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { generateWorkRecord } from '../utils/pdfGenerator';
import { api } from '@/lib/api';

export function StaffManagement() {
  const [staff, setStaff] = useState<any[]>([]);
  const [workRecords, setWorkRecords] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [openAddStaff, setOpenAddStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({
    firstName: '',
    lastName: '',
    role: '',
    phone: '',
    email: '',
    hireDate: '',
    salary: '' as any,
    isTeacher: false,
  });
  const [openWork, setOpenWork] = useState(false);
  const [workForm, setWorkForm] = useState({
    date: '',
    class: '',
    subject: '',
    topic: '',
    objectives: '',
    activities: '',
    evaluation: '',
    remarks: '',
    staffId: '',
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [staffData, workData] = await Promise.all([
          api.get('/staff'),
          api.get('/work-records'),
        ]);
        if (mounted) {
          setStaff(staffData || []);
          setWorkRecords(workData || []);
        }
      } catch {}
    };
    load();
    return () => { mounted = false; };
  }, []);

  const filteredStaff = staff.filter(member => {
    const searchLower = searchTerm.toLowerCase();
    return (
      member.firstName.toLowerCase().includes(searchLower) ||
      member.lastName.toLowerCase().includes(searchLower) ||
      member.code.toLowerCase().includes(searchLower) ||
      member.role.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl mb-2">Staff Management</h1>
          <p className="text-gray-600">Manage staff records and work documentation</p>
        </div>
        <Dialog open={openAddStaff} onOpenChange={setOpenAddStaff}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus size={20} />
              Add Staff
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Staff Member</DialogTitle>
              <DialogDescription>Enter the staff member's details below</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div>
                <Label>First Name</Label>
                <Input placeholder="Enter first name" value={newStaff.firstName} onChange={e=>setNewStaff(s=>({...s, firstName:e.target.value}))} />
              </div>
              <div>
                <Label>Last Name</Label>
                <Input placeholder="Enter last name" value={newStaff.lastName} onChange={e=>setNewStaff(s=>({...s, lastName:e.target.value}))} />
              </div>
              <div>
                <Label>Role</Label>
                <Input placeholder="e.g., Mathematics Teacher" value={newStaff.role} onChange={e=>setNewStaff(s=>({...s, role:e.target.value}))} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input placeholder="+237 6XX XXX XXX" value={newStaff.phone} onChange={e=>setNewStaff(s=>({...s, phone:e.target.value}))} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" placeholder="email@school.cm" value={newStaff.email} onChange={e=>setNewStaff(s=>({...s, email:e.target.value}))} />
              </div>
              <div>
                <Label>Hire Date</Label>
                <Input type="date" value={newStaff.hireDate} onChange={e=>setNewStaff(s=>({...s, hireDate:e.target.value}))} />
              </div>
              <div>
                <Label>Salary (FCFA)</Label>
                <Input type="number" placeholder="150000" value={newStaff.salary} onChange={e=>setNewStaff(s=>({...s, salary:e.target.value}))} />
              </div>
              <div className="col-span-2 flex items-center gap-3 pt-2">
                <Checkbox
                  id="isTeacher"
                  checked={newStaff.isTeacher}
                  onCheckedChange={(checked) => setNewStaff(s => ({ ...s, isTeacher: !!checked }))}
                />
                <Label htmlFor="isTeacher">This staff member is a teacher</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                onClick={async ()=>{
                  try {
                    await api.post('/staff', {
                      firstName: newStaff.firstName,
                      lastName: newStaff.lastName,
                      role: newStaff.role,
                      phone: newStaff.phone,
                      email: newStaff.email,
                      hireDate: newStaff.hireDate,
                      salary: Number(newStaff.salary)||0,
                      isTeacher: newStaff.isTeacher,
                    });
                    const list = await api.get('/staff');
                    setStaff(list||[]);
                    setOpenAddStaff(false);
                    setNewStaff({ firstName:'', lastName:'', role:'', phone:'', email:'', hireDate:'', salary:'', isTeacher: false });
                  } catch {}
                }}
              >Save Staff</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="staff" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="staff">Staff List</TabsTrigger>
          <TabsTrigger value="work-records">Work Records</TabsTrigger>
        </TabsList>

        <TabsContent value="staff">
          <Card className="p-6 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <Input
                placeholder="Search staff by name, ID, or role..."
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
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Salary (FCFA)</TableHead>
                  <TableHead>Hire Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.code}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {member.firstName} {member.lastName}
                        {member.isTeacher && <Badge className="bg-blue-500 text-white text-xs">Teacher</Badge>}
                      </span>
                    </TableCell>
                    <TableCell>{member.role}</TableCell>
                    <TableCell>{member.phone}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{member.salary.toLocaleString()}</TableCell>
                    <TableCell>{new Date(member.hireDate).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="work-records">
          <div className="flex justify-between items-center mb-6">
            <p className="text-gray-600">Daily work records and lesson plans</p>
            <Dialog open={openWork} onOpenChange={setOpenWork}>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                  <Plus size={20} />
                  Add Work Record
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Add Work Record</DialogTitle>
                  <DialogDescription>Record daily lesson plans and teaching activities</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Teacher</Label>
                      <select
                        className="border rounded h-10 px-3 w-full"
                        value={workForm.staffId}
                        onChange={(e)=>setWorkForm(s=>({...s, staffId:e.target.value}))}
                      >
                        <option value="">Select teacher</option>
                        {staff.map((t:any)=> (
                          <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>Date</Label>
                      <Input type="date" value={workForm.date} onChange={e=>setWorkForm(s=>({...s, date:e.target.value}))} />
                    </div>
                    <div>
                      <Label>Class</Label>
                      <Input placeholder="e.g., Primary 3" value={workForm.class} onChange={e=>setWorkForm(s=>({...s, class:e.target.value}))} />
                    </div>
                    <div>
                      <Label>Subject</Label>
                      <Input placeholder="e.g., Mathematics" value={workForm.subject} onChange={e=>setWorkForm(s=>({...s, subject:e.target.value}))} />
                    </div>
                    <div>
                      <Label>Topic</Label>
                      <Input placeholder="e.g., Fractions" value={workForm.topic} onChange={e=>setWorkForm(s=>({...s, topic:e.target.value}))} />
                    </div>
                  </div>
                  <div>
                    <Label>Learning Objectives</Label>
                    <Textarea placeholder="What students should learn..." rows={3} value={workForm.objectives} onChange={e=>setWorkForm(s=>({...s, objectives:e.target.value}))} />
                  </div>
                  <div>
                    <Label>Activities</Label>
                    <Textarea placeholder="Teaching activities and methods..." rows={3} value={workForm.activities} onChange={e=>setWorkForm(s=>({...s, activities:e.target.value}))} />
                  </div>
                  <div>
                    <Label>Evaluation</Label>
                    <Textarea placeholder="Assessment methods..." rows={2} value={workForm.evaluation} onChange={e=>setWorkForm(s=>({...s, evaluation:e.target.value}))} />
                  </div>
                  <div>
                    <Label>Remarks</Label>
                    <Textarea placeholder="Additional notes..." rows={2} value={workForm.remarks} onChange={e=>setWorkForm(s=>({...s, remarks:e.target.value}))} />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button onClick={async ()=>{
                    try {
                      const teacher = staff.find((s:any)=>String(s.id)===workForm.staffId);
                      await api.post('/work-records', {
                        staffId: workForm.staffId,
                        staffName: teacher ? `${teacher.firstName} ${teacher.lastName}` : '',
                        date: workForm.date,
                        subject: workForm.subject,
                        class: workForm.class,
                        topic: workForm.topic,
                        objectives: workForm.objectives,
                        activities: workForm.activities,
                        evaluation: workForm.evaluation,
                        remarks: workForm.remarks,
                      });
                      const list = await api.get('/work-records');
                      setWorkRecords(list||[]);
                      setOpenWork(false);
                      setWorkForm({ date:'', class:'', subject:'', topic:'', objectives:'', activities:'', evaluation:'', remarks:'', staffId:'' });
                    } catch {}
                  }}>Save Record</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{record.date}</TableCell>
                    <TableCell>{record.staffName}</TableCell>
                    <TableCell>{record.class}</TableCell>
                    <TableCell>{record.subject}</TableCell>
                    <TableCell>{record.topic}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            const full = await api.get(`/work-records/${record.id}`);
                            generateWorkRecord(full);
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
