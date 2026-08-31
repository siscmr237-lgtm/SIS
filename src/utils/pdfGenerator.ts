import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Expense, Student, Staff, ReportCard, WorkRecord, TimetableEntry, AttendanceRecord, TestExamBreakdownSubject } from '../types';
import { BASE_URL } from '../lib/api';
import { formatTermLabel } from './academicTerm';
import { dateOnly, todayIso } from './dateOnly';
import { formatPaymentMethod } from './paymentMethods';

const SCHOOL_INFO = {
  name: 'École Primaire et Maternelle',
  address: 'Yaoundé, Cameroon',
  phone: '+237 670 000 000',
  email: 'info@school.cm'
};

export function generateExpenseInvoice(expense: Expense) {
  const doc = new jsPDF();
  
  // Header
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(SCHOOL_INFO.name, 105, 15, { align: 'center' });
  doc.setFontSize(10);
  doc.text(SCHOOL_INFO.address, 105, 22, { align: 'center' });
  doc.text(`Tel: ${SCHOOL_INFO.phone} | Email: ${SCHOOL_INFO.email}`, 105, 28, { align: 'center' });
  
  // Title
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.text('EXPENSE INVOICE', 105, 50, { align: 'center' });
  
  // Invoice details
  doc.setFontSize(10);
  doc.text(`Invoice No: ${expense.invoiceNumber}`, 20, 65);
  doc.text(`Date: ${dateOnly(expense.date)}`, 20, 72);
  doc.text(`Payment Method: ${formatPaymentMethod(expense.paymentMethod)}`, 20, 79);
  
  // Expense details
  autoTable(doc, {
    startY: 90,
    head: [['Field', 'Details']],
    body: [
      ['Category', expense.category],
      ['Payee', expense.payee],
      ['Description', expense.description],
      ['Amount', `${expense.amount.toLocaleString()} FCFA`]
    ],
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235] }
  });
  
  // Footer
  const finalY = (doc as any).lastAutoTable.finalY + 20;
  doc.setFontSize(9);
  doc.text('This is a computer-generated expense record.', 105, finalY, { align: 'center' });
  
  doc.save(`Expense_${expense.invoiceNumber}.pdf`);
}

export function generateTimetable(timetable: TimetableEntry[], className: string) {
  const doc = new jsPDF('l', 'mm', 'a4');
  
  // Header
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 297, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(SCHOOL_INFO.name, 148.5, 15, { align: 'center' });
  doc.setFontSize(16);
  doc.text(`Class Timetable - ${className}`, 148.5, 28, { align: 'center' });
  
  // Group by day
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const tableData = days.map(day => {
    const dayEntries = timetable.filter(entry => entry.day === day);
    return [
      day,
      ...dayEntries.map(entry => `${entry.time}\n${entry.subject}\n(${entry.teacher})`).join('\n\n')
    ];
  });
  
  doc.setTextColor(0, 0, 0);
  autoTable(doc, {
    startY: 50,
    head: [['Day', 'Schedule']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235] },
    styles: { cellPadding: 5, fontSize: 10 }
  });
  
  doc.save(`Timetable_${className}.pdf`);
}

export function generateAttendanceSheet(date: string, className: string, students: Student[]) {
  const doc = new jsPDF();
  
  // Header
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(SCHOOL_INFO.name, 105, 15, { align: 'center' });
  doc.setFontSize(14);
  doc.text(`Attendance Sheet - ${className}`, 105, 25, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`Date: ${date}`, 105, 32, { align: 'center' });
  
  // Attendance table
  doc.setTextColor(0, 0, 0);
  const tableData = students.map((student, index) => [
    (index + 1).toString(),
    student.id,
    `${student.firstName} ${student.lastName}`,
    '', // Present checkbox
    '', // Absent checkbox
    '', // Late checkbox
    '' // Remarks
  ]);
  
  autoTable(doc, {
    startY: 50,
    head: [['No.', 'Student ID', 'Name', 'Present', 'Absent', 'Late', 'Remarks']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 9 },
    columnStyles: {
      3: { cellWidth: 15 },
      4: { cellWidth: 15 },
      5: { cellWidth: 15 }
    }
  });
  
  doc.save(`Attendance_${className}_${date}.pdf`);
}

