import { useState } from 'react';
import { NavigationPage } from '../App';
import { api } from '@/lib/api';
import { useCachedResource, useSisCache } from '@/lib/SisCache';
import { RevalidatingBadge, useResourceError } from './ResourceStatus';
import { BookOpen, DollarSign, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { LevelFeesDialog } from './LevelFeesDialog';
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

interface CreateOutcome {
  created: string[];
  alreadyExisted: string[];
  failed: string[];
  message?: string;
}

/**
 * Reports the result of "create standard classes" when it did NOT fully
 * succeed. Silent on success — the class list itself is the confirmation, and
 * a toast already fired. Names every class individually rather than giving a
 * count, so it is clear exactly what is missing and what to expect from a
 * retry. Inline styles because src/index.css is a pre-compiled Tailwind build
 * and arbitrary utility classes would silently render as nothing.
 */
function CreateStandardOutcome({
  outcome,
  onRetry,
  onDismiss,
  retrying,
}: {
  outcome: CreateOutcome | null;
  onRetry: () => void;
  onDismiss: () => void;
  retrying: boolean;
}) {
  if (!outcome) return null;
  const problem = outcome.failed.length > 0 || Boolean(outcome.message);
  if (!problem) return null;

  return (
    <div
      style={{
        margin: '0 0 1.5rem',
        padding: '1rem 1.25rem',
        borderRadius: 10,
        border: '1px solid #FCD34D',
        backgroundColor: '#FFFBEB',
        color: '#92400E',
        fontSize: '0.875rem',
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
        {outcome.failed.length
          ? 'Some classes were not created'
          : 'The standard classes could not be created'}
      </p>
      {outcome.message && <p style={{ marginBottom: '0.5rem' }}>{outcome.message}</p>}
      {outcome.created.length > 0 && (
        <p style={{ marginBottom: '0.25rem' }}>
          <strong>Created:</strong> {outcome.created.join(', ')}
        </p>
      )}
      {outcome.alreadyExisted.length > 0 && (
        <p style={{ marginBottom: '0.25rem' }}>
          <strong>Already existed:</strong> {outcome.alreadyExisted.join(', ')}
        </p>
      )}
      {outcome.failed.length > 0 && (
        <p style={{ marginBottom: '0.25rem' }}>
          <strong>Not created:</strong> {outcome.failed.join(', ')}
        </p>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
        <Button size="sm" onClick={onRetry} disabled={retrying}>
          {retrying ? 'Retrying...' : 'Retry'}
        </Button>
        <Button size="sm" variant="outline" onClick={onDismiss} disabled={retrying}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function ClassesManagement({ onNavigate }: ClassesManagementProps) {
  const cache = useSisCache();
  // Three independent cached resources rather than one Promise.all, so each is
  // keyed on its own and shared with every other section that needs it — the
  // staff list here is the same cached entry Staff Management and Timetable use.
  const {
    data: classesData,
    loading: classesLoading,
    revalidating,
    error: classesError,
    refresh: refreshClasses,
  } = useCachedResource<any[]>('classes', () => api.get('/classes'));
  const { data: staffData } = useCachedResource<any[]>('staff', () => api.get('/staff'));
  const { data: subjectsData } = useCachedResource<any[]>('subjects', () => api.get('/subjects'));
  // "Create standard classes" must offer only the levels this school's TYPE
  // allows — a Daycare–Nursery school has no Class 1–6, and seeding them here
  // would put back exactly the rows that don't belong to it. The filtered
  // catalog is fetched from the server rather than mirrored locally so it
  // cannot drift from sis-backend/src/utils/classCatalog.js.
  const { data: settingsData } = useCachedResource<any>('settings', () => api.get('/settings'));
  const schoolType = settingsData?.schoolType ?? null;
  const { data: catalogData } = useCachedResource<Array<{ name: string }>>(
    schoolType ? `class-catalog:${schoolType}` : null,
    () => api.get(`/onboarding/class-catalog?schoolType=${encodeURIComponent(schoolType)}`),
    { deps: [schoolType] },
  );
  const catalogNames = (catalogData ?? []).map((c) => c.name);

  useResourceError(classesError, 'classes', classesData !== null);

  const classes = classesData ?? [];
  const teachers = (staffData ?? []).filter((s: any) => s.isTeacher);
  const allSubjects = subjectsData ?? [];
  const [subjectTeachers, setSubjectTeachers] = useState<any[]>([]);
  const [addTeacherSelections, setAddTeacherSelections] = useState<Record<number, string>>({});
  const [managingClass, setManagingClass] = useState<any>(null);
  const [classSubjects, setClassSubjects] = useState<any[]>([]);
  const [openManage, setOpenManage] = useState(false);
  const [addSubjectId, setAddSubjectId] = useState('');
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const loading = classesLoading;
  const [creating, setCreating] = useState(false);
  // Outcome of the last "create standard classes" attempt. Held in state (not
  // just a toast) so a partial or failed run stays on screen to be acted on
  // rather than vanishing after a few seconds.
  const [createOutcome, setCreateOutcome] = useState<CreateOutcome | null>(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [openFees, setOpenFees] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [deletingClassId, setDeletingClassId] = useState<number | null>(null);
  const [addSubjectSubmitting, setAddSubjectSubmitting] = useState(false);
  const [removingSubjectId, setRemovingSubjectId] = useState<number | null>(null);
  const [addingTeacherSubjectId, setAddingTeacherSubjectId] = useState<number | null>(null);
  const [removingTeacherId, setRemovingTeacherId] = useState<number | null>(null);

  // Clears every key a class edit can reach, then repopulates the list. The
  // old version only re-cached a non-empty response, so deleting the last
  // class left the deleted one sitting in the cache; refresh() now stores
  // whatever the server returns, empty list included.
  const refresh = async () => {
    cache.invalidateOn('class:write');
    await refreshClasses();
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
    if (addSubjectSubmitting) return;
    setAddSubjectSubmitting(true);
    try {
      await api.post(`/classes/${managingClass.id}/subjects`, { subjectId: Number(addSubjectId) });
      cache.invalidateOn('class:write');
      const data = await api.get(`/classes/${managingClass.id}/subjects`);
      setClassSubjects(data || []);
      setAddSubjectId('');
    } catch {} finally {
      setAddSubjectSubmitting(false);
    }
  };

  const handleRemoveSubject = async (assignment: any) => {
    if (!confirm(`Remove "${assignment.name ?? 'this subject'}" from this class?`)) return;
    if (removingSubjectId) return;
    setRemovingSubjectId(assignment.id);
    try {
      await api.delete(`/classes/${managingClass.id}/subjects/${assignment.id}`);
      cache.invalidateOn('class:write');
      const [subjects, stAssignments] = await Promise.all([
        api.get(`/classes/${managingClass.id}/subjects`),
        api.get(`/classes/${managingClass.id}/subject-teachers`),
      ]);
      setClassSubjects(subjects || []);
      setSubjectTeachers(stAssignments || []);
    } catch {} finally {
      setRemovingSubjectId(null);
    }
  };

  const handleAddSubjectTeacher = async (subject: any) => {
    const staffId = addTeacherSelections[subject.id];
    if (!staffId || !managingClass) return;
    if (addingTeacherSubjectId) return;
    // subjectId may be on a junction record; fall back to id if not present
    const subjectId = subject.subjectId ?? subject.id;
    setAddingTeacherSubjectId(subject.id);
    try {
      await api.post(`/classes/${managingClass.id}/subject-teachers`, {
        staffId: staffId,
        subjectId: Number(subjectId),
      });
      cache.invalidateOn('class:write');
      const data = await api.get(`/classes/${managingClass.id}/subject-teachers`);
      setSubjectTeachers(data || []);
      setAddTeacherSelections(prev => ({ ...prev, [subject.id]: '' }));
    } catch (e: any) {
      console.error('subject-teacher assign failed:', e?.message || e);
    } finally {
      setAddingTeacherSubjectId(null);
    }
  };

  const handleRemoveSubjectTeacher = async (assignmentId: number) => {
    if (!managingClass) return;
    if (removingTeacherId) return;
    setRemovingTeacherId(assignmentId);
    try {
      await api.delete(`/classes/${managingClass.id}/subject-teachers/${assignmentId}`);
      cache.invalidateOn('class:write');
      const data = await api.get(`/classes/${managingClass.id}/subject-teachers`);
      setSubjectTeachers(data || []);
    } catch {} finally {
      setRemovingTeacherId(null);
    }
  };

  const assignedSubjectIds = new Set(classSubjects.map((a: any) => a.subjectId ?? a.id));
  const availableSubjects = allSubjects.filter(s => !assignedSubjectIds.has(s.id));

  // One request, not a POST per class. The server creates the whole set in a
  // single statement, so there is no partial state to end up in — the previous
  // loop swallowed each failure with `catch {}` and then reported success
  // regardless, which is how a school could silently end up with half its
  // classes. Anything short of complete success is surfaced and retryable.
  const handleCreateStandard = async () => {
    if (creating) return;
    setCreating(true);
    setCreateOutcome(null);
    try {
      const res: any = await api.post('/classes/standard', {});
      await refresh();
      const created: string[] = res?.created ?? [];
      const alreadyExisted: string[] = res?.alreadyExisted ?? [];
      setCreateOutcome({ created, alreadyExisted, failed: [] });
      toast.success(
        created.length
          ? `Created ${created.length} ${created.length === 1 ? 'class' : 'classes'}${
              alreadyExisted.length ? ` (${alreadyExisted.length} already existed)` : ''
            }`
          : 'All standard classes already exist',
      );
    } catch (e: any) {
      // A PARTIAL_CREATE body still carries the per-class breakdown; anything
      // else (network, 500) means nothing is known to have been created.
      await refresh();
      const failed: string[] = e?.body?.failed ?? [];
      const created: string[] = e?.body?.created ?? [];
      setCreateOutcome({
        created,
        alreadyExisted: e?.body?.alreadyExisted ?? [],
        failed,
        message: e?.message || 'Could not create the standard classes.',
      });
      toast.error(
        failed.length
          ? `${failed.length} of ${created.length + failed.length} classes could not be created`
          : e?.message || 'Could not create the standard classes.',
      );
    } finally {
      setCreating(false);
    }
  };

  const handleAdd = async () => {
    const name = newClassName.trim();
    if (!name) return;
    if (addSubmitting) return;
    setAddSubmitting(true);
    try {
      await api.post('/classes', { name });
      await refresh();
      setNewClassName('');
      setOpenAdd(false);
    } catch {} finally {
      setAddSubmitting(false);
    }
  };

  const handleDelete = async (cls: any) => {
    if (!confirm(`Delete class "${cls.name}"? This cannot be undone.`)) return;
    if (deletingClassId) return;
    setDeletingClassId(cls.id);
    try {
      await api.delete(`/classes/${cls.id}`);
      await refresh();
    } catch {} finally {
      setDeletingClassId(null);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl mb-2">Classes</h1>
          <p className="text-gray-600">
            Manage school classes <RevalidatingBadge active={revalidating} />
          </p>
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
          <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={() => setOpenFees(true)}
          >
            <DollarSign size={20} />
            Fee Categories
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
                  <Button variant="outline" disabled={addSubmitting}>Cancel</Button>
                </DialogClose>
                <Button onClick={handleAdd} disabled={addSubmitting}>
                  {addSubmitting ? 'Saving...' : 'Save Class'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Rendered outside the empty-state card below: a partial run creates
          SOME classes, which unmounts that card — the report of what failed
          has to outlive it. */}
      <LevelFeesDialog open={openFees} onOpenChange={setOpenFees} />

      <CreateStandardOutcome
        outcome={createOutcome}
        onRetry={handleCreateStandard}
        onDismiss={() => setCreateOutcome(null)}
        retrying={creating}
      />

      {loading ? (
        <p className="p-4 text-gray-500">Loading classes...</p>
      ) : classes.length === 0 ? (
        <Card className="p-12 flex flex-col items-center gap-4 text-center">
          <p className="text-gray-500">No classes have been created yet.</p>
          <Button onClick={handleCreateStandard} disabled={creating}>
            {creating ? 'Creating...' : 'Create standard classes'}
          </Button>
          <p className="text-sm text-gray-400">
            {catalogNames.length
              ? `Creates: ${catalogNames.join(', ')}`
              : 'Loading the class levels for this school type...'}
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
                      disabled={deletingClassId === cls.id}
                      className="flex items-center gap-2"
                    >
                      <Trash2 size={16} />
                      {deletingClassId === cls.id ? 'Deleting...' : 'Delete'}
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
                              disabled={removingSubjectId === subject.id}
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
                                      disabled={removingTeacherId === st.id}
                                      className="text-gray-400 hover:text-red-500 leading-none ml-0.5 disabled:opacity-50"
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
                                  disabled={!addTeacherSelections[subject.id] || addingTeacherSubjectId === subject.id}
                                >
                                  {addingTeacherSubjectId === subject.id ? 'Adding...' : 'Add'}
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
                    <Button size="sm" onClick={handleAddSubject} disabled={!addSubjectId || addSubjectSubmitting}>
                      {addSubjectSubmitting ? 'Adding...' : 'Add'}
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
