// app/robots.ts
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://www.merkurov.love';

  const defaultDisallow = [
    '/admin',
    '/admin/*',
    '/api/',
    '/api/*',
    '/auth/',
    '/auth/*',
    '/profile',
    '/profile/*',
    '/debug',
    '/debug/*',
    '/debug-auth',
    '/debug-auth/*',
    '/kit',
    '/kit/*',
    '/onboard',
    '/onboard/*',
    '/users',
    '/users/*',
    '/roles-demo',
    '/roles-demo/*',
    '/journal/*/full',
    '/letters/*/full',
    '/temple/whispers',
    '/temple/whispers/*',
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: defaultDisallow,
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: defaultDisallow,
      },
      {
        userAgent: 'bingbot',
        allow: '/',
        disallow: defaultDisallow,
      },
      // AI Crawlers - Allow access to public content for LLM & AI Search indexing
      {
        userAgent: [
          'GPTBot',
          'ChatGPT-User',
          'Claude-Web',
          'ClaudeBot',
          'PerplexityBot',
          'Applebot',
          'Applebot-Extended',
          'anthropic-ai',
          'cohere-ai',
          'Google-Extended',
        ],
        allow: '/',
        disallow: defaultDisallow,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
