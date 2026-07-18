import { useEffect, useState } from 'react';
import { NavigationPage } from '../App';
import { api } from '@/lib/api';
import { useSisCache } from '@/lib/SisCache';
import { SCHOOL_CLASSES } from '@/lib/classes';
import { BookOpen, Plus, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogDescription, DialogClose,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from './ui/table';

interface ClassesManagementProps {
  onNavigate?: (page: NavigationPage) => void;
}

export function ClassesManagement({ onNavigate }: ClassesManagementProps) {
  const cache = useSisCache();
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
  const [subjectTeachers, setSubjectTeachers] = useState<any[]>([]);
  const [addTeacherSelections, setAddTeacherSelections] = useState<Record<number, string>>({});
  const [managingClass, setManagingClass] = useState<any>(null);
  const [classSubjects, setClassSubjects] = useState<any[]>([]);
  const [openManage, setOpenManage] = useState(false);
  const [addSubjectId, setAddSubjectId] = useState('');
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [newClassName, setNewClassName] = useState('');

  useEffect(() => {
    let mounted = true;
    const cachedClasses = cache.get<any[]>('classes');
    const cachedStaff   = cache.get<any[]>('staff');
    if (cachedClasses && cachedStaff && mounted) {
      setClasses(cachedClasses);
      setTeachers(cachedStaff.filter((s: any) => s.isTeacher));
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [classData, staffData, subjectData] = await Promise.all([
          api.get('/classes'),
          api.get('/staff'),
          api.get('/subjects'),
        ]);
        if (mounted) {
          if (Array.isArray(classData) && classData.length > 0) cache.set('classes', classData);
          if (Array.isArray(staffData) && staffData.length > 0) cache.set('staff', staffData);
          setClasses(classData || []);
          setTeachers((staffData || []).filter((s: any) => s.isTeacher));
          setAllSubjects(subjectData || []);
        }
      } catch {}
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const refresh = async () => {
    try {
      const data = await api.get('/classes');
      if (Array.isArray(data) && data.length > 0) cache.set('classes', data);
      setClasses(data || []);
    } catch {}
  };

  const handleAssignTeacher = async (cls: any, selectedCode: string) => {
    try {
      await api.put(`/classes/${cls.id}`, { classTeacherId: selectedCode || null });
      await refresh();
    } catch {}
  };

  const handleOpenManage = async (cls: any) => {
    setManagingClass(cls);
    setAddSubjectId('');
    setClassSubjects([]);
    setSubjectTeachers([]);
    setAddTeacherSelections({});
    setLoadingSubjects(true);
    setOpenManage(true);
    if (teachers.length) console.log('[debug] teacher object fields:', teachers[0]);
    try {
      const [subjects, stAssignments] = await Promise.all([
        api.get(`/classes/${cls.id}/subjects`),
        api.get(`/classes/${cls.id}/subject-teachers`),
      ]);
      setClassSubjects(subjects || []);
      setSubjectTeachers(stAssignments || []);
    } catch {}
    setLoadingSubjects(false);
  };

  const handleAddSubject = async () => {
    if (!addSubjectId || !managingClass) return;
    try {
      await api.post(`/classes/${managingClass.id}/subjects`, { subjectId: Number(addSubjectId) });
      const data = await api.get(`/classes/${managingClass.id}/subjects`);
      setClassSubjects(data || []);
      setAddSubjectId('');
    } catch {}
  };

  const handleRemoveSubject = async (assignment: any) => {
    if (!confirm(`Remove "${assignment.name ?? 'this subject'}" from this class?`)) return;
    try {
      await api.delete(`/classes/${managingClass.id}/subjects/${assignment.id}`);
      const [subjects, stAssignments] = await Promise.all([
        api.get(`/classes/${managingClass.id}/subjects`),
        api.get(`/classes/${managingClass.id}/subject-teachers`),
      ]);
      setClassSubjects(subjects || []);
      setSubjectTeachers(stAssignments || []);
    } catch {}
  };

  const handleAddSubjectTeacher = async (subject: any) => {
    const staffId = addTeacherSelections[subject.id];
    if (!staffId || !managingClass) return;
    // subjectId may be on a junction record; fall back to id if not present
    const subjectId = subject.subjectId ?? subject.id;
    try {
      // await api.post(`/classes/${managingClass.id}/subject-teachers`, {
      //   staffId: Number(staffId),
      //   subjectId: Number(subjectId),
      // });
      await api.post(`/classes/${managingClass.id}/subject-teachers`, {
        staffId: staffId,
        subjectId: Number(subjectId),
      });
      const data = await api.get(`/classes/${managingClass.id}/subject-teachers`);
      setSubjectTeachers(data || []);
      setAddTeacherSelections(prev => ({ ...prev, [subject.id]: '' }));
    } catch (e: any) {
      console.error('subject-teacher assign failed:', e?.message || e);
    }
  };

  const handleRemoveSubjectTeacher = async (assignmentId: number) => {
    if (!managingClass) return;
    try {
      await api.delete(`/classes/${managingClass.id}/subject-teachers/${assignmentId}`);
      const data = await api.get(`/classes/${managingClass.id}/subject-teachers`);
      setSubjectTeachers(data || []);
    } catch {}
  };

  const assignedSubjectIds = new Set(classSubjects.map((a: any) => a.subjectId ?? a.id));
  const availableSubjects = allSubjects.filter(s => !assignedSubjectIds.has(s.id));

  const handleCreateStandard = async () => {
    setCreating(true);
    for (const name of SCHOOL_CLASSES) {
      try {
        await api.post('/classes', { name });
      } catch {}
    }
    await refresh();
    setCreating(false);
  };

  const handleAdd = async () => {
    const name = newClassName.trim();
    if (!name) return;
    try {
      await api.post('/classes', { name });
      await refresh();
      setNewClassName('');
      setOpenAdd(false);
    } catch {}
  };

  const handleDelete = async (cls: any) => {
    if (!confirm(`Delete class "${cls.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/classes/${cls.id}`);
      await refresh();
    } catch {}
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl mb-2">Classes</h1>
          <p className="text-gray-600">Manage school classes</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={() => onNavigate?.('subjects')}
          >
            <BookOpen size={20} />
            Manage Subjects
          </Button>
          <Dialog open={openAdd} onOpenChange={setOpenAdd}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus size={20} />
                Add Class
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Class</DialogTitle>
                <DialogDescription>Enter the class name below</DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label>Class Name</Label>
                <Input
                  placeholder="e.g., Class 7"
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
                />
              </div>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={handleAdd}>Save Class</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <p className="p-4 text-gray-500">Loading classes...</p>
      ) : classes.length === 0 ? (
        <Card className="p-12 flex flex-col items-center gap-4 text-center">
          <p className="text-gray-500">No classes have been created yet.</p>
          <Button onClick={handleCreateStandard} disabled={creating}>
            {creating ? 'Creating...' : 'Create standard classes'}
          </Button>
          <p className="text-sm text-gray-400">
            Creates: {SCHOOL_CLASSES.join(', ')}
          </p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Class Teacher</TableHead>
                <TableHead>Subjects</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.map(cls => (
                <TableRow key={cls.id}>
                  <TableCell>{cls.name}</TableCell>
                  <TableCell>
                    <select
                      className="border rounded h-9 px-2 text-sm w-full min-w-[180px]"
                      value={cls.classTeacher?.id ?? ''}
                      onChange={e => handleAssignTeacher(cls, e.target.value)}
                    >
                      <option value="">— None —</option>
                      {teachers.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.firstName} {t.lastName}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenManage(cls)}
                      className="flex items-center gap-2"
                    >
                      <BookOpen size={16} />
                      Subjects
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(cls)}
                      className="flex items-center gap-2"
                    >
                      <Trash2 size={16} />
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </Card>
      )}
      <Dialog open={openManage} onOpenChange={open => {
        setOpenManage(open);
        if (!open) { setManagingClass(null); setSubjectTeachers([]); setAddTeacherSelections({}); }
      }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Subjects — {managingClass?.name}</DialogTitle>
            <DialogDescription>Manage subjects and their assigned teachers</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {loadingSubjects ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : (
              <>
                {classSubjects.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">No subjects assigned yet.</p>
                ) : (
                  <div className="divide-y">
                    {classSubjects.filter((a: any) => a?.id && a?.name).map((subject: any) => {
                      const assigned = subjectTeachers.filter(st => st.subject?.id === (subject.subjectId ?? subject.id));
                      const assignedIds = new Set(assigned.map(st => st.staff?.id));
                      const available = teachers.filter(t => !assignedIds.has(t.id));
                      return (
                        <div key={subject.id} className="py-2 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{subject.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveSubject(subject)}
                              className="text-red-500 hover:text-red-700 h-7 px-2"
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                          <div className="pl-2 space-y-1.5">
                            {assigned.length === 0 ? (
                              <p className="text-xs text-gray-400">No teachers assigned</p>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {assigned.map(st => (
                                  <span key={st.id} className="inline-flex items-center gap-1 text-xs bg-gray-100 rounded px-2 py-0.5">
                                    {st.staff?.firstName} {st.staff?.lastName}
                                    <button
                                      onClick={() => handleRemoveSubjectTeacher(st.id)}
                                      className="text-gray-400 hover:text-red-500 leading-none ml-0.5"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            {available.length > 0 && (
                              <div className="flex gap-1">
                                <select
                                  className="border rounded h-7 px-1.5 text-xs flex-1"
                                  value={addTeacherSelections[subject.id] ?? ''}
                                  onChange={e => setAddTeacherSelections(prev => ({ ...prev, [subject.id]: e.target.value }))}
                                >
                                  <option value="">Add teacher…</option>
                                  {available.map(t => (
                                    <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                                  ))}
                                </select>
                                <Button
                                  size="sm"
                                  className="h-7 text-xs px-2"
                                  onClick={() => handleAddSubjectTeacher(subject)}
                                  disabled={!addTeacherSelections[subject.id]}
                                >
                                  Add
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {availableSubjects.length > 0 && (
                  <div className="flex gap-2 pt-2 border-t">
                    <select
                      className="border rounded h-9 px-2 text-sm flex-1"
                      value={addSubjectId}
                      onChange={e => setAddSubjectId(e.target.value)}
                    >
                      <option value="">Select subject to add</option>
                      {availableSubjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <Button size="sm" onClick={handleAddSubject} disabled={!addSubjectId}>
                      Add
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex justify-end pt-2">
            <DialogClose asChild>
              <Button variant="outline">Done</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
