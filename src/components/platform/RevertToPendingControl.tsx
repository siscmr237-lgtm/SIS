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
 * IT TAKES EFFECT AT ONCE, and that is worth being clear about: the API checks
 * this column on every request (requireApprovedSchool in the backend's
 * roleGuards.js), so a school signed in and working at the moment of the click
 * has its very next call refused — reads and writes alike, and its teachers'
 * calls too. It does not wait for them to sign out or for a token to lapse.
 *
 * WHAT IT DOES NOT DO is the other half. It moves one status column and nothing
 * else — no data is deleted, no sessions are ended, onboarding is not unwound.
 * The school's students, staff and settings are all still there, and approving
 * again puts it back exactly where it was. The school lands on
 * /school/pending-verification, which tells them their account is under review
 * rather than leaving them at a door that has silently stopped opening.
 *
 * The dialog is shared with ApproveSchoolControl via ConfirmActionControl. The
 * amber tone is kept even though the school page now puts this button alone at
 * its foot rather than in the approval's slot: amber still says "this closes
 * something" at a glance, and the two controls remain one status apart, so a
 * school going PENDING swaps this button for the green one.
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
      label="Mark Waiting"
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
