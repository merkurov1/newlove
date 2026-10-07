// app/sitemap.ts

import { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';

// Обновляем раз в час, чтобы не грузить базу
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    'https://www.merkurov.love';

  const supabase =
    createClient();

  // 1. STATIC HUBS

  const staticPages: MetadataRoute.Sitemap[] = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/selection`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/journal`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/projects`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/temple`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/heartandangel`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/heartandangel/world`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/heartandangel/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/heartandangel/calm`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/heartandangel/letitgo`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/vigil`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/absolution`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/tribute`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  // 2. FLOW
  //
  // Flow public identity is:
  //
  //   /flow/[slug]
  //
  // Never use item.id or source_url here.

  let flowPages: MetadataRoute.Sitemap = [];

  try {
    const {
      data: flowItems,
      error,
    } = await supabase
      .from('items')
      .select(
        'slug,updated_at,published_at',
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

    if (error) {
      throw error;
    }

    if (flowItems) {
      flowPages =
        flowItems
          .filter(
            (
              item,
            ): item is {
              slug: string;
              updated_at: string | null;
              published_at: string | null;
            } =>
              typeof item.slug ===
                'string' &&
              item.slug.trim()
                .length > 0,
          )
          .map(
            (item) => ({
              url: `${baseUrl}/flow/${encodeURIComponent(
                item.slug,
              )}`,

              lastModified:
                new Date(
                  item.updated_at ||
                    item.published_at ||
                    new Date().toISOString(),
                ),

              changeFrequency:
                'weekly',

              priority: 0.8,
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

  let articlePages: MetadataRoute.Sitemap[] = [];

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
              'weekly',
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

  let letterPages: MetadataRoute.Sitemap[] = [];

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
              'monthly',
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

  let projectPages: MetadataRoute.Sitemap[] = [];

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
              'monthly',
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

  let tagPages: MetadataRoute.Sitemap[] = [];

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
            lastModified:
              new Date(),
            changeFrequency:
              'weekly',
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