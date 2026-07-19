import { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Plus, FileText, Search, Trash2 } from 'lucide-react';
import { generateFeeInvoice } from '../utils/pdfGenerator';
import { api } from '@/lib/api';

export function FeesManagement() {
  const [fees, setFees] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState({
    studentId: '',
    academicYear: '',
    term: '',
    breakdown: {} as Record<string, string>,
    paymentDate: '',
    paymentMethod: '',
  });

  // Helpers to compute remaining per category for selected student/period
  const normalizedCats: { name: string; limit: number }[] = ((settings?.feesCategories || []) as any[]).map((c: any) =>
    typeof c === 'string' ? { name: c, limit: 0 } : { name: c.name, limit: Number(c.limit) || 0 }
  );
  const limitsMap = Object.fromEntries(normalizedCats.map((c) => [String(c.name), Number(c.limit) || 0])) as Record<string, number>;
  const legacyMap: Record<string, string> = {
    tuitionFee: 'Tuition Fee',
    registrationFee: 'Registration Fee',
    uniformFee: 'Uniform Fee',
    booksFee: 'Books Fee',
    otherFees: 'Other Fees',
  };
  const paidMap: Record<string, number> = (() => {
    const res: Record<string, number> = {};
    if (!form.studentId || !form.academicYear || !form.term) return res;
    const relevant = fees.filter((f: any) => f.studentId === form.studentId && f.academicYear === form.academicYear && f.term === form.term);
    for (const f of relevant) {
      const b = (f as any).breakdown;
      if (b && typeof b === 'object') {
        for (const [k, v] of Object.entries(b)) {
          const key = String(k);
          res[key] = (res[key] || 0) + (Number(v) || 0);
        }
      } else {
        // accumulate legacy fields
        for (const [k, label] of Object.entries(legacyMap)) {
          const val = Number((f as any)[k] || 0) || 0;
          res[label] = (res[label] || 0) + val;
        }
      }
    }
    return res;
  })();
  const hasSelection = !!(form.studentId && form.academicYear && form.term);
  const remainingFor = (cat: string) => Math.max((limitsMap[cat] || 0) - (paidMap[cat] || 0), 0);

  // helpers for status
  const feeCats: { name: string; limit: number }[] = ((settings?.feesCategories || []) as any[]).map((c: any) =>
    typeof c === 'string' ? { name: c, limit: 0 } : { name: c.name, limit: Number(c.limit) || 0 }
  );
  const expectedTotal = feeCats.reduce((s, c) => s + (Number(c.limit) || 0), 0);

  const computeRow = (fee: any) => {
    const paid = Number(fee.amountPaid) || 0;
    const balance = Math.max(expectedTotal - paid, 0);
    const status: 'Paid' | 'Incomplete' | 'Not paid' = paid <= 0 ? 'Not paid' : (balance === 0 ? 'Paid' : 'Incomplete');
    return { paid, balance, status };
  };

  const filteredFees = fees.filter(fee => {
    const matchesSearch = 
      (fee.studentName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (fee.id || '').toLowerCase().includes(searchTerm.toLowerCase());
    const { status } = computeRow(fee);
    const matchesStatus = 
      filterStatus === 'all' ||
      (filterStatus === 'paid' && status === 'Paid') ||
      (filterStatus === 'incomplete' && status === 'Incomplete') ||
      (filterStatus === 'not_paid' && status === 'Not paid');
    return matchesSearch && matchesStatus;
  });

  const totalCollected = fees.reduce((sum, fee) => sum + (Number(fee.amountPaid) || 0), 0);
  const totalOutstanding = fees.reduce((sum, fee) => {
    const paid = Number(fee.amountPaid) || 0;
    const bal = Math.max(expectedTotal - paid, 0);
    return sum + bal;
  }, 0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [fRes, sRes, stRes, cRes] = await Promise.allSettled([
          api.get('/fees'),
          api.get('/students'),
          api.get('/settings'),
          api.get('/fee-categories'),
        ] as const);
        if (!mounted) return;
        const fList = fRes.status === 'fulfilled' ? (fRes.value || []) : [];
        const sList = sRes.status === 'fulfilled' ? (sRes.value || []) : [];
        const st = stRes.status === 'fulfilled' ? (stRes.value || null) : null;
        const cats = cRes.status === 'fulfilled' ? (cRes.value || []) : [];
        setFees(fList);
        setStudents(sList);
        const normalizedCats = (cats as any[]).map((c:any)=> ({ name: c.name, limit: Number(c.limit)||0 }));
        const defaults = normalizedCats.length ? normalizedCats : [
          { name: 'Tuition Fee', limit: 0 },
          { name: 'Registration Fee', limit: 0 },
        ];
        setSettings(st ? { ...st, feesCategories: defaults } : { feesCategories: defaults } as any);
      } catch {
        if (!mounted) return;
        // minimal fallback
        setSettings({ feesCategories: [ { name: 'Tuition Fee', limit: 0 }, { name: 'Registration Fee', limit: 0 } ] } as any);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl mb-2">Fees Management</h1>
          <p className="text-gray-600">Manage school fees and payment records</p>
        </div>
        <Dialog open={openAdd} onOpenChange={(open: boolean)=>{
          setOpenAdd(open);
          if (open) {
            // reset dynamic breakdown when opening
            const cats: string[] = (settings?.feesCategories && settings.feesCategories.length)
              ? settings.feesCategories
              : ['Tuition Fee','Registration Fee','Uniform Fee','Books Fee','Other Fees'];
            const init: Record<string,string> = {};
            cats.forEach(c=>{ init[c] = ''; });
            setForm(s=>({ ...s, breakdown: init }));
          }
        }}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus size={20} />
              Record Payment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Record Fee Payment</DialogTitle>
              <DialogDescription>Enter payment details for student fees</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <Label>Student</Label>
                <Select value={form.studentId} onValueChange={(v: string)=>setForm(s=>({...s, studentId:v}))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select student" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map(student => (
                      <SelectItem key={student.id} value={student.id}>
                        {student.firstName} {student.lastName} - {student.class}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                {(((settings?.feesCategories && settings.feesCategories.length)
                  ? (settings.feesCategories as any[]).map((c:any)=> typeof c==='string'? c : c.name)
                  : ['Tuition Fee','Registration Fee']) as string[]).map((cat)=> {
                  const limit = limitsMap[cat] || 0;
                  const canClamp = hasSelection && limit > 0;
                  const rem = canClamp ? remainingFor(cat) : undefined;
                  const val = form.breakdown[cat] || '';
                  return (
                    <div key={cat}>
                      <Label>{cat} (FCFA)</Label>
                      <Input
                        type="number"
                        placeholder={canClamp ? String(rem) : '0'}
                        disabled={canClamp && (rem as number) <= 0}
                        value={val}
                        onChange={e => {
                          const raw = Number(e.target.value || 0) || 0;
                          const n = canClamp ? Math.max(0, Math.min(raw, rem as number)) : Math.max(0, raw);
                          setForm(s => ({
                            ...s,
                            breakdown: { ...s.breakdown, [cat]: n ? String(n) : '' }
                          }));
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Payment Date</Label>
                  <Input type="date" value={form.paymentDate} onChange={e=>setForm(s=>({...s, paymentDate:e.target.value}))} />
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <Select value={form.paymentMethod} onValueChange={(v: string)=>setForm(s=>({...s, paymentMethod:v}))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                      <SelectItem value="mobile">Mobile Money</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={async ()=>{
                try {
                  const st = students.find((s:any)=>s.id===form.studentId);
                  const total = Object.values(form.breakdown||{}).reduce((a:number,b:any)=> a + (Number(b)||0), 0);
                  // Map dynamic categories to legacy fields for backward-compatible invoices
                  const normEntries = Object.entries(form.breakdown||{}).map(([k,v])=>[String(k).toLowerCase(), Number(v)||0]) as [string, number][];
                  const getSum = (pred:(k:string)=>boolean) => normEntries.filter(([k])=>pred(k)).reduce((s, [,val])=> s+val, 0);
                  const tuitionFee = getSum(k=> k.includes('tuition'));
                  const registrationFee = getSum(k=> k.includes('registration'));
                  const uniformFee = getSum(k=> k.includes('uniform'));
                  const booksFee = getSum(k=> k.includes('book'));
                  const otherFees = getSum(k=> k.includes('other'));
                  const expectedAmount = expectedTotal; // from settings
                  const balance = Math.max(expectedAmount - total, 0);
                  const status = total <= 0 ? 'Not paid' : (balance === 0 ? 'Paid' : 'Incomplete');
                  await api.post('/fees', {
                    studentId: form.studentId,
                    studentName: st ? `${st.firstName} ${st.lastName}` : '',
                    class: st?.class,
                    academicYear: form.academicYear,
                    term: form.term,
                    breakdown: Object.fromEntries(Object.entries(form.breakdown||{}).map(([k,v])=>[k, Number(v)||0])),
                    totalAmount: total,
                    amountPaid: total,
                    paymentDate: form.paymentDate,
                    paymentMethod: form.paymentMethod,
                    // legacy fields for compatibility with existing invoice renderers/backends
                    tuitionFee,
                    registrationFee,
                    uniformFee,
                    booksFee,
                    otherFees,
                    expectedAmount,
                    balance,
                    status,
                  });
                  const list = await api.get('/fees');
                  setFees(list||[]);
                  setOpenAdd(false);
                  setForm({ studentId:'', academicYear:'', term:'', breakdown:{}, paymentDate:'', paymentMethod:'' });
                } catch {}
              }}>Record Payment</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <h3 className="text-gray-600 mb-2">Total Fees Collected</h3>
          <p className="text-3xl text-green-600">{totalCollected.toLocaleString()} FCFA</p>
        </Card>
        <Card className="p-6">
          <h3 className="text-gray-600 mb-2">Outstanding Fees</h3>
          <p className="text-3xl text-orange-600">{totalOutstanding.toLocaleString()} FCFA</p>
        </Card>
      </div>

      <Card className="p-6 mb-6">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <Input
              placeholder="Search by student name or fee ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="incomplete">Incomplete</SelectItem>
              <SelectItem value="not_paid">Not paid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fee ID</TableHead>
              <TableHead>Student Name</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Term</TableHead>
              <TableHead>Total (FCFA)</TableHead>
              <TableHead>Paid (FCFA)</TableHead>
              <TableHead>Balance (FCFA)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFees.map((fee) => (
              <TableRow key={fee.id}>
                <TableCell>{fee.id}</TableCell>
                <TableCell>{fee.studentName}</TableCell>
                <TableCell>{fee.class}</TableCell>
                <TableCell>{fee.term}</TableCell>
                <TableCell>{fee.totalAmount.toLocaleString()}</TableCell>
                <TableCell>{fee.amountPaid.toLocaleString()}</TableCell>
                {(() => { const { balance } = computeRow(fee); return (
                  <TableCell>{balance.toLocaleString()}</TableCell>
                ); })()}
                <TableCell>
                  {(() => {
                    const { status } = computeRow(fee);
                    if (status === 'Paid') return <Badge className="bg-green-500">Paid</Badge>;
                    if (status === 'Incomplete') return <Badge className="bg-orange-500">Incomplete</Badge>;
                    return <Badge className="bg-red-500">Not paid</Badge>;
                  })()}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const detail = await api.get(`/fees/${fee.id}`);
                          generateFeeInvoice(detail || fee);
                        } catch {
                          generateFeeInvoice(fee);
                        }
                      }}
                      className="flex items-center gap-2"
                    >
                      <FileText size={16} />
                      Invoice
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async ()=>{
                        if (!confirm('Delete this fee record?')) return;
                        try {
                          await api.delete(`/fees/${fee.id}`);
                          const list = await api.get('/fees');
                          setFees(list||[]);
                        } catch {}
                      }}
                      className="flex items-center gap-2"
                    >
                      <Trash2 size={16} />
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
