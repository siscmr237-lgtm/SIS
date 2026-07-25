"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, BASE_URL } from "../../src/lib/api";
import { compressImageForUpload } from "../../src/lib/imageResize";
import { EMPTY_UNIFORM_COLORS, UniformColors } from "../../src/lib/uniformColors";
import { UniformColorPicker } from "../../src/components/onboarding/UniformColorPicker";

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

  const [schoolType, setSchoolType] = useState<SchoolType | "">("");
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [sectionsByClass, setSectionsByClass] = useState<Record<string, number>>({});
  const [motto, setMotto] = useState("");
  const [address, setAddress] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [uniformColors, setUniformColors] = useState<UniformColors>(EMPTY_UNIFORM_COLORS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard: existing schools (onboardingCompleted=true) must never reach this page.
  useEffect(() => {
    const userStr =
      typeof window !== "undefined" ? window.localStorage.getItem("user") : null;
    if (!userStr) {
      router.replace("/login");
      return;
    }
    try {
      const user = JSON.parse(userStr);
      if (user?.School?.[0]?.onboardingCompleted !== false) {
        router.replace("/");
      }
    } catch {
      router.replace("/login");
    }
  }, [router]);

  // Fetch filtered class catalog whenever school type changes.
  useEffect(() => {
    if (!schoolType) {
      setCatalog([]);
      return;
    }
    api
      .get(`/onboarding/class-catalog?schoolType=${schoolType}`)
      .then((data) => {
        setCatalog(data || []);
        setSelectedClasses([]); // Reset selections when type changes
        setSectionsByClass({});
      })
      .catch(() => setCatalog([]));
  }, [schoolType]);

  const toggleClass = (name: string) =>
    setSelectedClasses((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );

  const setSectionsForClass = (name: string, raw: string) => {
    const parsed = parseInt(raw, 10);
    const sections = Math.max(1, Math.min(26, Number.isFinite(parsed) ? parsed : 1));
    setSectionsByClass((prev) => ({ ...prev, [name]: sections }));
  };

  // Expand each selected class into its sections (e.g. 2 sections of "Class 1"
  // becomes "Class 1A"/"Class 1B"); a single section stays as the plain name.
  const expandedClassNames = selectedClasses.flatMap((name) => {
    const sections = sectionsByClass[name] ?? 1;
    if (sections <= 1) return [name];
    return Array.from({ length: sections }, (_, i) => `${name}${String.fromCharCode(65 + i)}`);
  });

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";

    let toStore: File = file;
    try {
      toStore = await compressImageForUpload(file);
    } catch (err) {
      // Fall back to the original file — the backend has its own resize
      // safety net if it turns out to be too large.
      console.error("Client-side image compression failed, using original file", err);
    }
    setLogoFile(toStore);
    setLogoPreview(URL.createObjectURL(toStore));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        const token =
          typeof window !== "undefined"
            ? window.localStorage.getItem("auth_token")
            : null;
        const formData = new FormData();
        formData.append("file", logoFile);
        formData.append("type", "logo");

        const uploadRes = await fetch(`${BASE_URL}/upload`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });
        setLogoUploading(false);

        if (!uploadRes.ok) {
          const text = await uploadRes.text();
          throw new Error(text || `Logo upload failed: ${uploadRes.status}`);
        }
        const { path } = await uploadRes.json();
        logoPath = path;
      }

      await api.post("/onboarding", {
        schoolType,
        classNames: expandedClassNames,
        ...(motto && { motto }),
        ...(address && { address }),
        ...(logoPath !== undefined && { logo: logoPath }),
        uniformColors,
      });

      // Update localStorage so subsequent checks see onboardingCompleted=true
      try {
        const userStr = window.localStorage.getItem("user");
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user?.School?.[0]) {
            user.School[0].onboardingCompleted = true;
            user.School[0].schoolType = schoolType;
            if (motto) user.School[0].motto = motto;
            if (address) user.School[0].address = address;
            if (logoPath) user.School[0].logo = logoPath;
            window.localStorage.setItem("user", JSON.stringify(user));
          }
        }
      } catch {}

      router.replace("/");
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
      setLogoUploading(false);
    }
  };

  const handleBackToLogin = () => {
    try {
      window.localStorage.removeItem("auth_token");
      window.localStorage.removeItem("user");
    } catch {}
    router.replace("/login");
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
                            max={26}
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
