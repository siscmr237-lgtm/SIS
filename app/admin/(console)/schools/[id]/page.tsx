"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { platformApi } from "@/lib/platformApi";
import { PasswordResetControl } from "@/components/platform/PasswordResetControl";
import { hexForLabel } from "@/lib/uniformColors";
import { RegistrationStatusBadge } from "@/components/platform/RegistrationStatusBadge";
import { ApproveSchoolControl } from "@/components/platform/ApproveSchoolControl";
import { RevertToPendingControl } from "@/components/platform/RevertToPendingControl";
import { PhoneChangeControl } from "@/components/platform/PhoneChangeControl";

/**
 * One school. Identity, headcounts, and its admin accounts.
 *
 * The uniform is THREE COLOUR LABELS on a single Json column — shirt, trouser,
 * gown. There is no uniform description field on School, so none is invented
 * here; the section shows the garments it actually has.
 *
 * THE ONE STATUS ACTION SITS AT THE FOOT, not the head. Approving a PENDING
 * school still leads, because that is a decision the page is asking for. The
 * reverse — marking an approved school as waiting again — is not asked for by
 * anything; it is reached for, rarely, and it belongs out of the way of the
 * details somebody came to read. See the note above it.
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
  /** FAILED | INCOMPLETE | PENDING | APPROVED. Typed as string so a value this
   *  build has not heard of renders as itself rather than crashing the page. */
  registrationStatus: string;
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
          <div style={{ marginTop: 7 }}>
            <RegistrationStatusBadge status={school.registrationStatus} />
          </div>
        </div>
      </div>

      {/* The approval, on its own card directly under the identity block — the
          first thing on the page for the one status that needs a decision, and
          absent entirely for every other status. A school that has not
          submitted its details cannot be approved (the API refuses it), and one
          that already is has nothing left to do here. */}
      {school.registrationStatus === "PENDING" && (
        <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, margin: "0 0 3px", color: "#0F172A" }}>
              Waiting for approval
            </h2>
            <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: 0, lineHeight: 1.45 }}>
              This school has submitted its details and cannot reach its dashboard until it is approved.
            </p>
          </div>
          <ApproveSchoolControl
            schoolId={school.id}
            schoolName={school.name}
            onApproved={(status) =>
              setSchool((prev) => (prev ? { ...prev, registrationStatus: status } : prev))
            }
          />
        </div>
      )}

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
                {/* The two credential controls, side by side. Both are bordered
                    white buttons of the same size, and both may drop a message
                    underneath — hence align-items:flex-start, so one reporting
                    a result does not shove the other down the page.

                    Wrapping is allowed: at the narrowest console width two
                    buttons of this length do not fit on one line, and a row
                    that overflows would put the second one off the edge. */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                  <PasswordResetControl
                    endpoint={`/platform/school-admins/${a.id}/password`}
                    mode="reset"
                    subjectName={a.name}
                  />
                  <PhoneChangeControl
                    adminId={a.id}
                    adminName={a.name}
                    currentPhone={a.phoneNumber}
                    // Written straight back into the loaded school, so the Phone
                    // field above updates without a reload. The server's value,
                    // not the field's — it is the one that was actually stored.
                    onSaved={(phoneNumber) =>
                      setSchool((prev) =>
                        prev
                          ? {
                              ...prev,
                              admins: prev.admins.map((x) =>
                                x.id === a.id ? { ...x, phoneNumber } : x,
                              ),
                            }
                          : prev,
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Marking a school as waiting again, alone at the foot of the page and
          deliberately outside every card.

          It used to head an "Approved and live" card explaining itself. The
          card is gone: it announced a status the badge under the school's name
          already gives, and put the page's only destructive-feeling control
          above everything a team member actually comes here to read. On its own
          down here it is still findable and no longer in the way. The dialog it
          opens carries the warning the card's paragraph used to.

          Still shown for APPROVED only. That has not changed and is not
          cosmetic: a school that is not approved has no access to take away,
          and the API refuses the call rather than dragging an INCOMPLETE school
          forward into a submission it never made. */}
      {school.registrationStatus === "APPROVED" && (
        <div style={{ marginTop: 8, marginBottom: 16 }}>
          <RevertToPendingControl
            schoolId={school.id}
            schoolName={school.name}
            onReverted={(status) =>
              setSchool((prev) => (prev ? { ...prev, registrationStatus: status } : prev))
            }
          />
        </div>
      )}
    </div>
  );
}
