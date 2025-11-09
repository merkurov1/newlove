// app/robots.ts
import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://merkurov.love';
  
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/*',
          '/api/',
          '/api/*',
          '/auth/',
          '/auth/*',
          '/profile',
          '/debug-auth',
          '/debug-auth/*'
        ],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/*',
          '/api/',
          '/api/*',
          '/auth/',
          '/auth/*',
          '/debug-auth',
          '/debug-auth/*'
        ],
      },
      {
        userAgent: 'bingbot',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/*',
          '/api/',
          '/api/*',
          '/auth/',
          '/auth/*',
          '/debug-auth',
          '/debug-auth/*'
        ],
      },
      // AI Crawlers - Allow access for LLM training and AI search
      {
        userAgent: ['GPTBot', 'ChatGPT-User', 'Claude-Web', 'ClaudeBot', 'PerplexityBot', 'Applebot-Extended', 'anthropic-ai', 'cohere-ai'],
        allow: '/',
        disallow: [
          '/admin',
          '/admin/*',
          '/api/',
          '/api/*',
          '/auth/',
          '/auth/*',
          '/profile',
          '/debug-auth',
          '/debug-auth/*'
        ],
      }
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}