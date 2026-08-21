"use client";

import { platformApi } from "@/lib/platformApi";
import { ConfirmActionControl } from "./ConfirmActionControl";

/**
 * Approving a school, from the console.
 *
 * Behind a confirmation because of what it does rather than because it is
 * destructive: it is the single act that opens a school's dashboard, and the
 * button sits on a page a team member is otherwise only reading. A one-click
 * grant on a read-only screen is the kind of thing that gets pressed by
 * accident exactly once.
 *
 * The dialog itself lives in ConfirmActionControl, shared with
 * RevertToPendingControl so the two cannot drift apart.
 */
export function ApproveSchoolControl({
  schoolId,
  schoolName,
  onApproved,
}: {
  schoolId: number | string;
  schoolName: string;
  /** Called with the status the server reports after a successful approval. */
  onApproved: (status: string) => void;
}) {
  return (
    <ConfirmActionControl
      label="Approve School"
      tone="grant"
      title={`Approve ${schoolName}? This will give them access to their dashboard.`}
      body="You can send them back to pending afterwards if you need to."
      confirmLabel="Approve"
      busyLabel="Approving..."
      errorFallback="Could not approve this school."
      onConfirm={async () => {
        const res: any = await platformApi.post(`/platform/schools/${schoolId}/approve`);
        // The server is the authority on what the status now is, including the
        // case where somebody else approved it a moment earlier — it answers
        // with APPROVED either way, so the badge tells the truth regardless of
        // which of the two clicks this was.
        onApproved(res?.registrationStatus ?? "APPROVED");
      }}
    />
  );
}
