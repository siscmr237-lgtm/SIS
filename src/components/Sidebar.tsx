"use client";

import {
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Home,
  LayoutGrid,
  Receipt,
  Settings,
  UserCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { BASE_URL } from '../lib/api';
import { useSisCache } from '../lib/SisCache';
import { NavigationPage } from "../App";

interface SidebarProps {
  currentPage: NavigationPage;
  onNavigate: (page: NavigationPage) => void;
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ currentPage, onNavigate, open = false, onClose }: SidebarProps) {
  const cache = useSisCache();
  const menuItems = [
    { id: "dashboard" as NavigationPage, label: "Dashboard", icon: Home },
    { id: "students" as NavigationPage, label: "Students", icon: Users },
    { id: "staff" as NavigationPage, label: "Staff", icon: UserCheck },
    { id: "classes" as NavigationPage, label: "Classes", icon: LayoutGrid },
    { id: "finance" as NavigationPage, label: "Finance", icon: DollarSign },
    { id: "expenses" as NavigationPage, label: "Expenses", icon: Receipt },
    {
      id: "report-cards" as NavigationPage,
      label: "Report Cards",
      icon: FileText,
    },
    { id: "attendance" as NavigationPage, label: "Attendance", icon: Calendar },
    { id: "timetable" as NavigationPage, label: "Timetable", icon: Clock },
  ];
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
      if (!user?.School) return;
      const school = user.School[0];
      setSchoolSettings(school);
      const logo = school?.logo;
      if (!logo) return;
      const cached = cache.get<string>('logo-url');
      if (cached) { setLogoSrc(cached); return; }
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

  const handleNavigate = (page: NavigationPage) => {
    onNavigate(page);
    onClose?.();
  };

  return (
    <aside
      className={[
        'w-64 bg-blue-900 text-white flex flex-col flex-shrink-0',
        // Mobile: fixed overlay drawer; desktop: static in flex flow
        'fixed inset-y-0 left-0 z-50',
        'md:static md:inset-auto md:z-auto',
        'transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      ].join(' ')}
    >
      <div className="p-6 border-b border-blue-800">
        <div className="flex items-center gap-3 mb-4">
          {logoSrc && (
            <img
              src={logoSrc}
              alt="School Logo"
              className="w-12 h-12 object-cover rounded-lg border-2 border-blue-700 flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-medium truncate">
              {schoolSettings.name}
            </h1>
            <p className="text-xs text-blue-200">School Admin</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg mb-1 transition-colors ${
                isActive
                  ? "bg-blue-700 text-white"
                  : "text-blue-100 hover:bg-blue-800"
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-4 py-2 border-t border-blue-800">
        <button
          onClick={() => handleNavigate("settings")}
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
            currentPage === "settings"
              ? "bg-blue-700 text-white"
              : "text-blue-100 hover:bg-blue-800"
          }`}
        >
          <Settings size={18} />
          <span>School Settings</span>
        </button>
      </div>

      <div className="p-4 border-t border-blue-800">
        <p className="text-sm text-blue-300">{schoolSettings.academicYear}</p>
        <p className="text-xs text-blue-400 mt-1">
          {schoolSettings.currentTerm}
        </p>
      </div>
    </aside>
  );
}
