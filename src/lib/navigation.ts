"use client";

import { useRouter } from 'next/navigation';
import { NavigationPage } from '../App';
import { Student, Staff } from '../types';

const PAGE_PATHS: Partial<Record<NavigationPage, string>> = {
  dashboard: '/dashboard',
  students: '/students',
  staff: '/staff',
  finance: '/finance',
  expenses: '/expenses',
  'report-cards': '/report-cards',
  attendance: '/attendance',
  timetable: '/timetable',
  classes: '/classes',
  subjects: '/subjects',
  'tests-exams': '/tests-exams',
  'enter-marks': '/enter-marks',
  'class-ranking': '/class-ranking',
  settings: '/settings',
};

// 'student-profile'/'staff-profile' aren't reached through generic navigate()
// calls — they only ever happen via viewStudent/viewStaff below, which route
// straight to the profile URL.
export function pathForPage(page: NavigationPage): string {
  return PAGE_PATHS[page] ?? '/dashboard';
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
        `/students/${encodeURIComponent(student.id)}${tab ? `?tab=${encodeURIComponent(tab)}` : ''}`,
      ),
    viewStaff: (staff: Staff) => router.push(`/staff/${encodeURIComponent(staff.code)}`),
  };
}
