// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true
  },
  // <<< ДОБАВЛЕННЫЙ БЛОК ДЛЯ РАБОТЫ ЛОГОТИПА
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'txvkqcitalfbjytmnawq.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/media/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Для аватарок из Google-аккаунтов
        port: '',
        pathname: '/**',
      }
    ],
  },
};

module.exports = nextConfig;
