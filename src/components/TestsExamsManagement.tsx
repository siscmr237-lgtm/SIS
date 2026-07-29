import { useEffect, useState } from 'react';
import { NavigationPage } from '../App';
import { api } from '@/lib/api';
import { formatTermLabel, getDefaultTermFields } from '../utils/academicTerm';
import { ArrowLeft, Plus, Trash2, Settings2, Pencil } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogTrigger, DialogDescription, DialogClose,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from './ui/table';

interface TestsExamsManagementProps {
  onNavigate?: (page: NavigationPage) => void;
}

const TYPE_OPTIONS: { value: 'TEST' | 'EXAM'; label: string }[] = [
  { value: 'TEST', label: 'Test' },
  { value: 'EXAM', label: 'Exam' },
];

export function TestsExamsManagement({ onNavigate }: TestsExamsManagementProps) {
  const [classes, setClasses] = useState<any[]>([]);
  const [classId, setClassId] = useState('');
  const [{ term, academicYear }, setPeriod] = useState(() => getDefaultTermFields());
  const [testExams, setTestExams] = useState<any[]>([]);
  const [classSubjects, setClassSubjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: '', type: 'TEST' as 'TEST' | 'EXAM', order: '1' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [openTotals, setOpenTotals] = useState(false);
  const [totalsTestExam, setTotalsTestExam] = useState<any>(null);
  const [totalsRows, setTotalsRows] = useState<{ subjectId: number; name: string; value: string }[]>([]);
  const [savingTotals, setSavingTotals] = useState(false);
  const [totalsMessage, setTotalsMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get('/classes');
        setClasses(data || []);
        if (Array.isArray(data) && data.length && !classId) setClassId(String(data[0].id));
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    if (!classId || !term || !academicYear) return;
    setLoading(true);
    try {
      const [rows, subjects] = await Promise.all([
        api.get(`/test-exams?classId=${classId}&term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear)}`),
        api.get(`/classes/${classId}/subjects`),
      ]);
      setTestExams(rows || []);
      setClassSubjects(subjects || []);
    } catch {
      setTestExams([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, term, academicYear]);

  const openCreateForm = () => {
    setEditingId(null);
    setForm({ name: '', type: 'TEST', order: String((testExams?.length || 0) + 1) });
    setFormError(null);
    setOpenForm(true);
  };

  const openEditForm = (row: any) => {
    setEditingId(row.id);
    setForm({ name: row.name, type: row.type, order: String(row.order ?? 0) });
    setFormError(null);
    setOpenForm(true);
  };

  const handleSaveForm = async () => {
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    if (saving) return;
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await api.put(`/test-exams/${editingId}`, {
          name: form.name.trim(),
          type: form.type,
          order: Number(form.order) || 0,
        });
      } else {
        await api.post('/test-exams', {
          classId: Number(classId),
          academicYear,
          term,
          name: form.name.trim(),
          type: form.type,
          order: Number(form.order) || 0,
        });
      }
      await refresh();
      setOpenForm(false);
    } catch (e: any) {
      setFormError(e?.message || 'Failed to save');
    }
    setSaving(false);
  };

  const handleDelete = async (row: any) => {
    if (!confirm(`Delete "${row.name}"? This also removes its configured totals and any marks entered against it.`)) return;
    if (deletingId) return;
    setDeletingId(row.id);
    try {
      await api.delete(`/test-exams/${row.id}`);
      await refresh();
    } catch {} finally {
      setDeletingId(null);
    }
  };

  const openTotalsDialog = async (row: any) => {
    setTotalsTestExam(row);
    setTotalsMessage(null);
    setOpenTotals(true);
    try {
      const existing = await api.get(`/test-exams/${row.id}/subject-totals`);
      const bySubject = Object.fromEntries((existing || []).map((t: any) => [t.subjectId, t.totalMarks]));
      setTotalsRows(
        classSubjects.map((s: any) => ({
          subjectId: s.id,
          name: s.name,
          value: bySubject[s.id] != null ? String(bySubject[s.id]) : '',
        }))
      );
    } catch {
      setTotalsRows(classSubjects.map((s: any) => ({ subjectId: s.id, name: s.name, value: '' })));
    }
  };

  const handleSaveTotals = async () => {
    if (!totalsTestExam) return;
    if (savingTotals) return;
    setSavingTotals(true);
    setTotalsMessage(null);
    const failures: string[] = [];
    for (const row of totalsRows) {
      if (row.value === '') continue;
      const totalMarks = Number(row.value);
      if (!Number.isInteger(totalMarks) || totalMarks <= 0) {
        failures.push(`${row.name}: must be a positive whole number`);
        continue;
      }
      try {
        await api.put(`/test-exams/${totalsTestExam.id}/subject-totals/${row.subjectId}`, { totalMarks });
      } catch (e: any) {
        failures.push(`${row.name}: ${e?.message || 'failed to save'}`);
      }
    }
    setSavingTotals(false);
    setTotalsMessage(failures.length ? `Some totals were not saved: ${failures.join('; ')}` : 'Totals saved.');
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex-1">
          <button
            onClick={() => onNavigate?.('report-cards')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-600 transition-colors mb-3"
          >
            <ArrowLeft size={16} />
            Back to Report Cards
          </button>
          <h1 className="text-3xl mb-2">Tests &amp; Exams</h1>
          <p className="text-gray-600">Manage a class's tests and exams, and their per-subject totals</p>
        </div>
        <Dialog open={openForm} onOpenChange={setOpenForm}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2" onClick={openCreateForm} disabled={!classId}>
              <Plus size={20} />
              Add Test/Exam
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Test/Exam' : 'Add Test/Exam'}</DialogTitle>
              <DialogDescription>
                {editingId ? 'Update this test/exam.' : `For this class, ${formatTermLabel(term)} — ${academicYear}.`}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div>
                <Label>Name</Label>
                <Input
                  placeholder="e.g., CA1"
                  value={form.name}
                  onChange={e => setForm(s => ({ ...s, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={(v: string) => setForm(s => ({ ...s, type: v as 'TEST' | 'EXAM' }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Order</Label>
                  <Input
                    type="number"
                    value={form.order}
                    onChange={e => setForm(s => ({ ...s, order: e.target.value }))}
                  />
                </div>
              </div>
              {formError && <p className="text-red-600 text-sm">{formError}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline" disabled={saving}>Cancel</Button>
              </DialogClose>
              <Button onClick={handleSaveForm} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-6 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>Class</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="Select class" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Term</Label>
            <Select value={term} onValueChange={(v: string) => setPeriod(p => ({ ...p, term: v }))}>
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
            <Label>Academic Year</Label>
            <Input
              placeholder="2026/2027"
              value={academicYear}
              onChange={e => setPeriod(p => ({ ...p, academicYear: e.target.value }))}
            />
          </div>
        </div>
      </Card>

      {!classId ? (
        <Card className="p-6">
          <p className="text-gray-500">Select a class to manage its tests and exams.</p>
        </Card>
      ) : loading ? (
        <p className="p-4 text-gray-500">Loading...</p>
      ) : testExams.length === 0 ? (
        <Card className="p-6">
          <p className="text-gray-500">No tests or exams yet for this class, term, and academic year.</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testExams.map(row => (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.type === 'EXAM' ? 'Exam' : 'Test'}</TableCell>
                    <TableCell>{row.order}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => openTotalsDialog(row)}>
                          <Settings2 size={16} />
                          Totals
                        </Button>
                        <Button variant="outline" size="sm" className="flex items-center gap-2" onClick={() => openEditForm(row)}>
                          <Pencil size={16} />
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex items-center gap-2"
                          onClick={() => handleDelete(row)}
                          disabled={deletingId === row.id}
                        >
                          <Trash2 size={16} />
                          {deletingId === row.id ? 'Deleting...' : 'Delete'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={openTotals} onOpenChange={open => { setOpenTotals(open); if (!open) { setTotalsTestExam(null); setTotalsRows([]); setTotalsMessage(null); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Subject Totals — {totalsTestExam?.name}</DialogTitle>
            <DialogDescription>Set each subject's total marks for this test/exam. Leave blank to skip.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {classSubjects.length === 0 ? (
              <p className="text-sm text-gray-400">This class has no subjects assigned yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Total Marks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {totalsRows.map((row, idx) => (
                    <TableRow key={row.subjectId}>
                      <TableCell>{row.name}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          placeholder="Not set"
                          value={row.value}
                          onChange={e => {
                            const v = e.target.value;
                            setTotalsRows(rows => rows.map((r, i) => (i === idx ? { ...r, value: v } : r)));
                          }}
                          className="w-24"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {totalsMessage && <p className="text-sm mt-4 text-gray-600">{totalsMessage}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={savingTotals}>Close</Button>
            </DialogClose>
            <Button onClick={handleSaveTotals} disabled={savingTotals || classSubjects.length === 0}>
              {savingTotals ? 'Saving...' : 'Save Totals'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
