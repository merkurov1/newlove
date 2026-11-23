// next.config.js
//
// Next.js 16 uses Turbopack for `next dev` and `next build` by default. The
// project has no custom webpack loaders/plugins that Turbopack cannot handle,
// so the previous `webpack()` hook (which only set logging levels) was removed.
//
// `@next/bundle-analyzer` still hooks into webpack. It is applied only when
// ANALYZE=true and is meant to be used together with `next build --webpack`
// (see `scripts.analyze`). A normal build stays on Turbopack.
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

// sharp — нативный модуль, его нельзя бандлить.
// pdf-parse/pdfjs-dist содержат worker и ESM-загрузчик, поэтому остаются
// внешними серверными пакетами.
const externalPackages = ['sharp', 'pdf-parse', 'pdfjs-dist'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'merkurov.love' }],
        destination: 'https://www.merkurov.love/:path*',
        permanent: true,
      },
      // Old sitemap entries / renamed routes.
      { source: '/stat', destination: '/liveheart/stat', permanent: true },
      { source: '/projects', destination: '/all', permanent: true },
      // Feed aliases are handled by app/rss.xml/route.ts and
      // app/flow/rss.xml/route.ts so they stay next to the feed handlers.
      { source: '/feed', destination: '/flow', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), microphone=(self)',
          },
        ],
      },
      {
        // The Heart & Angel SW must never be served from a stale HTTP cache.
        source: '/heartandangel-sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/heartandangel',
          },
        ],
      },
      {
        // The isolated owner PWA worker follows the same update guarantees.
        // Without this header an installed iOS/iPadOS PWA can keep running an
        // old worker after a production deploy.
        source: '/pierrot-sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/admin/pierrot',
          },
        ],
      },
      {
        source: '/heartandangel/manifest.webmanifest',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600',
          },
        ],
      },
      {
        // Private research pages must never be cached by a CDN or a shared
        // proxy, even before the server-side ADMIN guard runs.
        source: '/research/telegram/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'private, no-store, max-age=0, must-revalidate',
          },
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow',
          },
        ],
      },
    ];
  },
  reactStrictMode: true,
  poweredByHeader: false,
  trailingSlash: false,
  typescript: {
    // TypeScript strict mode enabled - errors will block builds
    ignoreBuildErrors: false,
  },
  // Output mode - required for Render and other Node.js hosting platforms
  // Vercel doesn't need this, but Render does
  output: 'standalone',

  // Server packages that must stay outside the bundle.
  serverExternalPackages: externalPackages,

  // Автоматический Tree-Shaking для утилит и иконок
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', '@tiptap/react'],
    // Preserve the previous opt-in behaviour (disabled unless explicitly set).
    ...(process.env.ENABLE_OPTIMIZE_CSS === '1' ? { optimizeCss: true } : {}),
  },

  // Temporary production ingestion route needs the canonical manuscript in
  // its serverless bundle. Removed together with the route after indexing.
  outputFileTracingIncludes: {
    '/api/admin/knowledge/**': ['./app/unframed/Unframed.markdown'],
    '/api/unframed/**': ['./app/unframed/Unframed.markdown'],
    // Production release reconciliation reads the ordered migration files at
    // runtime. Trace them into the authenticated release route.
    '/api/admin/pierrot/dev/workbench/release/**': ['./migrations/**/*.sql'],
  },

  // Конфигурация изображений
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'nzasvblckrwsnlxsqfma.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'txvkqcitalfbjytmnawq.supabase.co', // Старый домен Supabase
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Для аватарок из Google-аккаунтов
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co', // Все поддомены Supabase
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.bsky.app', // Для изображений Bluesky
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com', // Для превью YouTube
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'miro.medium.com', // Для изображений Medium
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn-images-1.medium.com', // Для изображений Medium
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.medium.com', // Для всех поддоменов Medium
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'medium.com', // Для изображений Medium
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'example.com', // Для тестовых изображений
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.ibb.co', // Для изображений открыток
        port: '',
        pathname: '/**',
      },
    ],

    // Enable image optimization for better performance
    // Use environment variable to disable if needed: NEXT_PUBLIC_DISABLE_IMAGE_OPTIMIZATION=1
    unoptimized: process.env.NEXT_PUBLIC_DISABLE_IMAGE_OPTIMIZATION === '1',
    formats: ['image/avif', 'image/webp'], // AVIF first for best compression
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    // Next 16 defaults to [75] only. The design system uses explicit quality
    // values that must keep rendering as before.
    qualities: [50, 75, 84, 88, 92, 100],
    // Long cache TTL for better CDN performance (1 year)
    minimumCacheTTL: 31536000,
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

module.exports = process.env.ANALYZE === 'true' ? withBundleAnalyzer(nextConfig) : nextConfig;
