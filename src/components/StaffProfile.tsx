import { ArrowLeft } from 'lucide-react';
import { NavigationPage } from '../App';
import { Staff } from '../types';
import { Card } from './ui/card';

interface StaffProfileProps {
  staff: Staff;
  onNavigate: (page: NavigationPage) => void;
}

export function StaffProfile({ staff, onNavigate }: StaffProfileProps) {
  return (
    <div className="p-4 md:p-8">
      <button
        onClick={() => onNavigate('staff')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-6"
      >
        <ArrowLeft size={18} />
        Back to Staff
      </button>

      <div className="mb-6">
        <h1 className="text-3xl">{staff.firstName} {staff.lastName}</h1>
        <p className="text-gray-500 mt-1">{staff.code} · {staff.isTeacher ? 'Teacher' : staff.role}</p>
      </div>

      <Card className="p-6 text-gray-500">
        Staff profile coming soon.
      </Card>
    </div>
  );
}
