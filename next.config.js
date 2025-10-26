// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true
  },
  // Оптимизация для Vercel
  // Output mode (standalone helps deploying to some platforms)
  output: 'standalone',
  // Allow disabling heavy build features locally via env to reduce memory use during builds
  experimental: (process.env.DISABLE_OPTIMIZE_CSS === '1') ? {} : {
    // Оптимизация для production
     // NOTE: `next` may require `critters` when `optimizeCss` is enabled which can
     // cause runtime MODULE_NOT_FOUND errors in some deployment environments where
     // node_modules are pruned. Keep this feature opt-in via ENABLE_OPTIMIZE_CSS to
     // avoid runtime failures (set ENABLE_OPTIMIZE_CSS=1 in your build environment
     // to enable it if you also ensure `critters` is installed).
     optimizeCss: (process.env.ENABLE_OPTIMIZE_CSS === '1') ? true : false,
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
      }
    ],
    // Поддержка локальных изображений из /public/uploads
    domains: ['nzasvblckrwsnlxsqfma.supabase.co', 'txvkqcitalfbjytmnawq.supabase.co'],
  // Временно отключаем встроенный оптимизатор изображений Next.js / Vercel.
  // Это предотвратит дальнейшие "Image Optimization - Cache Writes" на Vercel
  // и быстро уменьшит потребление бесплатной квоты. В долгосрочной перспективе
  // рекомендую либо настроить внешний CDN/прокси для изображений, пред-генерировать
  // превью и миниатюры в хранилище, либо понизить использование next/image
  // для внешних/динамических источников.
  unoptimized: true,
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};

module.exports = nextConfig;
