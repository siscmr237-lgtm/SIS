"use client";

import { DollarSign, TrendingUp, UserCheck, Users } from "lucide-react";
import { useAcademicYear } from '@/lib/academicYear';
import { AcademicYearNotices } from './AcademicYearNotices';
import { RecentActivity } from './RecentActivity';
import { SetupChecklist } from './SetupChecklist';
import { SetupWizard } from './SetupWizard';
import { useRouter } from 'next/navigation';
import { NavigationPage } from '../App';
import { useEffect, useState } from "react";
import { api, BASE_URL } from "../../src/lib/api";
import { useCachedResource, useSisCache } from "../../src/lib/SisCache";
import { formatTermLabel, resolveSchoolTerm } from "../../src/utils/academicTerm";
import { computeSchoolAbbreviation } from "../../src/utils/schoolAbbreviation";
import { Card } from "./ui/card";
import { statValueFontSize } from "../utils/statFigure";

// onNavigate is optional so the existing `<Dashboard />` call sites keep
// working; without it the setup card still lists what is outstanding, it just
// has nowhere to send you.
export function Dashboard({ onNavigate }: { onNavigate?: (page: NavigationPage) => void }) {
  // Reading the status IS the app-load half of the rollover: the endpoint runs
  // the same advanceYearIfDue() the cron runs, so a missed cron self-corrects here.
  const { status: yearStatus, advance: advanceYear, acknowledge: ackYear } = useAcademicYear();
  const cache = useSisCache();
  // /dashboard carries feesCollected, outstandingFees and financialSummary, so
  // it is fetched fresh on every visit and never cached — the loading state on
  // this screen is the price of never showing a figure that a payment or an
  // expense recorded a moment ago has already changed.
  const { data: dashboardData, loading } = useCachedResource<any>(
    null,
    () => api.get("/dashboard"),
    { policy: 'fresh' },
  );
  const [schoolSettings, setSchoolSettings] = useState({
    name: "School",
    abbreviation: "",
    logo: "https://images.unsplash.com/photo-1599305445671-ac291c95aaa9?w=200&h=200&fit=crop",
    academicYear: "2024/2025",
    currentTerm: "Term 1",
    autoTermEnabled: true,
  });
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  /** The wizard step the checklist has asked for, if any. Cleared on close. */
  const [wizardStep, setWizardStep] = useState<string | null>(null);
  const router = useRouter();

  /**
   * Where a Recent Activity row goes.
   *
   * Two of the three land on the profile's Finance tab, which is where that
   * transaction is actually listed — ?tab= is the app's existing deep-link
   * mechanism (StudentProfile/StaffProfile both read it, and the Students list
   * already uses it for the same reason). It opens the RECORD'S OWNER, not the
   * individual ledger row: no screen in this app addresses a single entry, so
   * the Finance tab is as close as the UI can actually get.
   *
   * Expenses only go as far as the list. ExpensesManagement reads no search
   * params and has no per-expense route, so there is nothing to deep-link TO —
   * inventing a URL here would just 404 or be silently ignored.
   */
  const openActivity = (ref: { type: string; code: string | null }) => {
    if (!ref.code) return;
    if (ref.type === 'student') router.push(`/students/${encodeURIComponent(ref.code)}?tab=finance`);
    else if (ref.type === 'staff') router.push(`/staff/${encodeURIComponent(ref.code)}?tab=finance`);
    else router.push('/expenses');
  };
  const resolved = resolveSchoolTerm(schoolSettings);
  // The school object below comes from the localStorage copy written at LOGIN, so
  // its academicYear is whatever it was then. Advancing the year would leave the
  // most prominent place showing it stale until the next sign-in — so the live
  // status wins whenever we have it, and the cached value is only a fallback for
  // the moment before it arrives.
  const academicYear = yearStatus?.activeYear ?? resolved.academicYear;
  const term = resolved.term;

  // The school object here comes from the cached localStorage copy written at
  // login, which for a session predating the abbreviation column simply has no
  // abbreviation field. Falling back to the raw name overflows the header for
  // long names, so derive one on the fly as a last resort — this holds no
  // matter which code path created the school or how stale the cache is.
  const headerName =
    schoolSettings.abbreviation ||
    computeSchoolAbbreviation(schoolSettings.name) ||
    schoolSettings.name;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const userStr = window.localStorage.getItem("user");
    if (!userStr) return;
    try {
      const user = JSON.parse(userStr);
      if (!user?.School?.length) return;
      const school = user.School[0];
      if (!school) return;
      setSchoolSettings(school);
      const logo = school?.logo;
      if (!logo) return;
      // Sidebar resolves this on app load; read from cache instead of re-fetching
      const cached = cache.get<string>('logo-url');
      if (cached) { setLogoSrc(cached); return; }
      // Fallback: fetch and cache (handles rare case where Dashboard mounts before Sidebar)
      if (logo.startsWith('schools/')) {
        const token = window.localStorage.getItem('auth_token');
        fetch(`${BASE_URL}/upload/signed-url?path=${encodeURIComponent(logo)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.url) { cache.set('logo-url', data.url); setLogoSrc(data.url); }
          })
          .catch(() => {});
      } else {
        cache.set('logo-url', logo);
        setLogoSrc(logo);
      }
    } catch {}
  }, []);
  const stats = [
    {
      title: "Total Students",
      value: dashboardData?.totalStudents ?? 0,
      icon: Users,
      color: "bg-blue-500",
    },
    {
      title: "Total Staff",
      value: dashboardData?.totalStaff ?? 0,
      icon: UserCheck,
      color: "bg-green-500",
    },
    {
      title: "Fees Collected",
      // Unit kept OUT of the value. Glued on, "FCFA" is just three more
      // characters the number has to find room for, and the only place a line
      // can safely break is between them — see the card body below.
      value: (dashboardData?.feesCollected ?? 0).toLocaleString(),
      unit: "FCFA",
      icon: DollarSign,
      color: "bg-purple-500",
    },
    {
      title: "Outstanding Fees",
      value: (dashboardData?.outstandingFees ?? 0).toLocaleString(),
      unit: "FCFA",
      icon: TrendingUp,
      color: "bg-orange-500",
    },
  ];

  if (loading) {
    return <div className="p-4 md:p-8">Loading dashboard...</div>;
  }

  return (
    <div className="p-4 md:p-8">
      {/* School Header */}
      {/* overflow-hidden + min-w-0 are what actually keep this inside the
          viewport on narrow screens: a flex child defaults to min-width:auto,
          which refuses to shrink below its content, so without min-w-0 the
          `truncate` below can never engage and a long abbreviation pushes the
          card past the right edge. shrink-0 stops the logo being squashed, and
          flex-wrap lets the year/term line drop to a second line instead of
          overflowing. None of these change desktop, where there's room to spare. */}
      <AcademicYearNotices status={yearStatus} onAdvance={advanceYear} onAcknowledge={ackYear} />

      {/* A banner, not a hero panel. The logo is 48px rather than 80, the two
          text lines together come to 44px so the block never sets the height
          (the logo does), and the padding is 10/14 rather than 24 all round so
          the card hugs its contents. Roughly 70px tall against the 130 it was,
          and the bottom margin halves too — that space is what the four metric
          cards below need in order to be on screen at 390x844. */}
      <Card
        className="bg-gradient-to-r from-blue-50 to-purple-50 overflow-hidden"
        style={{ padding: '0.625rem 0.875rem', marginBottom: '1rem' }}
      >
        <div className="flex items-center min-w-0" style={{ gap: '0.75rem' }}>
          {logoSrc && (
            <img
              src={logoSrc}
              alt="School Logo"
              className="object-cover rounded-lg border-2 border-white shadow-lg shrink-0"
              style={{ width: 48, height: 48 }}
            />
          )}
          <div className="flex-1 min-w-0">
            {/* Explicit line-heights, because the whole point is that these two
                lines add up to less than the logo beside them: 26 + 18 = 44. */}
            <h1
              className="truncate"
              style={{ fontSize: '1.125rem', lineHeight: '1.4rem', margin: 0, fontWeight: 500 }}
            >
              {headerName}
            </h1>
            <div
              className="flex flex-wrap text-gray-600 min-w-0"
              style={{ gap: '0.5rem', fontSize: '0.75rem', lineHeight: '1.125rem', marginTop: 2 }}
            >
              <span className="truncate min-w-0">Academic Year: {academicYear}</span>
              <span className="shrink-0">•</span>
              <span className="truncate min-w-0">{formatTermLabel(term)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* The wizard runs once, immediately after KYC; the checklist below is
          what catches whatever was skipped, from then on. Both read the same
          live data, so neither can claim something the other denies.

          The dashboard owns the link between them: the checklist names a step,
          this holds it, and the wizard opens there. Held here rather than inside
          the checklist because the wizard is the checklist's sibling, not its
          child, and neither should be reaching into the other. */}
      <SetupWizard
        onNavigate={onNavigate}
        openAtStep={wizardStep}
        onCloseRequested={() => setWizardStep(null)}
      />

      {/* Sits above the metrics while there is setup left, and removes itself
          entirely once there is not. It blocks nothing either way. */}
      <SetupChecklist onNavigate={onNavigate} onOpenWizardStep={setWizardStep} />

      {/* Third and last place the space for the metric cards comes from, after
          the school card and the checklist. A 24px heading over a 16px subtitle
          with a 32px margin under it was 96px of chrome introducing four cards
          that already say what they are. */}
      <div style={{ marginBottom: '0.875rem' }}>
        <h2 style={{ fontSize: '1.125rem', lineHeight: '1.5rem', margin: 0, fontWeight: 500 }}>
          Dashboard Overview
        </h2>
        <p className="text-gray-600" style={{ fontSize: '0.8125rem', lineHeight: '1.125rem', marginTop: 2 }}>
          Key metrics and recent activities
        </p>
      </div>

      {/* Two per row at every width — Students | Staff, then Collected |
          Outstanding. The pairs are the point: each row is one comparison, and
          the old 4-across collapsed to a single column on phones, which turned
          four cards into four full-width slabs and pushed everything below them
          off the screen.

          The icon moved beside the text instead of sitting on its own line
          above it. That one change is most of the height saving; the rest is
          padding, down from 24px to 14/16. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} style={{ padding: '0.875rem 1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  className={`${stat.color} text-white`}
                  style={{
                    flexShrink: 0, width: 36, height: 36, borderRadius: 8,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Icon size={18} />
                </div>
                {/* minWidth 0 is what keeps a long figure inside its column
                    instead of widening it: without it a flex item refuses to
                    shrink below its content and the pair stops being equal. */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 className="text-gray-600 text-xs" style={{ marginBottom: 1 }}>{stat.title}</h3>
                  <p style={{ lineHeight: 1.15, margin: 0, overflow: 'hidden' }}>
                    {/* nowrap: a money figure must never break mid-number. Split
                        across lines, "10,939,0 / 00" is not a smaller version of
                        the truth, it is unreadable. The size steps down instead. */}
                    <span
                      style={{
                        fontSize: statValueFontSize(String(stat.value)),
                        whiteSpace: 'nowrap',
                        display: 'inline-block',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        verticalAlign: 'bottom',
                      }}
                      title={stat.unit ? `${stat.value} ${stat.unit}` : String(stat.value)}
                    >
                      {stat.value}
                    </span>
                    {/* The one place a break is allowed. FCFA sits beside the
                        number when there is room and drops beneath it when there
                        is not, which costs a line only on the cards that need
                        one. */}
                    {stat.unit && (
                      <span
                        className="text-gray-500"
                        style={{
                          fontSize: '0.7rem',
                          marginLeft: 3,
                          // Same alignment as the figure, which is inline-block
                          // for its overflow rules — left on the baseline the
                          // two would sit a couple of pixels apart.
                          display: 'inline-block',
                          verticalAlign: 'bottom',
                        }}
                      >
                        {stat.unit}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Full width each, stacked, rather than side by side. Both are lists of
          label-and-amount rows, and at half width the amounts were being pushed
          hard against the labels on anything narrower than a laptop. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Replaces the old Recent Expenses card. That one showed only outgoing
            money, so the dashboard's "recent activity" was half the story: a
            school could take ten fee payments in a week and this corner of the
            screen would not mention it. */}
        <RecentActivity onOpen={openActivity} />

        <Card className="p-6">
          <h2 className="text-xl mb-4">Financial Summary</h2>
          <div className="space-y-4">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Total Income</span>
              <span className="text-green-600">
                {(
                  dashboardData?.financialSummary?.totalIncome ?? 0
                ).toLocaleString()}{" "}
                FCFA
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Total Expenses</span>
              <span className="text-red-600">
                {(
                  dashboardData?.financialSummary?.totalExpenses ?? 0
                ).toLocaleString()}{" "}
                FCFA
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span>Net Balance</span>
              <span className="text-blue-600">
                {(
                  dashboardData?.financialSummary?.netBalance ?? 0
                ).toLocaleString()}{" "}
                FCFA
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
