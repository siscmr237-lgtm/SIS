import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Settings, Plus, Trash2, Edit, Save, X, Upload, KeyRound, EyeIcon, EyeOffIcon, Bell } from 'lucide-react';
import { schoolSettings } from '../data/mockData';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { AcademicYearSelect, useAcademicYear } from '@/lib/academicYear';
import { useCachedResource, useSisCache } from '@/lib/SisCache';
import { RevalidatingBadge, useResourceError } from './ResourceStatus';
import { uploadImage } from '@/lib/uploadImage';
import { PasswordHints } from './PasswordHints';
import { HOLIDAY, TERM_OPTIONS, resolveSchoolTerm } from '@/utils/academicTerm';
import {
  ABBREVIATION_MAX_LENGTH,
  normalizeSchoolAbbreviation,
  validateSchoolAbbreviation,
} from '../utils/schoolAbbreviation';
import { AdministratorsSection } from './AdministratorsSection';

/**
 * The notifications switch.
 *
 * Styled entirely inline, and NOT built on src/components/ui/switch.tsx. That
 * component exists but is used by nothing in this app, which means its Tailwind
 * utilities were never compiled into src/index.css — and index.css is a frozen
 * pre-built artifact, so a class that is not already in it renders as nothing at
 * all, silently. A switch that is invisible is worse than no switch. This
 * mirrors the toggle in FeeDrive.tsx, which is inline for the same reason.
 *
 * A real <button role="switch"> rather than a styled div: reachable by keyboard,
 * announces its own state through aria-checked, and responds to the space bar
 * with no extra handler.
 */
