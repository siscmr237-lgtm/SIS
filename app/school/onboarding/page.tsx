"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../src/lib/api";
import { fetchRegistrationSnapshot, routeForSnapshot } from "../../../src/lib/registrationStatus";
import { SCHOOL_HOME_PATH } from "../../../src/lib/registrationRoutes";
import { clampSectionCount, expandClassSections, MAX_SECTIONS } from "../../../src/lib/classes";
import { postImage, prepareImage } from "../../../src/lib/uploadImage";
import { EMPTY_UNIFORM_COLORS, UniformColors } from "../../../src/lib/uniformColors";
import { UniformColorPicker } from "../../../src/components/onboarding/UniformColorPicker";
import { clearSession, getUser, setUser } from "../../../src/lib/session";

type SchoolType = "DAYCARE_NURSERY" | "DAYCARE_NURSERY_PRIMARY";

interface CatalogEntry {
  name: string;
  schoolTypes: string[];
}

const SCHOOL_TYPE_OPTIONS = [
  {
    value: "DAYCARE_NURSERY" as SchoolType,
    label: "Daycare and Nursery",
    sub: "Pre-Nursery, Nursery 1 & 2, and Day Care levels",
  },
  {
    value: "DAYCARE_NURSERY_PRIMARY" as SchoolType,
    label: "Daycare, Nursery and Primary",
    sub: "All of the above plus Class 1 – 6",
  },
];

const DRAFT_KEY_BASE = "onboarding_draft_v1";

interface OnboardingDraft {
  schoolType?: SchoolType | "";
  selectedClasses?: string[];
  sectionsByClass?: Record<string, number>;
  motto?: string;
  address?: string;
  uniformColors?: UniformColors;
}

// Scoped to the signed-in account so a shared browser can't leak one admin's
// in-progress draft into another admin's onboarding form.
function getDraftKey(): string {
  if (typeof window === "undefined") return DRAFT_KEY_BASE;
  const user = getUser("school");
  return `${DRAFT_KEY_BASE}:${user?.id ?? "anon"}`;
}

function loadDraft(): OnboardingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getDraftKey());
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: 44,
  padding: "0 0.875rem",
  borderRadius: 12,
  fontSize: "0.875rem",
  color: "#111827",
  backgroundColor: "white",
  outline: "none",
  border: "1.5px solid #D1D5DB",
  boxSizing: "border-box",
};

