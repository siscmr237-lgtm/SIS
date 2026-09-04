"use client";

import { platformApi } from "@/lib/platformApi";
import { ConfirmActionControl } from "./ConfirmActionControl";

/**
 * Moving a school past the OTP step, from the console.
 *
 * The step BEFORE approve, and the one the team could not take until now. A
 * signup writes its real account and school the moment the form is submitted,
 * so a school that never came back with the code is not lost — it is sitting in
 * this console marked Failed Registration with everything it typed. What it
 * cannot do is move: the client gate sends any admin whose email is unproven to
 * the code screen whatever their status says, so their details page is out of
 * reach until somebody breaks the deadlock.
 *
 * WHAT IT GRANTS IS THE RIGHT TO FILL IN A FORM, which is why the tone is
 * `grant` and not `destroy`, and why there is no phrase to type. The school
 * lands on /school/onboarding — exactly where a signup that had gone normally
 * would have arrived — and still has to submit its details, and still has to be
 * approved by a person afterwards. Nothing here shortens either of those.
 *
 * IT IS STILL A CONFIRMATION, for the same reason approve is: it asserts that
 * an address belongs to whoever typed it when nobody has proved that, and it
 * sits on a page a team member is otherwise only reading. The dialog says so in
 * as many words, because "skip verification" read quickly sounds administrative
 * and it is not — it is the one control in this console that vouches for
 * somebody's identity on their behalf. The server records which address was
 * waived, so the claim can be checked later.
 */
export function SkipEmailVerificationControl({
  schoolId,
  schoolName,
  email,
  onAdvanced,
}: {
  schoolId: number | string;
  schoolName: string;
  /** The unproven address, named in the dialog so it is read before it is vouched for. */
  email: string | null;
  /** Called with the status the server reports, once the school has been moved on. */
  onAdvanced: (status: string) => void;
}) {
  return (
    <ConfirmActionControl
      label="Skip Email Verification"
      tone="grant"
      title={`Mark ${email || "this account"} as verified and let ${schoolName} continue?`}
      body="Nobody will have proved this address belongs to them. They go straight to the school details form; they still have to submit it, and you still have to approve them afterwards."
      confirmLabel="Skip Verification"
      busyLabel="Skipping..."
      errorFallback="Could not move this school past email verification."
      onConfirm={async () => {
        const res: any = await platformApi.post(
          `/platform/schools/${schoolId}/skip-email-verification`,
        );
        // The server decides the resulting status, as approve and revert do. It
        // is INCOMPLETE for the ordinary case — a FAILED school moving on — but
        // the route refuses to drag a school that had somehow got further back
        // to it, and answers with what is actually on the row.
        onAdvanced(res?.registrationStatus ?? "INCOMPLETE");
      }}
    />
  );
}
