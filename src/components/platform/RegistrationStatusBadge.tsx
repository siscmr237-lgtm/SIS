"use client";

import type { RegistrationStatus } from "@/lib/registrationStatus";

/**
 * How a school's registration status is named and coloured in the console.
 *
 * One map, shared by the schools list and the school detail page, so the two
 * cannot end up calling the same status different things — the list is where
 * the team scans for work, and the detail page is where they act on it, and a
 * status that reads "Pending Verification" in one place and something else in
 * the other is a status nobody trusts.
 *
 * The labels are longer than the enum values on purpose. "FAILED" alone reads
 * like an error on our side; "Failed Registration" says what actually did not
 * happen, which is that somebody signed up and never finished.
 */
const PRESENTATION: Record<
  RegistrationStatus,
  { label: string; background: string; color: string; border: string }
> = {
  FAILED: { label: "Failed Registration", background: "#FEE2E2", color: "#B91C1C", border: "#FECACA" },
  INCOMPLETE: { label: "Incomplete Registration", background: "#FFEDD5", color: "#C2410C", border: "#FED7AA" },
  PENDING: { label: "Pending Verification", background: "#FEF3C7", color: "#A16207", border: "#FDE68A" },
  APPROVED: { label: "Approved", background: "#DCFCE7", color: "#15803D", border: "#BBF7D0" },
};

/**
 * An unknown value is shown as itself rather than hidden or guessed at. A
 * status this console does not recognise means the API knows something this
 * build does not, and saying so is more useful than a blank cell.
 */
function presentationFor(status: string) {
  return (
    PRESENTATION[status as RegistrationStatus] ?? {
      label: status || "Unknown",
      background: "#F1F5F9",
      color: "#475569",
      border: "#E2E8F0",
    }
  );
}

export function RegistrationStatusBadge({ status }: { status: string }) {
  const p = presentationFor(status);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 9px",
        borderRadius: 999,
        background: p.background,
        color: p.color,
        border: `1px solid ${p.border}`,
        fontSize: "0.72rem",
        fontWeight: 600,
        lineHeight: 1.5,
        whiteSpace: "nowrap",
      }}
    >
      {p.label}
    </span>
  );
}

export { presentationFor };
