"use client";

import { Clock } from "lucide-react";
import { Card } from "@/components/ui/card";

/**
 * Timetable — not shipped yet.
 *
 * The sidebar entry is disabled, so this page is only reachable by typing the
 * URL or following an old link. It says so plainly rather than rendering a
 * half-finished timetable under a "coming soon" heading, which would leave
 * somebody unsure whether what they were looking at counted.
 *
 * src/components/Timetable.tsx is left untouched and still builds; putting it
 * back is restoring one import and one line.
 */
export default function TimetablePage() {
  return (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 className="text-2xl mb-2">Timetable</h2>
        <p className="text-gray-600">Class schedules and period planning</p>
      </div>

      <Card style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: '50%',
            backgroundColor: '#F5F7FA', color: '#0f2345',
            marginBottom: '0.875rem',
          }}
        >
          <Clock size={26} />
        </span>
        <h3 className="text-xl" style={{ marginBottom: '0.35rem' }}>Coming soon</h3>
        <p className="text-sm text-gray-600" style={{ maxWidth: 380, margin: '0 auto' }}>
          Timetables are not ready yet. Everything else — attendance, marks, fees and report
          cards — works as normal in the meantime.
        </p>
      </Card>
    </div>
  );
}
