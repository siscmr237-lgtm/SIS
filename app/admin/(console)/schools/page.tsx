"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { platformApi } from "@/lib/platformApi";
import { RegistrationStatusBadge } from "@/components/platform/RegistrationStatusBadge";

/**
 * Every school, read-only, plus where each one stands in signing up.
 *
 * Deliberately nothing else — no student names, no fee figures, no staff pay.
 * registrationStatus is the one thing added to the fields already here, and
 * it is a fact about the REGISTRATION rather than about the school's data; the
 * counts are still aggregates, so there is nothing extra here to reveal even by
 * accident. The status has to be on the list rather than only on the detail
 * page: finding the schools waiting on you should not mean opening every row.
 */
interface SchoolRow {
  id: number;
  name: string;
  abbreviation: string;
  registrationStatus: string;
  signedUpAt: string | null;
  studentCount: number;
  staffCount: number;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function SchoolsPage() {
  const [rows, setRows] = useState<SchoolRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    platformApi
      .get("/platform/schools")
      .then(setRows)
      .catch((e) => setError(e?.message || "Could not load schools."));
  }, []);

  const th: React.CSSProperties = {
    textAlign: "left", padding: "10px 14px", fontSize: "0.75rem",
    textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748B",
    borderBottom: "1px solid #E2E8F0", whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "12px 14px", fontSize: "0.875rem", color: "#0F172A",
    borderBottom: "1px solid #F1F5F9", whiteSpace: "nowrap",
  };
  const link: React.CSSProperties = { color: "#1D4ED8", textDecoration: "none" };

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#0F172A", margin: "0 0 4px" }}>Schools</h1>
      <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: "0 0 18px" }}>
        Every school on the platform. Read-only.
      </p>

      {error && (
        <p style={{ fontSize: "0.875rem", color: "#DC2626" }}>{error}</p>
      )}

      {!error && rows === null && (
        <p style={{ fontSize: "0.875rem", color: "#64748B" }}>Loading...</p>
      )}

      {rows && rows.length === 0 && (
        <p style={{ fontSize: "0.875rem", color: "#64748B" }}>No schools have signed up yet.</p>
      )}

      {rows && rows.length > 0 && (
        <div style={{ background: "white", borderRadius: 12, border: "1px solid #E2E8F0", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
            <thead>
              <tr>
                <th style={th}>School</th>
                {/* Second column, not last: where a school stands is the reason
                    to open this list at all, and a status pushed out past the
                    counts is one nobody reads. */}
                <th style={th}>Status</th>
                <th style={th}>Signed up</th>
                <th style={{ ...th, textAlign: "right" }}>Students</th>
                <th style={{ ...th, textAlign: "right" }}>Staff</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  {/* The abbreviation, not the full name. A name long enough to
                      wrap to two lines set the row height for every other
                      column and, on a phone, pushed Status off to the right of
                      a horizontal scroll — the one thing this list exists to
                      show. Six letters do not. The full name is still here as
                      the hover title, and is the heading of the page the link
                      leads to, so nothing is lost, only moved one step away. */}
                  <td style={td}>
                    <Link href={`/admin/schools/${s.id}`} style={link} title={s.name}>
                      {s.abbreviation}
                    </Link>
                  </td>
                  <td style={td}>
                    <RegistrationStatusBadge status={s.registrationStatus} />
                  </td>
                  <td style={td}>{formatDate(s.signedUpAt)}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {s.studentCount}
                  </td>
                  {/* The count itself is the control — it is the thing you are
                      asking a question about. A zero is not a link: there is
                      nothing behind it, and a link that leads to an empty list
                      reads as a fault. */}
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {s.staffCount > 0 ? (
                      <Link href={`/admin/schools/${s.id}/staff`} style={link}>{s.staffCount}</Link>
                    ) : (
                      <span style={{ color: "#94A3B8" }}>0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows && rows.length > 0 && (
        <p style={{ fontSize: "0.75rem", color: "#94A3B8", marginTop: 10 }}>
          {rows.length} school{rows.length === 1 ? "" : "s"}.
        </p>
      )}
    </div>
  );
}
