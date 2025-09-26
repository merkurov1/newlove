/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true, // Оставляем, так как полезно для отладки
  
  // КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Удаляем проблемный флаг, который вызвал ошибку Partytown.
  // experimental: {
  //   nextScriptWorkers: true,
  // },

  images: {
    remotePatterns: [
      // Правило для вашего хранилища Supabase
      {
        protocol: 'https',
        hostname: 'txvkqcitalfbjytmnawq.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      // Правило для аватаров Google
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/a/**',
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true, // Отключаем ESLint при сборке (как ты хотел)
  },
};

module.exports = nextConfig;

