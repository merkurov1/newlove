import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * Public content is open to search engines and AI crawlers. Only private
 * application surfaces (admin, API, auth, drafts) are excluded.
 */
const PRIVATE_PATHS = [
  '/admin',
  '/admin/',
  '/admin/*',
  '/api',
  '/api/',
  '/api/*',
  '/auth',
  '/auth/',
  '/auth/*',
  '/draft',
  '/draft/',
  '/draft/*',
  '/unframed/debug',
  '/unframed/debug/*',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: [
          'GPTBot',
          'OAI-SearchBot',
          'ChatGPT-User',
          'ClaudeBot',
          'Claude-SearchBot',
          'Claude-User',
          'PerplexityBot',
          'Google-Extended',
          'Applebot-Extended',
          'CCBot',
          'Googlebot',
          'bingbot',
        ],
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
