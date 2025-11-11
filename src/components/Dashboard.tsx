import { Card } from './ui/card';
import { Users, UserCheck, DollarSign, TrendingUp } from 'lucide-react';
import { mockStudents, mockStaff, mockFees, mockExpenses, schoolSettings } from '../data/mockData';

export function Dashboard() {
  const totalStudents = mockStudents.length;
  const totalStaff = mockStaff.length;
  
  const totalFeesCollected = mockFees.reduce((sum, fee) => sum + fee.amountPaid, 0);
  const totalFeesOutstanding = mockFees.reduce((sum, fee) => sum + fee.balance, 0);
  const totalExpenses = mockExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  
  const stats = [
    {
      title: 'Total Students',
      value: totalStudents,
      icon: Users,
      color: 'bg-blue-500'
    },
    {
      title: 'Total Staff',
      value: totalStaff,
      icon: UserCheck,
      color: 'bg-green-500'
    },
    {
      title: 'Fees Collected',
      value: `${totalFeesCollected.toLocaleString()} FCFA`,
      icon: DollarSign,
      color: 'bg-purple-500'
    },
    {
      title: 'Outstanding Fees',
      value: `${totalFeesOutstanding.toLocaleString()} FCFA`,
      icon: TrendingUp,
      color: 'bg-orange-500'
    }
  ];

  return (
    <div className="p-8">
      {/* School Header */}
      <Card className="p-6 mb-8 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center gap-6">
          <img 
            src={schoolSettings.logo} 
            alt="School Logo" 
            className="w-20 h-20 object-cover rounded-lg border-2 border-white shadow-lg"
          />
          <div className="flex-1">
            <h1 className="text-3xl mb-1">{schoolSettings.name}</h1>
            <div className="flex gap-4 text-gray-600">
              <span>Academic Year: {schoolSettings.academicYear}</span>
              <span>•</span>
              <span>{schoolSettings.currentTerm}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="mb-8">
        <h2 className="text-2xl mb-2">Dashboard Overview</h2>
        <p className="text-gray-600">Key metrics and recent activities</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`${stat.color} text-white p-3 rounded-lg`}>
                  <Icon size={24} />
                </div>
              </div>
              <h3 className="text-gray-600 text-sm mb-1">{stat.title}</h3>
              <p className="text-2xl">{stat.value}</p>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-xl mb-4">Recent Expenses</h2>
          <div className="space-y-3">
            {mockExpenses.slice(0, 3).map((expense) => (
              <div key={expense.id} className="flex justify-between items-center py-2 border-b">
                <div>
                  <p>{expense.description}</p>
                  <p className="text-sm text-gray-500">{expense.category}</p>
                </div>
                <p className="text-red-600">{expense.amount.toLocaleString()} FCFA</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl mb-4">Financial Summary</h2>
          <div className="space-y-4">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Total Income</span>
              <span className="text-green-600">{totalFeesCollected.toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Total Expenses</span>
              <span className="text-red-600">{totalExpenses.toLocaleString()} FCFA</span>
            </div>
            <div className="flex justify-between py-2">
              <span>Net Balance</span>
              <span className="text-blue-600">
                {(totalFeesCollected - totalExpenses).toLocaleString()} FCFA
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
