"use client";

import { useRouter } from 'next/navigation';
import { NavigationPage } from '../App';
import { Student, Staff } from '../types';

const PAGE_PATHS: Partial<Record<NavigationPage, string>> = {
  dashboard: '/school/dashboard',
  students: '/school/students',
  staff: '/school/staff',
  finance: '/school/finance',
  expenses: '/school/expenses',
  // Nested under finance because that is the only way in: the Fee Drive button
  // lives on the Finance page and there is no sidebar entry for it.
  'fee-drive': '/school/finance/fee-drive',
  'report-cards': '/school/report-cards',
  attendance: '/school/attendance',
  timetable: '/school/timetable',
  classes: '/school/classes',
  subjects: '/school/subjects',
  'tests-exams': '/school/tests-exams',
  'enter-marks': '/school/enter-marks',
  'class-ranking': '/school/class-ranking',
  settings: '/school/settings',
};

// 'student-profile'/'staff-profile' aren't reached through generic navigate()
// calls — they only ever happen via viewStudent/viewStaff below, which route
// straight to the profile URL.
export function pathForPage(page: NavigationPage): string {
  return PAGE_PATHS[page] ?? '/school/dashboard';
}

export function useAppNavigation() {
  const router = useRouter();
  return {
    navigate: (page: NavigationPage) => router.push(pathForPage(page)),
    // `tab` lands the visitor on a specific profile tab — the Students list's
    // Fees cell uses it to open straight onto Finance, since that is where the
    // answer to "why does it say Owing?" lives.
    viewStudent: (student: Student, tab?: string) =>
      router.push(
        `/school/students/${encodeURIComponent(student.id)}${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`,
      ),
    viewStaff: (staff: Staff) => router.push(`/school/staff/${encodeURIComponent(staff.code)}`),
  };
}
