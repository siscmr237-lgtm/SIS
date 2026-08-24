import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Expense, Student, Staff, ReportCard, WorkRecord, TimetableEntry, AttendanceRecord, TestExamBreakdownSubject } from '../types';
import { BASE_URL } from '../lib/api';
import { formatTermLabel } from './academicTerm';

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
  doc.text(`Date: ${expense.date}`, 20, 72);
  doc.text(`Payment Method: ${expense.paymentMethod}`, 20, 79);
  
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
  let headY = 16;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(schoolInfo?.name ?? SCHOOL_INFO.name, 105, headY, { align: 'center' });
  doc.setFont('helvetica', 'normal');

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
      head: [['Date', 'Fee', 'Payment Type', 'Amount (FCFA)']],
      body: payments.map((entry) => [
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
        0: { cellWidth: 30 },
        1: { cellWidth: 60 },
        2: { cellWidth: 50 },
        3: { cellWidth: 40, halign: 'right' },
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
  doc.setFontSize(18);
  doc.text(schoolInfo?.name ?? SCHOOL_INFO.name, 105, 15, { align: 'center' });

  const motto = schoolInfo?.motto?.trim();
  if (motto) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text(motto, 105, 23, { align: 'center' });
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

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.text(schoolInfo?.name || 'School', logo ? 40 : 14, 15);
    if (schoolInfo?.motto) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.text(schoolInfo.motto, logo ? 40 : 14, 22);
      doc.setFont('helvetica', 'normal');
    }
    doc.setFontSize(12);
    doc.text('STUDENT REPORT CARD', logo ? 40 : 14, 32);
    doc.setFontSize(9);
    doc.text(
      `Academic Year ${card.academicYear}  ·  ${card.terms.map(formatTermLabel).join(', ')}`,
      logo ? 40 : 14, 39,
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

  // Tests & Exams breakdown — each test/exam's marksObtained/total individually,
  // per subject, plus the compiled subject total. Optional: an older report
  // card (or one predating Tests & Exams setup) simply omits this section.
  if (extra?.breakdown?.length) {
    cursorY += 15;
    if (cursorY > 270) { doc.addPage(); cursorY = 20; }
    doc.setFontSize(12);
    doc.text('Tests & Exams Breakdown', 20, cursorY);
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
        head: [['Test/Exam', 'Type', 'Marks Obtained', 'Total']],
        body: subject.testExams.map(t => [
          t.name,
          t.type === 'EXAM' ? 'Exam' : 'Test',
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
