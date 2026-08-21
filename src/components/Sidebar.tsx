"use client";

import {
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Home,
  LayoutGrid,
  Settings,
  UserCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BASE_URL } from '../lib/api';
import { useSisCache } from '../lib/SisCache';
import { formatTermLabel, resolveSchoolTerm } from '../utils/academicTerm';

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

const MENU_ITEMS = [
  { href: "/school/dashboard", label: "Dashboard", icon: Home },
  { href: "/school/students", label: "Students", icon: Users },
  { href: "/school/staff", label: "Staff", icon: UserCheck },
  { href: "/school/classes", label: "Classes", icon: LayoutGrid },
  { href: "/school/finance", label: "Finance", icon: DollarSign },
  { href: "/school/report-cards", label: "Report Cards", icon: FileText },
  { href: "/school/attendance", label: "Attendance", icon: Calendar },
  { href: "/school/timetable", label: "Timetable", icon: Clock },
];

/**
 * Menu entries whose feature is not shipped. Kept in the list rather than
 * removed so the app still says the thing is planned — a menu that quietly
 * loses an item reads as something having broken.
 */
const COMING_SOON = ["/school/timetable"];

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const cache = useSisCache();
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const [schoolSettings, setSchoolSettings] = useState({
    name: "School",
    logo: "https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&h=200&fit=crop",
    academicYear: "2024/2025",
    currentTerm: "Term 1",
    autoTermEnabled: true,
  });
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const { academicYear, term } = resolveSchoolTerm(schoolSettings);

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

  return (
    /* Anchored to the RIGHT edge on mobile, matching the hamburger that opens
       it. The transform and z-index live in MOBILE_DRAWER_CSS rather than in
       utility classes: `translate-x-full` is not in the frozen stylesheet, so
       the class form of this would have silently done nothing. From md up the
       md:static below takes over and the offsets stop applying. */
    <aside
      data-sis-drawer=""
      data-open={open ? 'true' : 'false'}
      className="w-64 bg-blue-900 text-white flex flex-col fixed inset-y-0 right-0 md:static md:inset-auto md:z-auto"
    >
      <div className="p-6 border-b border-blue-800">
        <div className="flex items-center gap-3 mb-4">
          {logoSrc && (
            <img
              src={logoSrc}
              alt="School Logo"
              className="w-12 h-12 object-cover rounded-lg border-2 border-blue-700"
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
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          // Not built yet. Rendered as a non-link so there is nothing to click,
          // nothing to focus and no href to middle-click or copy — a Link with a
          // swallowed onClick would still look and behave like a destination.
          // It reads as unavailable rather than as broken: dimmed, no hover, a
          // default cursor and the reason spelled out beside it.
          if (COMING_SOON.includes(item.href)) {
            return (
              <div
                key={item.href}
                aria-disabled="true"
                title={`${item.label} — coming soon`}
                className="w-full flex items-center gap-3 px-4 py-2 rounded-lg mb-1"
                style={{ color: '#93B4D8', opacity: 0.55, cursor: 'default' }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                <span
                  className="text-xs"
                  style={{
                    marginLeft: 'auto', padding: '1px 6px', borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.35)', whiteSpace: 'nowrap',
                  }}
                >
                  Soon
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => onClose?.()}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg mb-1 transition-colors ${
                active
                  ? "bg-blue-700 text-white"
                  : "text-blue-100 hover:bg-blue-800"
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-2 border-t border-blue-800">
        <Link
          href="/school/settings"
          onClick={() => onClose?.()}
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
            isActive("/school/settings")
              ? "bg-blue-700 text-white"
              : "text-blue-100 hover:bg-blue-800"
          }`}
        >
          <Settings size={18} />
          <span>School Settings</span>
        </Link>
      </div>

      <div className="p-4 border-t border-blue-800">
        <p className="text-sm text-blue-300">{academicYear}</p>
        <p className="text-xs text-blue-400 mt-1">
          {formatTermLabel(term)}
        </p>
      </div>
    </aside>
  );
}
