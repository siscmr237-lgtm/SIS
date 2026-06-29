import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
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

export function ClassesManagement() {
  const [classes, setClasses] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [allSubjects, setAllSubjects] = useState<any[]>([]);
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
    const init = async () => {
      try {
        const [classData, staffData, subjectData] = await Promise.all([
          api.get('/classes'),
          api.get('/staff'),
          api.get('/subjects'),
        ]);
        if (mounted) {
          setClasses(classData || []);
          setTeachers((staffData || []).filter((s: any) => s.isTeacher));
          setAllSubjects(subjectData || []);
        }
      } catch {}
      if (mounted) setLoading(false);
    };
    init();
    return () => { mounted = false; };
  }, []);

  const refresh = async () => {
    try {
      const data = await api.get('/classes');
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
    setLoadingSubjects(true);
    setOpenManage(true);
    try {
      const data = await api.get(`/classes/${cls.id}/subjects`);
      setClassSubjects(data || []);
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
      const data = await api.get(`/classes/${managingClass.id}/subjects`);
      setClassSubjects(data || []);
    } catch {}
  };

  const assignedSubjectIds = new Set(classSubjects.map((a: any) => a.id));
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
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl mb-2">Classes</h1>
          <p className="text-gray-600">Manage school classes</p>
        </div>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Class Teacher</TableHead>
                <TableHead>Subjects</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {classes.map(cls => (
                <TableRow key={cls.id}>
                  <TableCell>{cls.code}</TableCell>
                  <TableCell>{cls.name}</TableCell>
                  <TableCell>
                    <select
                      className="border rounded h-9 px-2 text-sm w-full min-w-[180px]"
                      value={cls.classTeacher?.code || ''}
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
        </Card>
      )}
      <Dialog open={openManage} onOpenChange={open => { setOpenManage(open); if (!open) setManagingClass(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Subjects — {managingClass?.name}</DialogTitle>
            <DialogDescription>Add or remove subjects assigned to this class</DialogDescription>
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
                    {classSubjects.filter((a: any) => a?.id && a?.name).map((subject: any) => (
                      <div key={subject.id} className="flex items-center justify-between py-2">
                        <span className="text-sm">{subject.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveSubject(subject)}
                          className="text-red-500 hover:text-red-700 h-7 px-2"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ))}
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
