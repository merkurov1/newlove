/** @type {import('next').NextConfig} */
const nextConfig = {
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
};

module.exports = nextConfig;
