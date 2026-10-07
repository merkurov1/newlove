import type { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';

export const revalidate = 3600;

type SitemapEntry = {
  url: string;
  lastModified?: string | Date;
  changeFrequency?:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never';
  priority?: number;
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    'https://www.merkurov.love';

  const supabase =
    createClient();

  const now = new Date();

  // 1. STATIC HUBS

  const staticPages: SitemapEntry[] = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/selection`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/journal`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/projects`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/temple`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/heartandangel`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/heartandangel/world`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/heartandangel/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/heartandangel/calm`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/heartandangel/letitgo`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/vigil`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/absolution`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/tribute`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  // 2. FLOW
  //
  // Public Flow identity is /flow/[slug].
  // Only published + public items enter the sitemap.

  let flowPages: SitemapEntry[] = [];

  try {
    const { data: flowItems } =
      await supabase
        .from('items')
        .select(
          'slug, updated_at, published_at',
        )
        .eq(
          'status',
          'published',
        )
        .eq(
          'visibility',
          'public',
        )
        .not(
          'slug',
          'is',
          null,
        )
        .order(
          'published_at',
          {
            ascending: false,
          },
        )
        .limit(5000);

    if (flowItems) {
      flowPages =
        flowItems
          .filter(
            (
              item,
            ) =>
              typeof item.slug ===
              'string' &&
              item.slug.length > 0,
          )
          .map(
            (item) => ({
              url: `${baseUrl}/flow/${encodeURIComponent(
                item.slug as string,
              )}`,
              lastModified:
                item.updated_at ||
                item.published_at ||
                now,
              changeFrequency:
                'weekly' as const,
              priority: 0.7,
            }),
          );
    }
  } catch (error) {
    console.error(
      'Sitemap Error (Flow):',
      error,
    );
  }

  // 3. ARTICLES -> ROOT

  let articlePages: SitemapEntry[] =
    [];

  try {
    const {
      data: articles,
    } = await supabase
      .from('articles')
      .select(
        'slug, updatedAt, publishedAt',
      )
      .eq(
        'published',
        true,
      )
      .order(
        'publishedAt',
        {
          ascending: false,
        },
      )
      .limit(1000);

    if (articles) {
      articlePages =
        articles.map(
          (item) => ({
            url: `${baseUrl}/${item.slug}`,
            lastModified:
              new Date(
                item.updatedAt ||
                  item.publishedAt,
              ),
            changeFrequency:
              'weekly' as const,
            priority: 0.8,
          }),
        );
    }
  } catch (error) {
    console.error(
      'Sitemap Error (Articles):',
      error,
    );
  }

  // 4. LETTERS -> ROOT

  let letterPages: SitemapEntry[] =
    [];

  try {
    const {
      data: letters,
    } = await supabase
      .from('letters')
      .select(
        'slug, updatedAt, publishedAt',
      )
      .eq(
        'published',
        true,
      )
      .limit(200);

    if (letters) {
      letterPages =
        letters.map(
          (letter) => ({
            url: `${baseUrl}/${letter.slug}`,
            lastModified:
              new Date(
                letter.updatedAt ||
                  letter.publishedAt,
              ),
            changeFrequency:
              'monthly' as const,
            priority: 0.7,
          }),
        );
    }
  } catch (error) {
    console.error(
      'Sitemap Error (Letters):',
      error,
    );
  }

  // 5. PROJECTS -> ROOT

  let projectPages: SitemapEntry[] =
    [];

  try {
    const {
      data: projects,
    } = await supabase
      .from('projects')
      .select(
        'slug, updatedAt, createdAt',
      )
      .eq(
        'published',
        true,
      )
      .limit(100);

    if (projects) {
      projectPages =
        projects.map(
          (project) => ({
            url: `${baseUrl}/${project.slug}`,
            lastModified:
              new Date(
                project.updatedAt ||
                  project.createdAt,
              ),
            changeFrequency:
              'monthly' as const,
            priority: 0.6,
          }),
        );
    }
  } catch (error) {
    console.error(
      'Sitemap Error (Projects):',
      error,
    );
  }

  // 6. TAGS -> /tags/slug

  let tagPages: SitemapEntry[] =
    [];

  try {
    const {
      data: tags,
    } = await supabase
      .from('Tag')
      .select(
        'slug, name',
      )
      .limit(200);

    if (tags) {
      tagPages =
        tags.map(
          (tag) => ({
            url: `${baseUrl}/tags/${
              tag.slug ||
              tag.name
            }`,
            lastModified: now,
            changeFrequency:
              'weekly' as const,
            priority: 0.5,
          }),
        );
    }
  } catch (error) {
    console.error(
      'Sitemap Error (Tags):',
      error,
    );
  }

  return [
    ...staticPages,
    ...flowPages,
    ...articlePages,
    ...letterPages,
    ...projectPages,
    ...tagPages,
  ];
}