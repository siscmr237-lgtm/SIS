import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Settings, Plus, Trash2, Edit, Save, X, Upload, KeyRound, EyeIcon, EyeOffIcon } from 'lucide-react';
import { schoolSettings } from '../data/mockData';
import { toast } from 'sonner';
import { api, BASE_URL } from '@/lib/api';
import { useAcademicYear } from '@/lib/academicYear';
import { useCachedResource, useSisCache } from '@/lib/SisCache';
import { RevalidatingBadge, useResourceError } from './ResourceStatus';
import { compressImageForUpload } from '@/lib/imageResize';
import { PasswordHints } from './PasswordHints';
import { formatTermLabel, resolveSchoolTerm, resolveEffectiveSchoolTerm } from '@/utils/academicTerm';
import { computeSchoolAbbreviation } from '@/utils/schoolAbbreviation';

export function SchoolSettings() {
  const router = useRouter();
  const cache = useSisCache();
  const [settings, setSettings] = useState(schoolSettings);
  const [isEditingBasic, setIsEditingBasic] = useState(false);
  const [savingBasicInfo, setSavingBasicInfo] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  // This screen owns the classes bug from before: a cached list overwrote the
  // live one. It caches only what it owns — the school's own settings and the
  // charge categories — and never writes to the shared 'classes' key.
  const {
    data: settingsData,
    revalidating,
    error: settingsError,
  } = useCachedResource<any>('settings', () => api.get('/settings'));
  // Academic-year state and the manual advance action.
  const { status: yearStatus, advance: advanceYear } = useAcademicYear();
  const [confirmAdvanceYear, setConfirmAdvanceYear] = useState(false);
  const [advancingYear, setAdvancingYear] = useState(false);
  // Label for the destination year, derived from the active one so the button
  // says exactly where a click leads.
  const nextYearLabel = (() => {
    const start = Number(String(yearStatus?.activeYear || '').slice(0, 4));
    return Number.isFinite(start) && start > 0 ? `${start + 1}/${start + 2}` : 'the next year';
  })();

  useResourceError(settingsError, 'school settings', settingsData !== null);

  // Fee configuration is NOT here any more: fees belong to a class LEVEL and are
  // edited from the Classes page ("Fee Categories"), because one fee structure
  // is shared by every section of a level.

  // Change Password dialog state
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  // Basic Settings Form State
  const [formData, setFormData] = useState({
    name: settings.name,
    logo: settings.logo,
    academicYear: settings.academicYear,
    currentTerm: settings.currentTerm,
    motto: '',
    abbreviation: '',
  });
  // Tracks whether the admin actually typed into the Academic Year / Current
  // Term fields (as opposed to just re-saving the auto-resolved value that
  // was pre-filled) — only a real edit should switch autoTermEnabled off.
  const [termFieldsDirty, setTermFieldsDirty] = useState(false);

  // What to actually display: live-computed when autoTermEnabled is on,
  // otherwise exactly the manually stored values.
  const displayedTerm = resolveSchoolTerm(settings);

  useEffect(() => {
    if (!settingsData) return;
    setSettings(prev => ({ ...prev, ...settingsData }));
    // Pre-fill the editable fields with the effective (never-blank) current
    // value so opening the edit form always starts from something sensible,
    // whether auto or manual. Skipped while the form is open: a background
    // revalidation landing mid-edit must not overwrite what is being typed.
    if (isEditingBasic) return;
    const effective = resolveEffectiveSchoolTerm(settingsData);
    setFormData({
      name: settingsData.name || '',
      logo: settingsData.logo || '',
      academicYear: effective.academicYear,
      currentTerm: effective.term,
      motto: settingsData.motto || '',
      abbreviation: settingsData.abbreviation || '',
    });
    setTermFieldsDirty(false);
  }, [settingsData, isEditingBasic]);

  const syncLocalStorageSchool = (fields: Record<string, unknown>) => {
    try {
      const userStr = window.localStorage.getItem('user');
      if (!userStr) return;
      const user = JSON.parse(userStr);
      if (user?.School?.[0]) {
        Object.assign(user.School[0], fields);
        window.localStorage.setItem('user', JSON.stringify(user));
      }
    } catch {}
  };

  const handleBasicInfoSave = async () => {
    if (savingBasicInfo) return;
    setSavingBasicInfo(true);
    const isAutoAbbrev = !!(settings as any).abbreviationAutoGenerated;
    const payload: Record<string, unknown> = {
      name: formData.name,
      logo: formData.logo,
      motto: formData.motto,
    };
    // Manual abbreviation edits are only ever sent while auto-generate is
    // off — while it's on, the backend derives it from `name` itself, so
    // sending a value here would just be ignored (and could get stale).
    if (!isAutoAbbrev) {
      payload.abbreviation = formData.abbreviation;
    }
    if (termFieldsDirty) {
      payload.academicYear = formData.academicYear;
      payload.currentTerm = formData.currentTerm;
      if (settings.autoTermEnabled) payload.autoTermEnabled = false;
    }

    try {
      await api.put('/settings', payload);
      cache.invalidateOn('settings:write');
      // Mirrors what the backend just computed/stored, so the cached school
      // (and anything reading it, like the Dashboard) reflects it right away
      // without waiting for a fresh /settings fetch.
      const resolvedAbbreviation = isAutoAbbrev ? computeSchoolAbbreviation(formData.name) : formData.abbreviation;
      // Uses the functional updater (spreading `prev`, not the outer
      // `settings` closure) so this can never clobber a state change made by
      // another in-flight action (e.g. the abbreviation toggle) that
      // resolved while this save's own await was pending.
      setSettings(prev => {
        const next: any = { ...prev, name: formData.name, logo: formData.logo, motto: formData.motto, abbreviation: resolvedAbbreviation };
        if (termFieldsDirty) {
          next.academicYear = formData.academicYear;
          next.currentTerm = formData.currentTerm;
          if (settings.autoTermEnabled) next.autoTermEnabled = false;
        }
        return next;
      });
      syncLocalStorageSchool({ ...payload, abbreviation: resolvedAbbreviation });
      setTermFieldsDirty(false);
      setIsEditingBasic(false);
      toast.success('School information updated successfully');
    } catch {
      toast.error('Failed to save school information');
    } finally {
      setSavingBasicInfo(false);
    }
  };

  const handleAbbreviationAutoToggle = async (checked: boolean) => {
    // Whatever is currently shown (live-computed from the school name while
    // auto is on) is what gets persisted — whether we're enabling it (so the
    // stored value matches what's displayed) or disabling it (so switching
    // off freezes the value the admin was just looking at, not something
    // stale from before auto was last turned on).
    //
    // liveAbbreviation is computed from `prev` inside the updater rather than
    // from the `settings` closure directly — if this toggle is clicked right
    // after another save, React may not have re-rendered (and handed this
    // handler a fresh closure) yet, so reading `settings.name` here could
    // still see the pre-save value even though `prev` is guaranteed current.
    let liveAbbreviation = '';
    setSettings(prev => {
      liveAbbreviation = computeSchoolAbbreviation(isEditingBasic ? formData.name : prev.name);
      return { ...prev, abbreviationAutoGenerated: checked, abbreviation: liveAbbreviation } as any;
    });
    if (!checked) {
      setFormData(prev => ({ ...prev, abbreviation: liveAbbreviation }));
    }

    try {
      await api.put(
        '/settings',
        checked ? { abbreviationAutoGenerated: true } : { abbreviationAutoGenerated: false, abbreviation: liveAbbreviation }
      );
      cache.invalidateOn('settings:write');
      syncLocalStorageSchool({ abbreviationAutoGenerated: checked, abbreviation: liveAbbreviation });
      toast.success(
        checked
          ? 'Auto-generate enabled — abbreviation now follows the school name.'
          : 'Auto-generate disabled — abbreviation is now set manually.'
      );
    } catch {
      setSettings(prev => ({ ...prev, abbreviationAutoGenerated: !checked } as any));
      toast.error(checked ? 'Failed to enable auto-generate' : 'Failed to disable auto-generate');
    }
  };

  const handleAutoTermToggle = async (checked: boolean) => {
    if (checked) {
      setSettings(prev => ({ ...prev, autoTermEnabled: true }));
      try {
        await api.put('/settings', { autoTermEnabled: true });
        cache.invalidateOn('settings:write');
        syncLocalStorageSchool({ autoTermEnabled: true });
        toast.success('Auto-detect enabled — now showing the live term and year.');
      } catch {
        setSettings(prev => ({ ...prev, autoTermEnabled: false }));
        toast.error('Failed to enable auto-detect');
      }
      return;
    }

    // Turning auto off freezes whatever is currently being displayed (the
    // live value) into the manual fields, rather than reverting to a
    // possibly stale value that predates auto being turned on.
    const frozen = resolveEffectiveSchoolTerm(settings);
    setSettings(prev => ({ ...prev, autoTermEnabled: false, academicYear: frozen.academicYear, currentTerm: frozen.term }));
    setFormData(prev => ({ ...prev, academicYear: frozen.academicYear, currentTerm: frozen.term }));
    setTermFieldsDirty(false);
    try {
      await api.put('/settings', { autoTermEnabled: false, academicYear: frozen.academicYear, currentTerm: frozen.term });
      cache.invalidateOn('settings:write');
      syncLocalStorageSchool({ autoTermEnabled: false, academicYear: frozen.academicYear, currentTerm: frozen.term });
      toast.success('Auto-detect disabled — term and year are now set manually.');
    } catch {
      toast.error('Failed to disable auto-detect');
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoUploading(true);
    setLogoError(null);

    try {
      let uploadFile: File = file;
      try {
        uploadFile = await compressImageForUpload(file);
      } catch (compressErr) {
        // Fall back to the original file — the backend has its own resize
        // safety net if it turns out to be too large.
        console.error('Client-side image compression failed, uploading original', compressErr);
      }

      const token = typeof window !== 'undefined' ? window.localStorage.getItem('auth_token') : null;
      const body = new FormData();
      body.append('file', uploadFile);
      body.append('type', 'logo');

      const res = await fetch(`${BASE_URL}/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Upload failed: ${res.status}`);
      }

      const { path } = await res.json();

      // Persist the path to the database
      await api.put('/settings', { logo: path });
      // Also drops the cached signed logo URL, which now points at the old file.
      cache.invalidateOn('settings:write');

      // Sync localStorage so Sidebar/Dashboard/PDF pick up the new path
      try {
        const userStr = window.localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user?.School?.[0]) {
            user.School[0].logo = path;
            window.localStorage.setItem('user', JSON.stringify(user));
          }
        }
      } catch {}

      // Update local state so the stored path reflects immediately
      setSettings(prev => ({ ...prev, logo: path }));
      setFormData(prev => ({ ...prev, logo: path }));

      toast.success('Logo uploaded successfully');
    } catch (err: any) {
      const msg = err?.message || 'Upload failed';
      setLogoError(msg);
      toast.error('Logo upload failed');
    } finally {
      setLogoUploading(false);
      // Reset so the same file can be re-selected if needed
      e.target.value = '';
    }
  };

  const resetPasswordDialog = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmNewPassword(false);
    setPasswordError(null);
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    if (newPassword !== confirmNewPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setPasswordSubmitting(true);
    try {
      await api.put('/settings/password', { currentPassword, newPassword, confirmPassword: confirmNewPassword });
      setShowPasswordDialog(false);
      resetPasswordDialog();
      toast.success('Password updated successfully');
    } catch (e: any) {
      setPasswordError(e?.message || 'Failed to update password');
    } finally {
      setPasswordSubmitting(false);
    }
  };

  return (
    <div className="p-8 school-settings">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">School Settings</h1>
        <p className="text-gray-600">
          Manage school information and curriculum <RevalidatingBadge active={revalidating} />
        </p>
      </div>

      {/* Basic Information Card */}
      <Card className="p-6 mb-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl">Basic Information</h2>
          <Button
            onClick={() => {
              if (isEditingBasic) {
                handleBasicInfoSave();
              } else {
                setIsEditingBasic(true);
              }
            }}
            variant={isEditingBasic ? "default" : "outline"}
            disabled={savingBasicInfo}
          >
            {isEditingBasic ? (
              <>
                <Save className="mr-2" size={16} />
                {savingBasicInfo ? 'Saving...' : 'Save Changes'}
              </>
            ) : (
              <>
                <Edit className="mr-2" size={16} />
                Edit
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label>School Name</Label>
            {isEditingBasic ? (
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Enter school name"
              />
            ) : (
              <p className="mt-2 p-2 bg-gray-50 rounded">{settings.name}</p>
            )}
          </div>

          <div>
            <Label>School Motto <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
            {isEditingBasic ? (
              <Input
                value={formData.motto}
                onChange={(e) => setFormData(prev => ({ ...prev, motto: e.target.value }))}
                placeholder="e.g. Excellence in Education"
              />
            ) : (
              <p className="mt-2 p-2 bg-gray-50 rounded">{(settings as any).motto || '—'}</p>
            )}
          </div>

          <div className="md:col-span-2 flex items-center justify-between gap-4 p-3 bg-gray-50 rounded-lg border">
            <div>
              <Label className="mb-0.5 block">Auto-generate abbreviation from school name</Label>
              <p className="text-xs text-gray-500">
                {(settings as any).abbreviationAutoGenerated
                  ? 'Following the school name automatically.'
                  : 'Off — Abbreviation is set manually below.'}
              </p>
            </div>
            <Switch checked={!!(settings as any).abbreviationAutoGenerated} onCheckedChange={handleAbbreviationAutoToggle} />
          </div>

          <div className="md:col-span-2">
            <Label>Abbreviation</Label>
            {(settings as any).abbreviationAutoGenerated ? (
              <p className="mt-2 p-2 bg-gray-50 rounded text-gray-500">
                {computeSchoolAbbreviation(isEditingBasic ? formData.name : settings.name)}
                {' '}
                <span className="text-xs text-gray-400 font-normal">(auto-generated)</span>
              </p>
            ) : isEditingBasic ? (
              <Input
                value={formData.abbreviation}
                onChange={(e) => setFormData(prev => ({ ...prev, abbreviation: e.target.value }))}
                placeholder="e.g., ENPS"
              />
            ) : (
              <p className="mt-2 p-2 bg-gray-50 rounded">{(settings as any).abbreviation}</p>
            )}
          </div>

          <div className="md:col-span-2 flex items-center justify-between gap-4 p-3 bg-gray-50 rounded-lg border">
            <div>
              <Label className="mb-0.5 block">Auto-detect term and year</Label>
              <p className="text-xs text-gray-500">
                {settings.autoTermEnabled
                  ? 'Following the school calendar automatically. Editing the fields below switches this off.'
                  : 'Off — Academic Year and Current Term are set manually below.'}
              </p>
            </div>
            <Switch checked={settings.autoTermEnabled} onCheckedChange={handleAutoTermToggle} />
          </div>

          {/* The academic year is no longer free text. It is state that moves
              forward through the manual → nudge → auto flow, so it is shown
              read-only with an explicit advance action: a typo here would file
              records under a year that does not exist, and every year-tagged row
              is matched by exact string. */}
          <div>
            <Label>Academic Year</Label>
            <p className="mt-2 p-2 bg-gray-50 rounded">
              {yearStatus?.activeYear ?? displayedTerm.academicYear}
            </p>
            {yearStatus && (
              <div className="mt-2">
                {confirmAdvanceYear ? (
                  <div
                    style={{
                      padding: '0.75rem 0.875rem', borderRadius: 8,
                      border: '1px solid #FCD34D', backgroundColor: '#FFFBEB',
                      color: '#92400E', fontSize: '0.8125rem',
                    }}
                  >
                    <p style={{ fontWeight: 600, marginBottom: 4 }}>
                      Start the {nextYearLabel} academic year?
                    </p>
                    <p style={{ marginBottom: 8 }}>
                      New marks, fees and other records will be filed under{' '}
                      <strong>{nextYearLabel}</strong> from now on. Earlier years stay readable and
                      selectable. Nothing is promoted, graduated or reset.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Button
                        size="sm"
                        disabled={advancingYear}
                        onClick={async () => {
                          setAdvancingYear(true);
                          try {
                            await advanceYear();
                            toast.success(`Academic year is now ${nextYearLabel}`);
                            setConfirmAdvanceYear(false);
                          } catch (e: any) {
                            toast.error(e?.message || 'Could not advance the academic year.');
                          } finally {
                            setAdvancingYear(false);
                          }
                        }}
                      >
                        {advancingYear ? 'Starting...' : `Yes, start ${nextYearLabel}`}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={advancingYear}
                        onClick={() => setConfirmAdvanceYear(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setConfirmAdvanceYear(true)}>
                    Start next academic year ({nextYearLabel})
                  </Button>
                )}
              </div>
            )}
          </div>

          <div>
            <Label>Current Term</Label>
            {isEditingBasic ? (
              <Input
                value={formData.currentTerm}
                onChange={(e) => { setFormData(prev => ({ ...prev, currentTerm: e.target.value })); setTermFieldsDirty(true); }}
                placeholder="e.g., Term 1"
              />
            ) : (
              <p className="mt-2 p-2 bg-gray-50 rounded">{formatTermLabel(displayedTerm.term)}</p>
            )}
          </div>

          <div>
            <Label>School Logo</Label>
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-3">
                <label
                  className={`cursor-pointer inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50 transition-colors${logoUploading ? ' opacity-50 pointer-events-none' : ''}`}
                >
                  <Upload size={14} />
                  {logoUploading ? 'Uploading…' : 'Choose image'}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={handleLogoUpload}
                    disabled={logoUploading}
                  />
                </label>
                <span className="text-xs text-gray-400">JPG, PNG or WebP</span>
              </div>
              {logoError && (
                <p className="text-sm text-red-600">{logoError}</p>
              )}
              {settings.logo && (
                <p className="text-xs text-gray-500 break-all">{settings.logo}</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Change Password */}
      <Card className="p-6 mt-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl">Change Password</h2>
            <p className="text-sm text-gray-500 mt-1">Update the password used to sign in to this account.</p>
          </div>
          <Button variant="outline" onClick={() => setShowPasswordDialog(true)}>
            <KeyRound className="mr-2" size={16} />
            Change Password
          </Button>
        </div>
      </Card>

      {/* Logout */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <Button
          variant="destructive"
          onClick={() => {
            try {
              if (typeof window !== "undefined") {
                window.localStorage.removeItem("auth_token");
                window.localStorage.removeItem("user");
                router.replace("/login");
              }
            } catch {}
          }}
        >
          Logout
        </Button>
      </div>

      {/* Change Password Dialog */}
      <Dialog
        open={showPasswordDialog}
        onOpenChange={(open) => { setShowPasswordDialog(open); if (!open) resetPasswordDialog(); }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Current Password</Label>
              <div className="relative">
                <Input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showCurrentPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
            </div>

            <div>
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNewPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
              <PasswordHints password={newPassword} />
            </div>

            <div>
              <Label>Confirm New Password</Label>
              <div className="relative">
                <Input
                  type={showConfirmNewPassword ? 'text' : 'password'}
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmNewPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showConfirmNewPassword ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                </button>
              </div>
              {confirmNewPassword && newPassword !== confirmNewPassword && (
                <p className="text-xs text-red-600 mt-1">Passwords do not match.</p>
              )}
            </div>

            {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
          </div>

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={passwordSubmitting}>Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleChangePassword}
              disabled={passwordSubmitting || !currentPassword || !newPassword || !confirmNewPassword}
            >
              {passwordSubmitting ? 'Updating…' : 'Update Password'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
