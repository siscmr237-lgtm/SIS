"use client";

import { platformApi } from "@/lib/platformApi";
import { ConfirmActionControl } from "./ConfirmActionControl";

/**
 * Sending an approved school back to pending, from the console.
 *
 * The undo for ApproveSchoolControl. Two things bring a team member here: an
 * approval that went out by mistake, and a school whose submitted details turn
 * out to need redoing.
 *
 * WHAT IT DOES NOT DO is the part worth stating. It moves one status column
 * and nothing else — no data is deleted, no sessions are ended, onboarding is
 * not unwound. The school's students, staff and settings are all still there,
 * and approving again puts it back exactly where it was. The school lands on
 * /school/pending-verification, which tells them their account is under review
 * rather than leaving them at a door that has silently stopped opening.
 *
 * The dialog is shared with ApproveSchoolControl via ConfirmActionControl; the
 * amber tone is what separates the two buttons on a page that shows them in
 * the same slot.
 */
export function RevertToPendingControl({
  schoolId,
  schoolName,
  onReverted,
}: {
  schoolId: number | string;
  schoolName: string;
  /** Called with the status the server reports after a successful revert. */
  onReverted: (status: string) => void;
}) {
  return (
    <ConfirmActionControl
      label="Send Back to Pending"
      tone="withdraw"
      title={`Send ${schoolName} back to pending? They will lose access to their dashboard.`}
      body="Nothing is deleted — their students, staff and settings stay exactly as they are, and approving again restores access."
      confirmLabel="Send Back"
      busyLabel="Sending..."
      errorFallback="Could not send this school back to pending."
      onConfirm={async () => {
        const res: any = await platformApi.post(`/platform/schools/${schoolId}/revert-to-pending`);
        // The server decides the resulting status, the same way approve does —
        // including when somebody else got there first, where it answers
        // PENDING rather than failing.
        onReverted(res?.registrationStatus ?? "PENDING");
      }}
    />
  );
}
