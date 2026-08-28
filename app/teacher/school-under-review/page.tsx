"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ContentLoader } from "@/components/ContentLoader";

/**
 * /teacher/school-under-review — where a teacher lands when their SCHOOL, not
 * their own account, has stopped being allowed to use the product.
 *
 * The server refuses every school call from a school that is not APPROVED, and
 * it refuses teacher sessions along with admin ones on purpose: a school under
 * review is not open for business, and a portal that kept taking attendance and
 * marks would be the same hole with a different door open. src/lib/api.ts turns
 * that refusal into a redirect here.
 *
 * It is a separate page from /school/pending-verification, and it has to be.
 * That page bounces teachers to /teacher, and /teacher would send them back into
 * the portal, whose next call would be refused again — the two would bounce
 * forever. This is the terminus.
 *
 * NOTHING HERE CALLS THE API. That is what makes it a terminus: there is no
 * request on this page that can come back refused and move the browser again.
 * The status question is not one a teacher can answer anyway — it belongs to
 * their school's administrator, which is what the copy says instead of offering
 * a "check status" button that would be theirs to press but not theirs to act
 * on.
 *
 * Outside the (protected) group deliberately: that group's shell renders the
 * portal chrome — sidebar, navigation into the very pages that are refused —
 * around whatever it wraps, which is the last thing this page should be sitting
 * inside.
 */
export default function TeacherSchoolUnderReviewPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  // The same session check the teacher gate makes, and no more: is there a
  // session, and is it a teacher's? Anything else belongs somewhere else, and
  // the answer comes out of localStorage because there is no call to make.
  useEffect(() => {
    let alive = true;
    try {
      const token = window.localStorage.getItem("auth_token");
      if (!token) throw new Error("no token");

      const raw = window.localStorage.getItem("user");
      const user = raw ? JSON.parse(raw) : null;

      // An admin whose school is under review has a page of its own, with the
      // controls that actually belong to them on it.
      if (user?.actorType !== "teacher") {
        if (alive) router.replace("/school/pending-verification");
        return;
      }

      if (alive) setReady(true);
    } catch {
      if (alive) router.replace("/teacher/login");
    }
    return () => {
      alive = false;
    };
  }, [router]);

  const signOut = () => {
    if (typeof window === "undefined") return;
    window.localStorage.clear();
    // replace(), not push() — matching TeacherSidebar: signing out must not
    // leave the portal one Back press away.
    window.location.replace("/teacher/login");
  };

  if (!ready) {
    return <ContentLoader minHeight={"100vh"} />;
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-7 text-center shadow-sm">
        <h1 className="mb-3 text-base font-semibold text-gray-900">
          Your school&apos;s account is under review
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-gray-600">
          The portal is unavailable until the review is finished. Nothing you have
          recorded has been lost. Your school&apos;s administrator can tell you
          where things stand.
        </p>
        <div className="flex items-stretch gap-2.5">
          {/* Back into the portal. If the school has since been approved this
              simply works; if it has not, the first call is refused and lands
              the teacher back here — which is why it says Try Again rather than
              promising anything. */}
          <button
            type="button"
            onClick={() => router.replace("/teacher")}
            className="flex-1 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-800"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={signOut}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
