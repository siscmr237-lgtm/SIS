"use client";

import { platformApi } from "@/lib/platformApi";
import { ConfirmActionControl } from "./ConfirmActionControl";

/**
 * Deleting a school, from the console. Founder only, and the end of the road.
 *
 * NOT THE UNDO FOR ANYTHING. RevertToPendingControl beside it moves one status
 * column and says so — the school's students, staff and settings all stay put
 * and approving again restores them. This takes them. Every student and their
 * marks, every staff member and their pay, the attendance, the ledger, the
 * report cards, the timetable, the uploaded photos, and every account the
 * school signs in with — the owner and any Administrator the owner invited.
 * There is no archive and no export on the way out; afterwards the only copy
 * is a database backup.
 *
 * So it asks for the name to be TYPED, which the other controls on this page do
 * not. A dialog with two buttons stops the accidental click; it does not stop
 * the reflexive second one, and that is the click this has to survive. Typing
 * the school's name cannot be got through without having read which school is
 * about to go.
 *
 * THE DIALOG IS THE ONLY PLACE ANY OF THAT IS SAID. The button sits in a row
 * beside Mark Waiting with no heading and no paragraph of its own — a long
 * list printed on a page somebody is reading for other reasons is a list
 * nobody reads, and it pushed the details they did come for further down. So
 * the strings below are load-bearing rather than decorative: title, headcount
 * and consequence are the whole warning, and they are shown at the one moment
 * the reader is being asked to decide. Do not trim them to fit.
 *
 * WHAT IS SENT IS THE STORED NAME, not the typed text. The API refuses the call
 * unless the body names the school exactly — a deliberate guard against a blind
 * DELETE from a mistyped path or a script walking ids. Sending the canonical
 * name keeps the typed check what it is meant to be, a check on the team
 * member's attention, without the two definitions of "matches" arguing over
 * capitals and stray spaces.
 *
 * THE PAGE HAS TO LEAVE afterwards. Whatever this button is sitting on no
 * longer exists, so onDeleted navigates instead of patching state, which is why
 * it takes no arguments — there is nothing left to hand back.
 */
export function DeleteSchoolControl({
  schoolId,
  schoolName,
  studentCount,
  staffCount,
  onDeleted,
}: {
  schoolId: number | string;
  schoolName: string;
  /** Both counts are elsewhere on the page, but the dialog states them again:
   *  the size of what is about to go is the fact most worth having in front
   *  of somebody at the moment they are deciding. */
  studentCount: number;
  staffCount: number;
  /** Called once the server confirms the deletion. Navigate; do not re-render
   *  the school page, whose subject is gone. */
  onDeleted: () => void;
}) {
  const scale =
    studentCount === 0 && staffCount === 0
      ? "It has no students or staff on record."
      : `That includes ${studentCount} student${studentCount === 1 ? "" : "s"} and ` +
        `${staffCount} staff member${staffCount === 1 ? "" : "s"}, with every mark, ` +
        `payment, attendance record and uploaded file belonging to them.`;

  return (
    <ConfirmActionControl
      label="Delete School"
      tone="destroy"
      title={`Delete ${schoolName} and everything it has recorded?`}
      body={`${scale} This cannot be undone, and the accounts that sign in to this school are removed with it.`}
      confirmLabel="Delete Permanently"
      busyLabel="Deleting..."
      errorFallback="Could not delete this school."
      typeToConfirm={schoolName}
      onConfirm={async () => {
        await platformApi.del(`/platform/schools/${schoolId}`, { confirmName: schoolName });
        onDeleted();
      }}
    />
  );
}
