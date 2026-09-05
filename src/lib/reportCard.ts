import { getUser } from './session';
import { api } from './api';
import {
  generateReportCards,
  type ReportCardData,
  type ReportCardSubject,
} from '../utils/pdfGenerator';

/**
 * Assembling a report card.
 *
 * Nothing here computes a mark. The per-subject, per-assessment figures come
 * from GET /test-exams/student-breakdown — the same endpoint the Marks screens
 * read, which already applies the EXEMPT/UNMARKED rules — and the attendance
 * verdict from GET /attendance/consistency, which owns the 60% cutoff. The
 * report card is a rendering of those two answers, so it cannot disagree with
 * what the rest of the app shows.
 *
 * One request pair per student per term. A whole class is therefore genuinely
 * slower to produce than one card, which is expected and is why the bulk button
 * reports progress.
 */

export const REPORT_TERMS = ['Term 1', 'Term 2', 'Term 3'];

export interface ReportCardStudent {
  code: string;
  firstName: string;
  lastName: string;
  class?: string | null;
}

/** The school block on the card, read from the signed-in user like the financial sheet. */
export function readSchoolInfo(): { name?: string; logo?: string; motto?: string; academicYear?: string } | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const user = getUser();
    const school = user?.School?.[0];
    if (!school) return undefined;
    return { name: school.name, logo: school.logo, motto: school.motto, academicYear: school.academicYear };
  } catch {
    return undefined;
  }
}

async function buildOne(
  student: ReportCardStudent,
  terms: string[],
  academicYear: string,
): Promise<ReportCardData> {
  const termData: Array<{ term: string; subjects: ReportCardSubject[] }> = [];

  for (const term of terms) {
    try {
      const res: any = await api.get(
        `/test-exams/student-breakdown?studentId=${encodeURIComponent(student.code)}` +
        `&term=${encodeURIComponent(term)}&academicYear=${encodeURIComponent(academicYear)}`,
      );
      termData.push({ term, subjects: Array.isArray(res?.subjects) ? res.subjects : [] });
    } catch {
      // A term that fails to load prints as empty rather than aborting the whole
      // card — a partial report is more use than none, and the empty row says so.
      termData.push({ term, subjects: [] });
    }
  }

  let attendance: ReportCardData['attendance'] = [];
  try {
    const att: any = await api.get(
      `/attendance/consistency?studentId=${encodeURIComponent(student.code)}&academicYear=${encodeURIComponent(academicYear)}`,
    );
    attendance = Array.isArray(att?.terms) ? att.terms : [];
  } catch {
    attendance = [];
  }

  return {
    student: {
      code: student.code,
      firstName: student.firstName,
      lastName: student.lastName,
      class: student.class ?? null,
    },
    academicYear,
    terms,
    termData,
    attendance,
  };
}

/** One student's card, opened in a new tab. */
export async function downloadReportCard(
  student: ReportCardStudent,
  terms: string[],
  academicYear: string,
) {
  const card = await buildOne(student, terms, academicYear);
  await generateReportCards([card], readSchoolInfo());
}

/**
 * Every filtered student, as one multi-page document.
 *
 * Built sequentially rather than in parallel: a class of forty would otherwise
 * fire well over a hundred requests at once, and the server would rightly start
 * refusing them. `onProgress` exists because this is slow by nature and a button
 * that appears to have done nothing gets clicked again.
 */
export async function downloadAllReportCards(
  students: ReportCardStudent[],
  terms: string[],
  academicYear: string,
  onProgress?: (done: number, total: number) => void,
) {
  const cards: ReportCardData[] = [];
  for (let i = 0; i < students.length; i++) {
    cards.push(await buildOne(students[i], terms, academicYear));
    onProgress?.(i + 1, students.length);
  }
  if (!cards.length) return;
  await generateReportCards(cards, readSchoolInfo());
}
