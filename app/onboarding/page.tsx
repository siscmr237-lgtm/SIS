"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, BASE_URL } from "../../src/lib/api";

type SchoolType = "DAYCARE_NURSERY" | "DAYCARE_NURSERY_PRIMARY";

interface CatalogEntry {
  name: string;
  schoolTypes: string[];
}

const UNIFORM_COLORS = [
  { label: "White",        hex: "#FFFFFF",  border: true  },
  { label: "Sky Blue",     hex: "#87CEEB",  border: false },
  { label: "Navy",         hex: "#001f5b",  border: false },
  { label: "Khaki",        hex: "#C3B091",  border: false },
  { label: "Maroon",       hex: "#800000",  border: false },
  { label: "Forest Green", hex: "#228B22",  border: false },
  { label: "Grey",         hex: "#808080",  border: false },
  { label: "Black",        hex: "#000000",  border: false },
  { label: "Yellow",       hex: "#FFD700",  border: false },
  { label: "Red",          hex: "#DC143C",  border: false },
];

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
  const [motto, setMotto] = useState("");
  const [address, setAddress] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
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
      })
      .catch(() => setCatalog([]));
  }, [schoolType]);

  const toggleClass = (name: string) =>
    setSelectedClasses((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );

  const toggleColor = (label: string) =>
    setSelectedColors((prev) =>
      prev.includes(label) ? prev.filter((c) => c !== label) : [...prev, label]
    );

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    e.target.value = "";
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
        classNames: selectedClasses,
        ...(motto && { motto }),
        ...(address && { address }),
        ...(logoPath !== undefined && { logo: logoPath }),
        uniformColors: selectedColors,
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {catalog.map((cls) => {
                  const checked = selectedClasses.includes(cls.name);
                  return (
                    <label
                      key={cls.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 14px",
                        borderRadius: 8,
                        border: `1.5px solid ${
                          checked ? "#1e3a8a" : "#E5E7EB"
                        }`,
                        background: checked ? "#EFF6FF" : "white",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                        fontWeight: checked ? 600 : 400,
                        color: checked ? "#1e3a8a" : "#374151",
                        transition: "border-color 0.15s, background 0.15s",
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
                  );
                })}
              </div>
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
                JPG, PNG or WebP · max 5 MB
              </span>
            </div>
          </Section>

          {/* ── 6. Uniform Colours ───────────────────────────────────── */}
          <Section title="Uniform Colours" optional>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {UNIFORM_COLORS.map((color) => {
                const selected = selectedColors.includes(color.label);
                return (
                  <button
                    key={color.label}
                    type="button"
                    onClick={() => toggleColor(color.label)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "6px 12px",
                      borderRadius: 8,
                      border: `2px solid ${
                        selected ? "#1e3a8a" : "#E5E7EB"
                      }`,
                      cursor: "pointer",
                      background: selected ? "#EFF6FF" : "white",
                      fontSize: "0.8rem",
                      fontWeight: selected ? 600 : 400,
                      color: selected ? "#1e3a8a" : "#374151",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        width: 16,
                        height: 16,
                        borderRadius: 3,
                        backgroundColor: color.hex,
                        border: color.border ? "1px solid #D1D5DB" : "none",
                        flexShrink: 0,
                      }}
                    />
                    {color.label}
                  </button>
                );
              })}
            </div>
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
      </div>
    </div>
  );
}
