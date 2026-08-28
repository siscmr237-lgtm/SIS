import { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ThreePartDateInput } from './ThreePartDateInput';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { TableLoader } from './ContentLoader';
import { Download, FileText, Plus, Search } from 'lucide-react';
import { generateExpenseInvoice, generateExpenseRecords } from '../utils/pdfGenerator';
import { api } from '@/lib/api';
import { useCachedResource, useSisCache } from '@/lib/SisCache';
import { dateOnly, todayIso } from '../utils/dateOnly';
import { PAYMENT_METHODS, formatPaymentMethod } from '../utils/paymentMethods';

export function ExpensesManagement() {
  const cache = useSisCache();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [openAdd, setOpenAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openDownload, setOpenDownload] = useState(false);
  const [downloading, setDownloading] = useState(false);
  /**
   * The download dialog''s own filters, kept apart from the page''s search and
   * category boxes because they narrow a sheet rather than the screen. All four
   * are strings, including the two amounts: an empty box has to mean "no bound"
   * and 0 is a real bound somebody might type.
   */
  const [downloadFilters, setDownloadFilters] = useState({ from: '', to: '', min: '', max: '' });
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
  const { data: expensesData, loading: expensesLoading, refresh: refreshExpenses } = useCachedResource<any[]>(
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

  /**
   * The download dialog's bounds as numbers, or null for "no bound".
   *
   * NaN is folded into null on purpose. A half-typed '-' or '1e' in a number
   * input reads as NaN, and every comparison against NaN is false, so leaving it
   * in would silently drop every row from the sheet while the box still looked
   * like it held a filter.
   */
  const parseBound = (raw: string): number | null => {
    if (!raw.trim()) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const minAmount = parseBound(downloadFilters.min);
  const maxAmount = parseBound(downloadFilters.max);

  /**
   * What the sheet will actually contain: what the page is already showing,
   * narrowed by the dialog's date range and amount range.
   *
   * IT STARTS FROM filteredExpenses, NOT FROM THE WHOLE BOOK. The search box and
   * the category filter are part of what the user is looking at when they press
   * Download, so a sheet that quietly ignored them would not be the records on
   * screen. Both are named in the dialog and printed on the sheet, so an extract
   * never leaves here without saying what it left out.
   *
   * Dates compare as 'YYYY-MM-DD' strings rather than as Dates: that ordering is
   * already correct for this format and it avoids parsing a date-only value into
   * the viewer's timezone, which is what moves a record a day either way.
   */
  const downloadRows = filteredExpenses.filter(expense => {
    const day = dateOnly(expense.date);
    if (downloadFilters.from && day < downloadFilters.from) return false;
    if (downloadFilters.to && day > downloadFilters.to) return false;
    const amount = Number(expense.amount) || 0;
    if (minAmount != null && amount < minAmount) return false;
    if (maxAmount != null && amount > maxAmount) return false;
    return true;
  });
  const downloadTotal = downloadRows.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

  // Told rather than silently returning nothing: an inverted range is a typo, and
  // an empty sheet is an ambiguous way to report one.
  const rangeError =
    downloadFilters.from && downloadFilters.to && downloadFilters.from > downloadFilters.to
      ? 'The From date is after the To date.'
      : minAmount != null && maxAmount != null && minAmount > maxAmount
        ? 'The minimum amount is above the maximum.'
        : '';

  // The span the recorded amounts actually cover, so the two boxes below are
  // typed against real figures instead of guessed at.
  const amounts = filteredExpenses.map(e => Number(e.amount) || 0);
  const lowestAmount = amounts.length ? Math.min(...amounts) : 0;
  const highestAmount = amounts.length ? Math.max(...amounts) : 0;

  const clearDownloadFilters = () => setDownloadFilters({ from: '', to: '', min: '', max: '' });

  const handleDownloadRecords = async () => {
    if (downloading || rangeError) return;
    setDownloading(true);
    try {
      // Same source the financial sheets read the letterhead from.
      let schoolInfo: { name: string; logo?: string; motto?: string; academicYear?: string } | undefined;
      try {
        const userStr = window.localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user?.School?.[0]) schoolInfo = user.School[0];
        }
      } catch {}
      await generateExpenseRecords(
        downloadRows,
        {
          from: downloadFilters.from || undefined,
          to: downloadFilters.to || undefined,
          minAmount,
          maxAmount,
          category: filterCategory,
          search: searchTerm,
        },
        schoolInfo,
      );
      setOpenDownload(false);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl mb-2">Expenses Management</h1>
          <p className="text-gray-600">Track and manage school expenses</p>
        </div>
        <div className="flex gap-2">
        {/* Download first, Add Expense last: the primary action keeps the end of
            the row, and the two read left to right as read-then-write. */}
        <Dialog open={openDownload} onOpenChange={setOpenDownload}>
          <DialogTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <Download size={20} />
              Download Records
            </Button>
          </DialogTrigger>
          {/* maxWidth INLINE, not className="max-w-2xl".

              className="max-w-2xl" DOES NOT GIVE 42rem HERE, which is why this is
              inline. DialogContent merges its classes through cn() -> tailwind-merge,
              and that does two things to a caller''s max-w:

                - it drops the base max-w-[calc(100%-2rem)], the phone gutter, because
                  a caller max-w-* is the same utility group and wins. The dialog then
                  sits edge to edge on a phone.
                - it KEEPS the base sm:max-w-lg, because an sm: variant is a different
                  group. That rule is inside @media (width >= 40rem) and sits later in
                  the frozen src/index.css, so from 640px up it beats max-w-2xl and the
                  dialog renders 32rem, not the 42rem the class asked for.

              sm:max-w-2xl would fix the merge but not this stylesheet: index.css is a
              pre-compiled build and .sm:max-w-2xl was never compiled into it, so it
              styles nothing and the gutter class becomes the only cap left — a dialog
              1rem shy of the whole window. An inline maxWidth beats every class, needs
              nothing to have been compiled, and states the gutter and the cap in one
              declaration. It is what 14 dialogs in this repo already do. */}
          <DialogContent style={{ maxWidth: 'min(42rem, calc(100vw - 2rem))' }}>
            {/* Right padding clears the close button, which DialogContent pins at
                top-4 right-4. The header centres its text below 640px, so without
                this the title runs under the X on a narrow phone. Same allowance
                PayFeesDialog''s HEAD makes. */}
            <DialogHeader style={{ paddingRight: '1.5rem' }}>
              <DialogTitle>Download Expense Records</DialogTitle>
              <DialogDescription>
                A landscape PDF of the expense table. Narrow it by date and by amount, or leave the
                boxes empty to take everything currently listed.
              </DialogDescription>
            </DialogHeader>
            {/* The one scrolling child: DialogContent is a capped flex column, so
                without this the summary and the buttons below are what a short
                viewport pushes off the bottom.

                'auto' BASIS, NOT 0 — the same trap PayFeesDialog's BODY documents.
                DialogContent has no definite height, only a max-height, so a 0 basis
                means this middle contributes nothing to the intrinsic height: the box
                shrink-wraps to header + buttons and every field in here collapses to a
                bare underline. An 'auto' basis grows to the content and then shrinks
                under the cap, which is what min-height: 0 is here to permit.

                INLINE AND NOT min-h-0 flex-auto overflow-y-auto: of those three,
                only .overflow-y-auto is in src/index.css. .min-h-0 and .flex-auto
                were never compiled into this frozen build, so the class version
                would silently drop BOTH the auto basis and the min-height — and
                min-height: auto is the one that stops a flex item shrinking below
                its content, so the dialog would grow past its cap and push the
                buttons off a short screen instead of scrolling. */}
            <div className="grid gap-4 py-4" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
              {/* WRAPS ON ITS OWN, no sm: variant involved — src/index.css is a frozen
                  pre-compiled build where some responsive variants simply are not there.
                  auto-fit drops to one column as soon as two 200px tracks stop fitting,
                  which is what a phone gives this dialog; min(100%, 200px) keeps the
                  floor from overflowing a viewport narrower than the floor itself.
                  200 rather than less because each of these is three dropdowns. */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem' }}>
                <div>
                  <Label>From</Label>
                  <ThreePartDateInput
                    value={downloadFilters.from}
                    onChange={v => setDownloadFilters(f => ({ ...f, from: v ?? '' }))}
                    aria-label="Records from date"
                  />
                </div>
                <div>
                  <Label>To</Label>
                  <ThreePartDateInput
                    value={downloadFilters.to}
                    onChange={v => setDownloadFilters(f => ({ ...f, to: v ?? '' }))}
                    aria-label="Records to date"
                  />
                </div>
              </div>
              <div>
                <Label>Amount (FCFA)</Label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '1rem' }}>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Minimum"
                    value={downloadFilters.min}
                    onChange={e => setDownloadFilters(f => ({ ...f, min: e.target.value }))}
                    aria-label="Minimum amount"
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Maximum"
                    value={downloadFilters.max}
                    onChange={e => setDownloadFilters(f => ({ ...f, max: e.target.value }))}
                    aria-label="Maximum amount"
                  />
                </div>
                <p className="text-xs text-gray-500" style={{ marginTop: 4 }}>
                  {filteredExpenses.length
                    ? `Recorded amounts run from ${lowestAmount.toLocaleString()} to ${highestAmount.toLocaleString()} FCFA. Either box may be left empty.`
                    : 'Either box may be left empty.'}
                </p>
              </div>

              {/* What is about to be printed, counted before the button is pressed —
                  including the page filters, which narrow the sheet just as much as
                  the two above and are the easy ones to forget are still on. */}
              <div className="text-sm text-gray-600" style={{ borderTop: '1px solid #E5E7EB', paddingTop: '0.75rem' }}>
                <p>
                  <strong>{downloadRows.length}</strong> of {filteredExpenses.length} record{filteredExpenses.length === 1 ? '' : 's'}
                  {' '}·{' '}Total <strong>{downloadTotal.toLocaleString()}</strong> FCFA
                </p>
                {(searchTerm || filterCategory !== 'all') && (
                  <p className="text-xs text-gray-500" style={{ marginTop: 2 }}>
                    The page filters apply too —
                    {filterCategory !== 'all' ? ` category "${filterCategory}"` : ''}
                    {filterCategory !== 'all' && searchTerm ? ',' : ''}
                    {searchTerm ? ` search "${searchTerm}"` : ''}.
                  </p>
                )}
              </div>

              {rangeError && <p className="text-sm text-red-600">{rangeError}</p>}
            </div>
            <div className="flex justify-end gap-2" style={{ flexWrap: 'wrap' }}>
              <Button
                variant="outline"
                onClick={clearDownloadFilters}
                disabled={downloading || !(downloadFilters.from || downloadFilters.to || downloadFilters.min || downloadFilters.max)}
              >
                Clear
              </Button>
              <DialogClose asChild>
                <Button variant="outline" disabled={downloading}>Cancel</Button>
              </DialogClose>
              <Button
                onClick={handleDownloadRecords}
                disabled={downloading || !!rangeError || downloadRows.length === 0}
                className="flex items-center gap-2"
              >
                <Download size={16} />
                {downloading ? 'Preparing...' : 'Download PDF'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={openAdd} onOpenChange={setOpenAdd}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus size={20} />
              Add Expense
            </Button>
          </DialogTrigger>
          {/* Inline for the reason the download dialog above spells out: max-w-2xl
              alone renders 32rem from 640px up and loses the phone gutter. */}
          <DialogContent style={{ maxWidth: 'min(42rem, calc(100vw - 2rem))' }}>
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
                      {PAYMENT_METHODS.map(m => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
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
            {/* The headings stay; only the rows wait. */}
            {expensesLoading && <TableLoader colSpan={8} />}
            {!expensesLoading && filteredExpenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>{dateOnly(expense.date)}</TableCell>
                <TableCell>{expense.invoiceNumber}</TableCell>
                <TableCell>{expense.category}</TableCell>
                <TableCell>{expense.description}</TableCell>
                <TableCell>{expense.payee}</TableCell>
                <TableCell>{expense.amount.toLocaleString()}</TableCell>
                <TableCell>{formatPaymentMethod(expense.paymentMethod)}</TableCell>
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
