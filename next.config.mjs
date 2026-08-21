/**
 * Old paths that moved wholesale under a new prefix, and the prefix they moved
 * to. Redirects are generated from these rather than written out one by one
 * because the list is the thing worth reading — 40-odd hand-copied source/
 * destination pairs is where a typo hides.
 */
const MOVED_SECTIONS = [
  // The school admin app. Every one of these used to sit at the site root,
  // which is why the root was not free for anything else.
  {
    prefix: '/school',
    paths: [
      'login', 'signup', 'password-reset', 'verify-email', 'onboarding',
      'dashboard', 'students', 'staff', 'classes', 'subjects', 'attendance',
      'class-ranking', 'enter-marks', 'expenses', 'finance', 'report-cards',
      'settings', 'tests-exams', 'timetable',
    ],
  },
];

/**
 * Two rules per path: the page itself, and anything nested under it so
 * /students/ABC123 and /staff/T042 travel with their parent.
 *
 * Each `source` is anchored — Next compiles '/login' to /^\/login(?:\/)?$/, so
 * it matches /login and nothing else. That is what keeps /teacher/login and
 * /admin/login out of it: they are different paths, not paths that happen to
 * end in the same segment. Worth stating because getting this wrong would
 * quietly send teachers and the internal team to the school door.
 */
const sectionRedirects = MOVED_SECTIONS.flatMap(({ prefix, paths }) =>
  paths.flatMap((p) => [
    { source: `/${p}`, destination: `${prefix}/${p}`, permanent: false },
    { source: `/${p}/:path*`, destination: `${prefix}/${p}/:path*`, permanent: false },
  ]),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  images: {
    remotePatterns: [{ protocol: 'http', hostname: '**' }, { protocol: 'https', hostname: '**' }],
  },
  /**
   * `permanent: false` (307) throughout, deliberately. A 308 is cached by the
   * browser indefinitely, so if any of these paths ever has to mean something
   * again we could not take it back from anyone who had visited it once.
   */
  async redirects() {
    return [
      // The team console moved from /platform/* to /admin/*. /platform was
      // never a page of its own — it had no page.tsx, only the login door and
      // the gated (console) group — so the bare path goes to the door. This
      // rule must stay ahead of the catch-all below it.
      { source: '/platform', destination: '/admin/login', permanent: false },
      // Carries deep links across too: /platform/schools/12/staff ->
      // /admin/schools/12/staff. The gate on the (console) layout still decides
      // whether the visitor may see what they asked for.
      { source: '/platform/:path*', destination: '/admin/:path*', permanent: false },

      ...sectionRedirects,
    ];
  },
};

export default nextConfig;