function Section({
  title,
  children,
  required,
  optional,
}: {
  title: string;
  children: React.ReactNode;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          fontWeight: 600,
          fontSize: "0.9rem",
          color: "#111827",
          marginBottom: 10,
        }}
      >
        {title}
        {required && <span style={{ color: "#DC2626", marginLeft: 4 }}>*</span>}
        {optional && (
          <span
            style={{
              fontSize: "0.78rem",
              color: "#9CA3AF",
              fontWeight: 400,
              marginLeft: 6,
            }}
          >
            (optional)
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();

  const [schoolType, setSchoolType] = useState<SchoolType | "">(() => loadDraft()?.schoolType ?? "");
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>(() => loadDraft()?.selectedClasses ?? []);
  const [sectionsByClass, setSectionsByClass] = useState<Record<string, number>>(() => loadDraft()?.sectionsByClass ?? {});
  const [motto, setMotto] = useState(() => loadDraft()?.motto ?? "");
  const [address, setAddress] = useState(() => loadDraft()?.address ?? "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [uniformColors, setUniformColors] = useState<UniformColors>(() => loadDraft()?.uniformColors ?? EMPTY_UNIFORM_COLORS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard: this form is only for a school that has not currently got details
  // submitted — an INCOMPLETE one.
  //
  // Asked of the SERVER rather than of the cached user, because the cache
  // cannot answer it any more. A school arrives here by two different routes
  // now: straight after verifying its email, and again later by pressing "Not
  // Done" on the waiting page, which moves it back from PENDING to INCOMPLETE.
  // The second of those changes a row this browser may already have a stale
  // copy of.
  //
  // A failure to reach the answer leaves the form as it is. This page grants no
  // access — submitting it makes a school PENDING, which is further from the
  // dashboard, not closer — so holding a visitor here on a network blip is the
  // harmless direction, and the app shell's gate is what actually guards the
  // product.
  useEffect(() => {
    let alive = true;
    // The school session, not whatever a teacher tab may have signed into in
    // this same browser. getUser returns null for absent and unparseable alike,
    // which are the same answer here: nobody is signed in on this side.
    if (!getUser("school")) {
      router.replace("/school/login");
      return;
    }

    fetchRegistrationSnapshot()
      .then((snap) => {
        if (!alive) return;
        const destination = routeForSnapshot(snap);
        // null means APPROVED — an existing school, which must never see this
        // form. Anything pointing somewhere other than here is followed too.
        if (destination === null) {
          router.replace(SCHOOL_HOME_PATH);
        } else if (destination !== "/school/onboarding") {
          router.replace(destination);
        }
      })
      .catch(() => {
        /* Could not reach the server: leave the form up rather than bounce. */
      });

    return () => {
      alive = false;
    };
  }, [router]);

  // Fetch filtered class catalog whenever school type changes. Selections
  // that no longer belong to the new catalog are dropped, but ones that do
  // (e.g. a class shared between school types, or a draft restored from an
  // earlier session) are kept rather than always wiped.
  useEffect(() => {
    if (!schoolType) {
      setCatalog([]);
      return;
    }
    api
      .get(`/onboarding/class-catalog?schoolType=${schoolType}`)
      .then((data) => {
        const list: CatalogEntry[] = data || [];
        setCatalog(list);
        const validNames = new Set(list.map((c) => c.name));
        setSelectedClasses((prev) => prev.filter((name) => validNames.has(name)));
        setSectionsByClass((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([name]) => validNames.has(name)))
        );
      })
      .catch(() => setCatalog([]));
  }, [schoolType]);

  // Draft autosave: persists in-progress selections so a forced logout (a
  // genuine session expiry, or anything else that crashes/reloads this page)
  // never silently loses what the user already typed. Debounced so rapid
  // typing doesn't hit localStorage on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (typeof window === "undefined") return;
      const draft: OnboardingDraft = {
        schoolType,
        selectedClasses,
        sectionsByClass,
        motto,
        address,
        uniformColors,
      };
      try {
        window.localStorage.setItem(getDraftKey(), JSON.stringify(draft));
      } catch {}
    }, 500);
    return () => clearTimeout(handle);
  }, [schoolType, selectedClasses, sectionsByClass, motto, address, uniformColors]);

  const toggleClass = (name: string) =>
    setSelectedClasses((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );

  const setSectionsForClass = (name: string, raw: string) => {
    setSectionsByClass((prev) => ({ ...prev, [name]: clampSectionCount(raw) }));
  };

  // Expand each selected class into its sections (e.g. 2 sections of "Class 1"
  // becomes "Class 1 A"/"Class 1 B"); a single section stays as the plain name.
  // Shared with the Classes page's Add Class dialog, which creates the same rows
  // after onboarding and has to name them identically — see src/lib/classes.ts.
  const expandedClassNames = expandClassSections(selectedClasses, sectionsByClass);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";

    setLogoError(null);
    try {
      // Shrunk here, at pick time, so the preview and the stored file are the
      // same small thing that will later be sent. A failure is reported and
      // the file is dropped — it must NOT fall through to keeping the original,
      // which is what turned a 4 MB camera photo into "Failed to fetch" at the
      // end of a long form.
      const toStore = await prepareImage(file, "logo");
      setLogoFile(toStore);
      setLogoPreview(URL.createObjectURL(toStore));
    } catch (err: any) {
      setLogoFile(null);
      setLogoPreview(null);
      setLogoError(err?.message || "This image could not be used. Please try another.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!schoolType) {
      setError("Please select a school type.");
      return;
    }
    if (selectedClasses.length === 0) {
      setError("Please select at least one class.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let logoPath: string | undefined;

      if (logoFile) {
        setLogoUploading(true);
        try {
          logoPath = await postImage(logoFile, "logo");
        } finally {
          setLogoUploading(false);
        }
      }

      const submitted: any = await api.post("/onboarding", {
        schoolType,
        classNames: expandedClassNames,
        ...(motto && { motto }),
        ...(address && { address }),
        ...(logoPath !== undefined && { logo: logoPath }),
        uniformColors,
      });

      try {
        window.localStorage.removeItem(getDraftKey());
      } catch {}

      // Keep the cached user roughly in step with what was just saved. It is a
      // convenience for anything that reads the school's own particulars off
      // it — it decides nothing about access, which is always a live question.
      try {
        const user = getUser("school");
        if (user?.School?.[0]) {
          user.School[0].onboardingCompleted = true;
          user.School[0].schoolType = schoolType;
          if (submitted?.school?.registrationStatus) {
            user.School[0].registrationStatus = submitted.school.registrationStatus;
          }
          if (motto) user.School[0].motto = motto;
          if (address) user.School[0].address = address;
          if (logoPath) user.School[0].logo = logoPath;
          setUser(user, "school");
        }
      } catch {}

      // Submitting KYC is an application, not an arrival. It leaves the school
      // PENDING, so the next screen is the waiting page rather than the
      // dashboard — read from the row the server just wrote back, so an already
      // APPROVED school editing its particulars is not sent to wait for an
      // approval it already has.
      router.replace(
        submitted?.school?.registrationStatus === "PENDING"
          ? "/school/pending-verification"
          : SCHOOL_HOME_PATH,
      );
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
      setLogoUploading(false);
    }
  };

  const handleBackToLogin = () => {
    // The school session only. A teacher signed in in another tab of this
    // browser is not part of this decision and keeps their session.
    clearSession("school");
    router.replace("/school/login");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f0f5f9",
        padding: "2rem 1rem",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 680,
          backgroundColor: "white",
          borderRadius: 20,
          boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          padding: "2.5rem",
          marginBottom: "2rem",
        }}
      >
        {/* Header */}
        <div
          style={{
            marginBottom: "2rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "1rem",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "1.75rem",
                fontWeight: 700,
                color: "#0F172A",
                margin: 0,
              }}
            >
              Set Up Your School
            </h1>
            <p
              style={{
                fontSize: "0.875rem",
                color: "#6B7280",
                marginTop: "0.375rem",
              }}
            >
              Tell us a bit about your school before we get started
            </p>
          </div>
          <button
            type="button"
            onClick={handleBackToLogin}
            className="hidden md:flex"
            style={{
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: "#2563EB",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              marginTop: 4,
              flexShrink: 0,
            }}
          >
            ← Back to Login
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* ── 1. School Type ──────────────────────────────────────── */}
          <Section title="School Type" required>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {SCHOOL_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "14px 16px",
                    borderRadius: 12,
                    border: `2px solid ${
                      schoolType === opt.value ? "#1e3a8a" : "#E5E7EB"
                    }`,
                    cursor: "pointer",
                    background:
                      schoolType === opt.value ? "#EFF6FF" : "white",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  <input
                    type="radio"
                    name="schoolType"
                    value={opt.value}
                    checked={schoolType === opt.value}
                    onChange={() => setSchoolType(opt.value)}
                    style={{
                      accentColor: "#1e3a8a",
                      width: 18,
                      height: 18,
                      flexShrink: 0,
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        color: "#111827",
                      }}
                    >
                      {opt.label}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "#6B7280",
                        marginTop: 2,
                      }}
                    >
                      {opt.sub}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </Section>

          {/* ── 2. Classes Available ─────────────────────────────────── */}
          <Section title="Classes Available" required>
            {!schoolType ? (
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "#9CA3AF",
                  fontStyle: "italic",
                }}
              >
                Select a school type above to see available classes
              </p>
            ) : catalog.length === 0 ? (
              <p style={{ fontSize: "0.875rem", color: "#9CA3AF" }}>
                Loading…
              </p>
            ) : (
              <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {catalog.map((cls) => {
                  const checked = selectedClasses.includes(cls.name);
                  const sections = sectionsByClass[cls.name] ?? 1;
                  return (
                    <div
                      key={cls.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "8px 14px",
                        borderRadius: 8,
                        border: `1.5px solid ${
                          checked ? "#1e3a8a" : "#E5E7EB"
                        }`,
                        background: checked ? "#EFF6FF" : "white",
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          cursor: "pointer",
                          fontSize: "0.875rem",
                          fontWeight: checked ? 600 : 400,
                          color: checked ? "#1e3a8a" : "#374151",
                          userSelect: "none",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleClass(cls.name)}
                          style={{
                            accentColor: "#1e3a8a",
                            width: 15,
                            height: 15,
                          }}
                        />
                        {cls.name}
                      </label>
                      {checked && (
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: "0.78rem",
                            color: "#6B7280",
                            whiteSpace: "nowrap",
                            paddingLeft: 10,
                            borderLeft: "1px solid #DBEAFE",
                          }}
                        >
                          Sections
                          <input
                            type="number"
                            min={1}
                            max={MAX_SECTIONS}
                            value={sections}
                            onChange={(e) => setSectionsForClass(cls.name, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: 48,
                              height: 26,
                              borderRadius: 6,
                              border: "1px solid #D1D5DB",
                              padding: "0 6px",
                              fontSize: "0.8rem",
                              textAlign: "center",
                              color: "#111827",
                            }}
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
              {selectedClasses.some((name) => (sectionsByClass[name] ?? 1) > 1) && (
                <p style={{ fontSize: "0.78rem", color: "#9CA3AF", marginTop: 10 }}>
                  Classes with more than 1 section will be created as separate classes
                  (e.g. 2 sections of "Class 1" becomes "Class 1A" and "Class 1B").
                </p>
              )}
              </>
            )}
          </Section>

          {/* ── 3. School Motto ──────────────────────────────────────── */}
          <Section title="School Motto" optional>
            <input
              type="text"
              value={motto}
              onChange={(e) => setMotto(e.target.value)}
              placeholder="e.g. Excellence in Education"
              style={inputStyle}
            />
          </Section>

          {/* ── 4. Address ───────────────────────────────────────────── */}
          <Section title="Address">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Commercial Avenue, Bamenda"
              style={inputStyle}
            />
          </Section>

          {/* ── 5. School Logo ────────────────────────────────────────── */}
          <Section title="School Logo" optional>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {logoPreview && (
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    objectFit: "cover",
                    border: "1px solid #E5E7EB",
                    flexShrink: 0,
                  }}
                />
              )}
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "1.5px solid #D1D5DB",
                  cursor: logoUploading ? "not-allowed" : "pointer",
                  fontSize: "0.875rem",
                  color: "#374151",
                  background: "white",
                  opacity: logoUploading ? 0.6 : 1,
                  flexShrink: 0,
                }}
              >
                <Upload size={15} />
                {logoPreview ? "Change image" : "Choose image"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleLogoChange}
                  disabled={logoUploading}
                  style={{ display: "none" }}
                />
              </label>
              <span style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>
                JPG, PNG or WebP
              </span>
            </div>
            {/* Reported next to the control that caused it, at pick time,
                rather than 300px away at the foot of the form after submit. */}
            {logoError && (
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "#DC2626",
                  marginTop: 8,
                  marginBottom: 0,
                  lineHeight: 1.4,
                }}
              >
                {logoError}
              </p>
            )}
          </Section>

          {/* ── 6. Uniform Colours ───────────────────────────────────── */}
          <Section title="Uniform Colours" optional>
            <UniformColorPicker value={uniformColors} onChange={setUniformColors} />
          </Section>

          {/* ── Error ────────────────────────────────────────────────── */}
          {error && (
            <p
              style={{
                fontSize: "0.875rem",
                color: "#DC2626",
                marginBottom: 12,
              }}
            >
              {error}
            </p>
          )}

          {/* ── Submit ───────────────────────────────────────────────── */}
          <button
            type="submit"
            disabled={submitting || logoUploading}
            style={{
              width: "100%",
              height: 48,
              borderRadius: 12,
              backgroundColor: "#1e3a8a",
              color: "white",
              fontSize: "0.9375rem",
              fontWeight: 600,
              border: "none",
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.6 : 1,
              boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
            }}
          >
            {submitting
              ? logoUploading
                ? "Uploading logo…"
                : "Setting up your school…"
              : "Get Started"}
          </button>
        </form>

        <div className="md:hidden" style={{ textAlign: "center", marginTop: "1.25rem" }}>
          <button
            type="button"
            onClick={handleBackToLogin}
            style={{
              fontSize: "0.8125rem",
              fontWeight: 500,
              color: "#2563EB",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            ← Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}