// Fallback for legacy public URLs — browser-side fetch
async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string | null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Routes storage-path logos through the backend (avoids browser CORS on private bucket).
// Falls back to browser fetch for legacy plain URLs.
async function getLogoDataUrl(logo: string): Promise<string | null> {
  if (logo.startsWith('schools/')) {
    try {
      const token = typeof window !== 'undefined'
        ? window.localStorage.getItem('auth_token')
        : null;
      const res = await fetch(
        `${BASE_URL}/upload/image-data?path=${encodeURIComponent(logo)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) return null;
      const { dataUrl } = await res.json();
      return dataUrl || null;
    } catch {
      return null;
    }
  }
  return loadImageAsDataUrl(logo);
}

/**
 * splitTextToSize, but a word wider than the line gets broken instead of
 * overflowing. jsPDF only breaks at spaces, so a run-on name with no space in
 * it would otherwise sail straight off the band.
 */
function wrapToWidth(doc: jsPDF, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const line of doc.splitTextToSize(text, maxWidth) as string[]) {
    let rest = line;
    while (rest.length > 1 && doc.getTextWidth(rest) > maxWidth) {
      let cut = rest.length;
      while (cut > 1 && doc.getTextWidth(rest.slice(0, cut)) > maxWidth) cut -= 1;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    if (rest) out.push(rest);
  }
  return out.length ? out : [text];
}

/** `text` cut down until it plus an ellipsis fits `maxWidth`. */
function withEllipsis(doc: jsPDF, text: string, maxWidth: number): string {
  let cut = text.length;
  while (cut > 0 && doc.getTextWidth(`${text.slice(0, cut).trimEnd()}...`) > maxWidth) cut -= 1;
  return `${text.slice(0, cut).trimEnd()}...`;
}

/**
 * The school name across the top of a header band — centred on the page, and
 * kept clear of the logo.
 *
 * A long name used to run straight through the logo in the corner. `maxWidth`
 * is the band minus BOTH corners — the logo's, and its mirror on the other
 * side — so the name stays centred on the PAGE rather than on whatever space is
 * left over beside the logo. A name too wide for that shrinks slightly, then
 * wraps; only one too long even for `maxLines` lines is ellipsised, because at
 * that point the band has no room left for the motto and the title under it.
 *
 * The block is centred vertically on `y`: one line draws exactly where the
 * caller asked, and a second grows half a line up and half a line down rather
 * than pushing everything below it out of the band. Returns the baseline of the
 * LAST line, so the motto and the lines under it keep flowing from wherever the
 * name actually ended.
 */
function drawSchoolName(
  doc: jsPDF,
  name: string | undefined | null,
  opts: {
    centerX: number;
    y: number;
    maxWidth: number;
    fontSize: number;
    minFontSize?: number;
    maxLines?: number;
  },
): number {
  const { centerX, y, maxWidth, fontSize } = opts;
  const minFontSize = opts.minFontSize ?? fontSize * 0.72;
  const maxLines = opts.maxLines ?? 2;
  const text = (name ?? '').trim() || 'School';

  doc.setFont('helvetica', 'bold');

  // One line at the asked-for size is the best outcome; a slight shrink keeps a
  // moderately long name on one line; only past that does it wrap, because two
  // lines cost the band vertical space the motto and title also want.
  let size = fontSize;
  let lines: string[];
  doc.setFontSize(size);
  while (size > fontSize * 0.9 && doc.getTextWidth(text) > maxWidth) {
    size -= 0.5;
    doc.setFontSize(size);
  }

  if (doc.getTextWidth(text) > maxWidth) {
    size = Math.max(fontSize * 0.85, minFontSize);
    doc.setFontSize(size);
    lines = wrapToWidth(doc, text, maxWidth);
    while (lines.length > maxLines && size > minFontSize) {
      size = Math.max(size - 0.5, minFontSize);
      doc.setFontSize(size);
      lines = wrapToWidth(doc, text, maxWidth);
    }
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = withEllipsis(doc, lines[maxLines - 1], maxWidth);
    }
  } else {
    lines = [text];
  }

  // Points to millimetres, tightened: a heading's own lines sit closer together
  // than body copy, and the band is not deep enough for a full 1.15 leading.
  const lineGap = size * 0.42;
  const firstY = y - ((lines.length - 1) * lineGap) / 2;
  lines.forEach((line, i) => {
    doc.text(line, centerX, firstY + i * lineGap, { align: 'center' });
  });

  doc.setFont('helvetica', 'normal');
  return firstY + (lines.length - 1) * lineGap;
}

/**
 * True on phones and tablets.
 *
 * A blob: URL opened in a new tab renders in the browser's own inline PDF
 * viewer. On desktop that viewer has a download button; on mobile it generally
 * does not, so the user is left looking at a sheet they cannot keep. Touch
 * devices get a real file download instead.
 *
 * `(hover: none) and (pointer: coarse)` is the pair that means touch-only — a
 * touchscreen laptop is coarse but still hovers, and a narrow desktop window is
 * neither, so viewport width would be the wrong signal here. The userAgent test
 * is a fallback for browsers that report neither media feature.
 */
function isTouchOnlyDevice(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return true;
  } catch {}
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Hand a finished document to the user: a download on touch devices, a new tab
 * on desktop where the inline viewer is the nicer read.
 *
 * The desktop branch falls back to a download when the tab does not open.
 * Generators that await a logo fetch first have left the user-gesture window by
 * the time they call this, which is exactly what popup blockers suppress, and a
 * blocked tab is otherwise a button that silently does nothing.
 */
function deliverPdf(doc: jsPDF, filename: string) {
  if (isTouchOnlyDevice()) {
    doc.save(filename);
    return;
  }
  const opened = window.open(doc.output('bloburl'), '_blank');
  if (!opened) doc.save(filename);
}

/**
 * Filesystem-safe filename fragment: no separators, no run of underscores.
 *
 * Letters are matched by Unicode property, not \w, so accented names survive —
 * "Étienne" is a name here, and "_tienne.pdf" would be a bug with a real
 * student's name in it.
 */
function pdfNamePart(value: string): string {
  return value.replace(/[^\p{L}\p{N}.-]+/gu, '_').replace(/^_+|_+$/g, '') || 'Unknown';
}

interface LedgerPdfEntry {
  type: 'CHARGE' | 'PAYMENT';
  description: string;
  amount: number;
  entryDate: string;
  paymentMethod?: string | null;
  /** "2026/2027-0042". Payments only; null on every charge. */
  receiptNumber?: string | null;
  category?: { name: string } | null;
  /**
   * WHICH FEE this row is for, resolved server-side.
   *
   * NOT the same thing as `category`. That is the ChargeCategory relation, and a
   * fee payment does not use it: POST /ledger/payment writes categoryId: null on
   * purpose and records the fee in one of classLevelFeeId / studentFeeOverrideId /
   * settlesEntryId instead. So a Category column reading category?.name got null
   * for every payment and printed a dash down the whole sheet. GET
   * /ledger/student/:id now resolves the name through feeKeyOf() and sends it here.
   */
  feeName?: string | null;
}

/**
 * One class's register over a date range.
 *
 * Landscape, because a range is a grid of days and portrait runs out of width
 * after a fortnight. Days are chunked across pages rather than squeezed: a tick
 * nobody can read is worse than a second page.
 *
 * A cell is one of three things, and they are deliberately distinguishable in
 * print as well as on screen — P present, A absent, and a dash for a day nobody
 * took the register, which is NOT an absence.
 */
export function generateClassAttendanceSheet(sheet: {
  className: string;
  academicYear?: string | null;
  term?: string | null;
  from: string;
  to: string;
  days: string[];
  students: Array<{
    studentId: string;
    firstName: string;
    lastName: string;
    cells: Array<{ date: string; present: boolean | null }>;
    present: number;
    recorded: number;
    percentage: number | null;
    label: string;
  }>;
}) {
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFillColor(15, 35, 69);
  doc.rect(0, 0, 297, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('Attendance Register', 14, 13);
  doc.setFontSize(10);
  doc.text(
    [sheet.className, sheet.term, sheet.academicYear].filter(Boolean).join('  ·  '),
    14, 21,
  );
  doc.text(
    sheet.from === sheet.to ? sheet.from : `${sheet.from}  to  ${sheet.to}`,
    283, 21, { align: 'right' },
  );

  // A day column needs about 7mm to stay legible; the name and summary columns
  // take the rest. Beyond that the range is split across pages.
  const PER_PAGE = 24;
  const chunks: string[][] = [];
  for (let i = 0; i < sheet.days.length; i += PER_PAGE) chunks.push(sheet.days.slice(i, i + PER_PAGE));
  if (!chunks.length) chunks.push([]);

  chunks.forEach((chunk, page) => {
    if (page > 0) doc.addPage();
    const head = ['#', 'Student', ...chunk.map((d) => d.slice(8)), '%'];
    const body = sheet.students.map((s, i) => {
      const byDate = new Map(s.cells.map((c) => [c.date, c.present]));
      return [
        String(i + 1),
        `${s.firstName} ${s.lastName}`,
        ...chunk.map((d) => {
          const v = byDate.get(d);
          return v === true ? 'P' : v === false ? 'A' : '–';
        }),
        s.percentage == null ? '–' : `${s.percentage}%`,
      ];
    });

    autoTable(doc, {
      head: [head],
      body,
      startY: page === 0 ? 36 : 14,
      styles: { fontSize: 7, cellPadding: 1.5, halign: 'center' },
      headStyles: { fillColor: [15, 35, 69], fontSize: 7 },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 46, halign: 'left' } },
      // Which month the day numbers belong to, since the header shows only DD.
      didDrawPage: () => {
        if (chunk.length) {
          doc.setTextColor(120, 120, 120);
          doc.setFontSize(7);
          doc.text(`Days ${chunk[0]} to ${chunk[chunk.length - 1]}`, 14, page === 0 ? 34 : 12);
          doc.setTextColor(0, 0, 0);
        }
      },
    });
  });

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('P present · A absent · – no register taken that day', 14, doc.internal.pageSize.getHeight() - 8);

  window.open(doc.output('bloburl'), '_blank');
}

/**
 * One student's own attendance over a range, with the per-term consistency
 * verdict the report card uses. Portrait: a single student is a list, not a grid.
 */
export function generateStudentAttendanceSheet(sheet: {
  studentName: string;
  studentId: string;
  className?: string | null;
  academicYear?: string | null;
  term?: string | null;
  from: string;
  to: string;
  rows: Array<{ date: string; present: boolean | null }>;
  present: number;
  recorded: number;
  percentage: number | null;
  label: string;
}) {
  const doc = new jsPDF();

  doc.setFillColor(15, 35, 69);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('Attendance', 14, 13);
  doc.setFontSize(10);
  doc.text(`${sheet.studentName}  (${sheet.studentId})`, 14, 21);
  doc.text(
    [sheet.className, sheet.term, sheet.academicYear].filter(Boolean).join('  ·  '),
    14, 27,
  );

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(
    sheet.from === sheet.to ? `Date: ${sheet.from}` : `From ${sheet.from} to ${sheet.to}`,
    14, 42,
  );
  doc.text(
    sheet.percentage == null
      ? 'No register taken in this period'
      : `Present ${sheet.present} of ${sheet.recorded} recorded days — ${sheet.percentage}% (${sheet.label})`,
    14, 48,
  );

  autoTable(doc, {
    head: [['Date', 'Status']],
    // Only days that were actually recorded: a day nobody took the register is
    // not an absence, and listing it as a blank row would imply it was.
    body: sheet.rows
      .filter((r) => r.present !== null)
      .map((r) => [r.date, r.present ? 'Present' : 'Absent']),
    startY: 54,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [15, 35, 69] },
  });

  window.open(doc.output('bloburl'), '_blank');
}

export async function generateFinancialSheet(
  student: Student,
  ledgerData: { entries: LedgerPdfEntry[]; totalCharged: number; totalPaid: number; balance: number },
  schoolInfo?: { name: string; logo?: string; motto?: string; academicYear?: string }
) {
  const doc = new jsPDF();

  const HEADER_H = 52;

  // Header background
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, HEADER_H, 'F');

  // Logo — left corner, vertically centred within the heading band.
  if (schoolInfo?.logo) {
    const dataUrl = await getLogoDataUrl(schoolInfo.logo);
    if (dataUrl) {
      try {
        const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        const size = 30;
        doc.addImage(dataUrl, fmt, 8, (HEADER_H - size) / 2, size, size);
      } catch {}
    }
  }

  doc.setTextColor(255, 255, 255);

  // School name, motto and academic year stack down the centre. The cursor
  // moves only for lines that actually render, so a school with no motto gets
  // a tight block rather than a gap where the motto would have been.
  // 8mm of margin + the 30mm logo + 4mm of air, mirrored on the right so the
  // name is centred on the page and still cannot reach the logo.
  let headY = drawSchoolName(doc, schoolInfo?.name ?? SCHOOL_INFO.name, {
    centerX: 105,
    y: 16,
    maxWidth: schoolInfo?.logo ? 210 - 2 * 42 : 182,
    fontSize: 18,
  });

  const motto = schoolInfo?.motto?.trim();
  if (motto) {
    headY += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text(motto, 105, headY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
  }

  if (schoolInfo?.academicYear) {
    headY += 7;
    doc.setFontSize(9);
    doc.text(`Academic Year: ${schoolInfo.academicYear}`, 105, headY, { align: 'center' });
  }

  // Document title — centered
  doc.setFontSize(13);
  doc.text('Individual Financial Sheet', 105, 44, { align: 'center' });

  // Student info — one row, and no heading above it.
  //
  // The heading said nothing the three labelled values did not already say, and
  // stacking them cost three lines of vertical space before the table started.
  //
  // Fixed x positions rather than measured-and-spaced, so the three columns land
  // in the same place on every sheet whatever the name happens to be. Name gets
  // the 90mm to Class because it is the one value with no bound on its length.
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`Student Name: ${student.firstName} ${student.lastName}`, 20, 62);
  doc.text(`Class: ${student.class}`, 110, 62);
  doc.text(`Student ID: ${student.id}`, 155, 62);

  const { entries, totalCharged, totalPaid, balance } = ledgerData;

  // Payments only. Charges are already summarised in the totals row below, and
  // a sheet a parent reads is a record of what was paid — so a student with no
  // payments gets an empty table rather than a list of what they owe.
  const payments = entries.filter((entry) => entry.type === 'PAYMENT');

  let cursorY: number;

  if (payments.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(150, 150, 150);
    doc.text('No payment records found for this student.', 105, 86, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    cursorY = 91;
  } else {
    autoTable(doc, {
      // 95 was chosen when a three-line student block ended at y=84. That block
      // is one line at y=62 now, so the table starts where it used to leave a gap.
      startY: 74,
      // RECEIPT FIRST. This sheet is what the office hands over or emails, and
      // the number is the thing a parent will later be asked to quote — so it
      // leads the row rather than trailing four columns behind the date.
      head: [['Receipt', 'Date', 'Fee', 'Payment Type', 'Amount (FCFA)']],
      body: payments.map((entry) => [
        // Every row here is a payment, so a dash means a payment recorded before
        // numbering existed and never backfilled — worth showing as absent
        // rather than blank, so nobody reads it as a printing fault.
        entry.receiptNumber ?? '—',
        new Date(entry.entryDate).toLocaleDateString('en-GB'),
        // feeName, NOT category?.name — see LedgerPdfEntry.feeName for why the
        // latter was null on every payment and printed a dash down the column.
        // The dash is still the fallback, for a payment genuinely recorded
        // before payments named the fee they settle.
        entry.feeName ?? entry.category?.name ?? '—',
        entry.paymentMethod ?? '—',
        entry.amount.toLocaleString(),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 9 },
      margin: { left: 15, right: 15 },
      columnStyles: {
        // 180mm of content width, shared out again now there are five columns:
        // the receipt number needs 34 for "2026/2027-0042" without wrapping, and
        // Fee and Payment Type give it up because both are short in practice.
        0: { cellWidth: 34 },
        1: { cellWidth: 26 },
        2: { cellWidth: 48 },
        3: { cellWidth: 38 },
        4: { cellWidth: 34, halign: 'right' },
      },
    });
    cursorY = (doc as any).lastAutoTable.finalY;
  }

  // The three totals sit side by side in one row, each column an even third of
  // the 180mm content width.
  autoTable(doc, {
    startY: cursorY + 12,
    head: [['Total Charged', 'Total Paid', 'Balance Owed']],
    body: [[
      `${totalCharged.toLocaleString()} FCFA`,
      `${totalPaid.toLocaleString()} FCFA`,
      `${balance.toLocaleString()} FCFA`,
    ]],
    theme: 'grid',
    // ROW HEIGHT MATCHES THE RECORDS TABLE, which is what fontSize and
    // cellPadding between them decide. The records table above sets only
    // fontSize: 9 and takes autoTable's default padding, so this one says the
    // same and says nothing about padding — an explicit cellPadding: 3 here was
    // the reason these rows stood taller than every row above them.
    styles: { fontSize: 9, halign: 'center' },
    // Grey, not the header blue. These are totals derived from the table above,
    // not a second table of their own, and a second band of the same strong blue
    // read as a competing heading.
    headStyles: { fillColor: [107, 114, 128], halign: 'center' },
    margin: { left: 15, right: 15 },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 60 },
      2: { cellWidth: 60 },
    },
  });

  const studentName = pdfNamePart(`${student.firstName} ${student.lastName}`);
  deliverPdf(doc, `Financial_Sheet_${studentName}.pdf`);
}

export async function generateStaffFinancialSheet(
  staff: Staff,
  ledgerData: { entries: LedgerPdfEntry[]; totalCharged: number; totalPaid: number; balance: number },
  schoolInfo?: { name: string; logo?: string; motto?: string; academicYear?: string }
) {
  const doc = new jsPDF();

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, 52, 'F');

  if (schoolInfo?.logo) {
    const dataUrl = await getLogoDataUrl(schoolInfo.logo);
    if (dataUrl) {
      try {
        const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(dataUrl, fmt, 8, 6, 30, 30);
      } catch {}
    }
  }

  doc.setTextColor(255, 255, 255);

  // Same corner reservation as the student sheet, and the motto flows from
  // where the name ended rather than from a fixed y, so a wrapped name pushes
  // it down instead of being written over.
  let headY = drawSchoolName(doc, schoolInfo?.name ?? SCHOOL_INFO.name, {
    centerX: 105,
    y: 15,
    maxWidth: schoolInfo?.logo ? 210 - 2 * 42 : 182,
    fontSize: 18,
  });

  const motto = schoolInfo?.motto?.trim();
  if (motto) {
    headY += 8;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text(motto, 105, headY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
  }

  if (schoolInfo?.academicYear) {
    doc.setFontSize(9);
    doc.text(`Academic Year: ${schoolInfo.academicYear}`, 195, 33, { align: 'right' });
  }

  doc.setFontSize(13);
  doc.text('Staff Financial Sheet', 105, 44, { align: 'center' });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.text('Staff Information', 20, 62);
  doc.setFontSize(10);
  doc.text(`Name: ${staff.firstName} ${staff.lastName}`, 20, 70);
  // Role moves up into the row the staff code used to occupy. These y values are
  // absolute millimetres, so deleting a line without closing the gap would leave
  // a blank band above the table rather than a tighter block.
  doc.text(`Role: ${staff.isTeacher ? 'Teacher' : staff.role}`, 20, 77);

  const { entries, totalCharged, totalPaid, balance } = ledgerData;

  if (entries.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(150, 150, 150);
    doc.text('No financial records found for this staff member.', 105, 107, { align: 'center' });
  } else {
    const tableData = entries.map(entry => [
      new Date(entry.entryDate).toLocaleDateString('en-GB'),
      entry.type === 'CHARGE' ? 'Charge' : 'Payment',
      entry.category?.name ?? '—',
      entry.description,
      `${entry.amount.toLocaleString()} FCFA`,
    ]);

    autoTable(doc, {
      startY: 95,
      head: [['Date', 'Type', 'Category', 'Description', 'Amount (FCFA)']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 22 },
        2: { cellWidth: 32 },
        4: { cellWidth: 30, halign: 'right' },
      },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 8,
      body: [
        ['Total Charged', `${totalCharged.toLocaleString()} FCFA`],
        ['Total Paid',    `${totalPaid.toLocaleString()} FCFA`],
        ['Balance Owed',  `${balance.toLocaleString()} FCFA`],
      ],
      theme: 'plain',
      styles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 60, fontStyle: 'bold' },
        1: { cellWidth: 60, halign: 'right' },
      },
      margin: { left: 110 },
    });
  }

  const url = doc.output('bloburl');
  window.open(url, '_blank');
}

/** One assessment's line within a subject, for one term. */
export interface ReportCardAssessment {
  name: string;
  state: string;
  marksObtained: number | null;
  totalMarks: number | null;
}

export interface ReportCardSubject {
  subjectId: number;
  subjectName: string;
  marksObtained: number;
  totalMarks: number;
  counted: number;
  exempt: number;
  unmarked: number;
  testExams: ReportCardAssessment[];
}

export interface ReportCardData {
  student: { code: string; firstName: string; lastName: string; class?: string | null };
  academicYear: string;
  terms: string[];
  termData: Array<{ term: string; subjects: ReportCardSubject[] }>;
  attendance: Array<{ term: string; percentage: number | null; label: string; consistent: boolean | null }>;
}

/**
 * The overall verdict.
 *
 * Computed on the student's combined percentage across every selected term, from
 * the same obtained/possible pair the rest of the app scores on — which already
 * excludes EXEMPT assessments from BOTH sides, so an excused paper neither adds
 * a zero nor inflates the denominator. Term-end zeros are real marks and count.
 *
 * Null when nothing counted: a student with no marks in the selected terms has
 * no result, and printing FAILED against them would assert something the marks
 * do not say.
 */
export function reportCardResult(obtained: number, possible: number) {
  if (!possible) return { percentage: null as number | null, result: 'NO RESULT', color: [107, 114, 128] as [number, number, number] };
  const percentage = Math.round((obtained / possible) * 1000) / 10;
  if (percentage >= 60) return { percentage, result: 'PASSED', color: [5, 96, 61] as [number, number, number] };
  if (percentage >= 40) return { percentage, result: 'AVERAGE', color: [230, 196, 130] as [number, number, number] };
  return { percentage, result: 'FAILED', color: [224, 85, 46] as [number, number, number] };
}

/**
 * Report cards as one document — a page per student, so a single card and a
 * whole class share one code path and cannot render differently.
 *
 * Opened in a new tab via a blob URL, the same as the financial sheet.
 */
export async function generateReportCards(
  cards: ReportCardData[],
  schoolInfo?: { name?: string; logo?: string; motto?: string },
) {
  const doc = new jsPDF();
  const logo = schoolInfo?.logo ? await getLogoDataUrl(schoolInfo.logo) : null;

  cards.forEach((card, index) => {
    if (index > 0) doc.addPage();

    doc.setFillColor(15, 35, 69);
    doc.rect(0, 0, 210, 46, 'F');

    if (logo) {
      const fmt = logo.includes('image/png') ? 'PNG' : 'JPEG';
      try { doc.addImage(logo, fmt, 8, 6, 26, 26); } catch { /* a bad logo must not lose the card */ }
    }

    // Centred on the page rather than butted up against the logo: 8mm of
    // margin + the 26mm logo + 4mm of air, reserved on both sides.
    doc.setTextColor(255, 255, 255);
    let headY = drawSchoolName(doc, schoolInfo?.name, {
      centerX: 105,
      y: 15,
      maxWidth: logo ? 210 - 2 * 38 : 182,
      fontSize: 15,
    });
    if (schoolInfo?.motto) {
      headY += 6;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text(schoolInfo.motto, 105, headY, { align: 'center' });
      doc.setFont('helvetica', 'normal');
    }
    doc.setFontSize(12);
    doc.text('STUDENT REPORT CARD', 105, 32, { align: 'center' });
    doc.setFontSize(9);
    doc.text(
      `Academic Year ${card.academicYear}  ·  ${card.terms.map(formatTermLabel).join(', ')}`,
      105, 39, { align: 'center' },
    );

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.text(`${card.student.firstName} ${card.student.lastName}`, 14, 56);
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.text(
      [card.student.code, card.student.class].filter(Boolean).join('  ·  '),
      14, 62,
    );
    doc.setTextColor(0, 0, 0);

    let y = 70;
    let grandObtained = 0;
    let grandPossible = 0;

    for (const block of card.termData) {
      // Columns are this term's assessments, so a term with a different set
      // prints its own shape rather than being forced into a shared grid.
      const assessmentNames: string[] = [];
      for (const s of block.subjects) {
        for (const t of s.testExams) if (!assessmentNames.includes(t.name)) assessmentNames.push(t.name);
      }

      const body = block.subjects.map((s) => {
        grandObtained += s.marksObtained;
        grandPossible += s.totalMarks;
        const cells = assessmentNames.map((n) => {
          const t = s.testExams.find((x) => x.name === n);
          if (!t) return '–';
          if (t.state === 'EXEMPT') return 'Ex';
          if (t.marksObtained == null) return '–';
          return `${t.marksObtained}${t.totalMarks != null ? `/${t.totalMarks}` : ''}`;
        });
        const pct = s.totalMarks > 0 ? `${Math.round((s.marksObtained / s.totalMarks) * 1000) / 10}%` : '–';
        return [s.subjectName, ...cells, `${s.marksObtained}/${s.totalMarks}`, pct];
      });

      doc.setFontSize(10);
      doc.text(formatTermLabel(block.term), 14, y);
      y += 2;

      autoTable(doc, {
        head: [['Subject', ...assessmentNames, 'Total', '%']],
        body: body.length ? body : [['No marks recorded for this term', ...assessmentNames.map(() => ''), '', '']],
        startY: y,
        styles: { fontSize: 8, cellPadding: 1.6 },
        headStyles: { fillColor: [15, 35, 69], fontSize: 8 },
        columnStyles: { 0: { cellWidth: 46 } },
        margin: { left: 14, right: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Attendance, per term, from the same endpoint the app shows on screen.
    const att = card.attendance.filter((a) => card.terms.includes(a.term));
    doc.setFontSize(9);
    doc.text('Attendance', 14, y);
    y += 5;
    for (const a of att) {
      doc.setTextColor(90, 90, 90);
      doc.text(
        a.percentage == null
          ? `${formatTermLabel(a.term)}: no register taken`
          : `${formatTermLabel(a.term)}: ${a.percentage}% — ${a.label}`,
        18, y,
      );
      y += 5;
    }
    doc.setTextColor(0, 0, 0);

    const verdict = reportCardResult(grandObtained, grandPossible);
    y += 4;
    doc.setFillColor(verdict.color[0], verdict.color[1], verdict.color[2]);
    doc.rect(14, y, 182, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text(
      verdict.percentage == null
        ? 'OVERALL: NO RESULT'
        : `OVERALL: ${verdict.result}  —  ${grandObtained}/${grandPossible}  (${verdict.percentage}%)`,
      18, y + 9,
    );
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(7);
    doc.setTextColor(130, 130, 130);
    doc.text(
      'Ex = exempt (excluded from the percentage)   ·   – = not marked   ·   PASSED 60-100%, AVERAGE 40-59%, FAILED 0-39%',
      14, 288,
    );
    doc.setTextColor(0, 0, 0);
  });

  window.open(doc.output('bloburl'), '_blank');
}

export function generateWorkRecord(record: WorkRecord) {
  const doc = new jsPDF();
  
  // Header
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(SCHOOL_INFO.name, 105, 15, { align: 'center' });
  doc.setFontSize(14);
  doc.text('Record of Work', 105, 28, { align: 'center' });
  
  // Record details
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  
  const details = [
    ['Teacher', record.staffName],
    ['Date', record.date],
    ['Class', record.class],
    ['Subject', record.subject],
    ['Topic', record.topic]
  ];
  
  autoTable(doc, {
    startY: 50,
    body: details,
    theme: 'plain',
    styles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold' },
      1: { cellWidth: 150 }
    }
  });
  
  let yPos = (doc as any).lastAutoTable.finalY + 15;
  
  // Objectives
  doc.setFontSize(12);
  doc.text('Learning Objectives:', 20, yPos);
  doc.setFontSize(10);
  const objectivesLines = doc.splitTextToSize(record.objectives, 170);
  doc.text(objectivesLines, 20, yPos + 7);
  yPos += 7 + (objectivesLines.length * 5) + 10;
  
  // Activities
  doc.setFontSize(12);
  doc.text('Activities:', 20, yPos);
  doc.setFontSize(10);
  const activitiesLines = doc.splitTextToSize(record.activities, 170);
  doc.text(activitiesLines, 20, yPos + 7);
  yPos += 7 + (activitiesLines.length * 5) + 10;
  
  // Evaluation
  doc.setFontSize(12);
  doc.text('Evaluation:', 20, yPos);
  doc.setFontSize(10);
  const evaluationLines = doc.splitTextToSize(record.evaluation, 170);
  doc.text(evaluationLines, 20, yPos + 7);
  yPos += 7 + (evaluationLines.length * 5) + 10;
  
  // Remarks
  doc.setFontSize(12);
  doc.text('Remarks:', 20, yPos);
  doc.setFontSize(10);
  const remarksLines = doc.splitTextToSize(record.remarks, 170);
  doc.text(remarksLines, 20, yPos + 7);
  
  doc.save(`Work_Record_${record.staffName}_${record.date}.pdf`);
}

export function generateReportCard(
  report: ReportCard,
  extra?: { breakdown?: TestExamBreakdownSubject[]; rank?: { rank: number; totalStudents: number } }
) {
  const doc = new jsPDF();

  // Header with school colors
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, 50, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text(SCHOOL_INFO.name, 105, 20, { align: 'center' });
  doc.setFontSize(16);
  doc.text('STUDENT REPORT CARD', 105, 32, { align: 'center' });
  doc.setFontSize(10);
  doc.text(`${formatTermLabel(report.term)} - ${report.academicYear}`, 105, 42, { align: 'center' });

  // Student information
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.text('Student Information', 20, 65);

  autoTable(doc, {
    startY: 70,
    body: [
      ['Name:', report.studentName, 'Class:', report.class],
      ['Average Score:', `${report.averageScore}%`, 'Position:', `${report.position} of ${report.totalStudents}`],
      [
        'Attendance:', `${report.attendance}%`,
        extra?.rank ? 'Class Rank:' : '', extra?.rank ? `${extra.rank.rank} of ${extra.rank.totalStudents}` : '',
      ],
    ],
    theme: 'plain',
    styles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 35, fontStyle: 'bold' },
      1: { cellWidth: 60 },
      2: { cellWidth: 35, fontStyle: 'bold' },
      3: { cellWidth: 60 }
    }
  });

  let cursorY: number = (doc as any).lastAutoTable.finalY;

  // Sequence Tests & Exams breakdown — each assessment's marksObtained/total individually,
  // per subject, plus the compiled subject total. Optional: an older report
  // card (or one predating Sequence Tests & Exams setup) simply omits this section.
  if (extra?.breakdown?.length) {
    cursorY += 15;
    if (cursorY > 270) { doc.addPage(); cursorY = 20; }
    doc.setFontSize(12);
    doc.text('Sequence Tests & Exams Breakdown', 20, cursorY);
    cursorY += 8;

    for (const subject of extra.breakdown) {
      const blockHeight = 8 + (subject.testExams.length + 1) * 7;
      if (cursorY + blockHeight > 280) { doc.addPage(); cursorY = 20; }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      // The subject total covers only the assessments that count for this
      // student: exempt ones are excluded, and unmarked ones are not zeros until
      // their term ends. With nothing counted there is no fraction to print —
      // "0/0" would read as a score of zero.
      doc.text(
        subject.counted > 0
          ? `${subject.subjectName} — ${subject.marksObtained}/${subject.totalMarks}`
          : `${subject.subjectName} — not yet marked`,
        20,
        cursorY,
      );
      doc.setFont('helvetica', 'normal');
      cursorY += 5;

      autoTable(doc, {
        startY: cursorY,
        head: [['Assessment', 'Type', 'Marks Obtained', 'Total']],
        body: subject.testExams.map(t => [
          t.name,
          t.type === 'EXAM' ? 'Exam' : 'Sequence Test',
          // Exempt is a statement in its own right, not a missing mark: the
          // student was excused, and this assessment counts towards neither
          // side of their total.
          t.state === 'EXEMPT' ? 'Exempt' : t.marksObtained ?? '—',
          t.state === 'EXEMPT' ? '—' : t.totalMarks ?? `(${t.configuredTotalMarks})`,
        ]),
        theme: 'grid',
        headStyles: { fillColor: [100, 116, 139] },
        styles: { fontSize: 9 },
        margin: { left: 20, right: 20 },
      });
      cursorY = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // Subjects table (legacy manually-entered scores)
  const subjectData = report.subjects.map(subject => [
    subject.name,
    subject.score.toString(),
    subject.grade,
    subject.teacherComment
  ]);

  cursorY += 7;
  if (cursorY > 270) { doc.addPage(); cursorY = 20; }
  doc.setFontSize(12);
  doc.text('Academic Performance', 20, cursorY);
  cursorY += 5;

  autoTable(doc, {
    startY: cursorY,
    head: [['Subject', 'Score', 'Grade', 'Teacher Comment']],
    body: subjectData,
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 20 },
      2: { cellWidth: 20 },
      3: { cellWidth: 100 }
    }
  });
  cursorY = (doc as any).lastAutoTable.finalY;

  // Grading scale
  if (cursorY + 10 > 280) { doc.addPage(); cursorY = 20; }
  doc.setFontSize(10);
  doc.text('Grading Scale: A (80-100) | B (70-79) | C (60-69) | D (50-59) | F (0-49)', 20, cursorY + 10);

  // Head teacher comment
  const commentLines = doc.splitTextToSize(report.headTeacherComment, 170);
  if (cursorY + 29 + (commentLines.length * 5) > 280) { doc.addPage(); cursorY = 0; }
  doc.setFontSize(12);
  doc.text('Head Teacher Comment:', 20, cursorY + 22);
  doc.setFontSize(10);
  doc.text(commentLines, 20, cursorY + 29);

  // Signature section
  const finalY = cursorY + 29 + (commentLines.length * 5) + 15;
  doc.line(20, finalY, 80, finalY);
  doc.text('Head Teacher Signature', 25, finalY + 5);

  doc.line(130, finalY, 190, finalY);
  doc.text('Date', 155, finalY + 5);

  doc.save(`Report_Card_${report.studentName}_${report.term}.pdf`);
}

/* ────────────────────────────── FEE DRIVE NOTICES ──────────────────────────────
 *
 * One letter per student, TWO LETTERS TO A SHEET of A4, so a school chasing two
 * hundred balances prints a hundred pages instead of two hundred and cuts them
 * apart down the middle.
 *
 * WHY THIS IS DRAWN HERE AND NOT ON THE SERVER. Every PDF this app produces is
 * produced by this file, and a Fee Drive notice has to carry the same letterhead
 * as the rest of them — the same band, the same logo placement, the same way a
 * school with no motto gets a tight header rather than a gap. The backend has no
 * PDF library of any kind (jspdf and jspdf-autotable are frontend dependencies),
 * so drawing it there would mean adding one and reimplementing the letterhead a
 * second time, where it would immediately start drifting from this one. The
 * DATA is server-side, which is the part that matters: GET /ledger/fee-drive
 * decides who is on the list, what they owe, what period it is and how the
 * proprietor signs. Nothing below computes any of that — it only lays it out.
 */

/** Half of A4 portrait. The whole layout below is written relative to this. */
const HALF_PAGE_H = 148.5;
const PAGE_W = 210;

/** One letter's worth of content. Everything here comes from the server. */
export interface FeeDriveLetter {
  firstName: string;
  lastName: string;
  class: string | null;
  balance: number;
}

export interface FeeDriveContext {
  school: { name: string; motto?: string | null; logo?: string | null };
  academicYear: string;
  term: string;
  /** Already assembled by the server — "Mme MN", "Sir PT", or "" if unknown. */
  proprietorSignature: string;
}

/** A run of text that shares one style, for drawRichParagraph below. */
interface TextRun {
  text: string;
  bold?: boolean;
  /** RGB. Defaults to near-black. */
  color?: [number, number, number];
}

/**
 * A wrapped paragraph whose styling changes MID-SENTENCE.
 *
 * doc.splitTextToSize + doc.text cannot do this: they take one string in one
 * style, and the outstanding amount has to be bold and red inside a sentence
 * that is neither. So the paragraph is laid out a word at a time — measure,
 * place, advance, wrap at the margin — which is also the only way the line
 * containing the amount wraps correctly, since a bold word is wider than the
 * same word in regular and measuring it as regular would overrun the margin.
 *
 * Splitting on /(\s+)/ with a capture group keeps the separators, so a run that
 * ends mid-sentence does not lose the space before the next one, and an explicit
 * "\n\n" between runs still forces a paragraph break.
 *
 * Returns the y of the last baseline drawn, so the caller can carry on beneath
 * a block whose height it did not have to predict.
 */
function drawRichParagraph(
  doc: jsPDF,
  runs: TextRun[],
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  let cursorX = x;
  let cursorY = y;

  const newline = () => {
    cursorX = x;
    cursorY += lineHeight;
  };

  for (const run of runs) {
    doc.setFont('helvetica', run.bold ? 'bold' : 'normal');
    const [r, g, b] = run.color ?? [17, 24, 39];
    doc.setTextColor(r, g, b);

    // Blank lines are structure, not text: a run of two or more newlines is a
    // paragraph break and must not be measured or drawn as a word.
    const pieces = run.text.split(/(\n{2,}|\s+)/);
    for (const piece of pieces) {
      if (!piece) continue;
      if (/^\n{2,}$/.test(piece)) {
        newline();
        newline();
        continue;
      }
      if (/^\s+$/.test(piece)) {
        // A space only counts if something is already on this line — a line
        // must not begin with the space that followed the word that wrapped.
        if (cursorX > x) cursorX += doc.getTextWidth(' ');
        continue;
      }
      const w = doc.getTextWidth(piece);
      if (cursorX > x && cursorX + w > x + maxWidth) newline();
      doc.text(piece, cursorX, cursorY);
      cursorX += w;
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(17, 24, 39);
  return cursorY;
}

/**
 * The letterhead band, at `top` — the top of whichever half of the sheet this
 * letter occupies.
 *
 * Deliberately the same composition as generateFinancialSheet's: the same blue
 * band, the logo left and vertically centred in it, and the school name, motto
 * and period stacked down the middle. It is SHORTER, because it has to be — that
 * one is 52mm on a 297mm page, and 52mm out of 148.5mm would leave no room for
 * a letter underneath. The cursor still moves only for lines that actually
 * render, so a school with no motto gets a tight block rather than a gap where
 * the motto would have been.
 */
function drawLetterhead(
  doc: jsPDF,
  ctx: FeeDriveContext,
  logoDataUrl: string | null,
  top: number,
): void {
  const BAND_H = 33;

  doc.setFillColor(37, 99, 235);
  doc.rect(0, top, PAGE_W, BAND_H, 'F');

  if (logoDataUrl) {
    try {
      const fmt = logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      const size = 21;
      doc.addImage(logoDataUrl, fmt, 9, top + (BAND_H - size) / 2, size, size);
    } catch {
      // A logo that jsPDF will not decode must not cost the school its letters.
    }
  }

  doc.setTextColor(255, 255, 255);

  // 9mm of margin + the 21mm logo + 4mm of air, reserved on both sides.
  let headY = drawSchoolName(doc, ctx.school.name, {
    centerX: 105,
    y: top + 10,
    maxWidth: logoDataUrl ? 210 - 2 * 34 : 182,
    fontSize: 13,
  });

  const motto = ctx.school.motto?.trim();
  if (motto) {
    headY += 5;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text(motto, 105, headY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
  }

  // Year and term on one line. Both are live values from the server; the term
  // goes through formatTermLabel so it reads the way it reads everywhere else
  // in the app rather than as a raw column value.
  headY += 5;
  doc.setFontSize(7.5);
  doc.text(
    `Academic Year: ${ctx.academicYear}  |  ${formatTermLabel(ctx.term)}`,
    105,
    headY,
    { align: 'center' },
  );

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Fee Drive Notice', 105, top + BAND_H - 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(17, 24, 39);
}

/**
 * One student's letter, filling the half-sheet whose top edge is at `top`.
 *
 * The signature is pinned to the BOTTOM of the half-page rather than flowing
 * after the body, so both letters on a sheet sign off at the same height and the
 * page reads as two identical notices instead of two paragraphs of different
 * lengths. The body cannot collide with it: at this size the longest name and
 * class this app permits still leaves the paragraph well clear.
 */
function drawFeeDriveLetter(
  doc: jsPDF,
  ctx: FeeDriveContext,
  letter: FeeDriveLetter,
  logoDataUrl: string | null,
  top: number,
): void {
  drawLetterhead(doc, ctx, logoDataUrl, top);

  const LEFT = 20;
  const CONTENT_W = PAGE_W - LEFT * 2;
  const fullName = `${letter.firstName} ${letter.lastName}`.trim();
  /**
   * A PLAIN HYPHEN, not the em dash this app uses for a missing value
   * everywhere on screen.
   *
   * jsPDF's default helvetica is WinAnsi-encoded and silently DROPS U+2014: the
   * content stream comes out as "(Class:  end)" with the character simply gone,
   * while getTextWidth still reports 5.6mm for it. So an em dash here would not
   * render as a dash — it would render as a gap of blank paper that pushes the
   * rest of the line along, which on a letter to a parent reads as a mistake
   * rather than as "not recorded".
   *
   * Defensive rather than expected: Student.class is NOT NULL in the schema, so
   * a letter with no class should be unreachable. It is written this way so that
   * if one ever does arrive the line says something.
   */
  const className = letter.class ?? '-';

  // Name and class on ONE line, as specified. Fixed x for the class so the two
  // letters on a sheet line up with each other whatever the names happen to be.
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Student: ${fullName}`, LEFT, top + 43);
  doc.text(`Class: ${className}`, 140, top + 43);
  doc.setFont('helvetica', 'normal');

  /**
   * 9.5pt on a 5mm line — the same size the rest of this file sets body text at.
   *
   * There is room to spare, and it was worth measuring rather than assuming: the
   * body has to fit between the student line and the signature rule pinned 16mm
   * off the foot of the half page. Read back off the generated content stream, a
   * typical letter's last baseline lands at 93mm against a rule at 132.5mm —
   * 39.5mm clear — and a deliberately absurd 100-character name in a
   * 40-character class reaches only 98mm, still 34.5mm clear. The paragraph
   * would have to grow by roughly seven more wrapped lines before the signature
   * was in any danger.
   */
  doc.setFontSize(9.5);
  const amount = `${letter.balance.toLocaleString()}`;
  drawRichParagraph(
    doc,
    [
      { text: 'Dear Parent/Guardian,\n\n' },
      { text: `We wish to bring to your attention that ${fullName} of ${className} currently has an outstanding school fee balance of ` },
      // The one thing on the page that has to be impossible to miss.
      { text: amount, bold: true, color: [220, 38, 38] },
      { text: ' FCFA.\n\n' },
      { text: "We kindly ask that this amount be settled as soon as possible to ensure your child's continued attendance and smooth experience at school.\n\n" },
      { text: 'Thank you for your prompt attention to this matter.' },
    ],
    LEFT,
    top + 53,
    CONTENT_W,
    5,
  );

  // Signature block, pinned to the foot of the half-page. Empty when the
  // proprietor's name is unknown — a rule with nothing under it says less than
  // no rule at all.
  if (ctx.proprietorSignature) {
    const sigY = top + HALF_PAGE_H - 16;
    doc.setDrawColor(156, 163, 175);
    doc.setLineWidth(0.2);
    doc.line(LEFT, sigY, LEFT + 45, sigY);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.text(ctx.proprietorSignature, LEFT, sigY + 5);
    doc.setFont('helvetica', 'normal');
  }
}

/**
 * The dashed line the sheet gets cut along. Drawn once per page, and only on a
 * page that actually carries two letters — a cut line under a blank bottom half
 * invites somebody to cut a letter's foot off.
 */
function drawCutLine(doc: jsPDF): void {
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  try {
    doc.setLineDashPattern([2, 2], 0);
  } catch {
    // Older jsPDF builds name this differently; a solid rule is a fine
    // fallback and the line is guidance, not content.
  }
  doc.line(8, HALF_PAGE_H, PAGE_W - 8, HALF_PAGE_H);
  try {
    doc.setLineDashPattern([], 0);
  } catch {}
}

/**
 * Every letter in the drive, two to a sheet, top half then bottom half then
 * over the page. An odd final student leaves the bottom half of the last sheet
 * blank, which is what makes the stack safe to guillotine in one pass.
 *
 * `letters` arrives in the order the server sorted it — class, then name — and
 * is NOT re-sorted here, so the stack of paper comes out in the same order as
 * the table the user was looking at when they pressed the button.
 *
 * The logo is fetched ONCE for the whole run rather than per letter: it is the
 * same image on all of them, and re-fetching it two hundred times would make a
 * large drive slow for no reason.
 */
export async function generateFeeDriveNotices(
  ctx: FeeDriveContext,
  letters: FeeDriveLetter[],
): Promise<void> {
  const doc = new jsPDF();
  const logoDataUrl = ctx.school.logo ? await getLogoDataUrl(ctx.school.logo) : null;

  letters.forEach((letter, i) => {
    const isTop = i % 2 === 0;
    // jsPDF opens with one page already, so a new sheet is needed before every
    // top-half letter EXCEPT the first.
    if (isTop && i > 0) doc.addPage();
    drawFeeDriveLetter(doc, ctx, letter, logoDataUrl, isTop ? 0 : HALF_PAGE_H);
    // Drawn when the bottom letter lands, so it is never drawn under a blank
    // half.
    if (!isTop) drawCutLine(doc);
  });

  deliverPdf(doc, 'Fee_Drive_Notices.pdf');
}

/**
 * One student's notice, alone on the top half of a sheet with the bottom half
 * left blank — the same letter the batch produces, printed one at a time from
 * the student's own Finance tab.
 *
 * Shares drawFeeDriveLetter with the batch rather than reproducing it, so the
 * two can never say different things to the same parent.
 */
export async function generateFeeDriveNotice(
  ctx: FeeDriveContext,
  letter: FeeDriveLetter,
): Promise<void> {
  const doc = new jsPDF();
  const logoDataUrl = ctx.school.logo ? await getLogoDataUrl(ctx.school.logo) : null;
  drawFeeDriveLetter(doc, ctx, letter, logoDataUrl, 0);
  const name = pdfNamePart(`${letter.firstName} ${letter.lastName}`);
  deliverPdf(doc, `Fee_Drive_Notice_${name}.pdf`);
}

/**
 * Which slice of the expense book a records sheet covers, as the user set it.
 *
 * Every field is optional and an absent one means "no bound" — the sheet prints
 * the applied ones under the title so a page handed to somebody else still says
 * what it is and, more importantly, what it is NOT. A total on an unlabelled
 * extract is the kind of number that gets read as the whole year's spend.
 */
export interface ExpenseRecordsFilters {
  from?: string;
  to?: string;
  minAmount?: number | null;
  maxAmount?: number | null;
  category?: string;
  search?: string;
}

/**
 * The expense book as a table — Date, Invoice, Category, Description, Payee,
 * Amount, Payment Method — over whatever range the download dialog was set to.
 *
 * LANDSCAPE, because seven columns is what was asked for and one of them is a
 * free-text description. In portrait the 180mm of content width leaves the
 * description about 45mm, which wraps a one-line note into four and turns a
 * fifty-row month into a document nobody reads. Landscape gives 269mm and lets
 * the description have 75 of it on its own.
 *
 * THE TOTAL IS OF WHAT IS PRINTED, not of the whole book. It is drawn as the
 * table's foot so it repeats on every page and can never be read as a running
 * subtotal of the page it happens to land on.
 */
export async function generateExpenseRecords(
  expenses: Expense[],
  filters: ExpenseRecordsFilters = {},
  schoolInfo?: { name: string; logo?: string; motto?: string; academicYear?: string },
) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const PAGE_W = 297;
  const PAGE_H = 210;
  // 4mm deeper than the portrait sheets need, because this band carries the
  // name, the motto AND the year, and a name that wraps to two lines has to
  // clear the title pinned to the bottom of it.
  const HEADER_H = 44;
  const MARGIN = 14;

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, PAGE_W, HEADER_H, 'F');

  if (schoolInfo?.logo) {
    const dataUrl = await getLogoDataUrl(schoolInfo.logo);
    if (dataUrl) {
      try {
        const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        const size = 26;
        doc.addImage(dataUrl, fmt, 8, (HEADER_H - size) / 2, size, size);
      } catch {}
    }
  }

  // Same stacking rule the financial sheet uses: the cursor only moves for a
  // line that actually renders, so a school with no motto gets a tight block
  // rather than a gap where the motto would have been.
  doc.setTextColor(255, 255, 255);

  // 8mm of margin + the 26mm logo + 4mm of air, reserved on both sides.
  let headY = drawSchoolName(doc, schoolInfo?.name ?? SCHOOL_INFO.name, {
    centerX: PAGE_W / 2,
    y: 14,
    maxWidth: schoolInfo?.logo ? PAGE_W - 2 * 38 : PAGE_W - 28,
    fontSize: 17,
  });

  const motto = schoolInfo?.motto?.trim();
  if (motto) {
    headY += 6;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text(motto, PAGE_W / 2, headY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
  }

  if (schoolInfo?.academicYear) {
    headY += 6;
    doc.setFontSize(9);
    doc.text(`Academic Year: ${schoolInfo.academicYear}`, PAGE_W / 2, headY, { align: 'center' });
  }

  doc.setFontSize(13);
  doc.text('Expense Records', PAGE_W / 2, HEADER_H - 6, { align: 'center' });

  // The applied filters, in words. Built from the ones that are actually set,
  // so an unfiltered download says "All records" rather than printing four
  // empty bounds.
  const parts: string[] = [];
  if (filters.from && filters.to) {
    parts.push(filters.from === filters.to ? `Date: ${filters.from}` : `Date: ${filters.from} to ${filters.to}`);
  } else if (filters.from) {
    parts.push(`Date: from ${filters.from}`);
  } else if (filters.to) {
    parts.push(`Date: up to ${filters.to}`);
  }
  const min = filters.minAmount ?? null;
  const max = filters.maxAmount ?? null;
  if (min != null && max != null) parts.push(`Amount: ${min.toLocaleString()} to ${max.toLocaleString()} FCFA`);
  else if (min != null) parts.push(`Amount: at least ${min.toLocaleString()} FCFA`);
  else if (max != null) parts.push(`Amount: up to ${max.toLocaleString()} FCFA`);
  if (filters.category && filters.category !== 'all') parts.push(`Category: ${filters.category}`);
  if (filters.search?.trim()) parts.push(`Search: "${filters.search.trim()}"`);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.text(parts.length ? parts.join('   ·   ') : 'All records', MARGIN, HEADER_H + 8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `${expenses.length} record${expenses.length === 1 ? '' : 's'}  ·  Generated ${todayIso()}`,
    PAGE_W - MARGIN, HEADER_H + 8, { align: 'right' },
  );
  doc.setTextColor(0, 0, 0);

  const total = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  if (expenses.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(150, 150, 150);
    doc.text('No expenses match these filters.', PAGE_W / 2, HEADER_H + 30, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  } else {
    autoTable(doc, {
      startY: HEADER_H + 14,
      head: [['Date', 'Invoice No.', 'Category', 'Description', 'Payee', 'Amount (FCFA)', 'Payment Method']],
      body: expenses.map((e) => [
        dateOnly(e.date),
        e.invoiceNumber ?? '—',
        e.category ?? '—',
        e.description ?? '',
        e.payee ?? '—',
        (Number(e.amount) || 0).toLocaleString(),
        formatPaymentMethod(e.paymentMethod),
      ]),
      foot: [['', '', '', '', 'Total', `${total.toLocaleString()} FCFA`, '']],
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
      // Grey rather than the header blue: it is a total derived from the rows
      // above, not a second heading competing with the first.
      footStyles: { fillColor: [107, 114, 128], textColor: 255, halign: 'right' },
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      margin: { left: MARGIN, right: MARGIN, bottom: 16 },
      // 269mm of content width, spent where the text actually is. Description
      // takes the largest share because it is the one column with no bound on
      // its length; Amount is right-aligned so the figures line up on the unit.
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 32 },
        2: { cellWidth: 28 },
        3: { cellWidth: 75 },
        4: { cellWidth: 45 },
        5: { cellWidth: 30, halign: 'right' },
        6: { cellWidth: 35 },
      },
      // Page numbers, drawn per page rather than once at the end, because a
      // records sheet is the kind of document that gets printed and stapled.
      didDrawPage: () => {
        const page = doc.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(`Page ${page}`, PAGE_W - MARGIN, PAGE_H - 8, { align: 'right' });
        doc.setTextColor(0, 0, 0);
      },
    });
  }

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('This is a computer-generated expense record.', MARGIN, PAGE_H - 8);

  deliverPdf(doc, `Expense_Records_${todayIso()}.pdf`);
}

