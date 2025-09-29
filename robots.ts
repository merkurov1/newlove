// app/robots.ts
import { MetadataRoute } from 'next'

// !!! ВАЖНО: Замените это на URL вашего сайта
const baseUrl = 'https://your-domain.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/admin/', // Запрещаем роботам заходить в админку
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
