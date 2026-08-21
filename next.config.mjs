/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  images: {
    remotePatterns: [{ protocol: 'http', hostname: '**' }, { protocol: 'https', hostname: '**' }],
  },
  /**
   * The team console moved from /platform/* to /admin/*. These keep the old
   * URLs working for anyone who bookmarked them or has one in their history.
   *
   * Server-side rather than a client component that redirects on mount: this
   * costs one 307 instead of shipping a page whose only job is to bounce, and
   * it still works with JS disabled. Order matters — Next takes the first
   * match, so the bare /platform rule must come before the catch-all.
   *
   * `permanent: false` (307, not 308) deliberately. A 308 is cached by the
   * browser indefinitely, so if /platform ever has to mean something again we
   * could not take it back from anyone who had visited it once.
   */
  async redirects() {
    return [
      // /platform was never a page of its own — it had no page.tsx, only the
      // /platform/login door and the gated (console) group. So the front door
      // is where it goes, not /admin.
      { source: '/platform', destination: '/admin/login', permanent: false },
      // Covers /platform/login -> /admin/login, and carries deep links across
      // too: /platform/schools/12/staff -> /admin/schools/12/staff. The gate on
      // the (console) layout still decides whether the visitor may see it.
      { source: '/platform/:path*', destination: '/admin/:path*', permanent: false },
    ];
  },
};

export default nextConfig;
