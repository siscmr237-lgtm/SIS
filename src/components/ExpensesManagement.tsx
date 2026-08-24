import { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ThreePartDateInput } from './ThreePartDateInput';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { FileText, Plus, Search } from 'lucide-react';
import { generateExpenseInvoice } from '../utils/pdfGenerator';
import { api } from '@/lib/api';
import { useCachedResource, useSisCache } from '@/lib/SisCache';
import { dateOnly } from '../utils/dateOnly';

/**
 * Today as 'YYYY-MM-DD', read off the local calendar rather than the ISO
 * string.
 *
 * new Date().toISOString().split('T')[0] is the older idiom in this codebase and
 * it is wrong for the hour either side of midnight: a school an hour ahead of
 * UTC recording at 00:30 would be offered yesterday as the default. The three
 * local parts give the date the person is actually having.
 */
function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function ExpensesManagement() {
  const cache = useSisCache();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [openAdd, setOpenAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    date: '',
    category: '',
    description: '',
    amount: '',
    payee: '',
    paymentMethod: '',
  });
  /**
   * The invoice number this expense is about to be given — shown, never typed.
   *
   * It is fetched rather than worked out from `expenses` below, because that
   * list is the FILTERED one: the API applies the search box and the category
   * filter, so the highest number can easily be missing from it and the preview
   * would run backwards over numbers already issued. Empty until it arrives.
   */
  const [nextInvoice, setNextInvoice] = useState('');

  /**
   * Opening the dialog is what fills it in: today in the date field, and the
   * next number from the server in the invoice field.
   *
   * On open rather than in the useState initialiser above, because that
   * initialiser also runs during the server render — a date computed there can
   * disagree with the one the browser computes and take the hydration with it.
   * Reopening resets the date to today, which is the point of a default.
   */
  useEffect(() => {
    if (!openAdd) return;
    setForm(s => ({ ...s, date: todayIso() }));

    let cancelled = false;
    setNextInvoice('');
    api.get('/expenses/next-invoice')
      .then((r: any) => { if (!cancelled) setNextInvoice(r?.invoiceNumber ?? ''); })
      .catch(() => { /* the field shows its loading text; POST assigns anyway */ });
    return () => { cancelled = true; };
  }, [openAdd]);

  const categories = ['Utilities', 'Supplies', 'Maintenance', 'Salaries', 'Transportation', 'Damage', 'Other'];

  // Money: fetched fresh on every visit, never stored.
  const { data: expensesData, refresh: refreshExpenses } = useCachedResource<any[]>(
    null,
    () => {
      const params = new URLSearchParams();
      if (searchTerm) params.set('q', searchTerm);
      if (filterCategory && filterCategory !== 'all') params.set('category', filterCategory);
      return api.get(`/expenses${params.toString() ? `?${params.toString()}` : ''}`);
    },
    { policy: 'fresh', deps: [searchTerm, filterCategory] },
  );
  const expenses = expensesData ?? [];

  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = 
      expense.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.payee.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = filterCategory === 'all' || expense.category === filterCategory;
    
    return matchesSearch && matchesCategory;
  });

  const totalExpenses = expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl mb-2">Expenses Management</h1>
          <p className="text-gray-600">Track and manage school expenses</p>
        </div>
        <div className="flex gap-2">
        <Dialog open={openAdd} onOpenChange={setOpenAdd}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus size={20} />
              Add Expense
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Record New Expense</DialogTitle>
              <DialogDescription>Enter expense details and payment information</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Date</Label>
                  <ThreePartDateInput value={form.date} onChange={v=>setForm(s=>({...s, date:v ?? ''}))} aria-label="Expense date" />
                </div>
                <div>
                  {/* The hint rides on the label rather than sitting under the field,
                      because this dialog has no scrolling child: every row added to it
                      pushes Record Expense towards the bottom of a short viewport. */}
                  <Label>Invoice Number <span className="text-xs text-gray-500">(automatic)</span></Label>
                  {/* readOnly, not disabled: the number still has to be readable and
                      copyable, and a disabled field reads as "not applicable here"
                      rather than "filled in for you". */}
                  <Input
                    readOnly
                    value={nextInvoice}
                    placeholder="Assigning..."
                    className="bg-gray-50 text-gray-600"
                    aria-label="Invoice number, assigned automatically"
                  />
                </div>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v: string)=>setForm(s=>({...s, category:v}))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Input placeholder="Describe the expense..." value={form.description} onChange={e=>setForm(s=>({...s, description:e.target.value}))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount (FCFA)</Label>
                  <Input type="number" placeholder="50000" value={form.amount} onChange={e=>setForm(s=>({...s, amount:e.target.value}))} />
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
                      <SelectItem value="check">Check</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Payee</Label>
                <Input placeholder="Name of recipient/vendor" value={form.payee} onChange={e=>setForm(s=>({...s, payee:e.target.value}))} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline" disabled={submitting}>Cancel</Button>
              </DialogClose>
              <Button
                disabled={submitting}
                onClick={async ()=>{
                  if (submitting) return;
                  setSubmitting(true);
                  try {
                    await api.post('/expenses', {
                      date: form.date,
                      category: form.category,
                      description: form.description,
                      amount: Number(form.amount)||0,
                      payee: form.payee,
                      paymentMethod: form.paymentMethod,
                      // No invoiceNumber: the server owns the series and assigns the
                      // real number here. Sending the preview back would turn a race
                      // with another clerk into a 409 this dialog swallows silently.
                    });
                    // This is the invalidation the old expense form never did.
                    // Nothing financial is cached any more, so it clears no
                    // stale total today — it routes the write through the map
                    // so it stays correct if that ever changes.
                    cache.invalidateOn('expense:write');
                    await refreshExpenses();
                    setOpenAdd(false);
                    setForm({ date:'', category:'', description:'', amount:'', payee:'', paymentMethod:'' });
                  } catch {
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >{submitting ? 'Recording...' : 'Record Expense'}</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Card className="p-6 mb-6">
        <h3 className="text-gray-600 mb-2">Total Expenses</h3>
        <p className="text-3xl text-red-600">{totalExpenses.toLocaleString()} FCFA</p>
      </Card>

      <Card className="p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <Input
              placeholder="Search by description, payee, or invoice number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Invoice No.</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Payee</TableHead>
              <TableHead>Amount (FCFA)</TableHead>
              <TableHead>Payment Method</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredExpenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>{dateOnly(expense.date)}</TableCell>
                <TableCell>{expense.invoiceNumber}</TableCell>
                <TableCell>{expense.category}</TableCell>
                <TableCell>{expense.description}</TableCell>
                <TableCell>{expense.payee}</TableCell>
                <TableCell>{expense.amount.toLocaleString()}</TableCell>
                <TableCell className="capitalize">{expense.paymentMethod}</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateExpenseInvoice(expense)}
                    className="flex items-center gap-2"
                  >
                    <FileText size={16} />
                    Invoice
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
