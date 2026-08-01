import { useState } from 'react';
import { api } from '@/lib/api';
import { useCachedResource, useSisCache } from '@/lib/SisCache';
import { RevalidatingBadge, useResourceError } from './ResourceStatus';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { NavigationPage } from '../App';
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

interface SubjectsManagementProps {
  onNavigate?: (page: NavigationPage) => void;
}

export function SubjectsManagement({ onNavigate }: SubjectsManagementProps) {
  const cache = useSisCache();
  const {
    data: subjectsData,
    loading,
    revalidating,
    error: subjectsError,
    refresh: refreshSubjects,
  } = useCachedResource<any[]>('subjects', () => api.get('/subjects'));
  const subjects = subjectsData ?? [];

  useResourceError(subjectsError, 'subjects', subjectsData !== null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Seeding and per-class assignment both reshuffle which subjects a class
  // has, so a subject write clears the class-subject keys too.
  const refresh = async () => {
    cache.invalidateOn('subject:write');
    await refreshSubjects();
  };

  const handleSeedStandard = async () => {
    setSeeding(true);
    setSeedResult(null);
    try {
      const result = await api.post('/subjects/seed-standard', {});
      await refresh();
      setSeedResult(
        `${result.subjectsInCatalog} subjects in catalog, ${result.classLinksCreated} class links assigned`
      );
    } catch {}
    setSeeding(false);
  };

  const handleAdd = async () => {
    const name = newSubjectName.trim();
    if (!name) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.post('/subjects', { name });
      await refresh();
      setNewSubjectName('');
      setOpenAdd(false);
    } catch {} finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (subject: any) => {
    if (!confirm(`Delete subject "${subject.name}"? This cannot be undone.`)) return;
    if (deletingId) return;
    setDeletingId(subject.id);
    try {
      await api.delete(`/subjects/${subject.id}`);
      await refresh();
    } catch {} finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-8">
        <div>
          <button
            onClick={() => onNavigate?.('classes')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-3"
          >
            <ArrowLeft size={16} />
            Back to Classes
          </button>
          <h1 className="text-3xl mb-2">Subjects</h1>
          <p className="text-gray-600">
            Manage school subjects <RevalidatingBadge active={revalidating} />
          </p>
        </div>
        <Dialog open={openAdd} onOpenChange={setOpenAdd}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus size={20} />
              Add Subject
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Subject</DialogTitle>
              <DialogDescription>Enter the subject name below</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label>Subject Name</Label>
              <Input
                placeholder="e.g., Physics"
                value={newSubjectName}
                onChange={e => setNewSubjectName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline" disabled={submitting}>Cancel</Button>
              </DialogClose>
              <Button onClick={handleAdd} disabled={submitting}>
                {submitting ? 'Saving...' : 'Save Subject'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="p-4 text-gray-500">Loading subjects...</p>
      ) : subjects.length === 0 ? (
        <Card className="p-12 flex flex-col items-center gap-4 text-center">
          <p className="text-gray-500">No subjects have been created yet.</p>
          {seedResult && <p className="text-green-600 text-sm">{seedResult}</p>}
          <Button onClick={handleSeedStandard} disabled={seeding}>
            {seeding ? 'Loading...' : 'Load standard subjects'}
          </Button>
        </Card>
      ) : (
        <>
          {seedResult && (
            <div className="mb-4 p-3 rounded bg-green-50 text-green-700 text-sm">
              {seedResult}
            </div>
          )}
          <Card>
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.map(subject => (
                  <TableRow key={subject.id}>
                    <TableCell>{subject.name}</TableCell>
                    <TableCell>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(subject)}
                        disabled={deletingId === subject.id}
                        className="flex items-center gap-2"
                      >
                        <Trash2 size={16} />
                        {deletingId === subject.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
