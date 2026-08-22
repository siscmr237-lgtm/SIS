'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { generateStudentAttendanceSheet } from '../utils/pdfGenerator';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { ThreePartDateInput } from './ThreePartDateInput';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Download } from 'lucide-react';

/**
 * One student's attendance, on their own detail page.
 *
 * Read-only by design: a register is taken for a class on a day, so marking
 * belongs on the class screen where every student of that day is in front of
 * you. Here the question is "how has this child been attending", which is a
 * different one.
 *
 * The per-term consistency verdict comes from GET /attendance/consistency —
 * the same endpoint the report card will use — rather than being recomputed
 * here, so the two can never disagree about whether a student is Consistent.
 */

const TERMS = ['Term 1', 'Term 2', 'Term 3'];

interface Row { date: string; status: string | null; present: boolean | null }

export function StudentAttendancePanel({
  studentCode,
  studentName,
  className,
}: {
  studentCode: string;
  studentName: string;
  className?: string | null;
}) {
  const [term, setTerm] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<{
    from: string; to: string; academicYear: string;
    present: number; recorded: number; percentage: number | null; label: string; consistent: boolean | null;
  } | null>(null);
  const [terms, setTerms] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only the newest response may land — the filters change faster than a slow
  // request returns, and a stale one would describe a period no longer selected.
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    try {
      // The register is read through the class sheet endpoint scoped to this
      // student's own row, so the cells here and on the class screen come from
      // one code path and cannot disagree.
      const qs = new URLSearchParams({ classLevel: levelOf(className ?? '') });
      if (term) qs.set('term', term);
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);

      const [sheet, consistency] = await Promise.all([
        className ? api.get(`/attendance/sheet?${qs.toString()}`) : Promise.resolve(null),
        api.get(`/attendance/consistency?studentId=${encodeURIComponent(studentCode)}`),
      ]);
      if (seq !== seqRef.current) return;

      const mine = (sheet?.students ?? []).find((s: any) => s.studentId === studentCode) ?? null;
      setRows(mine?.cells ?? []);
      setSummary(
        mine
          ? {
              from: sheet.from, to: sheet.to, academicYear: sheet.academicYear,
              present: mine.present, recorded: mine.recorded,
              percentage: mine.percentage, label: mine.label, consistent: mine.consistent,
            }
          : null,
      );
      setTerms(consistency?.terms ?? []);
    } catch (e: any) {
      if (seq !== seqRef.current) return;
      setError(e?.message || 'Could not load attendance.');
      setRows([]);
      setSummary(null);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [studentCode, className, term, from, to]);

  useEffect(() => { load(); }, [load]);

  const download = () => {
    if (!summary) return;
    generateStudentAttendanceSheet({
      studentName,
      studentId: studentCode,
      className,
      academicYear: summary.academicYear,
      term: term || null,
      from: summary.from,
      to: summary.to,
      rows,
      present: summary.present,
      recorded: summary.recorded,
      percentage: summary.percentage,
      label: summary.label,
    });
  };

  return (
    <div>
      <Card className="p-6 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <Label>Term</Label>
            <Select value={term || '__all'} onValueChange={(v) => setTerm(v === '__all' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Whole year" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Whole year to date</SelectItem>
                {TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>From</Label>
            <ThreePartDateInput value={from} onChange={(v) => setFrom(v ?? '')} aria-label="From date" />
          </div>
          <div>
            <Label>To</Label>
            <ThreePartDateInput value={to} onChange={(v) => setTo(v ?? '')} disabled={!from} aria-label="To date" />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: '0.75rem' }}>
          <Button variant="outline" onClick={download} disabled={!summary || loading} className="flex items-center gap-2">
            <Download size={16} />
            Download
          </Button>
          {(from || to || term) && (
            <Button variant="outline" onClick={() => { setFrom(''); setTo(''); setTerm(''); }}>
              Clear
            </Button>
          )}
        </div>

        {error && <p className="text-sm" style={{ color: '#B91C1C', marginTop: '0.5rem' }}>{error}</p>}
      </Card>

      {/* Per-term standing, from the same endpoint the report card reads. */}
      <Card className="p-6 mb-4">
        <h3 className="text-base font-medium mb-3">By term</h3>
        {terms.length === 0 ? (
          <p className="text-sm text-gray-500">No terms to show.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {terms.map((t: any) => (
              <div key={t.term} className="flex items-center justify-between text-sm">
                <span>{t.term}</span>
                <span>
                  {t.percentage == null ? (
                    <span className="text-gray-400">No records</span>
                  ) : (
                    <>
                      {t.present}/{t.recorded}{' '}
                      <span style={{ color: t.consistent ? '#05603D' : '#E0552E', fontWeight: 500 }}>
                        {t.percentage}% · {t.label}
                      </span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        {loading ? (
          <p className="p-6 text-gray-500">Loading attendance...</p>
        ) : !summary ? (
          <p className="p-6 text-gray-500">No attendance for the selected period.</p>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ padding: '0.75rem 1rem 0' }}>
              <p className="text-sm text-gray-500">
                {summary.from === summary.to ? summary.from : `${summary.from} to ${summary.to}`}
                {summary.percentage == null
                  ? ' · no register taken'
                  : ` · present ${summary.present} of ${summary.recorded} recorded days (${summary.percentage}%)`}
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {/* Days nobody took the register are omitted rather than shown
                    blank — a blank row reads as an absence. */}
                {rows.filter((r) => r.present !== null).length === 0 ? (
                  <tr><td className="px-4 py-3 text-gray-500" colSpan={2}>No register taken in this period.</td></tr>
                ) : (
                  rows.filter((r) => r.present !== null).map((r) => (
                    <tr key={r.date} className="border-b">
                      <td className="px-4 py-3">{r.date}</td>
                      <td className="px-4 py-3" style={{ color: r.present ? '#05603D' : '#E0552E', fontWeight: 500 }}>
                        {r.present ? 'Present' : 'Absent'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function levelOf(className: string): string {
  const name = String(className || '').trim();
  const m = /^(.+) ([A-Z])$/.exec(name);
  return m ? m[1] : name;
}
