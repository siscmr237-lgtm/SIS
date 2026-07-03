import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { StudentsManagement } from './components/StudentsManagement';
import { StaffManagement } from './components/StaffManagement';
import { FeesManagement } from './components/FeesManagement';
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
  | 'staff'
  | 'fees'
  | 'expenses'
  | 'report-cards'
  | 'attendance'
  | 'timetable'
  | 'classes'
  | 'subjects'
  | 'settings';

export default function App() {
  const [currentPage, setCurrentPage] = useState<NavigationPage>('dashboard');

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'students':
        return <StudentsManagement />;
      case 'staff':
        return <StaffManagement />;
      case 'fees':
        return <FeesManagement />;
      case 'expenses':
        return <ExpensesManagement />;
      case 'report-cards':
        return <ReportCards />;
      case 'attendance':
        return <Attendance />;
      case 'timetable':
        return <Timetable />;
      case 'classes':
        return <ClassesManagement onNavigate={setCurrentPage} />;
      case 'subjects':
        return <SubjectsManagement onNavigate={setCurrentPage} />;
      case 'settings':
        return <SchoolSettings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
      <main className="flex-1 overflow-y-auto">
        {renderPage()}
      </main>
    </div>
  );
}
