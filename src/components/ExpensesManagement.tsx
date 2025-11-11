import { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Plus, FileText, Search } from 'lucide-react';
import { generateExpenseInvoice } from '../utils/pdfGenerator';
import { api } from '@/lib/api';

export function ExpensesManagement() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState({
    date: '',
    invoiceNumber: '',
    category: '',
    description: '',
    amount: '',
    payee: '',
    paymentMethod: '',
  });

  const categories = ['Utilities', 'Supplies', 'Maintenance', 'Salaries', 'Transportation', 'Other'];

  const filteredExpenses = expenses.filter(expense => {
    const matchesSearch = 
      expense.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.payee.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = filterCategory === 'all' || expense.category === filterCategory;
    
    return matchesSearch && matchesCategory;
  });

  const totalExpenses = expenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (searchTerm) params.set('q', searchTerm);
        if (filterCategory && filterCategory !== 'all') params.set('category', filterCategory);
        const data = await api.get(`/expenses${params.toString() ? `?${params.toString()}` : ''}`);
        if (mounted) setExpenses(data || []);
      } catch {}
    };
    load();
    return () => { mounted = false; };
  }, [searchTerm, filterCategory]);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl mb-2">Expenses Management</h1>
          <p className="text-gray-600">Track and manage school expenses</p>
        </div>
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
                  <Input type="date" value={form.date} onChange={e=>setForm(s=>({...s, date:e.target.value}))} />
                </div>
                <div>
                  <Label>Invoice Number</Label>
                  <Input placeholder="INV-2024-XX-XXX" value={form.invoiceNumber} onChange={e=>setForm(s=>({...s, invoiceNumber:e.target.value}))} />
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
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button
                onClick={async ()=>{
                  try {
                    await api.post('/expenses', {
                      date: form.date,
                      category: form.category,
                      description: form.description,
                      amount: Number(form.amount)||0,
                      payee: form.payee,
                      paymentMethod: form.paymentMethod,
                      invoiceNumber: form.invoiceNumber,
                    });
                    const params = new URLSearchParams();
                    if (searchTerm) params.set('q', searchTerm);
                    if (filterCategory && filterCategory !== 'all') params.set('category', filterCategory);
                    const data = await api.get(`/expenses${params.toString() ? `?${params.toString()}` : ''}`);
                    setExpenses(data||[]);
                    setOpenAdd(false);
                    setForm({ date:'', invoiceNumber:'', category:'', description:'', amount:'', payee:'', paymentMethod:'' });
                  } catch {}
                }}
              >Record Expense</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-6 mb-6">
        <h3 className="text-gray-600 mb-2">Total Expenses</h3>
        <p className="text-3xl text-red-600">{totalExpenses.toLocaleString()} FCFA</p>
      </Card>

      <Card className="p-6 mb-6">
        <div className="flex gap-4">
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
            <SelectTrigger className="w-48">
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
                <TableCell>{expense.date}</TableCell>
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
      </Card>
    </div>
  );
}
