import { useState } from 'react';
import { Menu } from 'lucide-react';
import { SisCacheProvider } from './lib/SisCache';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { StudentsManagement } from './components/StudentsManagement';
import { StudentProfile } from './components/StudentProfile';
import { Student } from './types';
import { StaffManagement } from './components/StaffManagement';
import { FinanceOverview } from './components/FinanceOverview';
import { ExpensesManagement } from './components/ExpensesManagement';
import { ReportCards } from './components/ReportCards';
import { Attendance } from './components/Attendance';
import { Timetable } from './components/Timetable';
import { SchoolSettings } from './components/SchoolSettings';
import { ClassesManagement } from './components/ClassesManagement';
import { SubjectsManagement } from './components/SubjectsManagement';

export type NavigationPage = 
  | 'dashboard'
  | 'students'
  | 'student-profile'
  | 'staff'
  | 'finance'
  | 'expenses'
  | 'report-cards'
  | 'attendance'
  | 'timetable'
  | 'classes'
  | 'subjects'
  | 'settings';

export default function App() {
  const [currentPage, setCurrentPage] = useState<NavigationPage>('dashboard');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigate = (page: NavigationPage) => {
    setCurrentPage(page);
    setSidebarOpen(false);
  };

  const viewStudent = (s: Student) => {
    setSelectedStudent(s);
    navigate('student-profile');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'students':
        return <StudentsManagement onNavigate={navigate} onViewStudent={viewStudent} />;
      case 'student-profile':
        return selectedStudent ? (
          <StudentProfile student={selectedStudent} onNavigate={navigate} />
        ) : (
          <StudentsManagement onNavigate={navigate} onViewStudent={viewStudent} />
        );
      case 'staff':
        return <StaffManagement />;
      case 'finance':
        return <FinanceOverview onNavigate={navigate} onViewStudent={viewStudent} />;
      case 'expenses':
        return <ExpensesManagement />;
      case 'report-cards':
        return <ReportCards />;
      case 'attendance':
        return <Attendance />;
      case 'timetable':
        return <Timetable />;
      case 'classes':
        return <ClassesManagement onNavigate={navigate} />;
      case 'subjects':
        return <SubjectsManagement onNavigate={navigate} />;
      case 'settings':
        return <SchoolSettings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <SisCacheProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-blue-900 text-white flex items-center px-4 gap-3 shadow-md">
          <button onClick={() => setSidebarOpen(true)} className="p-1 rounded hover:bg-blue-800">
            <Menu size={22} />
          </button>
          <span className="font-medium text-sm truncate">School Admin</span>
        </div>
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        <Sidebar currentPage={currentPage} onNavigate={navigate} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
          {renderPage()}
        </main>
      </div>
    </SisCacheProvider>
  );
}
