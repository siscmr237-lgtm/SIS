"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { useTeacherAssignments, useTeacherTeaching } from "@/lib/teacherAssignments";

export default function TeacherDashboardPage() {
  const { data: assignments, loading, error } = useTeacherAssignments();
  const { data: classes, loading: loadingClasses, error: classesError } = useTeacherTeaching();
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
  const teachingClasses = classes ?? [];

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
            <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {classTeacherOf.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span>{c.name}</span>
                  <span className="text-xs text-gray-400">{c.code}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Every class this teacher works in, however they got there — a teacher
            can be class teacher of one and a subject specialist in several
            others, and all of them are their responsibility. */}
        <Card className="p-6">
          <h2 className="text-base font-medium mb-4">Your Classes</h2>
          {loadingClasses ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : teachingClasses.length === 0 ? (
            <p className="text-sm text-gray-500">
              You have no classes yet. Your school admin assigns these.
            </p>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {teachingClasses.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm gap-3">
                  <span>
                    {c.name}
                    <span className="text-xs text-gray-400" style={{ marginLeft: 8 }}>
                      {c.isClassTeacher
                        ? "class teacher"
                        : `${c.subjects.length} subject${c.subjects.length === 1 ? "" : "s"}`}
                    </span>
                  </span>
                  <span className="text-xs text-gray-500" style={{ whiteSpace: "nowrap" }}>
                    {c.studentCount} student{c.studentCount === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {(error || classesError) && (
        <Card className="p-6 text-red-600 text-sm">
          Couldn't load your classes. Please refresh and try again.
        </Card>
      )}
    </div>
  );
}
