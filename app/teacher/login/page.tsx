"use client";

import { Button } from "@/components/ui/button";
import { EyeIcon, EyeOffIcon, UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../src/lib/api";
import { mapLoginError } from "../../../src/lib/loginErrors";

/**
 * The teachers' door.
 *
 * Sits at /teacher/login, OUTSIDE app/teacher/(protected). (protected) is a
 * route group and adds no URL segment, so this page shares the /teacher prefix
 * with the portal while staying outside its gate — the same arrangement
 * /teacher/set-password already relies on. A gated login page could never be
 * reached by the person who needs it.
 *
 * The form, the fields and the auth call are the same as app/login/page.tsx.
 * What differs is who is allowed through: only actorType 'teacher'. Anything
 * else is refused here rather than signed in.
 *
 * Styled with inline styles and classes that already exist in the frozen
 * src/index.css — every className here is one app/login/page.tsx already
 * ships, so nothing new has to be compiled.
 */
export default function TeacherLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept apart from `error` because it is not a failed attempt: the details
  // were correct and the account is real, it just is not a teacher. It gets its
  // own block with a way onward instead of a red line.
  const [wrongDoor, setWrongDoor] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // The same two one-time banners app/login/page.tsx handles, and this page
  // needs them for the same reason: the teacher-side redirects that used to
  // land on /login now land here, carrying these params with them —
  // /teacher/set-password on success, and the shared api.ts on a dead session.
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
    if (shouldCleanUrl) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setWrongDoor(false);

    if (!identifier.trim() || !password.trim()) {
      setError('Please enter your phone number or email, and your password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post("/auth/login", { identifier, password });
      if ((res as any)?.token) {
        const actorType = (res as any).actorType;

        // THE REFUSAL, and it happens BEFORE anything is written to
        // localStorage. The response carries a perfectly valid token; storing
        // it and then refusing would leave a live admin session sitting in the
        // browser on a page that just said no, one URL away from the admin app.
        // Nothing is persisted unless the actor is a teacher, so a refused
        // sign-in leaves the browser exactly as it was.
        if (actorType !== "teacher") {
          setWrongDoor(true);
          setLoading(false);
          return;
        }

        const user = { ...(res as any).user, actorType };
        if (typeof window !== "undefined") {
          window.localStorage.setItem("auth_token", (res as any).token);
          window.localStorage.setItem("user", JSON.stringify(user));
        }
        // Teachers have no onboarding or email-verification step of their own —
        // those are admin-account concerns — so this is the whole journey.
        router.replace("/teacher");
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
              Welcome back Sir/Madam
            </h1>
            <p
              className="text-sm"
              style={{ color: "#6B7280", marginTop: "0.375rem" }}
            >
              Login to your school.
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

          {/* The wrong-door notice. Amber rather than red: nothing failed, and
              it carries the way onward, because a bare refusal is a dead end
              for someone who has just proved they own a real account. */}
          {wrongDoor && (
            <div
              style={{
                marginBottom: "1.25rem",
                padding: "0.75rem 1rem",
                borderRadius: 10,
                backgroundColor: "#FEF3C7",
                border: "1px solid #FCD34D",
                color: "#92400E",
                fontSize: "0.875rem",
                lineHeight: 1.45,
              }}
            >
              This login is for teachers only.
              <span style={{ display: "block", marginTop: "0.5rem" }}>
                Those details belong to a school admin account —{" "}
                <a
                  href="/school/login"
                  style={{ color: "#92400E", fontWeight: 600, textDecoration: "underline" }}
                >
                  sign in to the school
                </a>{" "}
                instead.
              </span>
              {/* POST /auth/login resolves an admin before a teacher, so one
                  email on both an AdminUser row and a Staff row always returns
                  the admin. The teacher record stays reachable by the phone
                  number the two rows do not share — worth saying, because
                  otherwise this person is stuck on a door they belong behind. */}
              <span style={{ display: "block", marginTop: "0.5rem" }}>
                If you are also on your school&apos;s staff list, sign in here with
                your teacher phone number rather than that email.
              </span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            {/* Phone Number or Email — the same field as the school door, and
                for the same reason: /auth/login matches a teacher on either a
                Staff email or a Staff phone, so narrowing the label to one of
                them would hide a working way in. */}
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

            {/* No "Forgot your password?" and no "Sign up".
                /school/password-reset is an admin flow end to end — it asks
                for an email and posts /password-reset/request, which resolves
                AdminUser rows only — so pointing a teacher at it would be a
                dead end. /signup creates a school admin account, which is the
                one thing this page exists to turn away. A teacher who cannot
                get in reaches a human instead: the floating support button is
                on this page, as it is on /login. */}
            <p className="text-center text-sm text-gray-500">
              Trouble signing in? Ask your school administrator to re-send your
              teacher invitation.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