function NotificationToggle({
  checked,
  busy,
  onChange,
}: {
  checked: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Push Notifications"
      disabled={busy}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        flexShrink: 0,
        width: 38,
        height: 22,
        borderRadius: 9999,
        border: "1px solid transparent",
        // The brand navy for on, a plain grey for off. Hex rather than a token
        // because there is no compiled utility to lean on — see above.
        backgroundColor: checked ? "#0f2345" : "#D1D5DB",
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
        transition: "background-color 160ms ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          width: 16,
          height: 16,
          borderRadius: 9999,
          backgroundColor: "#FFFFFF",
          transform: checked ? "translateX(16px)" : "translateX(0)",
          transition: "transform 160ms ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

export function SchoolSettings() {
  const router = useRouter();
  const cache = useSisCache();
  const [settings, setSettings] = useState(schoolSettings);
  const [savingBasicInfo, setSavingBasicInfo] = useState(false);
  /**
   * The push-notification opt-out.
   *
   * Held apart from `formData` and its Save button on purpose. Every other
   * field on this page is edited and then saved together; a switch is expected
   * to take effect when you flick it, and one that silently needed a Save
   * press further down the page would leave people believing they had turned
   * notifications off when they had not.
   *
   * Which is also why it is optimistic with a rollback: the switch moves
   * immediately, and moves back if the server refuses.
   */
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [savingNotifications, setSavingNotifications] = useState(false);
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
  // Academic-year state. Fetching it is also the app-load half of the rollover,
  // so the auto-advance still happens on this page — quietly, with no card.
  const { status: yearStatus, refresh: refreshYear } = useAcademicYear();

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

  /**
   * Every field is editable from the moment the page loads — there is no edit
   * mode. What used to be "am I editing" is now "has anything changed", which
   * is what the Save button needs to know anyway.
   *
   * `baseline` is the last saved state. Dirtiness is a comparison against it,
   * not a flag set by each onChange: typing a character and deleting it again
   * leaves nothing to save, and a flag would still claim otherwise.
   */
  type BasicForm = {
    name: string; logo: string; academicYear: string;
    currentTerm: string; motto: string; abbreviation: string;
    /**
     * 'MALE' | 'FEMALE' | '' — the ProprietorGender enum, with '' standing for
     * not-yet-chosen.
     *
     * A plain string rather than a nullable union so it behaves like every
     * sibling field above it: `dirtyFields` compares each key against the
     * baseline with !==, and a null would make "cleared it" and "never set it"
     * compare equal to two different things depending on which side was which.
     * The server turns '' back into NULL — see PUT /settings.
     */
    proprietorGender: string;
  };
  const EMPTY_FORM: BasicForm = { name: '', logo: '', academicYear: '', currentTerm: '', motto: '', abbreviation: '', proprietorGender: '' };
  const [formData, setFormData] = useState<BasicForm>(EMPTY_FORM);
  const [baseline, setBaseline] = useState<BasicForm>(EMPTY_FORM);

  const dirtyFields = (Object.keys(formData) as (keyof BasicForm)[])
    .filter(k => formData[k] !== baseline[k]);
  const isDirty = dirtyFields.length > 0;
  // Only a real change to either of these should switch auto-detect off.
  const termFieldsDirty = dirtyFields.includes('academicYear') || dirtyFields.includes('currentTerm');

  // Shown under the field as they type, and it also disables Save. The same
  // rule runs again in handleBasicInfoSave and again on the server — this copy
  // exists to tell somebody what is wrong while they can still see the field,
  // not to be the thing that enforces it.
  //
  // ONLY ONCE THE FIELD HAS LOADED. formData starts as EMPTY_FORM before the
  // settings request resolves, and an empty abbreviation is invalid, so without
  // this guard the page would open with a red error under an empty box that is
  // about to fill itself in.
  const abbreviationError = baseline.abbreviation || formData.abbreviation
    ? validateSchoolAbbreviation(formData.abbreviation)
    : null;

  /**
   * What the two calendar fields should show before anyone touches them.
   *
   * The YEAR is server state (it is what the rollover advances), so it comes
   * from /academic-year/status. The TERM is auto-detected from today's date
   * while autoTermEnabled is on, and is the stored value once it has been set
   * by hand. Auto-detection still happens exactly as before — it simply has no
   * card announcing it any more.
   */
  const detected = (() => {
    const resolved = resolveSchoolTerm(settingsData ?? settings);
    return {
      academicYear: yearStatus?.activeYear || resolved.academicYear || '',
      // null means the calendar says holiday; that IS the Holiday option.
      currentTerm: resolved.term || HOLIDAY,
    };
  })();

  useEffect(() => {
    if (!settingsData) return;
    setSettings(prev => ({ ...prev, ...settingsData }));
    // Not guarded by isDirty like the fields below: this switch is saved the
    // instant it moves, so there is never an unsaved edit here for a background
    // revalidation to overwrite. `!== false` defaults it ON for a response from
    // an API deployed before the column existed, matching the database default.
    setNotificationsEnabled(settingsData.notificationsEnabled !== false);
    // A background revalidation must never overwrite unsaved edits.
    if (isDirty) return;
    const next: BasicForm = {
      name: settingsData.name || '',
      logo: settingsData.logo || '',
      academicYear: detected.academicYear,
      currentTerm: detected.currentTerm,
      motto: settingsData.motto || '',
      abbreviation: settingsData.abbreviation || '',
      // NULL from the server means nobody has chosen yet, which is the select's
      // placeholder state rather than a value.
      proprietorGender: settingsData.proprietorGender || '',
    };
    setFormData(next);
    setBaseline(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsData, detected.academicYear, detected.currentTerm]);

  /**
   * Saves the switch immediately, and puts it back if the save fails.
   *
   * Sends ONLY notificationsEnabled. PUT /settings spreads the body into the
   * School row, so including the rest of the form would let this switch quietly
   * commit half-typed edits from the card above it.
   */
  const handleNotificationsToggle = async (next: boolean) => {
    const previous = notificationsEnabled;
    setNotificationsEnabled(next);
    setSavingNotifications(true);
    try {
      const updated = await api.put('/settings', { notificationsEnabled: next });
      // The server is the authority on what was stored — a coercion there must
      // not leave this switch showing something different from the row.
      setNotificationsEnabled(updated?.notificationsEnabled !== false);
      // The same invalidation every other save on this page performs, so the
      // cached settings entry cannot serve the old value to the next reader.
      cache.invalidateOn('settings:write');
      toast.success(next ? "Push notifications on." : "Push notifications off.");
    } catch {
      setNotificationsEnabled(previous);
      toast.error("Could not change the notification setting.");
    } finally {
      setSavingNotifications(false);
    }
  };

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
    if (savingBasicInfo || !isDirty) return;

    // CHECKED BEFORE THE REQUEST, not only after it. The server validates this
    // too and is the authority — but the abbreviation is now the prefix on every
    // receipt this school issues, and it sits on a form that saves the school
    // name, the logo and the motto in the same click. Letting the whole save
    // bounce off the API because of one stray space means the person at the
    // screen loses the other three edits and is told so by a toast.
    const abbreviation = normalizeSchoolAbbreviation(formData.abbreviation);
    const invalidAbbreviation = validateSchoolAbbreviation(abbreviation);
    if (invalidAbbreviation) {
      toast.error(invalidAbbreviation);
      return;
    }

    setSavingBasicInfo(true);
    // The abbreviation is an ordinary manual field: sent whenever it has
    // changed, and never re-derived from the name by the server.
    //
    // NORMALISED, so what gets saved is what the rest of this function then
    // writes into local state and localStorage. Sending the raw field and
    // storing the raw field would leave the header showing "cnps" until the
    // next reload told it otherwise.
    //
    // Changing this does NOT renumber a single existing receipt — old ones keep
    // the prefix they were issued under and only the next one uses the new. See
    // the note on School.abbreviation in the backend schema.
    const payload: Record<string, unknown> = {
      name: formData.name,
      logo: formData.logo,
      motto: formData.motto,
      abbreviation,
      // '' when nobody has chosen, which PUT /settings normalises back to NULL:
      // the Postgres enum has no member for '' and would refuse the write.
      proprietorGender: formData.proprietorGender,
    };
    if (termFieldsDirty) {
      payload.academicYear = formData.academicYear;
      payload.currentTerm = formData.currentTerm;
      // Choosing a term by hand is what turns auto-detect off — the toggle
      // that used to do it explicitly is gone, but the behaviour it guarded
      // is unchanged: a deliberate choice must not be overwritten tomorrow.
      if (settings.autoTermEnabled) payload.autoTermEnabled = false;
    }

    try {
      await api.put('/settings', payload);
      cache.invalidateOn('settings:write');
      setSettings(prev => {
        const next: any = { ...prev, ...payload };
        return next;
      });
      syncLocalStorageSchool(payload);
      // Saved state IS the new baseline, so Save goes quiet again.
      //
      // With the NORMALISED abbreviation folded back in. Somebody who typed
      // "cnps" has CNPS saved; leaving the raw text in the form and in the
      // baseline would show them the wrong value in the field, and would leave
      // Save lit up over a difference that only exists on their screen.
      const saved = { ...formData, abbreviation };
      setFormData(saved);
      setBaseline(saved);
      // The year lives in the rollover's state as well; re-read it so the
      // dropdown and every other screen agree immediately.
      if (dirtyFields.includes('academicYear')) refreshYear();
      toast.success('School information updated successfully');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save school information');
    } finally {
      setSavingBasicInfo(false);
    }
  };


  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoUploading(true);
    setLogoError(null);

    try {
      // Resizes, checks the payload size and reports its own failures in
      // words. Nothing here falls back to sending the original file.
      const path = await uploadImage(file, 'logo');

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
      // The reason goes in BOTH places. The toast is what a phone user
      // actually sees — it used to say only "Logo upload failed", which is the
      // same amount of information the browser gave us and none of what we now
      // know. The inline copy persists after the toast has gone.
      const msg = err?.message || 'The logo could not be uploaded. Please try again.';
      setLogoError(msg);
      toast.error(msg);
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
        {/* No Edit button: every field below is live from first paint. Save is
            the only action, it is disabled until something actually differs
            from the last saved state, and nothing auto-saves on blur or on
            change — a half-typed school name must never reach the server. */}
        <div className="flex justify-between items-center gap-4 mb-6">
          <h2 className="text-xl">Basic Information</h2>
          <Button
            onClick={handleBasicInfoSave}
            variant={isDirty ? 'default' : 'outline'}
            disabled={!isDirty || savingBasicInfo || !!abbreviationError}
          >
            <Save className="mr-2" size={16} />
            {savingBasicInfo ? 'Saving...' : isDirty ? 'Save Changes' : 'Saved'}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label>School Name</Label>
            <Input
              className="mt-2"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter school name"
            />
          </div>

          <div>
            <Label>School Motto <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
            <Input
              className="mt-2"
              value={formData.motto}
              onChange={(e) => setFormData(prev => ({ ...prev, motto: e.target.value }))}
              placeholder="e.g. Excellence in Education"
            />
          </div>

          {/* Suggested from the school name once, at signup, and manual from
              then on — renaming the school no longer rewrites it. The
              auto-generate toggle that used to sit above this went with that
              behaviour.

              THIS IS ALSO THE RECEIPT PREFIX now, which is why the field has a
              maxLength and an inline error where it used to take anything. The
              copy says so plainly, including the part that surprises people:
              changing it here leaves every receipt already issued exactly as it
              is. A school that goes from CNPS to ENPS gets CNPS001..015 and then
              ENPS016 — one sequence, two prefixes — because CNPS014 is printed
              on a receipt in somebody's hands and in their WhatsApp history. */}
          <div className="md:col-span-2">
            <Label>Abbreviation</Label>
            <Input
              className="mt-2"
              value={formData.abbreviation}
              /* Uppercased AS THEY TYPE rather than silently on save, so the
                 field shows the value that will actually go on a receipt. */
              onChange={(e) => setFormData(prev => ({
                ...prev,
                abbreviation: normalizeSchoolAbbreviation(e.target.value),
              }))}
              maxLength={ABBREVIATION_MAX_LENGTH}
              placeholder="e.g., ENPS"
            />
            {abbreviationError ? (
              <p className="text-xs text-red-600 mt-1">{abbreviationError}</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                Used where the full school name will not fit, and as the prefix on every
                receipt number — {formData.abbreviation || 'ENPS'}001, {formData.abbreviation || 'ENPS'}002.
                Letters and digits only, 2–{ABBREVIATION_MAX_LENGTH} characters. Changing it
                does not renumber receipts already issued.
              </p>
            )}
          </div>

          {/* A dropdown, never free text: every year-tagged row is matched by
              exact string, so "2026-2027" or "2026/2028" would file records
              under a year that does not exist and cannot be selected back.
              The list is the school's own years plus the next one — see
              selectableAcademicYears in the backend. The separate "Start next
              academic year" button is gone: choosing the year IS starting it. */}
          <div>
            <Label>Academic Year</Label>
            <div className="mt-2">
              <AcademicYearSelect
                value={formData.academicYear}
                years={yearStatus?.selectableYears ?? []}
                onChange={(year) => setFormData(prev => ({ ...prev, academicYear: year }))}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Runs September to August. Detected automatically; change it here to work in another year.
            </p>
          </div>

          <div>
            <Label>Current Term</Label>
            <div className="mt-2">
              <Select
                value={formData.currentTerm}
                onValueChange={(term) => setFormData(prev => ({ ...prev, currentTerm: term }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  {TERM_OPTIONS.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Detected from today's date. Choosing one yourself stops it changing on its own.
            </p>
          </div>

          <div>
            <Label>School Logo</Label>
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-3">
                {/* `relative` is load-bearing, not decoration.
                    The input below is .sr-only, which is `position: absolute`
                    with NO top/left — so it stays at its static position, and
                    its containing block is whatever is positioned above it.
                    Without this class nothing was, so the containing block was
                    the initial one (offsetParent was literally <body>): the
                    input escaped both <main>'s overflow-y and the shell's
                    overflow-hidden, landed 193px below the viewport near the
                    foot of this long page, and made the DOCUMENT scrollable.
                    Scrolling <main> to its end then chained into that empty
                    193px. Making this label the containing block keeps the
                    input where it actually lives, clipped normally.
                    Not display:none, which would drop it out of the tab order. */}
                <label
                  className={`relative cursor-pointer inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50 transition-colors${logoUploading ? ' opacity-50 pointer-events-none' : ''}`}
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

          {/* LAST in the grid on purpose, so it pairs with the logo on the
              closing row. Dropping it in higher up would have split Academic
              Year from Current Term, and those two belong side by side — they
              are read together and a manual edit to either switches auto-detect
              off for both.

              Every class here is one a sibling field above already uses, since
              src/index.css is a frozen Tailwind build and a class that is not
              already in it does nothing at all. */}
          <div>
            <Label>Proprietor&apos;s Gender <span className="text-gray-400 font-normal text-xs">(optional)</span></Label>
            <div className="mt-2">
              <Select
                value={formData.proprietorGender}
                onValueChange={(value) => setFormData(prev => ({ ...prev, proprietorGender: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  {/* Two options, and only two. The values are the
                      ProprietorGender enum members exactly as Postgres stores
                      them — not the labels — because PUT /settings writes them
                      straight to the column. */}
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="MALE">Male</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Sets how letters are signed: Female signs &ldquo;Mme&rdquo;, Male signs &ldquo;Sir&rdquo;, each followed by the
              proprietor&apos;s initials. Left unset, letters are signed with the initials alone.
            </p>
          </div>
        </div>
      </Card>

      {/* Push Notifications

          ITS OWN TOP-LEVEL CARD, between the school details above and the
          account security below. Deliberately not folded into Basic Information:
          this is the switch that decides whether anyone at this school hears from
          Lewa at all, and somebody looking for it should find it by scanning the
          page rather than by opening a section about the school's name and logo. */}
      <Card className="p-6 mt-6">
        <div className="flex justify-between items-start gap-4">
          <div className="flex gap-3 min-w-0">
            <Bell size={20} className="text-gray-500 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-xl">Push Notifications</h2>
              <p className="text-sm text-gray-500 mt-1">
                Receive reminders and alerts from Lewa on this device.
              </p>
            </div>
          </div>
          <NotificationToggle
            checked={notificationsEnabled}
            busy={savingNotifications}
            onChange={handleNotificationsToggle}
          />
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

      {/* Administrators — renders nothing at all for an Administrator, who may
          not see who else holds an account here. The refusal itself lives on the
          server (requireOwner on every /admins route); this only keeps the app
          from offering a section it would be refused. */}
      <AdministratorsSection />

      {/* Logout */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <Button
          variant="destructive"
          onClick={() => {
            try {
              if (typeof window !== "undefined") {
                window.localStorage.removeItem("auth_token");
                window.localStorage.removeItem("user");
                router.replace("/school/login");
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
        <DialogContent style={{ maxWidth: 'min(448px, calc(100vw - 2rem))' }}>
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