/**
 * One row of the Finance page's School Transactions table, as that table holds
 * it. Structurally identical to the `Transaction` interface in
 * FinanceOverview.tsx — restated here so this module stays free of a component
 * import, the way every other generator in this file is.
 */
export interface TransactionInvoice {
  id: string;
  type: string;
  category?: string | null;
  description: string;
  partyName?: string | null;
  partyType?: 'staff' | 'vendor' | null;
  partyCode?: string | null;
  amount: number;
  entryDate: string;
  paymentMethod?: string | null;
  note?: string | null;
  payrollMonth?: string | null;
  payrollBonus?: number | null;
  academicYear?: string | null;
  term?: string | null;
}

/**
 * What each kind of transaction is CALLED on paper, and what the other party to
 * it is called.
 *
 * A payroll run and a supplier invoice are not the same document, and printing
 * one heading over both would be wrong on at least one of them: a vendor sends
 * the school an invoice, whereas the school issues its own staff a voucher. The
 * party label moves with it for the same reason — "Payee" reads as the supplier
 * on an expense, and "Staff member" is what the name means on a payroll line.
 *
 * A staff CHARGE runs the other way (money the school is owed, e.g. damage
 * billed back), so it is a charge note rather than a voucher.
 */
const INVOICE_HEADINGS: Record<string, { title: string; party: string }> = {
  EXPENSE: { title: 'Expense Invoice', party: 'Payee' },
  PAYROLL: { title: 'Payroll Voucher', party: 'Staff member' },
  STAFF_PAYMENT: { title: 'Payment Voucher', party: 'Staff member' },
  STAFF_CHARGE: { title: 'Charge Note', party: 'Staff member' },
  PAYMENT: { title: 'Payment Voucher', party: 'Party' },
  CHARGE: { title: 'Charge Note', party: 'Party' },
};

