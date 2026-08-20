"use client";

import { useEffect, useState } from "react";
import { platformApi } from "@/lib/platformApi";

/**
 * V1 placeholder: proof the door works. Every school, read-only, three columns.
 *
 * Deliberately nothing else — no student names, no fee figures, no staff pay.
 * The API returns exactly these three fields and computes the count as an
 * aggregate, so there is nothing extra here to reveal even by accident.
 */
interface SchoolRow {
  id: number;
  name: string;
  signedUpAt: string | null;
  studentCount: number;
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
                <th style={th}>Signed up</th>
                <th style={{ ...th, textAlign: "right" }}>Students</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td style={{ ...td, whiteSpace: "normal" }}>{s.name}</td>
                  <td style={td}>{formatDate(s.signedUpAt)}</td>
                  <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {s.studentCount}
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
