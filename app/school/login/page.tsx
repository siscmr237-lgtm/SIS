"use client";

import { Button } from "@/components/ui/button";
import { EyeIcon, EyeOffIcon, UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../src/lib/api";
import { mapLoginError } from "../../../src/lib/loginErrors";
import { routeForFreshUser } from "../../../src/lib/registrationStatus";
import { setSession } from "../../../src/lib/session";

// THE SCHOOL ADMIN DOOR. Teachers have their own at /teacher/login, and every
// teacher-side redirect now points there instead of here.
//
// This page still accepts a teacher who arrives anyway — an old bookmark, a
// shared link, a browser autofilling the address — and forwards them to
// /teacher rather than refusing. They gave correct details for a real account;
// turning that into an error would be a dead end for no reason. The refusal
// only runs the other way round, on /teacher/login, where letting an admin
// through would put a school-wide session behind the teachers' door.

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    let shouldCleanUrl = false;
    if (params.get('reason') === 'expired') {
      setSessionMessage('Your session has expired. Please sign in again.');
      shouldCleanUrl = true;
    }
    if (params.get('message') === 'password_updated') {
      setSuccessMessage('Password updated — please sign in with your new password.');
      shouldCleanUrl = true;
    }
    // Strip the query param once read so a refresh or renewed navigation to /login
    // can't get stuck re-showing a banner from a one-time event.
    if (shouldCleanUrl) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    if (!identifier.trim() || !password.trim()) {
      setError('Please enter your phone number or email, and your password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/auth/login", { identifier, password });
      if ((res as any)?.token) {
        // actorType is stored ON the user object rather than beside it because
        // every gate downstream reads a single parsed `user` from localStorage;
        // a second key would be one more thing a partial write could desync.
        const actorType = (res as any).actorType;
        const user = { ...(res as any).user, actorType };

        // STORED UNDER THE ACTOR'S OWN PORTAL, not under this page's. A teacher
        // who signs in at the school door is forwarded to /teacher below, and
        // the teacher gate there reads the teacher namespace — writing this
        // session into the school one would leave that gate finding nothing,
        // bouncing back to '/', and the two forwarding each other forever.
        setSession((res as any).token, user, actorType === "teacher" ? "teacher" : "school");
        if (actorType === "teacher") {
          // Graceful forward, not an error. Teachers have no school-onboarding
          // or email-verification flow of their own — those are admin-account
          // concerns — so /teacher is the whole journey from here.
          router.replace("/teacher");
        } else if (user?.emailVerified === false) {
          router.replace("/school/verify-email");
        } else {
          // Where an admin belongs depends on how far their registration has
          // got, and that now has four possible answers rather than two. The
          // rule lives in one place so this door, the OTP screen and the app
          // shell's gate cannot drift into disagreeing about it.
          //
          // Reading it off the login RESPONSE is allowed — that payload came
          // back from the server in this same exchange, so it is not a cache.
          // Every later page load asks the server again.
          router.replace(routeForFreshUser(user));
        }
      } else {
        setError("Something went wrong on our end. Please try again shortly.");
      }
    } catch (err: any) {
      setError(mapLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  const groupBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusedField(null);
  };

  const fieldRing = (field: string): React.CSSProperties => ({
    border: `1.5px solid ${focusedField === field ? "#2563EB" : "#D1D5DB"}`,
    boxShadow:
      focusedField === field ? "0 0 0 3px rgba(37,99,235,0.12)" : "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
  });

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: "#f0f5f9" }}
    >
      <div
        className="w-full rounded-2xl shadow-lg overflow-hidden flex flex-col md:flex-row"
        style={{ maxWidth: 900 }}
      >
        {/* Left: the Lewa logo. The art arrives on its own opaque #EFF8FF
            field with a wide margin baked in, so it goes in as the panel's
            background rather than as an <img>: reaching every edge is the
            only way an opaque image meets this panel without showing a seam,
            and it lets the baked-in margin do the centring instead of
            padding. The colour underneath is the image's own field colour, so
            a failed load and a fractional rounding gap both land on the same
            blue -- and it replaces a gradient an opaque image would have
            covered anyway.

            Sized to 150% of the panel width rather than `cover`. That baked-in
            margin leaves cover showing a mark of only about 140px, and since
            cover keys off whichever axis is larger it grows on the taller
            cards -- the same logo at a different size on each of the seven
            pages. A width percentage keys off one axis, so every page matches,
            and the crop can only ever take empty field. backgroundSize rather
            than object-fit because an inline style has nowhere to fall back
            to. */}
        <div
          className="hidden md:flex"
          style={{
            width: "55%",
            backgroundColor: "#EFF8FF",
            backgroundImage: "url('/images/lewa-logo.png')",
            backgroundSize: "150%",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        />

        {/* Right: form */}
        <div className="flex-1 bg-white flex flex-col justify-center p-6 md:p-8">
          {/* Heading */}
          <div className="text-center md:text-left" style={{ marginBottom: "1.75rem" }}>
            <h1
              className="text-3xl font-bold tracking-tight"
              style={{ color: "#0F172A" }}
            >
              Welcome back Proprietor
            </h1>
            <p
              className="text-sm"
              style={{ color: "#6B7280", marginTop: "0.375rem" }}
            >
              Log in to your school.
            </p>
          </div>

          {successMessage && (
            <div
              style={{
                marginBottom: "1.25rem",
                padding: "0.75rem 1rem",
                borderRadius: 10,
                backgroundColor: "#F0FDF4",
                border: "1px solid #86EFAC",
                color: "#15803D",
                fontSize: "0.875rem",
              }}
            >
              {successMessage}
            </div>
          )}

          {sessionMessage && (
            <div
              style={{
                marginBottom: "1.25rem",
                padding: "0.75rem 1rem",
                borderRadius: 10,
                backgroundColor: "#FEF3C7",
                border: "1px solid #FCD34D",
                color: "#92400E",
                fontSize: "0.875rem",
              }}
            >
              {sessionMessage}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            {/* Phone Number or Email — admins sign in with the former,
                teachers with the latter, and the server tells them apart. The
                country-code select that used to sit here is gone: it cannot
                mean anything for an email address, and prefixing one would
                have corrupted the value being sent. */}
            <div>
              <label
                htmlFor="identifier"
                className="text-sm font-medium"
                style={{ display: "block", marginBottom: 6, color: "#374151" }}
              >
                Phone Number or Email
              </label>
              <div
                onFocus={() => setFocusedField("identifier")}
                onBlur={groupBlur}
                className="relative"
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 44,
                  borderRadius: 12,
                  overflow: "hidden",
                  backgroundColor: "white",
                  ...fieldRing("identifier"),
                }}
              >
                <UserIcon
                  className="absolute"
                  style={{ left: 12, color: "#9CA3AF", width: 16, height: 16 }}
                />
                <input
                  id="identifier"
                  type="text"
                  autoComplete="username"
                  placeholder="Phone number or email address"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
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

            {/* Password */}
            <div>
              <label
                className="text-sm font-medium"
                style={{ display: "block", marginBottom: 6, color: "#374151" }}
              >
                Password
              </label>
              <div
                onFocus={() => setFocusedField("password")}
                onBlur={groupBlur}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  height: 44,
                  borderRadius: 12,
                  overflow: "hidden",
                  backgroundColor: "white",
                  ...fieldRing("password"),
                }}
              >
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                  className="absolute right-2"
                  style={{
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
            </div>

            {/* Forgot password — right-aligned */}
            <div className="flex justify-end">
              <a
                href="/school/password-reset"
                className="text-sm font-medium"
                style={{ color: "#2563EB" }}
              >
                Forgot your password?
              </a>
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

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
              {loading ? "Signing in..." : "Sign In"}
            </Button>

            <p className="text-center text-sm text-gray-500">
              Don't have an account?{" "}
              <a
                href="/school/signup"
                className="font-medium"
                style={{ color: "#2563EB" }}
              >
                Sign up
              </a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
