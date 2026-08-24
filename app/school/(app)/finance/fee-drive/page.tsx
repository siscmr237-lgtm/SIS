"use client";

import { useRouter } from "next/navigation";
import { FeeDrive } from "@/components/FeeDrive";

export default function FeeDrivePage() {
  const router = useRouter();
  return (
    <FeeDrive
      onBack={() => router.push("/school/finance")}
      // Pushed straight to the profile URL rather than going through
      // useAppNavigation's viewStudent, which takes a whole Student. A row here
      // carries a code, a name, a class and three figures — not a Student — and
      // the profile page loads the student by code from the URL anyway, so
      // assembling a half-empty Student object to hand over would be inventing
      // a record to satisfy a signature.
      onViewStudent={(code) => router.push(`/school/students/${encodeURIComponent(code)}`)}
    />
  );
}
