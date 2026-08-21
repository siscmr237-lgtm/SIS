"use client";

import {
  Calendar,
  ClipboardList,
  Clock,
  Home,
  LogOut,
  User,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BASE_URL } from "../lib/api";
import { useSisCache } from "../lib/SisCache";
import { computeSchoolAbbreviation } from "../utils/schoolAbbreviation";

interface TeacherSidebarProps {
  open?: boolean;
  onClose?: () => void;
}

const MENU_ITEMS = [
  { href: "/teacher", label: "Dashboard", icon: Home },
  { href: "/teacher/attendance", label: "Attendance", icon: Calendar },
  { href: "/teacher/marks", label: "Marks", icon: ClipboardList },
  { href: "/teacher/timetable", label: "Timetable", icon: Clock },
  { href: "/teacher/salary", label: "Salary", icon: Wallet },
  { href: "/teacher/profile", label: "My Profile", icon: User },
];

export function TeacherSidebar({ open = false, onClose }: TeacherSidebarProps) {
  const pathname = usePathname();
  const cache = useSisCache();
  const [schoolName, setSchoolName] = useState("School");
  const [schoolAbbreviation, setSchoolAbbreviation] = useState("");
  const [teacherName, setTeacherName] = useState("Teacher");
  const [logoSrc, setLogoSrc] = useState<string | null>(null);

  // Same fallback chain as the admin dashboard: the stored abbreviation, then one
  // derived from the name, then the name itself. A session created before the
  // abbreviation column existed simply has no abbreviation field, and the raw
  // name is what was overflowing this header.
  const headerName = schoolAbbreviation || computeSchoolAbbreviation(schoolName) || schoolName;

  // "/teacher" is a prefix of every other item's href, so the usual
  // startsWith() rule would leave Dashboard permanently highlighted. The
  // dashboard is matched exactly; the rest keep prefix matching so a future
  // nested route still lights up its parent.
  const isActive = (href: string) =>
    href === "/teacher" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const userStr = window.localStorage.getItem("user");
    if (!userStr) return;
    try {
      const user = JSON.parse(userStr);
      const school = user?.School?.[0];
      if (school?.name) setSchoolName(school.name);
      if (school?.abbreviation) setSchoolAbbreviation(school.abbreviation);
      const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.name;
      if (name) setTeacherName(name);

      // Resolved exactly as the admin sidebar does, rather than re-implemented:
      // a stored logo is either an absolute URL or a `schools/…` path in private
      // storage, and the latter only works through a signed URL. The teacher
      // session can obtain one — /upload/signed-url carries no admin guard and
      // scopes by req.user.schoolId, which a teacher session has.
      const logo = school?.logo;
      if (!logo) return;
      const cached = cache.get<string>('logo-url');
      if (cached) { setLogoSrc(cached); return; }
      if (String(logo).startsWith('schools/')) {
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
  }, [cache]);

  const signOut = () => {
    if (typeof window === "undefined") return;
    window.localStorage.clear();
    // replace(), not push(): signing out must not leave the teacher section one
    // Back press away.
    window.location.replace("/teacher/login");
  };

  return (
    /* Same treatment as the admin Sidebar — teachers are on phones too, so the
       reach argument applies identically. See MOBILE_DRAWER_CSS. */
    <aside
      data-sis-drawer=""
      data-open={open ? 'true' : 'false'}
      className="w-64 bg-blue-900 text-white flex flex-col fixed inset-y-0 right-0 md:static md:inset-auto md:z-auto"
    >
      <div className="p-6 border-b border-blue-800">
        <div className="flex items-center gap-3">
          {logoSrc && (
            <img
              src={logoSrc}
              alt="School Logo"
              className="w-12 h-12 object-cover rounded-lg border-2 border-blue-700"
            />
          )}
          <div className="flex-1 min-w-0">
            {/* The abbreviation, not the full name: a long name truncated to
                nothing told the teacher less than six letters do. */}
            <h1 className="text-sm font-medium truncate" title={schoolName}>{headerName}</h1>
            <p className="text-xs text-blue-200 truncate">{teacherName}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 overflow-y-auto">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

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

      <div className="p-4 border-t border-blue-800">
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-blue-100 hover:bg-blue-800 transition-colors"
        >
          <LogOut size={18} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
