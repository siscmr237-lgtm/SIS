"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/PhoneInput";
import { PasswordHints } from "@/components/PasswordHints";
import { api } from "@/lib/api";

interface StaffMe {
  code?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  phone?: string;
  email?: string;
  hireDate?: string;
  isTeacher?: boolean;
}

function formatDate(value: string | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-sm text-gray-900">{value || "—"}</dd>
    </div>
  );
}

export default function TeacherProfilePage() {
  const [me, setMe] = useState<StaffMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get("/staff/me")
      .then((res: any) => {
        if (!alive) return;
        setMe(res);
        setPhone(res?.phone ?? "");
      })
      .catch((e: any) => {
        if (alive) setLoadError(e?.message || "Failed to load your profile.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const savePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPhone) return;
    setSavingPhone(true);
    setPhoneMessage(null);
    setPhoneError(null);
    try {
      // phone is the only field PATCH /staff/me accepts — name, role, salary
      // and email are the admin's to change, not the teacher's.
      const res: any = await api.patch("/staff/me", { phone });
      setMe((prev) => ({ ...(prev ?? {}), ...(res ?? {}), phone: res?.phone ?? phone }));
      setPhoneMessage("Phone number updated.");
    } catch (err: any) {
      setPhoneError(err?.message || "Failed to update your phone number.");
    } finally {
      setSavingPhone(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPassword) return;
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setSavingPassword(true);
    setPasswordMessage(null);
    setPasswordError(null);
    try {
      await api.post("/staff/me/change-password", {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated.");
    } catch (err: any) {
      setPasswordError(err?.message || "Failed to change your password.");
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">My Profile</h1>
        <p className="text-gray-600">Your details, contact number, and password</p>
      </div>

      {loading ? (
        <Card className="p-6 text-gray-500">Loading...</Card>
      ) : loadError ? (
        <Card className="p-6 text-red-600 text-sm">
          Couldn't load your profile. Please refresh and try again.
        </Card>
      ) : (
        <div className="space-y-4 max-w-3xl">
          <Card className="p-6">
            <h2 className="text-base font-medium mb-5">Staff Information</h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Role" value={me?.isTeacher ? "Teacher" : me?.role} />
              <Field label="First Name" value={me?.firstName} />
              <Field label="Last Name" value={me?.lastName} />
              <Field label="Email" value={me?.email} />
              <Field label="Hire Date" value={formatDate(me?.hireDate)} />
            </dl>
            <p className="text-xs text-gray-400 mt-5">
              Your name, role, and email are managed by your school admin.
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-medium mb-5">Contact Number</h2>
            <form onSubmit={savePhone} className="space-y-4">
              <div>
                <Label htmlFor="phone">Phone</Label>
                <PhoneInput
                  id="phone"
                  value={phone}
                  onChange={setPhone}
                />
              </div>
              {phoneMessage && <p className="text-sm text-green-700">{phoneMessage}</p>}
              {phoneError && <p className="text-sm text-red-600">{phoneError}</p>}
              <div className="flex justify-end">
                <Button type="submit" disabled={savingPhone || phone === (me?.phone ?? "")}>
                  {savingPhone ? "Saving..." : "Save Phone"}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-medium mb-5">Change Password</h2>
            <form onSubmit={changePassword} className="space-y-4">
              <div>
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <PasswordHints password={newPassword} />
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-red-600 mt-1">Passwords do not match.</p>
                )}
              </div>
              {passwordMessage && <p className="text-sm text-green-700">{passwordMessage}</p>}
              {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={
                    savingPassword ||
                    !currentPassword ||
                    !newPassword ||
                    newPassword !== confirmPassword
                  }
                >
                  {savingPassword ? "Updating..." : "Update Password"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
