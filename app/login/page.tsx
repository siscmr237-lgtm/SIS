"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon, PhoneIcon, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { api } from "../../src/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { phoneNumber, password });
      if ((res as any)?.token) {
        if (typeof window !== "undefined") {
          window.localStorage.setItem("auth_token", (res as any).token);
        }
        router.replace("/");
      } else {
        setError("Invalid response");
      }
    } catch (err: any) {
      setError(err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      {/* Soft pastel gradient background (light blue → off-white) */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#ECF5FF] via-[#F8FBFF] to-white" />

      <div className="relative w-full max-w-[400px]">
        <div className="mb-6 text-center flex flex-col items-center">
          <div className="bg-[#CFE5FF] p-3 rounded-full mb-3">
            <GraduationCap className="text-[#007BFF]" size={40} />
          </div>
          <div className="select-none text-[24px] font-medium leading-none mb-1" style={{ color: '#007BFF' }}>sis</div>
          <h1 className="text-3xl font-bold" style={{ color: '#007BFF' }}>Welcome Back</h1>
          <p className="mt-1 text-sm" style={{ color: '#6B7280' }}>Sign in to access your organization dashboard</p>
        </div>

        <form onSubmit={onSubmit} className="w-full bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg p-8 space-y-5 border border-gray-100">
          {/* Phone Number */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Phone Number</Label>
            {/* unified rounded group */}
            <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white pl-2 pr-2 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-[#CFE5FF]" style={{ boxShadow: '0 6px 20px rgba(0,0,0,0.06)' }}>
              <select
                className="w-[6.25rem] rounded-xl px-3 py-2 bg-white outline-none border border-gray-200"
                defaultValue="CM +237"
                aria-label="Country code"
              >
                <option>CM +237</option>
                <option>NG +234</option>
                <option>GH +233</option>
              </select>
              <div className="h-6 w-px bg-gray-200" />
              <div className="relative flex-1">
                <PhoneIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
                <Input
                  type="tel"
                  placeholder="Enter your phone number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Password</Label>
            {/* unified rounded group */}
            <div className="relative flex items-center rounded-2xl border border-gray-200 bg-white pr-2 pl-2 py-1.5 shadow-sm focus-within:ring-2 focus-within:ring-[#CFE5FF]" style={{ boxShadow: '0 6px 20px rgba(0,0,0,0.06)' }}>
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-2 px-2 text-gray-500 hover:text-gray-700 focus:outline-none"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button
            type="submit"
            disabled={loading}
            className="w-full rounded-full py-3 transition-all disabled:opacity-60 hover:shadow-lg"
            style={{ backgroundColor: '#007BFF', color: 'white', boxShadow: '0 8px 16px rgba(0,0,0,0.1)' }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </Button>

          <div className="text-center space-y-1">
            <button
              type="button"
              onClick={() => alert('Please contact the administrator to reset your password.')}
              className="text-sm font-medium"
              style={{ color: '#007BFF' }}
            >
              Forgot your password?
            </button>
            <div className="text-sm" style={{ color: '#6B7280' }}>
              Don\'t have an account? <span className="font-medium cursor-pointer" style={{ color: '#007BFF' }}>Sign up</span>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
