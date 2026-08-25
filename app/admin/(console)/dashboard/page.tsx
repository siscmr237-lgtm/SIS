"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeftRight,
  GraduationCap,
  School,
  Users,
  Wallet,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { platformApi } from "@/lib/platformApi";
import { statValueFontSize } from "@/utils/statFigure";

/**
 * The console's home page: what the whole platform adds up to.
 *
 * PLATFORM-WIDE AGGREGATES, AND NOTHING ELSE. Every figure on this screen is a
 * count or a sum over all schools at once — GET /platform/analytics takes no
 * parameters and cannot be asked about one school, so there is no school's
 * finances here, no student, and no member of staff. Which school is which is
 * the Schools page's job, and it stays there.
 *
 * WHY THIS IS THE LANDING PAGE. /admin used to bounce to /admin/schools, which
 * meant the first thing the team saw was a work queue. The queue is still one
 * click away and the count of schools waiting is on the first card, but the
 * question somebody opening the console usually has — how is the platform
 * doing — had nowhere to be answered at all.
 */

interface Analytics {
  totals: {
    schools: number;
    schoolsApproved: number;
    schoolsPending: number;
    students: number;
    staff: number;
    teachers: number;
    feesPaid: number;
    feePayments: number;
    feesCharged: number;
    transactions: number;
  };
  /** Twelve entries, oldest first, gaps already filled in by the API. */
  feesByMonth: { month: string; amount: number; payments: number }[];
}

/**
 * Real media queries, not Tailwind's `sm:`/`md:` variants.
 *
 * src/index.css is a frozen pre-compiled build, so a variant that is not
 * already in it parses, ships and does nothing — the same reason the console
 * layout carries its own CONSOLE_SHELL_CSS.
 *
 * The card grid needs no breakpoint to choose its column count: `auto-fit`
 * with a `minmax` floor gives five across on a desktop and two across on a
 * phone by itself, and two-up is what the school app's own dashboard settled
 * on for tiles this size. The one rule it does carry is about the odd card
 * out at two columns, and it is a container query rather than a media query —
 * see the note on it below.
 *
 * The chart's HEIGHT is the other thing that cannot be left to the content:
 * recharts measures its parent and draws nothing until it can, so that has to
 * come from a real rule rather than from a breakpoint guessed at in
 * JavaScript.
 */
const DASHBOARD_CSS = `
  [data-analytics-chart] { height: 300px; }
  [data-analytics-heading] { font-size: 1.25rem; }

  @media (max-width: 640px) {
    [data-analytics-chart] { height: 220px; }
    [data-analytics-heading] { font-size: 1.125rem; }
  }

  /* Five cards into two columns leaves the fifth on a row by itself at half
     width, which reads as a card that failed to load rather than as the last
     one. It is given the whole row instead.

     A CONTAINER query, not a media query, and that is the point: the rule has
     to fire exactly when auto-fit has settled on two columns or fewer, and that
     depends on the width of THIS GRID, not of the window — the console shell
     puts 20px of padding either side today and a change to that would drift a
     viewport breakpoint out of step with the layout it was chosen for. The
     threshold is arithmetic on the values above it: a third 150px track plus
     its 12px gap needs 474px, so at 473px and below there are at most two.

     1 / -1 rather than a span of two, because at the narrowest widths the grid
     is a single column and asking to span two there would conjure an implicit
     second column and push the card off the side. First line to last is
     whatever the grid currently has. (No backticks anywhere in this comment —
     it sits inside a template literal and one would end the string early.)

     Where @container is not supported the whole block is dropped and the card
     simply stays half-width, which is where it started. */
  [data-analytics-cards] { container-type: inline-size; }

  @container (max-width: 473px) {
    [data-analytics-cards] > :last-child { grid-column: 1 / -1; }
  }
`;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "2026-08" -> "Aug", or "Aug 2026" when the year is wanted.
 *
 * Split by hand rather than through `new Date("2026-08")`. That parses as
 * midnight UTC, and `toLocaleDateString` then renders it in the reader's
 * timezone — so west of Greenwich every label on the axis would silently name
 * the month before.
 */
function monthLabel(key: string, withYear = false) {
  const [year, month] = key.split("-");
  const name = MONTH_NAMES[Number(month) - 1] ?? key;
  return withYear ? `${name} ${year}` : name;
}

/**
 * Axis labels only. A platform-wide total runs to eight or nine digits, and
 * twelve of those down the side of the chart would take more width than the
 * chart itself. Every exact figure is a hover away in the tooltip, and the
 * cards above carry them in full.
 */
function compactAmount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

