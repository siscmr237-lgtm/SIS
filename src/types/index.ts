export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'male' | 'female';
  class: string;
  parentName: string;
  parentPhone: string;
  address: string;
  enrollmentDate: string;
}

export interface Staff {
  id: number;
  code: string;
  firstName: string;
  lastName: string;
  role: string;
  phone: string;
  email: string;
  hireDate: string;
  salary: number;
  isTeacher: boolean;
}

export interface Fee {
  id: string;
  studentId: string;
  studentName: string;
  class: string;
  term: string;
  academicYear: string;
  tuitionFee: number;
  registrationFee: number;
  uniformFee: number;
  booksFee: number;
  otherFees: number;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  paymentDate?: string;
  paymentMethod?: string;
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

export interface SchoolSettings {
  name: string;
  logo: string;
  academicYear: string;
  currentTerm: string;
  subjectsPerClass: SubjectConfig[];
}
