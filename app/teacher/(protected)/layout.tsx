"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { TeacherSidebar } from "@/components/TeacherSidebar";
import { useTeacherAuthGate } from "@/lib/teacherAuthGate";

// Shell for the teacher section, mirroring app/(app)/layout.tsx.
//
// (protected) is a route group and adds no URL segment, so everything under it
// still lives at /teacher/*. It exists purely so that /teacher/set-password —
// which is opened from an email link, before any session exists — can sit
// outside this gate while sharing the same "teacher" URL prefix.
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const status = useTeacherAuthGate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (status !== "ready") {
    return <div className="p-6 text-sm text-gray-600">Loading...</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-blue-900 text-white flex items-center px-4 gap-3 shadow-md">
        <button onClick={() => setSidebarOpen(true)} className="p-1 rounded hover:bg-blue-800">
          <Menu size={22} />
        </button>
        <span className="font-medium text-sm truncate">Teacher Portal</span>
      </div>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <TeacherSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}
