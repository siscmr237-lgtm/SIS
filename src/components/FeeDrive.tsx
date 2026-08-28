'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Download, Filter } from 'lucide-react';
import { api } from '../lib/api';
import { formatTermLabel } from '../utils/academicTerm';
import { generateFeeDriveNotices } from '../utils/pdfGenerator';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { TableLoader } from './ContentLoader';

/**
 * THE FEE DRIVE: every student who still owes money, and a stack of letters to
 * their parents.
 *
 * WHY THIS SCREEN IS WRITTEN IN INLINE STYLES. src/index.css is a frozen,
 * pre-compiled Tailwind build — a class that is not already in it produces
 * nothing at all, silently. So new markup here either reuses a class some
 * existing screen already ships (safe, because the build contains it) or styles
 * itself inline. The two toggles below are the clearest case: this app has a
 * ui/switch.tsx and a ui/checkbox.tsx, and neither is used anywhere, so their
 * `data-[state=checked]:…` variants were never compiled — grep the stylesheet
 * and there are zero of them. A Radix Switch here would have looked EXACTLY the
 * same on as off, which on a filter is worse than no control at all.
 *
 * The one thing inline styles cannot express is the reveal animation (it needs a
 * descendant selector and a delayed visibility transition), so that lives in a
 * <style> block keyed to this screen's own data attributes — the same technique,
 * and for the same reason, as the filter panel on the Finance page.
 */

interface FeeDriveRow {
  id: string;
  firstName: string;
  lastName: string;
  class: string | null;
  classLevel?: string | null;
  totalCharged: number;
  totalPaid: number;
  balance: number;
  firstInstallmentMet: boolean | null;
  paymentStatus: string | null;
}

interface FeeDriveResponse {
  academicYear: string;
  term: string;
  school: { name: string; motto: string | null; logo: string | null; abbreviation: string | null };
  proprietor: { signature: string; gender: string | null };
  totalOwing: number;
  count: number;
  students: FeeDriveRow[];
}

interface FeeDriveProps {
  /** Back to the Finance page. */
  onBack: () => void;
  /** Opens a student's profile, by their code. */
  onViewStudent: (studentCode: string) => void;
}

const money = (n: number) => `${n.toLocaleString()} FCFA`;

/**
 * A toggle, styled entirely inline for the reason given at the top of this file.
 *
 * A real <button role="switch"> rather than a styled div: it is reachable by
 * keyboard, announces its own state through aria-checked, and needs no extra
 * handler to respond to the space bar.
 */
function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem' }}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        data-fd-toggle=""
        style={{
          position: 'relative',
          flexShrink: 0,
          width: 38,
          height: 22,
          marginTop: 2,
          borderRadius: 9999,
          border: '1px solid transparent',
          // The brand navy for on, a plain grey for off. Stated as hex rather
          // than a token because there is no compiled utility to lean on.
          backgroundColor: checked ? '#0f2345' : '#D1D5DB',
          cursor: 'pointer',
          transition: 'background-color 160ms ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 16,
            height: 16,
            borderRadius: 9999,
            backgroundColor: '#FFFFFF',
            transform: checked ? 'translateX(16px)' : 'translateX(0)',
            transition: 'transform 160ms ease',
            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
          }}
        />
      </button>
      <span style={{ minWidth: 0 }}>
        <span
          onClick={() => onChange(!checked)}
          style={{ display: 'block', fontSize: '0.875rem', color: '#111827', cursor: 'pointer', userSelect: 'none' }}
        >
          {label}
        </span>
        <span style={{ display: 'block', fontSize: '0.75rem', color: '#6B7280', marginTop: 2 }}>{hint}</span>
      </span>
    </div>
  );
}

