'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';

/**
 * "Send receipt" — the WhatsApp confirmation for one payment.
 *
 * THE ADMIN IS APPROVING A FINANCIAL STATEMENT, not pressing a button. This is
 * the only message the school sends that quotes money, and its body invites the
 * parent to dispute it at the office — so the dialog shows the whole thing
 * before anything goes: who it reaches, on what number, and every figure exactly
 * as the message will word it. The figures come from the server's own preview,
 * not from anything this screen computed, so what is read here is what is sent.
 *
 * Inline styles: src/index.css is a frozen pre-compiled Tailwind build and a
 * utility not already in it renders as nothing.
 */

const NAVY = '#0f2345';
const GOLD = '#e6c482';
const RED = '#DC2626';
const MUTED = '#6b7280';

interface Preview {
  guardianName: string;
  amountPaid: string;
  dateReceived: string;
  studentName: string;
  receiptNumber: string;
  balance: string;
  schoolName: string;
}

interface Eligibility {
  ledgerEntryId: number;
  paymentId: string;
  studentName: string;
  guardianName: string;
  phone: string | null;
  storedPhone: string | null;
  receiptNumber: string | null;
  amount: number;
  state: string;
  status?: string | null;
  sentAt?: string | null;
  sentAmount?: number | null;
  sentBalance?: number | null;
  sentReceiptNumber?: string | null;
  errorMessage?: string | null;
  schoolName: string;
  configured: boolean;
  enabled: boolean;
  maxAgeDays: number;
  preview: Preview | null;
  balance: number | null;
  ageDays?: number;
}

/**
 * WHY A CONFIRMATION CANNOT BE SENT, in words a school secretary can act on.
 *
 * The last route we shipped flattened every failure into "could not be sent",
 * and diagnosing one cost a dig through the hosting provider's request log. The
 * server names each refusal; this turns the name into a sentence and keeps the
 * provider's own wording when it is more specific than anything written here.
 */
