export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'male' | 'female';
  class: string;
  parentId: number;
  parentName: string;
  parentPhone: string;
  address: string;
  enrollmentDate: string;
  allergies?: string | null;
  medicalConditions?: string | null;
  currentMedications?: string | null;
  medicalNotes?: string | null;
}

export interface Staff {
  id: number;
  code: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  role: string;
  phone: string;
  email: string;
  hireDate: string;
  salary: number;
  isTeacher: boolean;
}

export interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  payee: string;
  paymentMethod: string;
  invoiceNumber: string;
}

export interface ReportCard {
  id: string;
  studentId: string;
  studentName: string;
  class: string;
  term: string;
  academicYear: string;
  subjects: {
    name: string;
    score: number;
    grade: string;
    teacherComment: string;
  }[];
  averageScore: number;
  position: number;
  totalStudents: number;
  attendance: number;
  headTeacherComment: string;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  type: 'student' | 'staff';
  personId: string;
  personName: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  remarks?: string;
}

export interface WorkRecord {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  subject: string;
  class: string;
  topic: string;
  objectives: string;
  activities: string;
  evaluation: string;
  remarks: string;
}

export interface TimetableEntry {
  id: string;
  day: string;
  time: string;
  class: string;
  subject: string;
  teacher: string;
}

export interface SubjectConfig {
  id: string;
  className: string;
  subjects: string[];
}

/** MARKED counts, EXEMPT and UNMARKED are excluded from a student's totals. */
export type MarkState = 'MARKED' | 'UNMARKED' | 'EXEMPT';

export interface TestExamBreakdownEntry {
  testExamId: number;
  name: string;
  type: 'TEST' | 'EXAM';
  order: number;
  state: MarkState;
  marksObtained: number | null;
  /** Null when this assessment does not count for this student (exempt/unmarked). */
  totalMarks: number | null;
  /** What the assessment is out of regardless of whether it counts here. */
  configuredTotalMarks: number;
}

export interface TestExamBreakdownSubject {
  subjectId: number;
  subjectName: string;
  marksObtained: number;
  /** Sum of only the COUNTED assessments — 0 when nothing counts yet. */
  totalMarks: number;
  counted: number;
  exempt: number;
  unmarked: number;
  testExams: TestExamBreakdownEntry[];
}

export interface ClassRankingRow {
  studentId: string;
  firstName: string;
  lastName: string;
  totalObtained: number;
  totalPossible: number;
  /** Null when nothing counts yet, so the student has no percentage or rank. */
  percentage: number | null;
  rank: number | null;
  assessmentsCounted: number;
  assessmentsExempt: number;
  assessmentsUnmarked: number;
}

export interface SchoolSettings {
  name: string;
  logo: string;
  academicYear: string;
  currentTerm: string;
  autoTermEnabled: boolean;
  subjectsPerClass: SubjectConfig[];
}
