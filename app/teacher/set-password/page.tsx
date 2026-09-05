"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PasswordHints } from "@/components/PasswordHints";
import { api } from "@/lib/api";
import { ContentLoader } from "@/components/ContentLoader";
import { setSession } from "@/lib/session";

// Deliberately OUTSIDE app/teacher/(protected): this page is opened from an
// email invite, so there is no session yet and the teacher auth gate would
// bounce it straight to /login before the token could ever be read.

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
  | { name: "valid"; greeting: string | null }
  | { name: "invalid"; message: string };

function SetPasswordForm() {
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
      setVerify({ name: "invalid", message: "This invitation link is invalid." });
      return;
    }
    api
      .post("/auth/teacher/invite/verify", { token })
      .then((res: any) => {
        if (!alive) return;
        const name =
          [res?.firstName, res?.lastName].filter(Boolean).join(" ") || res?.name || null;
        setVerify({ name: "valid", greeting: name });
      })
      .catch((e: any) => {
        if (!alive) return;
        setVerify({
          name: "invalid",
          message: e?.message || "This invitation link is invalid or has expired.",
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
      const res: any = await api.post("/auth/teacher/set-password", { token, password });
      if (res?.token) {
        // The endpoint hands back a real session, so there is no reason to make
        // someone who just proved ownership of the invite log in again.
        const user = { ...(res.user ?? {}), actorType: res.actorType ?? "teacher" };
        setSession(res.token, user, "teacher");
        router.replace("/teacher");
      } else {
        router.replace("/teacher/login?message=password_updated");
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  if (verify.name === "checking") {
    return <p className="text-sm text-gray-600">Checking your invitation…</p>;
  }

  if (verify.name === "invalid") {
    return (
      <>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#0F172A" }}>
          Invitation not valid
        </h1>
        <p className="text-sm" style={{ color: "#6B7280", marginTop: "0.375rem" }}>
          {verify.message}
        </p>
        <p className="text-sm text-gray-500" style={{ marginTop: "1.5rem" }}>
          <a href="/teacher/login" className="font-medium" style={{ color: "#2563EB" }}>
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
          {verify.greeting ? `Welcome, ${verify.greeting}` : "Welcome"}
        </h1>
        <p className="text-sm" style={{ color: "#6B7280", marginTop: "0.375rem" }}>
          Choose a password to finish setting up your teacher account.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <PasswordField
            id="password"
            label="Password"
            placeholder="Choose a password"
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
            placeholder="Confirm your password"
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
          {submitting ? "Setting password…" : "Set password and continue"}
        </Button>
      </form>
    </>
  );
}

export default function TeacherSetPasswordPage() {
  // useSearchParams() suspends during prerender, so the component that calls it
  // has to sit under a Suspense boundary or `next build` fails outright.
  return (
    <Shell>
      <Suspense fallback={<ContentLoader minHeight={220} />}>
        <SetPasswordForm />
      </Suspense>
    </Shell>
  );
}
