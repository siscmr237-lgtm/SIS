"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordHints } from "@/components/PasswordHints";
import { api } from "@/lib/api";

/**
 * Step 2 of two: where the link in the reset email lands.
 *
 * Sits outside app/school/(app) deliberately, exactly as /teacher/set-password
 * sits outside the teacher's protected group. Whoever opens this page cannot log
 * in — that is why they are here — so an auth gate above it would bounce them
 * to /school/login before the token in the URL could ever be read.
 *
 * The token is the only credential involved. It is validated on load so that a
 * dead link says so immediately rather than after someone has chosen and typed a
 * password twice, and validated again on submit by the endpoint that spends it.
 */

const fieldRingStyle = (focused: boolean): React.CSSProperties => ({
  border: `1.5px solid ${focused ? "#2563EB" : "#D1D5DB"}`,
  boxShadow: focused ? "0 0 0 3px rgba(37,99,235,0.12)" : "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
});

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
        <div className="flex-1 bg-white flex flex-col justify-center p-6 md:p-8">{children}</div>
      </div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  placeholder,
  value,
  onChange,
  focused,
  onFocus,
  onBlur,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: (e: React.FocusEvent) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label
        htmlFor={id}
        className="text-sm font-medium"
        style={{ display: "block", marginBottom: 6, color: "#374151" }}
      >
        {label}
      </label>
      <div
        onFocus={onFocus}
        onBlur={onBlur}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          height: 44,
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: "white",
          ...fieldRingStyle(focused),
        }}
      >
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
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
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
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
        >
          {show ? (
            <EyeOffIcon style={{ width: 16, height: 16 }} />
          ) : (
            <EyeIcon style={{ width: 16, height: 16 }} />
          )}
        </button>
      </div>
    </div>
  );
}

type VerifyState =
  | { name: "checking" }
  | { name: "valid" }
  | { name: "invalid"; message: string };

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [verify, setVerify] = useState<VerifyState>({ name: "checking" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(null);
  };

  useEffect(() => {
    let alive = true;
    if (!token) {
      setVerify({
        name: "invalid",
        message: "This reset link is invalid. Please request a new one.",
      });
      return;
    }
    api
      .post("/password-reset/validate", { token })
      .then(() => {
        if (alive) setVerify({ name: "valid" });
      })
      .catch((e: any) => {
        if (!alive) return;
        setVerify({
          name: "invalid",
          message: e?.message || "This reset link is invalid or has expired.",
        });
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/password-reset/complete", {
        token,
        newPassword: password,
        confirmPassword: confirm,
      });
      // No session is handed back and none should be: unlike a teacher invite,
      // the only thing proven here is control of the mailbox, and the point of
      // the exercise is a password the owner can now sign in with. The banner on
      // the login page reads this query param.
      router.replace("/school/login?message=password_updated");
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  if (verify.name === "checking") {
    return <p className="text-sm text-gray-600">Checking your reset link…</p>;
  }

  if (verify.name === "invalid") {
    return (
      <>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#0F172A" }}>
          Link no longer valid
        </h1>
        <p
          className="text-sm"
          style={{ color: "#6B7280", marginTop: "0.375rem", lineHeight: 1.6 }}
        >
          {verify.message}
        </p>
        <p className="text-sm" style={{ marginTop: "1.5rem" }}>
          <a
            href="/school/password-reset"
            className="font-medium"
            style={{ color: "#2563EB" }}
          >
            Request a new reset link
          </a>
        </p>
        <p className="text-sm text-gray-500" style={{ marginTop: "0.75rem" }}>
          <a href="/school/login" className="font-medium" style={{ color: "#6B7280" }}>
            ← Back to login
          </a>
        </p>
      </>
    );
  }

  return (
    <>
      <div className="text-center md:text-left" style={{ marginBottom: "1.75rem" }}>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#0F172A" }}>
          Set new password
        </h1>
        <p className="text-sm" style={{ color: "#6B7280", marginTop: "0.375rem" }}>
          Choose a strong password for your account.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <PasswordField
            id="password"
            label="New Password"
            placeholder="New password"
            value={password}
            onChange={setPassword}
            focused={focused === "pw"}
            onFocus={() => setFocused("pw")}
            onBlur={groupBlur}
          />
          <PasswordHints password={password} />
        </div>

        <div>
          <PasswordField
            id="confirm"
            label="Confirm Password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            focused={focused === "confirm"}
            onFocus={() => setFocused("confirm")}
            onBlur={groupBlur}
          />
          {confirm && password !== confirm && (
            <p style={{ fontSize: "0.75rem", color: "#DC2626", marginTop: 4 }}>
              Passwords do not match.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button
          type="submit"
          disabled={submitting || !password || password !== confirm}
          className="w-full font-semibold"
          style={{
            height: 44,
            borderRadius: 12,
            backgroundColor: "#1e3a8a",
            color: "white",
            opacity: submitting || !password || password !== confirm ? 0.6 : 1,
          }}
        >
          {submitting ? "Updating…" : "Update password"}
        </Button>
      </form>
    </>
  );
}

export default function SchoolResetPasswordPage() {
  // useSearchParams() suspends during prerender, so the component that calls it
  // has to sit under a Suspense boundary or `next build` fails outright — the
  // same reason /teacher/set-password is arranged this way.
  return (
    <Shell>
      <Suspense fallback={<p className="text-sm text-gray-600">Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </Shell>
  );
}
