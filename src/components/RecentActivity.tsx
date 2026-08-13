'use client';

import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { useCachedResource } from '../lib/SisCache';
import { Card } from './ui/card';

/**
 * The last five times money actually MOVED.
 *
 * Three sources and only three: a student paid the school, the school paid a
 * supplier, the school paid a staff member. Charges are deliberately absent —
 * money becoming owed is not money changing hands, and a feed carrying both
 * would put "45,000 Tuition" on one row meaning received and on the next
 * meaning now owed, with nothing to separate them.
 *
 * Which is also why nothing here is a bare figure. Three amounts in the same
 * colour with no icon is precisely the failure this replaces: the reader cannot
 * tell income from outgoing without reading every line. Each kind gets its own
 * icon, its own colour and an explicit +/− sign, so direction is legible before
 * anything is read.
 *
 * Fetched on its own, never folded into GET /dashboard. If this query is slow or
 * fails, the metrics above it still render — this card carries its own loading,
 * error and empty states and nothing else on the screen waits for it.
 *
 * Money is formatted the way the rest of this app formats it — `n.toLocaleString()`
 * followed by FCFA. There is no shared helper to import; that pattern IS the
 * convention here (Dashboard, ExpensesManagement, FinanceOverview all do it
 * inline), so it is matched rather than replaced with a new one.
 *
 * Inline styles: src/index.css is a pre-compiled Tailwind artifact, so a utility
 * class that is not already in it renders as nothing at all, silently.
 */

type ActivityKind = 'fee-payment' | 'expense' | 'payroll';

interface ActivityRow {
  id: string;
  kind: ActivityKind;
  direction: 'in' | 'out';
  title: string;
  subtitle: string;
  context: string | null;
  amount: number;
  bonus?: number | null;
  date: string;
  ref: { type: 'student' | 'staff' | 'expense'; code: string | null };
}

const MUTED = '#6B7280';
const IN = '#05603d';      // Forest — money received
const OUT = '#e0552e';     // Burnt Orange — money paid out

/**
 * How each kind reads. Payroll and expenses are both outgoing, so they share a
 * colour and are told apart by icon and label — colour alone would say they are
 * the same thing.
 */
const KIND: Record<ActivityKind, { label: string; icon: typeof Wallet; tint: string; bg: string }> = {
  'fee-payment': { label: 'Fee payment', icon: ArrowDownLeft, tint: IN, bg: '#ECFDF5' },
  expense: { label: 'Expense', icon: ArrowUpRight, tint: OUT, bg: '#FDF3EF' },
  payroll: { label: 'Payroll', icon: Wallet, tint: OUT, bg: '#FDF3EF' },
};

/** "12 Aug 2026" — unambiguous, and short enough not to wrap the row. */
function formatDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Props {
  /** Where a row goes when clicked. Absent means the rows are not clickable. */
  onOpen?: (ref: ActivityRow['ref']) => void;
}

export function RecentActivity({ onOpen }: Props) {
  const { data, loading, error } = useCachedResource<{ activity: ActivityRow[] }>(
    null,
    () => api.get('/dashboard/recent-activity'),
    { policy: 'fresh' },
  );

  const rows = data?.activity ?? [];

  return (
    <Card className="p-6">
      <h2 className="text-xl mb-4">Recent Activity</h2>

      {loading ? (
        <p className="text-sm" style={{ color: MUTED }}>Loading recent activity...</p>
      ) : error ? (
        // Stated rather than shown as an empty list: "no activity" and "we could
        // not load the activity" are different facts and must not look alike.
        <p className="text-sm" style={{ color: MUTED }}>Could not load recent activity.</p>
      ) : rows.length === 0 ? (
        <div>
          <p className="text-sm" style={{ color: MUTED }}>No money has moved yet.</p>
          <p className="text-xs" style={{ color: MUTED, marginTop: 4 }}>
            Fee payments, expenses and payroll will appear here as they are recorded.
          </p>
        </div>
      ) : (
        <div>
          {rows.map((row, i) => {
            const kind = KIND[row.kind] ?? KIND.expense;
            const Icon = kind.icon;
            const clickable = Boolean(onOpen && row.ref.code);
            return (
              <div
                key={row.id}
                {...(clickable
                  ? {
                    role: 'button' as const,
                    tabIndex: 0,
                    onClick: () => onOpen?.(row.ref),
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpen?.(row.ref);
                      }
                    },
                  }
                  : {})}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.65rem 0.5rem',
                  borderTop: i === 0 ? 'none' : '1px solid #F3F4F6',
                  cursor: clickable ? 'pointer' : 'default',
                  borderRadius: 6,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0, width: 32, height: 32, borderRadius: '50%',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: kind.bg, color: kind.tint,
                  }}
                >
                  <Icon size={16} />
                </span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="text-sm" style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.title}
                  </p>
                  <p className="text-xs" style={{ color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {/* The kind is named in words as well as drawn, so the row
                        does not depend on colour alone to be understood. */}
                    {kind.label} · {row.subtitle}
                    {row.context ? ` · ${row.context}` : ''}
                  </p>
                </div>

                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <p className="text-sm" style={{ color: kind.tint, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {row.direction === 'in' ? '+' : '−'}{row.amount.toLocaleString()} FCFA
                  </p>
                  <p className="text-xs" style={{ color: MUTED, whiteSpace: 'nowrap' }}>
                    {formatDate(row.date)}
                    {row.bonus ? ` · incl. ${row.bonus.toLocaleString()} bonus` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
