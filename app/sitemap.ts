// app/sitemap.ts
// Minimal sitemap during migration. No database access here to keep
// the TypeScript build green while we migrate to Supabase.

import { MetadataRoute } from 'next';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://merkurov.love';

  const staticPages = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 1.0 },
    { url: `${baseUrl}/articles`, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 0.9 },
    { url: `${baseUrl}/projects`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: `${baseUrl}/talks`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.6 },
  ];

  // We'll later enhance this by pulling dynamic routes from Supabase.
  return staticPages;
}