/**
 * The invoice for a single School Transactions row — the sheet behind the
 * Download invoice button in that table's Details panel.
 *
 * ONE GENERATOR FOR EVERY ROW TYPE, not one per type, because the sheets differ
 * only in their heading and in which fields happen to be present. Payroll month
 * and bonus exist on a payroll line and on nothing else; an academic year and
 * term exist on a ledger entry and never on a standalone expense. Absent fields
 * are dropped rather than printed as dashes, exactly as the on-screen Details
 * panel drops them — a column of em-dashes reads as missing data instead of as
 * not applicable.
 *
 * THE REFERENCE IS THE ROW'S OWN CODE, and it is what makes this sheet worth
 * keeping: it is the id the record carries in the database, so a printed copy
 * can be matched back to the entry it came from. An expense that was given an
 * invoice number when it was recorded prints that too — that is the SUPPLIER's
 * number, a different thing from the school's own reference, so both appear
 * rather than one standing in for the other.
 */
export async function generateTransactionInvoice(
  tx: TransactionInvoice,
  schoolInfo?: { name: string; logo?: string; motto?: string; academicYear?: string },
) {
  const doc = new jsPDF();
  const heading = INVOICE_HEADINGS[tx.type] ?? { title: 'Transaction Record', party: 'Party' };
  const reference = String(tx.id).replace(/^(ledger|expense)-/, '');

  const HEADER_H = 46;

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, HEADER_H, 'F');

  if (schoolInfo?.logo) {
    const dataUrl = await getLogoDataUrl(schoolInfo.logo);
    if (dataUrl) {
      try {
        const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        const size = 26;
        doc.addImage(dataUrl, fmt, 9, (HEADER_H - size) / 2, size, size);
      } catch {
        // A logo jsPDF will not decode must not cost the school its invoice.
      }
    }
  }

  doc.setTextColor(255, 255, 255);

  // The cursor moves only for lines that actually render, so a school with no
  // motto gets a tight block rather than a gap where the motto would have been.
  // 9mm of margin + the 26mm logo + 4mm of air, reserved on both sides.
  let headY = drawSchoolName(doc, schoolInfo?.name ?? SCHOOL_INFO.name, {
    centerX: 105,
    y: 15,
    maxWidth: schoolInfo?.logo ? 210 - 2 * 39 : 182,
    fontSize: 17,
  });

  const motto = schoolInfo?.motto?.trim();
  if (motto) {
    headY += 6;
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'italic');
    doc.text(motto, 105, headY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(heading.title.toUpperCase(), 105, HEADER_H - 7, { align: 'center' });
  doc.setFont('helvetica', 'normal');

  // Reference and date, the two things that identify this sheet, on one line
  // directly under the band and before the detail table.
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(10);
  doc.text(`Reference: ${reference}`, 15, HEADER_H + 12);
  doc.text(`Date: ${dateOnly(tx.entryDate)}`, 195, HEADER_H + 12, { align: 'right' });

  const rows: Array<[string, string | null | undefined]> = [
    [heading.party, tx.partyName],
    ['Description', tx.description],
    ['Category', tx.category],
    ['Payment method', tx.paymentMethod],
    ['Payroll month', tx.payrollMonth],
    ['Of which bonus', tx.payrollBonus ? `${tx.payrollBonus.toLocaleString()} FCFA` : null],
    ['Academic year', tx.academicYear],
    ['Term', tx.term ? formatTermLabel(tx.term) : null],
    // On an expense row this column carries the supplier's invoice number; on a
    // ledger entry it is the free-text note. Labelled for whichever it is.
    [tx.type === 'EXPENSE' ? 'Supplier invoice no.' : 'Note', tx.note],
  ];

  autoTable(doc, {
    startY: HEADER_H + 18,
    head: [['Field', 'Details']],
    body: rows
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([label, value]) => [label, String(value)]),
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 9.5 },
    margin: { left: 15, right: 15 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 125 },
    },
  });

  // The amount gets its own band rather than a row in the table above. It is
  // the one number anybody checks first, and a striped row of the same weight
  // as "Category" buried it.
  const amountY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFillColor(243, 244, 246);
  doc.rect(15, amountY, 180, 14, 'F');
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.text('AMOUNT', 20, amountY + 9);
  doc.setFontSize(13);
  doc.text(`${tx.amount.toLocaleString()} FCFA`, 190, amountY + 9.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  // A signature line, because this is a voucher as often as it is a receipt and
  // an unsigned payout sheet is not evidence of anything.
  const signY = amountY + 42;
  doc.setDrawColor(150, 150, 150);
  doc.line(20, signY, 85, signY);
  doc.line(125, signY, 190, signY);
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  doc.text('Received by', 20, signY + 5);
  doc.text('Authorised by', 125, signY + 5);

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `This is a computer-generated record, issued ${dateOnly(todayIso())}.`,
    105,
    signY + 20,
    { align: 'center' },
  );

  const who = pdfNamePart(tx.partyName ?? heading.title);
  deliverPdf(doc, `${pdfNamePart(heading.title)}_${who}_${reference}.pdf`);
}
