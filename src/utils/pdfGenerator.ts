import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Expense, Student, ReportCard, WorkRecord, TimetableEntry, AttendanceRecord } from '../types';
import { BASE_URL } from '../lib/api';

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

interface LedgerPdfEntry {
  type: 'CHARGE' | 'PAYMENT';
  description: string;
  amount: number;
  entryDate: string;
  category?: { name: string } | null;
}

export async function generateFinancialSheet(
  student: Student,
  ledgerData: { entries: LedgerPdfEntry[]; totalCharged: number; totalPaid: number; balance: number },
  schoolInfo?: { name: string; logo?: string }
) {
  const doc = new jsPDF();

  // Header background
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, 40, 'F');

  // School logo — top-left, gracefully skipped if unavailable
  if (schoolInfo?.logo) {
    const dataUrl = await getLogoDataUrl(schoolInfo.logo);
    if (dataUrl) {
      try {
        const fmt = dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(dataUrl, fmt, 8, 4, 32, 32);
      } catch {}
    }
  }

  // Header text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(schoolInfo?.name ?? SCHOOL_INFO.name, 105, 15, { align: 'center' });
  doc.setFontSize(14);
  doc.text('Student Financial Statement', 105, 28, { align: 'center' });

  // Student info
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.text('Student Information', 20, 50);
  doc.setFontSize(10);
  doc.text(`Name: ${student.firstName} ${student.lastName}`, 20, 58);
  doc.text(`Student ID: ${student.id}`, 20, 65);
  doc.text(`Class: ${student.class}`, 20, 72);

  const { entries, totalCharged, totalPaid, balance } = ledgerData;

  if (entries.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(150, 150, 150);
    doc.text('No financial records found for this student.', 105, 95, { align: 'center' });
  } else {
    const tableData = entries.map(entry => [
      new Date(entry.entryDate).toLocaleDateString('en-GB'),
      entry.type === 'CHARGE' ? 'Charge' : 'Payment',
      entry.category?.name ?? '—',
      entry.description,
      `${entry.amount.toLocaleString()} FCFA`,
    ]);

    autoTable(doc, {
      startY: 85,
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

  doc.save(`Financial_Statement_${student.firstName}_${student.lastName}.pdf`);
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

export function generateReportCard(report: ReportCard) {
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
  doc.text(`${report.term} - ${report.academicYear}`, 105, 42, { align: 'center' });
  
  // Student information
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.text('Student Information', 20, 65);
  
  autoTable(doc, {
    startY: 70,
    body: [
      ['Name:', report.studentName, 'Class:', report.class],
      ['Average Score:', `${report.averageScore}%`, 'Position:', `${report.position} of ${report.totalStudents}`],
      ['Attendance:', `${report.attendance}%`, '', '']
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
  
  // Subjects table
  const subjectData = report.subjects.map(subject => [
    subject.name,
    subject.score.toString(),
    subject.grade,
    subject.teacherComment
  ]);
  
  doc.setFontSize(12);
  doc.text('Academic Performance', 20, (doc as any).lastAutoTable.finalY + 15);
  
  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
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
  
  // Grading scale
  doc.setFontSize(10);
  doc.text('Grading Scale: A (80-100) | B (70-79) | C (60-69) | D (50-59) | F (0-49)', 20, (doc as any).lastAutoTable.finalY + 10);
  
  // Head teacher comment
  doc.setFontSize(12);
  doc.text('Head Teacher Comment:', 20, (doc as any).lastAutoTable.finalY + 22);
  doc.setFontSize(10);
  const commentLines = doc.splitTextToSize(report.headTeacherComment, 170);
  doc.text(commentLines, 20, (doc as any).lastAutoTable.finalY + 29);
  
  // Signature section
  const finalY = (doc as any).lastAutoTable.finalY + 29 + (commentLines.length * 5) + 15;
  doc.line(20, finalY, 80, finalY);
  doc.text('Head Teacher Signature', 25, finalY + 5);
  
  doc.line(130, finalY, 190, finalY);
  doc.text('Date', 155, finalY + 5);
  
  doc.save(`Report_Card_${report.studentName}_${report.term}.pdf`);
}
