"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { ContentLoader } from "@/components/ContentLoader";

interface TimetableEntry {
  id: string;
  day: string;
  time: string;
  class?: string;
  subject: string;
  teacher?: string;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export default function TeacherTimetablePage() {
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scoped server-side to this teacher's own periods, so no class filter is
  // offered and nothing is dropped client-side.
  useEffect(() => {
    let alive = true;
    api
      .get("/timetable")
      .then((res: any) => {
        if (alive) setEntries(res ?? []);
      })
      .catch((e: any) => {
        if (alive) setError(e?.message || "Failed to load your timetable.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const forDay = (day: string) =>
    entries
      .filter((e) => e.day === day)
      .sort((a, b) => String(a.time).localeCompare(String(b.time)));

  // Anything the school schedules outside Mon–Fri would otherwise vanish from
  // this read-only view with no indication it exists.
  const otherDays = Array.from(
    new Set(entries.map((e) => e.day).filter((d) => d && !DAYS.includes(d))),
  );

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">My Timetable</h1>
        <p className="text-gray-600">Your teaching periods for the week</p>
      </div>

      {loading ? (
        <Card><ContentLoader minHeight={200} /></Card>
      ) : error ? (
        <Card className="p-6 text-red-600 text-sm">
          Couldn't load your timetable. Please refresh and try again.
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {[...DAYS, ...otherDays].map((day) => {
            const daySchedule = forDay(day);
            return (
              <Card key={day} className="p-4">
                <h3 className="mb-4 pb-2 border-b">{day}</h3>
                <div className="space-y-3">
                  {daySchedule.length > 0 ? (
                    daySchedule.map((entry) => (
                      <div key={entry.id} className="bg-gray-50 p-3 rounded text-sm">
                        <p className="text-xs text-gray-600 mb-1">{entry.time}</p>
                        <p className="mb-1">{entry.subject}</p>
                        {entry.class && <p className="text-xs text-gray-500">{entry.class}</p>}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-4">No classes scheduled</p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
