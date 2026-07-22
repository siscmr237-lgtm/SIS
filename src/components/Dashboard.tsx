"use client";

import { DollarSign, TrendingUp, UserCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { api, BASE_URL } from "../../src/lib/api";
import { useSisCache } from "../../src/lib/SisCache";
import { Card } from "./ui/card";

export function Dashboard() {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const cache = useSisCache();
  const [schoolSettings, setSchoolSettings] = useState({
    name: "School",
    logo: "https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&h=200&fit=crop",
    academicYear: "2024/2025",
    currentTerm: "Term 1",
  });
  const [logoSrc, setLogoSrc] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const userStr = window.localStorage.getItem("user");
    if (!userStr) return;
    try {
      const user = JSON.parse(userStr);
      if (!user?.School?.length) return;
      const school = user.School[0];
      if (!school) return;
      setSchoolSettings(school);
      const logo = school?.logo;
      if (!logo) return;
      // Sidebar resolves this on app load; read from cache instead of re-fetching
      const cached = cache.get<string>('logo-url');
      if (cached) { setLogoSrc(cached); return; }
      // Fallback: fetch and cache (handles rare case where Dashboard mounts before Sidebar)
      if (logo.startsWith('schools/')) {
        const token = window.localStorage.getItem('auth_token');
        fetch(`${BASE_URL}/upload/signed-url?path=${encodeURIComponent(logo)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.url) { cache.set('logo-url', data.url); setLogoSrc(data.url); }
          })
          .catch(() => {});
      } else {
        cache.set('logo-url', logo);
        setLogoSrc(logo);
      }
    } catch {}
  }, []);
  useEffect(() => {
    let mounted = true;
    const cached = cache.get<any>('dashboard');
    if (cached) {
      setDashboardData(cached);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const data = await api.get("/dashboard");
        if (mounted && data) {
          cache.set('dashboard', data);
          setDashboardData(data);
        }
      } catch {
        // 401s are handled globally in api.ts (clears session + redirects)
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const stats = [
    {
      title: "Total Students",
      value: dashboardData?.totalStudents ?? 0,
      icon: Users,
      color: "bg-blue-500",
    },
    {
      title: "Total Staff",
      value: dashboardData?.totalStaff ?? 0,
      icon: UserCheck,
      color: "bg-green-500",
    },
    {
      title: "Fees Collected",
      value: `${(dashboardData?.feesCollected ?? 0).toLocaleString()} FCFA`,
      icon: DollarSign,
      color: "bg-purple-500",
    },
    {
      title: "Outstanding Fees",
      value: `${(dashboardData?.outstandingFees ?? 0).toLocaleString()} FCFA`,
      icon: TrendingUp,
      color: "bg-orange-500",
    },
  ];

  if (loading) {
    return <div className="p-4 md:p-8">Loading dashboard...</div>;
  }

  return (
    <div className="p-4 md:p-8">
      {/* School Header */}
      <Card className="p-6 mb-8 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-center gap-6">
          {logoSrc && (
            <img
              src={logoSrc}
              alt="School Logo"
              className="w-20 h-20 object-cover rounded-lg border-2 border-white shadow-lg"
            />
          )}
          <div className="flex-1">
            <h1 className="text-3xl mb-1 truncate">{schoolSettings.name}</h1>
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
            {dashboardData?.recentExpenses?.slice(0, 3).map((expense: any) => (
              <div
                key={expense.id}
                className="flex justify-between items-center py-2 border-b"
              >
                <div>
                  <p>{expense.description}</p>
                  <p className="text-sm text-gray-500 capitalize">
                    {expense.category}
                  </p>
                </div>
                <p className="text-red-600">
                  {expense.amount.toLocaleString()} FCFA
                </p>
              </div>
            )) ?? <p>No recent expenses.</p>}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl mb-4">Financial Summary</h2>
          <div className="space-y-4">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Total Income</span>
              <span className="text-green-600">
                {(
                  dashboardData?.financialSummary?.totalIncome ?? 0
                ).toLocaleString()}{" "}
                FCFA
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Total Expenses</span>
              <span className="text-red-600">
                {(
                  dashboardData?.financialSummary?.totalExpenses ?? 0
                ).toLocaleString()}{" "}
                FCFA
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span>Net Balance</span>
              <span className="text-blue-600">
                {(
                  dashboardData?.financialSummary?.netBalance ?? 0
                ).toLocaleString()}{" "}
                FCFA
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
