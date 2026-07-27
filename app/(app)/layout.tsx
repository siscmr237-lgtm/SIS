"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { SisCacheProvider } from "@/lib/SisCache";
import { Sidebar } from "@/components/Sidebar";
import { useAuthGate } from "@/lib/authGate";

// Shared shell for every internal section (Dashboard, Students, Staff, ...).
// Mounts fresh on every direct URL visit and every hard reload, so the auth
// gate below runs independently each time rather than relying on whatever
// redirect happened at login.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const status = useAuthGate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (status !== "ready") {
    return <div className="p-6 text-sm text-gray-600">Loading...</div>;
  }

  return (
    <SisCacheProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-blue-900 text-white flex items-center px-4 gap-3 shadow-md">
          <button onClick={() => setSidebarOpen(true)} className="p-1 rounded hover:bg-blue-800">
            <Menu size={22} />
          </button>
          <span className="font-medium text-sm truncate">School Admin</span>
        </div>
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
        )}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
          {children}
        </main>
      </div>
    </SisCacheProvider>
  );
}
