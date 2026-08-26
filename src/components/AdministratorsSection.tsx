"use client";

import { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAdminRole } from '@/lib/adminRole';

/**
 * WHO ELSE MAY WORK IN THIS SCHOOL. Owner-only, on the School Settings page.
 *
 * The section renders nothing at all for an Administrator — but that is
 * presentation and nothing more. GET /admins, POST /admins/invite and
 * DELETE /admins/:id all carry requireOwner on the server, so an Administrator
 * who types the URL or calls the API directly is refused by the API itself. See
 * src/routes/admins.js.
 *
 * Inline styles throughout: src/index.css is a frozen Tailwind build, so a
 * utility class that is not already compiled into it does nothing.
 */

interface AdminRow {
  id: number;
  name: string;
  email: string | null;
  role: 'OWNER' | 'ADMINISTRATOR';
  isActive: boolean;
  joinedAt: string;
  /** False while an invitation is outstanding — no password has been set yet. */
  hasLogin: boolean;
}

const ROLE_LABEL: Record<AdminRow['role'], string> = {
  OWNER: 'Owner',
  ADMINISTRATOR: 'Administrator',
};

function formatJoined(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function AdministratorsSection() {
  const role = useAdminRole();
  const [rows, setRows] = useState<AdminRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showInvite, setShowInvite] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const [removing, setRemoving] = useState<AdminRow | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const load = () => {
    api
      .get('/admins')
      .then((res: any) => setRows(res?.admins ?? []))
      .catch((e: any) => setError(e?.message || 'Could not load administrators.'));
  };

  useEffect(() => {
    // Not until the role has settled, and never for an Administrator: the call
    // would come back 403 and put a permission error on a page they are
    // otherwise entitled to use.
    if (role !== 'OWNER') return;
    load();
  }, [role]);

  if (role !== 'OWNER') return null;

  const invite = async () => {
    if (inviting) return;
    setInviting(true);
    setInviteError(null);
    try {
      const res: any = await api.post('/admins/invite', {
        name: form.name.trim(),
        email: form.email.trim(),
      });
      setShowInvite(false);
      setForm({ name: '', email: '' });
      toast.success(res?.message || 'Invitation sent.');
      load();
    } catch (e: any) {
      setInviteError(e?.message || 'Could not send the invitation.');
    } finally {
      setInviting(false);
    }
  };

  const remove = async () => {
    if (!removing || removeBusy) return;
    setRemoveBusy(true);
    try {
      await api.delete(`/admins/${removing.id}`);
      toast.success(`${removing.name} no longer has access.`);
      setRemoving(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || 'Could not remove that administrator.');
    } finally {
      setRemoveBusy(false);
    }
  };

  const th: React.CSSProperties = {
    textAlign: 'left', padding: '10px 14px', fontSize: '0.75rem',
    textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B',
    borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    padding: '12px 14px', fontSize: '0.875rem', color: '#0F172A',
    borderBottom: '1px solid #F1F5F9', verticalAlign: 'top',
  };
  const tag = (color: string, bg: string): React.CSSProperties => ({
    display: 'inline-block', marginLeft: 8, padding: '1px 7px', borderRadius: 999,
    fontSize: '0.6875rem', fontWeight: 500, color, background: bg, whiteSpace: 'nowrap',
  });

  return (
    <Card className="p-6 mt-6">
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap', marginBottom: '1rem',
        }}
      >
        <div>
          <h2 className="text-xl">Administrators</h2>
          <p className="text-sm text-gray-500 mt-1">
            Who can sign in and work in this school. An administrator can edit only the records
            they created themselves, and cannot delete anything.
          </p>
        </div>
        <Button
          onClick={() => { setShowInvite(true); setInviteError(null); }}
          style={{ whiteSpace: 'nowrap' }}
        >
          <UserPlus className="mr-2" size={16} />
          Invite Administrator
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && rows === null && <p className="text-sm text-gray-500">Loading…</p>}

      {rows && (
        <div style={{ border: '1px solid #E2E8F0', borderRadius: 12, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Joined</th>
                <th style={{ ...th, textAlign: 'right' }}>&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} style={{ opacity: a.isActive ? 1 : 0.55 }}>
                  <td style={td}>
                    {a.name}
                    {/* Three states worth telling apart, and each is a different
                        thing to do next: removed means re-invite to restore,
                        invited means the link is still outstanding, and neither
                        means nothing needs doing. */}
                    {!a.isActive && <span style={tag('#B45309', '#FEF3C7')}>Removed</span>}
                    {a.isActive && !a.hasLogin && <span style={tag('#1D4ED8', '#DBEAFE')}>Invited</span>}
                  </td>
                  <td style={{ ...td, color: '#475569', wordBreak: 'break-all' }}>{a.email || '—'}</td>
                  <td style={td}>{ROLE_LABEL[a.role]}</td>
                  <td style={{ ...td, color: '#475569', whiteSpace: 'nowrap' }}>{formatJoined(a.joinedAt)}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {/* The owner's own row has no action: the account that owns
                        the school cannot be removed from it, which the server
                        enforces too. A removed administrator has none either —
                        inviting the same address again is what brings them back. */}
                    {a.role === 'ADMINISTRATOR' && a.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRemoving(a)}
                        style={{ color: '#DC2626', borderColor: '#FECACA' }}
                      >
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite dialog */}
      <Dialog
        open={showInvite}
        onOpenChange={(open) => { setShowInvite(open); if (!open) setInviteError(null); }}
      >
        <DialogContent style={{ maxWidth: 'min(448px, calc(100vw - 2rem))' }}>
          <DialogHeader>
            <DialogTitle>Invite an administrator</DialogTitle>
            <DialogDescription>
              They will be emailed a link to choose their own password. You never see or set it,
              and the link expires in 72 hours.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Full name</Label>
              <Input
                className="mt-2"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Grace Nkemtaji"
              />
            </div>
            <div>
              <Label>Email address</Label>
              <Input
                className="mt-2"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="name@example.com"
              />
            </div>
            {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
          </div>

          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={inviting}>Cancel</Button>
            </DialogClose>
            <Button
              onClick={invite}
              disabled={inviting || !form.name.trim() || !form.email.trim()}
            >
              {inviting ? 'Sending…' : 'Send Invitation'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <Dialog open={!!removing} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <DialogContent style={{ maxWidth: 'min(448px, calc(100vw - 2rem))' }}>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>
              They will be signed out and will not be able to sign in again. Everything they
              recorded stays exactly where it is, still showing their name — nothing is deleted.
              You can invite them back with the same email address at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={removeBusy} onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={removeBusy} onClick={remove}>
              {removeBusy ? 'Removing…' : 'Remove access'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
