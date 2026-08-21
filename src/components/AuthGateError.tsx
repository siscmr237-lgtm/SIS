"use client";

/**
 * What the app shows when the auth gate could not get an answer at all.
 *
 * Not an error page in the usual sense — nothing has gone wrong with the
 * session, and it is deliberately NOT a sign-out. The gate asks the server
 * where this school stands before rendering anything protected, and when that
 * question cannot be reached (offline, or the API answering 503 on a database
 * blip) the honest response is to hold and offer to ask again.
 *
 * Failing this way round is the point. Rendering the dashboard on an
 * unanswerable check would hand out access nobody granted; clearing the session
 * would log out a user whose login is perfectly good. This does neither.
 */
export function AuthGateError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        backgroundColor: "#f0f5f9",
      }}
    >
      <div
        style={{
          maxWidth: 380,
          width: "100%",
          background: "white",
          border: "1px solid #E2E8F0",
          borderRadius: 14,
          padding: "26px 24px",
          textAlign: "center",
          boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
        }}
      >
        <h1 style={{ fontSize: "1rem", fontWeight: 600, color: "#0F172A", margin: "0 0 8px" }}>
          We couldn&apos;t check your account
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#64748B", margin: "0 0 18px", lineHeight: 1.5 }}>
          Something went wrong reaching us. You are still signed in — check your
          connection and try again.
        </p>
        <button
          type="button"
          onClick={onRetry}
          style={{
            width: "100%",
            padding: "10px 16px",
            borderRadius: 9,
            border: "none",
            background: "#1D4ED8",
            color: "white",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
