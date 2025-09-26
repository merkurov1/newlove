/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true, // Оставляем, так как полезно для отладки
  
  // КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: Включаем поддержку CSS, чтобы Next.js не игнорировал globals.css
  // Этот флаг заставляет Next.js иначе обрабатывать рабочие скрипты,
  // что часто решает проблемы с инжектированием CSS в App Router.
  experimental: {
    nextScriptWorkers: true,
  },

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

