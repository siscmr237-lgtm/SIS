"use client";

import { Button } from "@/components/ui/button";
import { EyeIcon, EyeOffIcon, PhoneIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordHints } from "../../src/components/PasswordHints";
import { api } from "../../src/lib/api";

// ---------------------------------------------------------------------------
// Shared style helpers
// ---------------------------------------------------------------------------
const fieldRingStyle = (focused: boolean): React.CSSProperties => ({
  border: `1.5px solid ${focused ? "#2563EB" : "#D1D5DB"}`,
  boxShadow: focused ? "0 0 0 3px rgba(37,99,235,0.12)" : "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
});

const textInputStyle = (focused: boolean): React.CSSProperties => ({
  display: "block",
  width: "100%",
  height: 44,
  padding: "0 0.875rem",
  borderRadius: 12,
  fontSize: "0.875rem",
  color: "#111827",
  backgroundColor: "white",
  outline: "none",
  ...fieldRingStyle(focused),
});

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: "#f0f5f9" }}
    >
      <div
        className="w-full rounded-2xl shadow-lg overflow-hidden flex flex-col md:flex-row"
        style={{ maxWidth: 900 }}
      >
        <div
          className="hidden md:flex flex-col items-center justify-center"
          style={{
            width: "55%",
            background: "linear-gradient(145deg,#EBF4FF 0%,#F0F9FF 50%,#F8FAFC 100%)",
            padding: "3.5rem",
          }}
        >
          <img
            src="/illustration.svg"
            alt=""
            style={{ width: "100%", maxWidth: 340, height: "auto" }}
          />
        </div>
        <div className="flex-1 bg-white flex flex-col justify-center p-6 md:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — registration form
// ---------------------------------------------------------------------------
function SignupForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const groupBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = (await api.post("/auth/signup", { name, schoolName, phoneNumber, email, password })) as any;
      if (res?.token) {
        window.localStorage.setItem("auth_token", res.token);
        window.localStorage.setItem("user", JSON.stringify(res.user));
      }
      onSuccess();
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="text-center md:text-left" style={{ marginBottom: "1.5rem" }}>
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: "#0F172A" }}>
          Create Account
        </h1>
        <p className="text-sm" style={{ color: "#6B7280", marginTop: "0.375rem" }}>
          Get started — set up your school information system
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Full Name */}
        <div>
          <label
            className="text-sm font-medium"
            style={{ display: "block", marginBottom: 6, color: "#374151" }}
          >
            Full Name
          </label>
          <input
            type="text"
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            onFocus={() => setFocused("name")}
            onBlur={() => setFocused(null)}
            style={textInputStyle(focused === "name")}
          />
        </div>

        {/* School Name */}
        <div>
          <label
            className="text-sm font-medium"
            style={{ display: "block", marginBottom: 6, color: "#374151" }}
          >
            School Name
          </label>
          <input
            type="text"
            placeholder="Your school's name"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            required
            onFocus={() => setFocused("school")}
            onBlur={() => setFocused(null)}
            style={textInputStyle(focused === "school")}
          />
        </div>

        {/* Phone Number */}
        <div>
          <label
            className="text-sm font-medium"
            style={{ display: "block", marginBottom: 6, color: "#374151" }}
          >
            Phone Number
          </label>
          <div
            onFocus={() => setFocused("phone")}
            onBlur={groupBlur}
            style={{
              display: "flex",
              alignItems: "stretch",
              height: 44,
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: "white",
              ...fieldRingStyle(focused === "phone"),
            }}
          >
            <select
              defaultValue="CM +237"
              aria-label="Country code"
              style={{
                border: "none",
                borderRight: "1px solid #E5E7EB",
                padding: "0 8px 0 12px",
                backgroundColor: "#F9FAFB",
                fontSize: "0.875rem",
                color: "#374151",
                outline: "none",
                minWidth: 90,
              }}
            >
              <option>CM +237</option>
              <option>NG +234</option>
              <option>GH +233</option>
            </select>
            <div style={{ display: "flex", alignItems: "center", flex: 1, position: "relative" }}>
              <PhoneIcon
                style={{ position: "absolute", left: 12, color: "#9CA3AF", width: 16, height: 16 }}
              />
              <input
                type="tel"
                placeholder="Phone number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                required
                style={{
                  flex: 1,
                  height: "100%",
                  paddingLeft: "2.5rem",
                  paddingRight: "0.75rem",
                  border: "none",
                  outline: "none",
                  fontSize: "0.875rem",
                  color: "#111827",
                  background: "transparent",
                }}
              />
            </div>
          </div>
        </div>

        {/* Email */}
        <div>
          <label
            className="text-sm font-medium"
            style={{ display: "block", marginBottom: 6, color: "#374151" }}
          >
            Email Address
          </label>
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            onFocus={() => setFocused("email")}
            onBlur={() => setFocused(null)}
            style={textInputStyle(focused === "email")}
          />
          <p style={{ fontSize: "0.75rem", color: "#9CA3AF", marginTop: 4 }}>
            You'll confirm this email on the next step.
          </p>
        </div>

        {/* Password with live hints */}
        <div>
          <label
            className="text-sm font-medium"
            style={{ display: "block", marginBottom: 6, color: "#374151" }}
          >
            Password
          </label>
          <div
            onFocus={() => setFocused("password")}
            onBlur={groupBlur}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              height: 44,
              borderRadius: 12,
              overflow: "hidden",
              backgroundColor: "white",
              ...fieldRingStyle(focused === "password"),
            }}
          >
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Min 5 chars, upper + lower + symbol"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                flex: 1,
                height: "100%",
                paddingLeft: "1rem",
                paddingRight: "3rem",
                border: "none",
                outline: "none",
                fontSize: "0.875rem",
                color: "#111827",
                background: "transparent",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#9CA3AF",
                padding: 4,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                lineHeight: 0,
              }}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOffIcon style={{ width: 16, height: 16 }} />
              ) : (
                <EyeIcon style={{ width: 16, height: 16 }} />
              )}
            </button>
          </div>
          <PasswordHints password={password} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button
          type="submit"
          disabled={loading}
          className="w-full font-semibold"
          style={{
            height: 44,
            borderRadius: 12,
            backgroundColor: "#1e3a8a",
            color: "white",
            boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Creating account…" : "Continue"}
        </Button>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{" "}
          <a href="/login" className="font-medium" style={{ color: "#2563EB" }}>
            Sign in
          </a>
        </p>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------
// Root page
// ---------------------------------------------------------------------------
export default function SignupPage() {
  const router = useRouter();

  return (
    <Shell>
      <SignupForm onSuccess={() => router.replace("/verify-email")} />
    </Shell>
  );
}
