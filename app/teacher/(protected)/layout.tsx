"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { TeacherSidebar } from "@/components/TeacherSidebar";
import { MOBILE_DRAWER_CSS } from "@/components/mobileDrawerCss";
import { PageFade } from "@/components/PageFade";
import { useTeacherAuthGate } from "@/lib/teacherAuthGate";
import { ContentLoader } from "@/components/ContentLoader";

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
    return <ContentLoader minHeight={"100vh"} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <style>{MOBILE_DRAWER_CSS}</style>
      {/* Mirrors app/(app)/layout.tsx exactly — teachers are on phones too, so
          the same one-handed reach argument applies. */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-blue-900 text-white flex items-center justify-between px-4 gap-3 shadow-md">
        <span className="font-medium text-sm truncate min-w-0">Teacher Portal</span>
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          aria-expanded={sidebarOpen}
          className="p-1 rounded hover:bg-blue-800 shrink-0"
        >
          <Menu size={22} />
        </button>
      </div>
      <div
        data-sis-drawer-overlay=""
        data-open={sidebarOpen ? 'true' : 'false'}
        aria-hidden="true"
        className="fixed inset-0 md:hidden"
        onClick={() => setSidebarOpen(false)}
      />
      <TeacherSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        {/* Same arrival animation as the admin shell, from the same component so
            the two sections cannot drift. See src/components/PageFade.tsx. */}
        <PageFade>{children}</PageFade>
      </main>
    </div>
  );
}