export function FeeDrive({ onBack, onViewStudent }: FeeDriveProps) {
  // Collapsed by default, as specified.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [panelHeight, setPanelHeight] = useState(0);
  const panelInnerRef = useRef<HTMLDivElement | null>(null);

  const [firstInstalment, setFirstInstalment] = useState(false);
  const [noPayment, setNoPayment] = useState(false);
  // Held as STRINGS, not numbers. An empty box has to mean "no bound", and a
  // number state cannot hold "empty" without conscripting 0 or NaN to stand for
  // it — 0 is a legitimate bound and NaN would have to be special-cased at every
  // read anyway. The string is parsed once, where the query is built.
  const [minOwing, setMinOwing] = useState('');
  const [maxOwing, setMaxOwing] = useState('');

  const [data, setData] = useState<FeeDriveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Measured, because the stylesheet cannot know how tall this panel is at this
  // width and `height: auto` will not animate.
  useEffect(() => {
    const el = panelInnerRef.current;
    if (!el) return;
    const measure = () => setPanelHeight(Math.ceil(el.getBoundingClientRect().height));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * The query string, and the effect's dependency in one value.
   *
   * Built as a string so the effect below re-runs when the FILTERS change and
   * not merely when this component re-renders — a fresh object identity every
   * render would refetch on every keystroke elsewhere on the page.
   */
  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (firstInstalment) params.set('firstInstalment', 'true');
    if (noPayment) params.set('noPayment', 'true');
    // Sent only when they hold something. The server treats an absent bound as
    // open, so sending an empty one would be asking it to parse '' on every
    // request for no reason.
    if (minOwing.trim()) params.set('minOwing', minOwing.trim());
    if (maxOwing.trim()) params.set('maxOwing', maxOwing.trim());
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }, [firstInstalment, noPayment, minOwing, maxOwing]);

  useEffect(() => {
    let alive = true;
    // A 300ms settle on the amount boxes. Without it every digit of "150000" is
    // its own request, and the answers can land out of order.
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      api
        .get(`/ledger/fee-drive${queryString}`)
        .then((res: FeeDriveResponse) => {
          if (!alive) return;
          setData(res);
          setLoading(false);
        })
        .catch((e: any) => {
          if (!alive) return;
          setError(e?.message || 'Could not load the fee drive.');
          setLoading(false);
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [queryString]);

  const rows = data?.students ?? [];

  const handleDownload = async () => {
    if (!data || !rows.length || downloading) return;
    setDownloading(true);
    try {
      await generateFeeDriveNotices(
        {
          school: { name: data.school.name, motto: data.school.motto, logo: data.school.logo },
          academicYear: data.academicYear,
          term: data.term,
          proprietorSignature: data.proprietor.signature,
        },
        // Exactly the rows on screen, in the order the server sorted them —
        // class then name — so the stack of paper matches the table.
        rows.map((r) => ({
          firstName: r.firstName,
          lastName: r.lastName,
          class: r.class,
          balance: r.balance,
        })),
      );
    } catch (e: any) {
      setError(e?.message || 'The letters could not be generated.');
    } finally {
      setDownloading(false);
    }
  };

  const activeFilterCount = [firstInstalment, noPayment, !!minOwing.trim(), !!maxOwing.trim()].filter(Boolean).length;

  return (
    <div className="p-4 md:p-8">
      {/* Scoped to this screen's own attributes so it cannot collide with the
          Finance page's panel, and so this page styles itself whether or not
          that one is mounted. */}
      <style>{`
        [data-fd-panel] {
          overflow: hidden;
          opacity: 0;
          visibility: hidden;
          transition:
            height 300ms cubic-bezier(0.4, 0, 0.2, 1),
            opacity 160ms ease,
            visibility 0s linear 300ms;
        }
        [data-fd-panel] > div {
          transform: translateY(-6px);
          transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        [data-fd-panel][data-open="true"] {
          opacity: 1;
          visibility: visible;
          transition:
            height 300ms cubic-bezier(0.4, 0, 0.2, 1),
            opacity 220ms ease 60ms,
            visibility 0s;
        }
        [data-fd-panel][data-open="true"] > div { transform: none; }
        [data-fd-filters-toggle] { background-color: #FFFFFF; cursor: pointer; }
        [data-fd-filters-toggle]:hover { background-color: #F9FAFB; }
        [data-fd-filters-toggle][data-open="true"] { background-color: #F3F4F6; }
        [data-fd-filters-toggle]:focus-visible,
        [data-fd-toggle]:focus-visible {
          outline: 2px solid rgba(15, 35, 69, 0.45);
          outline-offset: 2px;
        }
        [data-fd-chevron] { transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1); }
        [data-fd-filters-toggle][data-open="true"] [data-fd-chevron] { transform: rotate(180deg); }
        /* One line per row, and the table scrolls inside its own box rather
           than widening the page. */
        [data-fd-table] th,
        [data-fd-table] td { white-space: nowrap; }
        [data-fd-row]:hover { background-color: #F9FAFB; }
        [data-fd-row] { cursor: pointer; }
        [data-fd-row]:focus-visible {
          outline: 2px solid rgba(15, 35, 69, 0.45);
          outline-offset: -2px;
        }
        @media (prefers-reduced-motion: reduce) {
          [data-fd-panel],
          [data-fd-panel] > div,
          [data-fd-chevron],
          [data-fd-toggle],
          [data-fd-toggle] > span { transition: none; }
        }
      `}</style>

      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-6"
      >
        <ArrowLeft size={18} />
        Back to Finance
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div className="flex-1">
          <h1 className="text-3xl mb-2">Fee Drive</h1>
          <p className="text-gray-600">
            {/* The period is stated here because it is what the letters will
                carry, read from the school's live settings rather than assumed. */}
            {data
              ? `Students with an outstanding balance — ${data.academicYear}, ${formatTermLabel(data.term)}`
              : 'Students with an outstanding balance'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownload} disabled={!rows.length || downloading || loading}>
            <Download size={20} className="mr-2" />
            {downloading ? 'Preparing…' : 'Download Letters'}
          </Button>
        </div>
      </div>

      <Card className="mb-8">
        <div className="p-4 border-b" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <h2 className="text-base font-medium">Outstanding Balances</h2>
            {/* The two figures a fee drive is actually about. Both are over the
                FILTERED set, which is what the letters will cover. */}
            {data && !loading && (
              <span style={{ fontSize: '0.875rem', color: '#6B7280' }}>
                {data.count} {data.count === 1 ? 'student' : 'students'} · {money(data.totalOwing)} owed
              </span>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              aria-controls="fee-drive-filters"
              data-fd-filters-toggle=""
              data-open={filtersOpen ? 'true' : 'false'}
              className="inline-flex items-center gap-2 h-9 px-3 border rounded-lg text-sm font-medium text-gray-600 transition-colors"
            >
              <Filter size={16} className="text-gray-400" />
              Filters
              {activeFilterCount > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 18,
                    height: 18,
                    padding: '0 5px',
                    borderRadius: 9999,
                    backgroundColor: '#0f2345',
                    color: '#FFFFFF',
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                  }}
                >
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown size={16} className="text-gray-400" data-fd-chevron="" />
            </button>

            <div
              id="fee-drive-filters"
              data-fd-panel=""
              data-open={filtersOpen ? 'true' : 'false'}
              style={{ height: filtersOpen ? panelHeight : 0 }}
            >
              <div ref={panelInnerRef} style={{ paddingTop: '0.75rem' }}>
                <div className="border rounded-lg p-3">
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                      gap: '1rem',
                      minWidth: 0,
                    }}
                  >
                    <Toggle
                      checked={firstInstalment}
                      onChange={setFirstInstalment}
                      label="First instalment not met"
                      hint="Only students who still owe on their first instalment."
                    />

                    <Toggle
                      checked={noPayment}
                      onChange={setNoPayment}
                      label="No payment at all"
                      hint="Only students who have paid absolutely nothing."
                    />

                    {/* Amounts, NOT dates — two plain number boxes. */}
                    <div>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#6B7280', marginBottom: '0.25rem' }}>
                        Balance owed (FCFA)
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1000}
                          value={minOwing}
                          onChange={(e) => setMinOwing(e.target.value)}
                          placeholder="From"
                          aria-label="Balance owed from"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            height: 36,
                            padding: '0 0.75rem',
                            borderRadius: 9999,
                            border: '1px solid #E5E7EB',
                            backgroundColor: '#FFFFFF',
                            fontSize: '0.875rem',
                            color: '#111827',
                            outline: 'none',
                          }}
                        />
                        <span style={{ fontSize: '0.875rem', color: '#9CA3AF' }}>to</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          step={1000}
                          value={maxOwing}
                          onChange={(e) => setMaxOwing(e.target.value)}
                          placeholder="To"
                          aria-label="Balance owed to"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            height: 36,
                            padding: '0 0.75rem',
                            borderRadius: 9999,
                            border: '1px solid #E5E7EB',
                            backgroundColor: '#FFFFFF',
                            fontSize: '0.875rem',
                            color: '#111827',
                            outline: 'none',
                          }}
                        />
                      </div>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#6B7280', marginTop: 4 }}>
                        Leave either side blank to leave that end open.
                      </span>
                    </div>
                  </div>

                  {activeFilterCount > 0 && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setFirstInstalment(false);
                          setNoPayment(false);
                          setMinOwing('');
                          setMaxOwing('');
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: '0.8125rem',
                          color: '#0f2345',
                          textDecoration: 'underline',
                          cursor: 'pointer',
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p style={{ padding: '1.5rem', color: '#B91C1C', fontSize: '0.875rem' }}>{error}</p>
        )}

        {!loading && rows.length === 0 && !error ? (
          <p className="p-6 text-gray-500">
            {activeFilterCount > 0
              ? 'No students match these filters.'
              : 'No students have an outstanding balance.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto', minWidth: 0 }}>
            <table className="w-full text-sm" data-fd-table="">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Student Name</th>
                  <th className="px-4 py-3 font-medium">Class</th>
                  <th className="px-4 py-3 font-medium" style={{ textAlign: 'right' }}>Total Charged</th>
                  <th className="px-4 py-3 font-medium" style={{ textAlign: 'right' }}>Total Paid</th>
                  <th className="px-4 py-3 font-medium" style={{ textAlign: 'right' }}>Balance Owed</th>
                </tr>
              </thead>
              <tbody>
                {loading && <TableLoader colSpan={5} />}
                {!loading && rows.map((r) => (
                  // The whole row is the link, since every cell on it is about
                  // the same student. tabIndex + the Enter/Space handler keep it
                  // reachable without a keyboard trap, which a bare onClick on a
                  // <tr> would not.
                  <tr
                    key={r.id}
                    data-fd-row=""
                    tabIndex={0}
                    role="link"
                    onClick={() => onViewStudent(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onViewStudent(r.id);
                      }
                    }}
                    className="border-b last:border-0"
                  >
                    <td className="px-4 py-3">
                      <span style={{ color: '#1D4ED8' }}>{`${r.firstName} ${r.lastName}`.trim()}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.class ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600" style={{ textAlign: 'right' }}>
                      {money(r.totalCharged)}
                    </td>
                    <td className="px-4 py-3 text-gray-600" style={{ textAlign: 'right' }}>
                      {money(r.totalPaid)}
                    </td>
                    {/* The figure the letter will quote, so it carries the same
                        weight here as it does there. */}
                    <td className="px-4 py-3" style={{ textAlign: 'right', color: '#DC2626', fontWeight: 500 }}>
                      {money(r.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
