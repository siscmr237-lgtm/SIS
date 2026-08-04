"use client";

import { Calendar, ClipboardList, Clock, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useTeacherAssignments } from "@/lib/teacherAssignments";

const QUICK_LINKS = [
  {
    href: "/teacher/attendance",
    label: "Attendance",
    description: "Mark today's register for your class",
    icon: Calendar,
  },
  {
    href: "/teacher/marks",
    label: "Marks",
    description: "Enter scores for a test or exam",
    icon: ClipboardList,
  },
  {
    href: "/teacher/timetable",
    label: "Timetable",
    description: "See your week at a glance",
    icon: Clock,
  },
  {
    href: "/teacher/salary",
    label: "Salary",
    description: "Your pay history and balance",
    icon: Wallet,
  },
];

export default function TeacherDashboardPage() {
  const { data: assignments, loading, error } = useTeacherAssignments();
  const [firstName, setFirstName] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const userStr = window.localStorage.getItem("user");
      if (!userStr) return;
      const user = JSON.parse(userStr);
      setFirstName(user?.firstName || String(user?.name || "").split(" ")[0] || "");
    } catch {}
  }, []);

  const classTeacherOf = assignments?.classTeacherOf ?? [];
  const subjectAssignments = assignments?.subjectAssignments ?? [];

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">
          {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        </h1>
        <p className="text-gray-600">Here's what you're responsible for this term</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card className="p-6">
          <h2 className="text-base font-medium mb-4">Class Teacher Of</h2>
          {loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : classTeacherOf.length === 0 ? (
            <p className="text-sm text-gray-500">
              You are not currently the class teacher of any class.
            </p>
          ) : (
            <ul className="space-y-2">
              {classTeacherOf.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-900">{c.name}</span>
                  <span className="text-xs text-gray-400">{c.code}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-base font-medium mb-4">Subjects You Teach</h2>
          {loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : subjectAssignments.length === 0 ? (
            <p className="text-sm text-gray-500">
              No subject assignments yet. Your school admin assigns these.
            </p>
          ) : (
            <ul className="space-y-2">
              {subjectAssignments.map((a) => (
                <li
                  key={`${a.classId}-${a.subjectId}`}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-900">{a.subjectName ?? `Subject ${a.subjectId}`}</span>
                  <span className="text-xs text-gray-400">{a.className ?? `Class ${a.classId}`}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {error && (
        <Card className="p-6 mb-6 text-red-600 text-sm">
          Couldn't load your assignments. Please refresh and try again.
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href}>
              <Card className="p-6 h-full hover:border-blue-400 hover:shadow-sm transition-all">
                <Icon size={22} className="text-blue-700 mb-3" />
                <p className="font-medium text-gray-900 mb-1">{link.label}</p>
                <p className="text-sm text-gray-500">{link.description}</p>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
