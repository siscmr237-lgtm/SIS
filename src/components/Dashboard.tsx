"use client";

import { DollarSign, TrendingUp, UserCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { api, BASE_URL } from "../../src/lib/api";
import { useSisCache } from "../../src/lib/SisCache";
import { formatTermLabel, resolveSchoolTerm } from "../../src/utils/academicTerm";
import { computeSchoolAbbreviation } from "../../src/utils/schoolAbbreviation";
import { Card } from "./ui/card";

export function Dashboard() {
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const cache = useSisCache();
  const [schoolSettings, setSchoolSettings] = useState({
    name: "School",
    abbreviation: "",
    logo: "https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&h=200&fit=crop",
    academicYear: "2024/2025",
    currentTerm: "Term 1",
    autoTermEnabled: true,
  });
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const { academicYear, term } = resolveSchoolTerm(schoolSettings);

  // The school object here comes from the cached localStorage copy written at
  // login, which for a session predating the abbreviation column simply has no
  // abbreviation field. Falling back to the raw name overflows the header for
  // long names, so derive one on the fly as a last resort — this holds no
  // matter which code path created the school or how stale the cache is.
  const headerName =
    schoolSettings.abbreviation ||
    computeSchoolAbbreviation(schoolSettings.name) ||
    schoolSettings.name;

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
      {/* overflow-hidden + min-w-0 are what actually keep this inside the
          viewport on narrow screens: a flex child defaults to min-width:auto,
          which refuses to shrink below its content, so without min-w-0 the
          `truncate` below can never engage and a long abbreviation pushes the
          card past the right edge. shrink-0 stops the logo being squashed, and
          flex-wrap lets the year/term line drop to a second line instead of
          overflowing. None of these change desktop, where there's room to spare. */}
      <Card className="p-6 mb-8 bg-gradient-to-r from-blue-50 to-purple-50 overflow-hidden">
        <div className="flex items-center gap-6 min-w-0">
          {logoSrc && (
            <img
              src={logoSrc}
              alt="School Logo"
              className="w-20 h-20 object-cover rounded-lg border-2 border-white shadow-lg shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl mb-1 truncate">{headerName}</h1>
            <div className="flex flex-wrap gap-4 text-gray-600 min-w-0">
              <span className="truncate min-w-0">Academic Year: {academicYear}</span>
              <span className="shrink-0">•</span>
              <span className="truncate min-w-0">{formatTermLabel(term)}</span>
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