const CARD: React.CSSProperties = {
  background: "white",
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  // The console sits on #F8FAFC, so a border alone leaves the cards flat
  // against it. One hairline shadow, not a drop — enough to lift them.
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

function StatCard({
  icon: Icon,
  tint,
  ink,
  label,
  value,
  unit,
  sub,
}: {
  icon: typeof School;
  /** The icon chip's background. */
  tint: string;
  /** The icon itself, always the darker partner of `tint`. */
  ink: string;
  label: string;
  value: string;
  unit?: string;
  sub: string;
}) {
  return (
    <div style={{ ...CARD, padding: "14px 15px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span
          aria-hidden="true"
          style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: tint, color: ink,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Icon size={17} />
        </span>
        <span
          style={{
            fontSize: "0.7rem", fontWeight: 600, color: "#64748B",
            textTransform: "uppercase", letterSpacing: "0.05em",
            // minWidth 0 so a two-word label ellipses inside the card rather
            // than widening it and breaking the grid's equal columns.
            minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
          title={label}
        >
          {label}
        </span>
      </div>

      {/* nowrap on the figure: a money total must never break mid-number.
          "10,939,0 / 00" is not a smaller version of the truth. The size steps
          down instead — the same statValueFontSize the school app's tiles and
          finance cards use, so the three can never disagree about when a figure
          has got too long for a card. */}
      <p style={{ margin: 0, lineHeight: 1.15, overflow: "hidden" }}>
        <span
          title={unit ? `${value} ${unit}` : value}
          style={{
            fontSize: statValueFontSize(value),
            fontWeight: 600,
            color: "#0F172A",
            whiteSpace: "nowrap",
            display: "inline-block",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            verticalAlign: "bottom",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </span>
        {/* The one break that is allowed: FCFA sits beside the number when
            there is room and drops under it when there is not, costing a line
            only on the card that needs one. */}
        {unit && (
          <span style={{ fontSize: "0.7rem", color: "#64748B", marginLeft: 4 }}>{unit}</span>
        )}
      </p>

      <p
        style={{
          margin: "6px 0 0", fontSize: "0.72rem", color: "#94A3B8",
          lineHeight: 1.35,
        }}
      >
        {sub}
      </p>
    </div>
  );
}

/** The hover card on the line. Inline-styled like everything else here. */
function ChartTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload as { month: string; amount: number; payments: number };
  return (
    <div
      style={{
        background: "white", border: "1px solid #E2E8F0", borderRadius: 9,
        padding: "8px 11px", boxShadow: "0 4px 12px rgba(15, 23, 42, 0.10)",
      }}
    >
      <div style={{ fontSize: "0.72rem", color: "#64748B", marginBottom: 3 }}>
        {monthLabel(point.month, true)}
      </div>
      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>
        {point.amount.toLocaleString()} <span style={{ fontSize: "0.7rem", fontWeight: 400, color: "#64748B" }}>FCFA</span>
      </div>
      <div style={{ fontSize: "0.72rem", color: "#94A3B8", marginTop: 2 }}>
        {point.payments.toLocaleString()} payment{point.payments === 1 ? "" : "s"}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    platformApi
      .get("/platform/analytics")
      .then(setData)
      .catch((e) => setError(e?.message || "Could not load the dashboard."));
  }, []);

  useEffect(load, [load]);

  if (error) {
    return (
      <div style={{ maxWidth: 1100 }}>
        <p style={{ fontSize: "0.875rem", color: "#DC2626", margin: "0 0 10px" }}>{error}</p>
        {/* A retry, which the other console pages do not offer, because this
            one is the landing page: a reader who arrives on a 503 here has not
            asked for anything yet and has nowhere to go back to. */}
        <button
          onClick={load}
          style={{
            background: "white", border: "1px solid #CBD5E1", color: "#0F172A",
            borderRadius: 8, padding: "6px 12px", fontSize: "0.8125rem", cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return <p style={{ fontSize: "0.875rem", color: "#64748B" }}>Loading...</p>;
  }

  const t = data.totals;
  const windowTotal = data.feesByMonth.reduce((sum, m) => sum + m.amount, 0);
  const collectionRate = t.feesCharged > 0 ? Math.round((t.feesPaid / t.feesCharged) * 100) : null;
  const studentsPerSchool = t.schools > 0 ? Math.round(t.students / t.schools) : 0;

  return (
    <div style={{ maxWidth: 1100 }}>
      <style>{DASHBOARD_CSS}</style>

      <h1
        data-analytics-heading=""
        style={{ fontWeight: 600, color: "#0F172A", margin: "0 0 4px" }}
      >
        Dashboard
      </h1>
      <p style={{ fontSize: "0.8125rem", color: "#64748B", margin: "0 0 18px" }}>
        Every school on the platform, added together.
      </p>

      {/* auto-fit, not a fixed column count: five across on a desktop, two
          across on a phone, and no breakpoint to keep in step with anything. */}
      <div
        data-analytics-cards=""
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <StatCard
          icon={School}
          tint="#EFF6FF"
          ink="#1D4ED8"
          label="Schools"
          value={t.schools.toLocaleString()}
          sub={
            t.schoolsPending > 0
              ? `${t.schoolsApproved} approved · ${t.schoolsPending} awaiting review`
              : `${t.schoolsApproved} approved`
          }
        />
        <StatCard
          icon={Wallet}
          tint="#DCFCE7"
          ink="#15803D"
          label="Fees paid"
          value={t.feesPaid.toLocaleString()}
          unit="FCFA"
          sub={
            collectionRate === null
              ? "No fees billed yet"
              : `${collectionRate}% of everything billed`
          }
        />
        <StatCard
          icon={ArrowLeftRight}
          tint="#EDE9FE"
          ink="#6D28D9"
          label="Transactions"
          value={t.transactions.toLocaleString()}
          sub="Payments, charges and expenses"
        />
        <StatCard
          icon={GraduationCap}
          tint="#E0F2FE"
          ink="#0369A1"
          label="Students"
          value={t.students.toLocaleString()}
          sub={t.schools > 0 ? `About ${studentsPerSchool} per school` : "No schools yet"}
        />
        <StatCard
          icon={Users}
          tint="#FEF3C7"
          ink="#A16207"
          label="Teachers"
          value={t.teachers.toLocaleString()}
          sub={`Of ${t.staff.toLocaleString()} staff in total`}
        />
      </div>

      <div style={{ ...CARD, padding: "16px 16px 10px" }}>
        {/* Wraps rather than breaking at a width: on a phone the total drops
            under the title instead of squeezing it. */}
        <div
          style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between",
            flexWrap: "wrap", gap: "6px 16px", marginBottom: 14,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#0F172A", margin: 0 }}>
              Fees collected
            </h2>
            <p style={{ fontSize: "0.75rem", color: "#94A3B8", margin: "2px 0 0" }}>
              Student fee payments, by the month the money moved
            </p>
          </div>
          {/* marginLeft auto, not just space-between: once this wraps onto a
              line of its own it is the only item on that line, and
              space-between would park it at the left edge under the subtitle
              looking like a stray third line of it. */}
          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: "auto" }}>
            <div
              style={{
                fontSize: "0.9375rem", fontWeight: 600, color: "#0F172A",
                fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
              }}
            >
              {windowTotal.toLocaleString()}{" "}
              <span style={{ fontSize: "0.7rem", fontWeight: 400, color: "#64748B" }}>FCFA</span>
            </div>
            <div style={{ fontSize: "0.72rem", color: "#94A3B8" }}>last 12 months</div>
          </div>
        </div>

        {windowTotal === 0 ? (
          // A flat line pinned to zero looks like a broken chart rather than an
          // empty one, and it is the state a brand-new platform is actually in.
          <div
            data-analytics-chart=""
            style={{
              display: "grid", placeItems: "center",
              color: "#94A3B8", fontSize: "0.8125rem", textAlign: "center",
              padding: "0 16px",
            }}
          >
            No fee payments have been recorded in the last 12 months.
          </div>
        ) : (
          <div data-analytics-chart="" style={{ minWidth: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.feesByMonth} margin={{ top: 6, right: 10, bottom: 0, left: 0 }}>
                {/* Horizontal rules only. Vertical ones add a second grid the
                    eye has to read past to follow a single line. */}
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={(m: string) => monthLabel(m)}
                  tick={{ fontSize: 11, fill: "#94A3B8" }}
                  tickLine={false}
                  axisLine={{ stroke: "#E2E8F0" }}
                  // Twelve labels do not fit across a phone. minTickGap lets
                  // recharts drop whichever ones would collide instead of
                  // overprinting them, at whatever width it is handed — so
                  // there is no breakpoint here to fall out of step.
                  minTickGap={14}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={compactAmount}
                  tick={{ fontSize: 11, fill: "#94A3B8" }}
                  tickLine={false}
                  axisLine={false}
                  width={46}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#CBD5E1", strokeWidth: 1 }} />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#1D4ED8"
                  strokeWidth={2}
                  // Small dots always, a bigger one under the cursor: with
                  // twelve points the shape of the line is the message, and
                  // dots large enough to read individually crowd it.
                  dot={{ r: 2.5, fill: "#1D4ED8", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#1D4ED8", stroke: "white", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <p style={{ fontSize: "0.72rem", color: "#94A3B8", marginTop: 10 }}>
        Figures cover every school on the platform, whatever its registration status.
      </p>
    </div>
  );
}
