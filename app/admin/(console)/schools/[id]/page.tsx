"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { platformApi } from "@/lib/platformApi";
import { PasswordResetControl } from "@/components/platform/PasswordResetControl";
import { hexForLabel } from "@/lib/uniformColors";

/**
 * One school. Identity, headcounts, and its admin accounts.
 *
 * The uniform is THREE COLOUR LABELS on a single Json column — shirt, trouser,
 * gown. There is no uniform description field on School, so none is invented
 * here; the section shows the garments it actually has.
 */
interface SchoolAdmin {
  id: number;
  name: string;
  email: string | null;
  phoneNumber: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
}

interface SchoolDetail {
  id: number;
  name: string;
  abbreviation: string;
  logo: string | null;
  motto: string | null;
  address: string | null;
  schoolType: string | null;
  uniformColors: { shirt: string | null; trouser: string | null; gown: string | null } | null;
  academicYear: string;
  currentTerm: string;
  studentCount: number;
  staffCount: number;
  admins: SchoolAdmin[];
}

const card: React.CSSProperties = {
  background: "white", border: "1px solid #E2E8F0", borderRadius: 12,
  padding: 18, marginBottom: 16,
};
const label: React.CSSProperties = { fontSize: "0.75rem", color: "#64748B", display: "block" };
const value: React.CSSProperties = { fontSize: "0.875rem", color: "#0F172A", marginTop: 2 };

function Swatch({ garment, colour }: { garment: string; colour: string | null }) {
  const hex = hexForLabel(colour);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        aria-hidden="true"
        style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0,
          background: hex || "transparent",
          // A white swatch on white needs an outline or it reads as missing;
          // so does an unset one, which gets a dashed box instead of a filled.
          border: hex ? "1px solid rgba(15,23,42,0.25)" : "1px dashed #CBD5E1",
        }}
      />
      <span style={{ fontSize: "0.8125rem", color: "#0F172A" }}>
        {garment}: <span style={{ color: colour ? "#0F172A" : "#94A3B8" }}>{colour || "not set"}</span>
      </span>
    </div>
  );
}

export default function SchoolDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    platformApi
      .get(`/platform/schools/${id}`)
      .then(setSchool)
      .catch((e) => setError(e?.message || "Could not load the school."));
    // A stored logo is often a private storage path, not a URL, so it has to be
    // signed before it can be rendered. Failure is not fatal — the path is shown
    // as text instead.
    platformApi
      .get(`/platform/schools/${id}/logo-url`)
      .then((r: any) => setLogoUrl(r?.url ?? null))
      .catch(() => setLogoFailed(true));
  }, [id]);

  if (error) return <p style={{ fontSize: "0.875rem", color: "#DC2626" }}>{error}</p>;
  if (!school) return <p style={{ fontSize: "0.875rem", color: "#64748B" }}>Loading...</p>;

  const uniform = school.uniformColors || { shirt: null, trouser: null, gown: null };
  const anyUniform = uniform.shirt || uniform.trouser || uniform.gown;

  return (
    <div style={{ maxWidth: 760 }}>
      <Link href="/admin/schools" style={{ color: "#64748B", fontSize: "0.8125rem", textDecoration: "none" }}>
        ← Schools
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "12px 0 18px" }}>
        {logoUrl && !logoFailed ? (
          <img
            src={logoUrl}
            alt=""
            onError={() => setLogoFailed(true)}
            style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", border: "1px solid #E2E8F0", flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: 56, height: 56, borderRadius: 10, flexShrink: 0,
            background: "#F1F5F9", border: "1px dashed #CBD5E1",
            display: "grid", placeItems: "center", fontSize: "0.7rem", color: "#94A3B8",
          }}>
            no logo
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#0F172A", margin: 0 }}>{school.name}</h1>
          <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: "3px 0 0" }}>
            {school.abbreviation}
            {school.motto ? ` · ${school.motto}` : ""}
          </p>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
          <div><span style={label}>Students</span><div style={value}>{school.studentCount}</div></div>
          <div>
            <span style={label}>Staff</span>
            <div style={value}>
              {school.staffCount > 0 ? (
                <Link href={`/admin/schools/${school.id}/staff`} style={{ color: "#1D4ED8", textDecoration: "none" }}>
                  {school.staffCount}
                </Link>
              ) : "0"}
            </div>
          </div>
          <div><span style={label}>Academic year</span><div style={value}>{school.academicYear}</div></div>
          <div><span style={label}>Current term</span><div style={value}>{school.currentTerm}</div></div>
          {school.address && (
            <div style={{ gridColumn: "span 2" }}>
              <span style={label}>Address</span>
              <div style={{ ...value, whiteSpace: "normal" }}>{school.address}</div>
            </div>
          )}
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 4px", color: "#0F172A" }}>Uniform</h2>
        <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: "0 0 12px", lineHeight: 1.45 }}>
          Three garment colours. The schema holds no uniform description beyond these.
        </p>
        {anyUniform ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Swatch garment="Shirt" colour={uniform.shirt} />
            <Swatch garment="Trouser" colour={uniform.trouser} />
            <Swatch garment="Gown" colour={uniform.gown} />
          </div>
        ) : (
          <p style={{ fontSize: "0.8125rem", color: "#94A3B8", margin: 0 }}>No uniform colours set.</p>
        )}
      </div>

      <div style={card}>
        <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 12px", color: "#0F172A" }}>
          Administrator{school.admins.length === 1 ? "" : "s"}
        </h2>
        {school.admins.length === 0 ? (
          <p style={{ fontSize: "0.8125rem", color: "#94A3B8", margin: 0 }}>No administrator on record.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {school.admins.map((a) => (
              <div key={a.id} style={{ borderTop: "1px solid #F1F5F9", paddingTop: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginBottom: 10 }}>
                  <div>
                    <span style={label}>Name</span>
                    <div style={value}>{a.name}{!a.isActive && <span style={{ color: "#B45309", fontSize: "0.72rem" }}> · disabled</span>}</div>
                  </div>
                  <div><span style={label}>Phone</span><div style={value}>{a.phoneNumber || "—"}</div></div>
                  <div style={{ gridColumn: "span 2" }}>
                    <span style={label}>Email</span>
                    {/* Nullable on AdminUser, unlike Staff.email. */}
                    <div style={{ ...value, overflowWrap: "anywhere" }}>{a.email || "—"}</div>
                  </div>
                </div>
                <PasswordResetControl
                  endpoint={`/platform/school-admins/${a.id}/password`}
                  mode="reset"
                  subjectName={a.name}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
