"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { platformApi } from "@/lib/platformApi";
import { PasswordResetControl } from "@/components/platform/PasswordResetControl";
import { ContentLoader } from "@/components/ContentLoader";

/**
 * One school's staff: name, email, phone, and the password control.
 *
 * No salary, no hire date, no ID number — those are on the row but are none of
 * this console's business in V1, and the API does not return them.
 */
interface StaffRow {
  id: number;
  code: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isTeacher: boolean;
  isActive: boolean;
  /** Whether a passwordHash exists. The hash itself is never sent. */
  hasLogin: boolean;
}

export default function SchoolStaffPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const [data, setData] = useState<{ school: { id: number; name: string }; staff: StaffRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    platformApi
      .get(`/platform/schools/${id}/staff`)
      .then(setData)
      .catch((e) => setError(e?.message || "Could not load staff."));
  };
  useEffect(() => { if (id) load(); }, [id]);

  const th: React.CSSProperties = {
    textAlign: "left", padding: "10px 14px", fontSize: "0.75rem",
    textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748B",
    borderBottom: "1px solid #E2E8F0", whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "12px 14px", fontSize: "0.875rem", color: "#0F172A",
    borderBottom: "1px solid #F1F5F9", verticalAlign: "top", whiteSpace: "nowrap",
  };

  if (error) return <p style={{ fontSize: "0.875rem", color: "#DC2626" }}>{error}</p>;
  // "Staff" is written into this page; the school it belongs to is not, so
  // the back link waits with the rest of the data.
  if (!data) {
    return (
      <div style={{ maxWidth: 1000 }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#0F172A", margin: "10px 0 4px" }}>Staff</h1>
        <ContentLoader minHeight={220} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <Link href={`/admin/schools/${id}`} style={{ color: "#64748B", fontSize: "0.8125rem", textDecoration: "none" }}>
        ← {data.school.name}
      </Link>

      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#0F172A", margin: "10px 0 4px" }}>Staff</h1>
      <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: "0 0 18px" }}>
        {data.staff.length} staff member{data.staff.length === 1 ? "" : "s"} at {data.school.name}.
      </p>

      {data.staff.length === 0 ? (
        <p style={{ fontSize: "0.875rem", color: "#64748B" }}>This school has no staff records.</p>
      ) : (
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #E2E8F0", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Phone</th>
                <th style={th}>Login</th>
                <th style={th}>Password</th>
              </tr>
            </thead>
            <tbody>
              {data.staff.map((s) => (
                <tr key={s.id}>
                  <td style={td}>
                    <div>{s.name}</div>
                    <div style={{ fontSize: "0.72rem", color: "#94A3B8", marginTop: 2 }}>
                      {s.role}{s.isTeacher ? " · Teacher" : ""}{!s.isActive ? " · inactive" : ""}
                    </div>
                  </td>
                  <td style={{ ...td, whiteSpace: "normal", overflowWrap: "anywhere" }}>{s.email || "—"}</td>
                  <td style={td}>{s.phone || "—"}</td>
                  <td style={td}>
                    <span style={{ fontSize: "0.75rem", color: s.hasLogin ? "#047857" : "#B45309" }}>
                      {s.hasLogin ? "Has login" : "No login"}
                    </span>
                  </td>
                  <td style={{ ...td, whiteSpace: "normal" }}>
                    <PasswordResetControl
                      endpoint={`/platform/staff/${s.id}/password`}
                      mode={s.hasLogin ? "reset" : "create"}
                      subjectName={s.name}
                      onDone={load}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
