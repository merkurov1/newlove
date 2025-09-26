/** @type {import('next').NextConfig} */
const nextConfig = {
  // Убедитесь, что здесь нет экспериментальных флагов, таких как nextScriptWorkers.
  reactStrictMode: true, 
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'txvkqcitalfbjytmnawq.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/a/**',
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // ФИНАЛЬНЫЙ ФИКС: Перенаправляем устаревший импорт NextAuth на новый путь
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Это предотвращает ошибку 'next-auth/next is deprecated' в клиентской сборке
      config.resolve.alias['next-auth/next'] = 'next-auth/react';
    }
    return config;
  },
};

module.exports = nextConfig;

