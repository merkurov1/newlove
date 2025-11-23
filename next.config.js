// next.config.js
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
    ];
  },
  reactStrictMode: true,
  eslint: {
    // Temporarily disable ESLint during builds to avoid invalid-option failures
    // (CI/deploy should set DISABLE_ESLINT=1 or fix ESLint config). Set to true
    // to prevent build-time lint failures stemming from environment/tooling.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // TypeScript strict mode enabled - errors will block builds
    ignoreBuildErrors: false,
  },
  // Output mode - required for Render and other Node.js hosting platforms
  // Vercel doesn't need this, but Render does
  output: 'standalone',

  // Webpack configuration
  webpack: (config, { isServer }) => {
    // Disable webpack cache warnings in production
    if (process.env.NODE_ENV === 'production') {
      config.infrastructureLogging = {
        level: 'error',
      };
    }

    return config;
  },

  // Allow disabling heavy build features locally via env to reduce memory use during builds
  experimental:
    process.env.DISABLE_OPTIMIZE_CSS === '1'
      ? {}
      : {
          // Оптимизация для production
          // NOTE: `next` may require `critters` when `optimizeCss` is enabled which can
          // cause runtime MODULE_NOT_FOUND errors in some deployment environments where
          // node_modules are pruned. Keep this feature opt-in via ENABLE_OPTIMIZE_CSS to
          // avoid runtime failures (set ENABLE_OPTIMIZE_CSS=1 in your build environment
          // to enable it if you also ensure `critters` is installed).
          optimizeCss: process.env.ENABLE_OPTIMIZE_CSS === '1' ? true : false,
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
    // Long cache TTL for better CDN performance (1 year)
    minimumCacheTTL: 31536000,
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

module.exports = nextConfig;
