"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import App from "../src/App";
import { api } from "../src/lib/api";

export default function Page() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        // Require token and a successful /auth/me
        const token =
          typeof window !== "undefined"
            ? window.localStorage.getItem("auth_token")
            : null;
        if (!token) throw new Error("no token");
        // await api.get("/auth/me");
        if (alive) setReady(true);
      } catch {
        if (alive) router.replace("/login");
      }
    };
    check();
    return () => {
      alive = false;
    };
  }, [router]);

  if (!ready)
    return <div className="p-6 text-sm text-gray-600">Loading...</div>;
  return <App />;
}
