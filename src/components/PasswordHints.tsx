"use client";

const CHECKS: { label: string; test: (p: string) => boolean }[] = [
  { label: "5 or more characters", test: (p) => p.length >= 5 },
  { label: "Uppercase letter (A–Z)", test: (p) => /[A-Z]/.test(p) },
  { label: "Lowercase letter (a–z)", test: (p) => /[a-z]/.test(p) },
  { label: "Symbol (!, @, #, …)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function PasswordHints({ password }: { password: string }) {
  if (!password) return null;
  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
      {CHECKS.map(({ label, test }) => {
        const ok = test(password);
        return (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                width: 14,
                flexShrink: 0,
                lineHeight: 1,
                color: ok ? "#16a34a" : "#D1D5DB",
              }}
            >
              {ok ? "✓" : "○"}
            </span>
            <span style={{ fontSize: "0.75rem", color: ok ? "#15803D" : "#9CA3AF" }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
