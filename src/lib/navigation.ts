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
    viewStudent: (student: Student) => router.push(`/students/${encodeURIComponent(student.id)}`),
    viewStaff: (staff: Staff) => router.push(`/staff/${encodeURIComponent(staff.code)}`),
  };
}
