import type { NextConfig } from 'next';

const adminHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
  { key: 'Cache-Control', value: 'no-store' },
];

const config: NextConfig = {
  // Native / WASM packages stay outside the bundle.
  serverExternalPackages: ['@electric-sql/pglite', 'sharp', 'postgres'],
  poweredByHeader: false,
  // Hide the Next.js dev-tools button (bottom-left) — it overlapped the admin sidebar.
  devIndicators: false,
  agentRules: false,
  // Server-rendered pages read the page templates and data.js at runtime.
  outputFileTracingIncludes: {
    '/[page]': ['./site-pages/**/*.html'],
    '/projects/[slug]': ['./public/assets/js/data.js'],
    '/projects/[slug]/[config]': ['./public/assets/js/data.js'],
    '/real-estate/[slug]': ['./public/assets/js/data.js'],
    '/real-estate/[slug]/[config]': ['./public/assets/js/data.js'],
    '/sitemap.xml': ['./public/assets/js/data.js'],
  },
  // The public site is plain HTML copied into public/ — serve "/" as index.html.
  async rewrites() {
    return { beforeFiles: [{ source: '/', destination: '/index.html' }] };
  },
  async headers() {
    return [
      // Public site files keep their names across deploys, so caching is moderate:
      // images a week, CSS/JS an hour; stale copies are used while a fresh one is fetched.
      { source: '/assets/img/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' }] },
      { source: '/assets/css/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' }] },
      { source: '/assets/js/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' }] },
      { source: '/admin/:path*', headers: adminHeaders },
      { source: '/admin', headers: adminHeaders },
      { source: '/api/admin/:path*', headers: adminHeaders },
      { source: '/api/auth/:path*', headers: adminHeaders },
    ];
  },
};

export default config;
