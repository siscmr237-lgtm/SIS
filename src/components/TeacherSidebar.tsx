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
  const [schoolName, setSchoolName] = useState("School");
  const [teacherName, setTeacherName] = useState("Teacher");

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
      const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.name;
      if (name) setTeacherName(name);
    } catch {}
  }, []);

  const signOut = () => {
    if (typeof window === "undefined") return;
    window.localStorage.clear();
    // replace(), not push(): signing out must not leave the teacher section one
    // Back press away.
    window.location.replace("/login");
  };

  return (
    <aside className={`w-64 bg-blue-900 text-white flex flex-col fixed inset-y-0 left-0 z-50 md:static md:inset-auto md:z-auto transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
      <div className="p-6 border-b border-blue-800">
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-medium truncate">{schoolName}</h1>
          <p className="text-xs text-blue-200 truncate">{teacherName}</p>
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
