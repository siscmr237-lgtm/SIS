import { useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ThreePartDateInput } from './ThreePartDateInput';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from './ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import { Plus, FileText, Search } from 'lucide-react';
import { NavigationPage } from '../App';
import { Staff } from '../types';
import { generateWorkRecord } from '../utils/pdfGenerator';
import { api } from '@/lib/api';
import { useCachedResource, useSisCache } from '@/lib/SisCache';
import { RevalidatingBadge, useResourceError } from './ResourceStatus';
import { StaffForm, StaffFormPayload } from './StaffForm';
import { RecordPayrollDialog } from './RecordPayrollDialog';
import { StaffChargeDot } from './StaffChargeStatus';
import { TABLE_ROW_MOTION_CSS, rowStaggerStyle } from './ui/motionCss';

interface StaffManagementProps {
  onNavigate?: (page: NavigationPage) => void;
  onViewStaff?: (staff: Staff) => void;
}

export function StaffManagement({ onNavigate, onViewStaff }: StaffManagementProps) {
  const cache = useSisCache();
  const {
    data: staffData,
    revalidating,
    error: staffError,
    refresh: refreshStaff,
  } = useCachedResource<Staff[]>('staff', () => api.get('/staff'));
  const {
    data: workRecordsData,
    error: workRecordsError,
    refresh: refreshWorkRecords,
  } = useCachedResource<any[]>('work-records', () => api.get('/work-records'));
  const staff = staffData ?? [];
  const workRecords = workRecordsData ?? [];

  useResourceError(staffError, 'the staff list', staffData !== null);
  useResourceError(workRecordsError, 'work records', workRecordsData !== null);
  const [searchTerm, setSearchTerm] = useState('');
  const [openAddStaff, setOpenAddStaff] = useState(false);
  // The staff member payroll is being recorded for. Held as the row rather than
  // a code so the dialog can be addressed and titled without a second lookup.
  const [payrollFor, setPayrollFor] = useState<Staff | null>(null);
  const [openWork, setOpenWork] = useState(false);
  const [workSubmitting, setWorkSubmitting] = useState(false);
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
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl mb-2">Staff Management</h1>
          <p className="text-gray-600">
            Manage staff records and work documentation <RevalidatingBadge active={revalidating} />
          </p>
        </div>
        <Button className="flex items-center gap-2" onClick={() => setOpenAddStaff(true)}>
          <Plus size={20} />
          Add Staff
        </Button>
        <StaffForm
          mode="add"
          open={openAddStaff}
          onOpenChange={setOpenAddStaff}
          onSubmit={async (payload: StaffFormPayload) => {
            await api.post('/staff', payload);
            cache.invalidateOn('staff:write');
            await refreshStaff();
            setOpenAddStaff(false);
          }}
        />
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
            {/* Rows fade in as the roster arrives, each 30ms behind the one
               above, capped at the tenth. Same arrangement as the students
               table — see src/components/ui/motionCss.ts. */}
            <style>{TABLE_ROW_MOTION_CSS}</style>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStaff.map((member, index) => (
                  <TableRow key={member.id} data-sis-row="" style={rowStaggerStyle(index)}>
                    <TableCell>
                      <button
                        onClick={() => onViewStaff?.(member)}
                        className="text-blue-600 hover:underline text-left font-medium"
                      >
                        {member.firstName} {member.lastName}
                      </button>
                      {/* Red while they owe the school something unsettled. It
                          clears itself when the debt is netted off payroll,
                          because 'ledger:write' re-reads this roster. */}
                      <StaffChargeDot outstanding={member.outstandingCharges} />
                    </TableCell>
                    <TableCell>{member.isTeacher ? 'Teacher' : member.role}</TableCell>
                    <TableCell>{member.phone}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => onViewStaff?.(member)}>
                          Details
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setPayrollFor(member)}>
                          Record Payroll
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
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
              <DialogContent style={{ maxWidth: 'min(768px, calc(100vw - 2rem))' }}>
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
                      <ThreePartDateInput value={workForm.date} onChange={v=>setWorkForm(s=>({...s, date:v ?? ''}))} aria-label="Work record date" />
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
                    <Button variant="outline" disabled={workSubmitting}>Cancel</Button>
                  </DialogClose>
                  <Button disabled={workSubmitting} onClick={async ()=>{
                    if (workSubmitting) return;
                    setWorkSubmitting(true);
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
                      cache.invalidateOn('work-record:write');
                      await refreshWorkRecords();
                      setOpenWork(false);
                      setWorkForm({ date:'', class:'', subject:'', topic:'', objectives:'', activities:'', evaluation:'', remarks:'', staffId:'' });
                    } catch {
                    } finally {
                      setWorkSubmitting(false);
                    }
                  }}>{workSubmitting ? 'Saving...' : 'Save Record'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <div className="overflow-x-auto">
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
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* One dialog for whichever row asked for it, rather than one per row. */}
      {payrollFor && (
        <RecordPayrollDialog
          open
          onOpenChange={(open) => { if (!open) setPayrollFor(null); }}
          staffCode={payrollFor.code}
          staffName={`${payrollFor.firstName} ${payrollFor.lastName}`}
          // The dialog has already reported 'ledger:write'; this re-reads the
          // roster so the row's red dot reflects anything netted off the run.
          onRecorded={refreshStaff}
        />
      )}
    </div>
  );
}
