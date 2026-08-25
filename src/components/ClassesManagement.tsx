import { useState } from 'react';
import { NavigationPage } from '../App';
import { api } from '@/lib/api';
import {
  clampSectionCount, expandClassSections, hasClassLevel, MAX_SECTIONS,
} from '@/lib/classes';
import { useCachedResource, useSisCache } from '@/lib/SisCache';
import { RevalidatingBadge, useResourceError } from './ResourceStatus';
import { BookOpen, DollarSign, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { LevelFeesDialog } from './LevelFeesDialog';
import { LevelSubjectsDialog } from './LevelSubjectsDialog';
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
  /** Which run produced this, so Retry repeats THAT run and not the other one. */
  source: 'standard' | 'add';
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
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const loading = classesLoading;
  const [creating, setCreating] = useState(false);
  // Outcome of the last "create standard classes" attempt. Held in state (not
  // just a toast) so a partial or failed run stays on screen to be acted on
  // rather than vanishing after a few seconds.
  const [createOutcome, setCreateOutcome] = useState<CreateOutcome | null>(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [openFees, setOpenFees] = useState(false);
  const [openSubjects, setOpenSubjects] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  // The Add Class dialog mirrors onboarding: tick levels, say how many sections
  // each has, create the lot in one go. `customLevels` holds names typed into
  // the field at the top — a school that teaches something the catalog has
  // never heard of should not have to leave the dialog to add it.
  const [customLevels, setCustomLevels] = useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [sectionsByLevel, setSectionsByLevel] = useState<Record<string, number>>({});
  const [addError, setAddError] = useState<string | null>(null);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [deletingClassId, setDeletingClassId] = useState<number | null>(null);
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
      setCreateOutcome({ created, alreadyExisted, failed: [], source: 'standard' });
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
        source: 'standard',
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

  const existingNames: string[] = classes.map((c: any) => c.name);
  // Only levels this school TYPE allows and does not already have: a
  // Daycare–Nursery school is never offered Class 1–6, and no level is offered
  // twice, whether it exists as a bare class or as sections of one.
  const availableCatalogLevels = catalogNames.filter((name) => !hasClassLevel(existingNames, name));
  const offeredLevels = [...customLevels, ...availableCatalogLevels];
  const plannedNames = expandClassSections(selectedLevels, sectionsByLevel);

  const resetAddDialog = () => {
    setNewClassName('');
    setCustomLevels([]);
    setSelectedLevels([]);
    setSectionsByLevel({});
    setAddError(null);
  };

  const toggleLevel = (level: string) =>
    setSelectedLevels(prev => (prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]));

  const setSectionsForLevel = (level: string, raw: string) =>
    setSectionsByLevel(prev => ({ ...prev, [level]: clampSectionCount(raw) }));

  // A name typed into the field at the top. It joins the list ticked rather than
  // being created straight away, so it takes a section count like everything
  // else and one Save creates the whole selection.
  const handleAddCustomLevel = () => {
    const name = newClassName.trim();
    if (!name || addSubmitting) return;
    // Case-insensitively, unlike the catalog filter above: class names are
    // matched as exact text everywhere else, so "class 7" alongside "Class 7"
    // would be two classes that read as one.
    const clash = existingNames.find(n => n.toLowerCase() === name.toLowerCase());
    if (clash || hasClassLevel(existingNames, name)) {
      setAddError(`This school already has ${clash ?? name}.`);
      return;
    }
    const already = offeredLevels.find(l => l.toLowerCase() === name.toLowerCase());
    if (already) {
      // The catalog already offers it — tick that row instead of standing a
      // second, near-identical entry next to it.
      setSelectedLevels(prev => (prev.includes(already) ? prev : [...prev, already]));
    } else {
      setCustomLevels(prev => [name, ...prev]);
      setSelectedLevels(prev => [...prev, name]);
    }
    setNewClassName('');
    setAddError(null);
  };

  /**
   * Creates each name in turn, classifying rather than swallowing failures: a
   * 409 means the class is already there, which is not a problem worth
   * reporting as one. The previous `catch {}` reported success no matter what.
   */
  const createClasses = async (names: string[]) => {
    const created: string[] = [];
    const alreadyExisted: string[] = [];
    const failed: string[] = [];
    let lastError = '';
    for (const name of names) {
      try {
        await api.post('/classes', { name });
        created.push(name);
      } catch (e: any) {
        if (e?.status === 409) alreadyExisted.push(name);
        else { failed.push(name); lastError = e?.message || lastError; }
      }
    }
    return { created, alreadyExisted, failed, lastError };
  };

  const runAdd = async (names: string[]) => {
    if (!names.length || addSubmitting) return;
    setAddSubmitting(true);
    setAddError(null);
    try {
      const { created, alreadyExisted, failed, lastError } = await createClasses(names);
      await refresh();
      if (failed.length) {
        // Reported outside the dialog, which closes: a partial run is something
        // to act on afterwards, and the panel behind the modal is where the
        // standard-classes run reports the same thing.
        setCreateOutcome({
          created,
          alreadyExisted,
          failed,
          message: lastError || `${failed.length} of ${names.length} classes could not be created.`,
          source: 'add',
        });
        toast.error(`${failed.length} of ${names.length} classes could not be created`);
      } else {
        setCreateOutcome(null);
        toast.success(
          created.length
            ? `Created ${created.length} ${created.length === 1 ? 'class' : 'classes'}${
                alreadyExisted.length ? ` (${alreadyExisted.length} already existed)` : ''
              }`
            : 'Those classes already exist',
        );
      }
      setOpenAdd(false);
      resetAddDialog();
    } finally {
      setAddSubmitting(false);
    }
  };

  const handleAdd = async () => {
    if (!plannedNames.length) {
      setAddError('Pick at least one class, or type a name and press Add.');
      return;
    }
    await runAdd(plannedNames);
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
            onClick={() => setOpenSubjects(true)}
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
          <Dialog
            open={openAdd}
            onOpenChange={open => {
              setOpenAdd(open);
              if (!open) resetAddDialog();
            }}
          >
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus size={20} />
                Add Class
              </Button>
            </DialogTrigger>
            <DialogContent style={{ maxWidth: 620 }}>
              <DialogHeader>
                <DialogTitle>Add New Class</DialogTitle>
                <DialogDescription>
                  Pick from the standard classes for this school, or type one of your own.
                </DialogDescription>
              </DialogHeader>

              <div className="py-2">
                <Label htmlFor="new-class-name">Class name</Label>
                <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                  <Input
                    id="new-class-name"
                    placeholder="e.g., Class 7"
                    value={newClassName}
                    onChange={e => setNewClassName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); handleAddCustomLevel(); }
                    }}
                    style={{ flex: 1 }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAddCustomLevel}
                    disabled={!newClassName.trim() || addSubmitting}
                    className="flex items-center gap-2"
                  >
                    <Plus size={16} />
                    Add
                  </Button>
                </div>
              </div>

              {/* Inline styles throughout, as elsewhere on this page: src/index.css
                  is a pre-compiled Tailwind build and an arbitrary utility would
                  render as nothing. */}
              <div style={{ maxHeight: 300, overflowY: 'auto', borderTop: '1px solid #E5E7EB', paddingTop: 12 }}>
                {offeredLevels.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    {catalogNames.length
                      ? 'Every standard class for this school has been added — type a name above to add one of your own.'
                      : 'Loading the standard classes for this school type...'}
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {offeredLevels.map(level => {
                      const checked = selectedLevels.includes(level);
                      const sections = sectionsByLevel[level] ?? 1;
                      return (
                        <div
                          key={level}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '8px 14px',
                            borderRadius: 8,
                            border: `1.5px solid ${checked ? '#1e3a8a' : '#E5E7EB'}`,
                            background: checked ? '#EFF6FF' : 'white',
                          }}
                        >
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              fontWeight: checked ? 600 : 400,
                              color: checked ? '#1e3a8a' : '#374151',
                              userSelect: 'none',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleLevel(level)}
                              disabled={addSubmitting}
                              style={{ accentColor: '#1e3a8a', width: 15, height: 15 }}
                            />
                            {level}
                          </label>
                          {checked && (
                            <label
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.78rem',
                                color: '#6B7280',
                                whiteSpace: 'nowrap',
                                paddingLeft: 10,
                                borderLeft: '1px solid #DBEAFE',
                              }}
                            >
                              Sections
                              <input
                                type="number"
                                min={1}
                                max={MAX_SECTIONS}
                                value={sections}
                                onChange={e => setSectionsForLevel(level, e.target.value)}
                                disabled={addSubmitting}
                                style={{
                                  width: 48,
                                  height: 26,
                                  borderRadius: 6,
                                  border: '1px solid #D1D5DB',
                                  padding: '0 6px',
                                  fontSize: '0.8rem',
                                  textAlign: 'center',
                                  color: '#111827',
                                }}
                              />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {plannedNames.length > 0 && (
                <p className="text-sm text-gray-500">
                  Will create: {plannedNames.join(', ')}
                </p>
              )}
              {addError && <p className="text-sm" style={{ color: '#B91C1C' }}>{addError}</p>}

              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="outline" disabled={addSubmitting}>Cancel</Button>
                </DialogClose>
                <Button onClick={handleAdd} disabled={addSubmitting || plannedNames.length === 0}>
                  {addSubmitting
                    ? 'Saving...'
                    : plannedNames.length > 1
                      ? `Save ${plannedNames.length} classes`
                      : 'Save Class'}
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
      <LevelSubjectsDialog
        open={openSubjects}
        onOpenChange={setOpenSubjects}
        onManageCatalogue={() => onNavigate?.('subjects')}
      />

      <CreateStandardOutcome
        outcome={createOutcome}
        onRetry={() => {
          if (createOutcome?.source === 'add') runAdd(createOutcome.failed);
          else handleCreateStandard();
        }}
        onDismiss={() => setCreateOutcome(null)}
        retrying={creating || addSubmitting}
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
                {/* No Subjects column: subjects belong to the class LEVEL, not to
                    an individual section, so a per-row control would suggest each
                    section had its own list. Managed from "Manage Subjects" above. */}
                <TableHead>Name</TableHead>
                <TableHead>Class Teacher</TableHead>
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
                  <TableCell className="flex gap-2">
                    {/* Teacher assignment stays per SECTION — two sections of one
                        level share subjects but can have different teachers — so it
                        lives here rather than in the level-scoped dialog. */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenManage(cls)}
                      className="flex items-center gap-2"
                    >
                      <BookOpen size={16} />
                      Teachers
                    </Button>
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
        <DialogContent style={{ maxWidth: 'min(576px, calc(100vw - 2rem))' }}>
          <DialogHeader>
            <DialogTitle>Subject Teachers — {managingClass?.name}</DialogTitle>
            <DialogDescription>
              Which subjects this section teaches comes from its class level — change that under
              “Manage Subjects”. Teachers are assigned per section here.
            </DialogDescription>
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
                          {/* No remove control: the subject is on the class LEVEL,
                              so dropping it here would silently affect every other
                              section. That belongs in "Manage Subjects". */}
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{subject.name}</span>
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
                {/* No "add subject" control either — a subject added here would
                    have to apply to the whole level, which is what the
                    level-scoped "Manage Subjects" dialog is for. */}
                {/* Padding is inline, not `pt-2`: that utility is absent from the
                    pre-compiled src/index.css and would render as nothing. */}
                {classSubjects.length === 0 && (
                  <p
                    className="text-sm text-gray-500"
                    style={{ borderTop: '1px solid #E5E7EB', paddingTop: '0.5rem' }}
                  >
                    Set this level’s subjects under “Manage Subjects” first, then assign teachers here.
                  </p>
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