export function paymentConfirmationReason(
  reason: string | null | undefined,
  row?: Partial<Eligibility> | null,
  fallback?: string | null,
): string {
  switch (reason) {
    case 'already_sent': {
      const when = row?.sentAt
        ? new Date(row.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;
      return when
        ? `A receipt for this payment was already sent on ${when}.`
        : 'A receipt for this payment has already been sent.';
    }
    case 'not_a_payment':
      return 'This is a charge, not a payment — there is nothing to confirm.';
    case 'staff_payment':
      return 'This is a staff payroll entry, not a fee payment from a parent.';
    case 'no_receipt_number':
      return 'This payment has no receipt number, so there is nothing to quote.';
    case 'too_old':
      return row?.ageDays != null
        ? `This payment is ${row.ageDays} days old. Receipts are only sent within ${row.maxAgeDays ?? 7} days.`
        : 'This payment is too old to send a receipt for.';
    case 'no_consent':
      return 'This guardian has not agreed to WhatsApp messages.';
    case 'no_number':
      return row?.storedPhone
        ? `"${row.storedPhone}" is not a number this can send to — it needs its country code.`
        : 'No phone number is on file for this guardian.';
    case 'invalid_variable':
      // Genuinely worth surfacing: it means a name or the school's own record
      // has a blank or a line break in it, which the admin can go and fix.
      return fallback || 'One of the details in the message is blank or contains a line break.';
    case 'NOT_CONFIGURED':
      return 'WhatsApp is not set up on the server yet.';
    case 'FEATURE_DISABLED':
      return 'Payment receipts are not switched on yet.';
    case 'TIMEOUT':
      return 'WhatsApp did not answer in time. It may still have been sent — check before resending.';
    case 'NETWORK':
      return 'Could not reach WhatsApp. Try again shortly.';
    default:
      return fallback || 'The receipt could not be sent.';
  }
}

/** One label/value line in the statement the admin reads before approving. */
function Line({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', padding: '0.15rem 0' }}>
      <span style={{ color: MUTED }}>{label}</span>
      <span
        style={{
          color: NAVY,
          fontWeight: strong ? 600 : 400,
          textAlign: 'right',
          ...(mono ? { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.02em' } : {}),
        }}
      >
        {value}
      </span>
    </div>
  );
}

export function PaymentConfirmationDialog({
  open, onOpenChange, ledgerEntryId, onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The payment's own id — the code the API accepts. */
  ledgerEntryId: string | number | null;
  onSent?: () => void;
}) {
  const [data, setData] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    if (!ledgerEntryId) return;
    setLoading(true);
    setError(null);
    try {
      const res: any = await api.get(`/whatsapp/payment-confirmation/${encodeURIComponent(String(ledgerEntryId))}`);
      setData(res);
    } catch (e: any) {
      setData(null);
      setError(e?.message || 'Could not read this payment.');
    } finally {
      setLoading(false);
    }
  }, [ledgerEntryId]);

  useEffect(() => {
    if (!open) return;
    setSent(false);
    setError(null);
    load();
  }, [open, load]);

  const send = async () => {
    if (!ledgerEntryId || sending) return;
    setSending(true);
    setError(null);
    try {
      const res: any = await api.post('/whatsapp/payment-confirmation', { ledgerEntryId });
      if (res?.sent) {
        setSent(true);
        toast.success('Receipt sent');
        onSent?.();
      } else {
        // The server's own name for the refusal, turned into a sentence — never
        // a generic failure.
        setError(paymentConfirmationReason(res?.reason, { ...data, ...res }, res?.errorMessage));
      }
      await load();
    } catch (e: any) {
      // A 503 (feature off) and a 404 land here.
      setError(paymentConfirmationReason(e?.code, data, e?.message));
    } finally {
      setSending(false);
    }
  };

  const p = data?.preview ?? null;
  const canSend = data?.state === 'ready' && data?.configured && data?.enabled && !sent;
  const blocked = data && data.state !== 'ready'
    ? paymentConfirmationReason(data.state, data)
    : (data && !data.enabled ? paymentConfirmationReason('FEATURE_DISABLED')
      : (data && !data.configured ? paymentConfirmationReason('NOT_CONFIGURED') : null));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !sending) onOpenChange(false); }}>
      <DialogContent style={{ maxWidth: 520 }}>
        <DialogHeader style={{ flex: '0 0 auto' }}>
          <DialogTitle>{sent ? 'Receipt sent' : 'Send payment receipt'}</DialogTitle>
        </DialogHeader>

        <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto' }}>
          {loading ? (
            <p className="text-sm text-gray-500" style={{ padding: '0.75rem 0' }}>Loading…</p>
          ) : !data ? (
            <p className="text-sm" style={{ color: RED, padding: '0.5rem 0' }}>{error ?? 'Not available.'}</p>
          ) : (
            <>
              {/* WHO IT REACHES. The guardian's name beside the number AS IT
                  WILL BE DIALLED — not the stored text — because this is the
                  last chance to notice that a message about a family's money is
                  about to go to a stranger. */}
              <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, background: '#F9FAFB', padding: '0.75rem', fontSize: '0.8125rem' }}>
                <Line label="Guardian" value={data.guardianName || 'Not recorded'} strong />
                <Line label="Will be sent to" value={data.phone ?? (data.storedPhone ? `"${data.storedPhone}"` : '—')} mono strong />
              </div>

              {/* THE STATEMENT, exactly as the message words it. The admin is
                  approving these figures, so they are shown in the message's own
                  order and phrasing rather than reformatted. */}
              {p && (
                <div style={{ marginTop: '0.75rem', border: `1px solid ${GOLD}`, borderRadius: 8, padding: '0.75rem', fontSize: '0.8125rem' }}>
                  <p className="text-xs" style={{ color: MUTED, marginBottom: '0.4rem' }}>
                    The message will say:
                  </p>
                  <Line label="Payment of" value={p.amountPaid} strong />
                  <Line label="Received on" value={p.dateReceived} />
                  <Line label="For" value={p.studentName} />
                  <Line label="Receipt number" value={p.receiptNumber} mono strong />
                  <Line label="Outstanding balance" value={p.balance} strong />
                  <Line label="From" value={p.schoolName} />
                  <p className="text-xs" style={{ color: MUTED, marginTop: '0.5rem' }}>
                    It also invites them to contact the office if this does not match their own record,
                    so every figure above will be read carefully.
                  </p>
                </div>
              )}

              {/* What was ACTUALLY sent, when one already has been. Shown from
                  the snapshot rather than from the payment as it stands now:
                  the amount can have been edited since, and the difference is
                  exactly what somebody needs to see. */}
              {data.state === 'already_sent' && (
                <div style={{ marginTop: '0.75rem', border: '1px solid #E5E7EB', borderRadius: 8, padding: '0.75rem', fontSize: '0.8125rem' }}>
                  <p className="text-xs" style={{ color: MUTED, marginBottom: '0.4rem' }}>What the parent was told:</p>
                  {data.sentAmount != null && <Line label="Payment of" value={`${data.sentAmount.toLocaleString()} FCFA`} strong />}
                  {data.sentBalance != null && <Line label="Outstanding balance" value={`${data.sentBalance.toLocaleString()} FCFA`} />}
                  {data.sentReceiptNumber && <Line label="Receipt number" value={data.sentReceiptNumber} mono />}
                  {data.sentAmount != null && data.sentAmount !== data.amount && (
                    <p className="text-xs" style={{ color: RED, marginTop: '0.5rem' }}>
                      This payment now reads {data.amount.toLocaleString()} FCFA, which is not what was sent.
                      The parent is holding the figure above.
                    </p>
                  )}
                </div>
              )}

              {blocked && !sent && (
                <p className="text-sm" style={{ color: data.state === 'already_sent' ? MUTED : RED, marginTop: '0.75rem' }}>
                  {blocked}
                </p>
              )}
              {error && <p className="text-sm" style={{ color: RED, marginTop: '0.5rem' }}>{error}</p>}
            </>
          )}
        </div>

        <div style={{ flex: '0 0 auto', borderTop: '1px solid #e5e7eb', paddingTop: '0.75rem' }} className="flex justify-end gap-2">
          {sent ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
              <Button
                onClick={send}
                disabled={!canSend || sending}
                style={canSend ? { background: NAVY, color: GOLD, borderColor: NAVY } : undefined}
              >
                {sending ? 'Sending…' : 'Send receipt'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
