import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata } from '@/lib/seo';
import { breadcrumbJsonLd, collectionPageJsonLd } from '@/lib/structuredData';
import { createClient } from '@/lib/supabase/server';

export const revalidate = 3600;

const TAGS_DESCRIPTION =
  'Browse every topic in the Anton Merkurov archive — art market, digital heritage, internet policy, AI and contemporary culture.';

export const metadata: Metadata = pageMetadata({
  title: 'Tags — Browse the Archive by Topic | Anton Merkurov',
  description: TAGS_DESCRIPTION,
  path: '/tags',
  languages: { 'x-default': '/tags', en: '/tags', ru: '/tags' },
});

async function getTags() {
  try {
    const supabase = createClient({ useServiceRole: true });
    const { data } = await supabase.from('Tag').select('slug,name').limit(200);
    return (data || [])
      .map((tag: any) => ({
        slug: String(tag.slug || tag.name || '').trim(),
        name: String(tag.name || tag.slug || '').trim(),
      }))
      .filter((tag) => tag.slug && tag.name);
  } catch {
    return [];
  }
}

export default async function TagsIndexPage() {
  const tags = await getTags();

  return (
    <div className="min-h-screen bg-[#FAF8F5] px-6 pb-24 pt-36 text-[#111] sm:px-10">
      <JsonLd
        data={collectionPageJsonLd({
          path: '/tags',
          name: 'Tags — archive topics',
          description: TAGS_DESCRIPTION,
          items: tags.map((tag) => ({ name: tag.name, url: `/tags/${encodeURIComponent(tag.slug)}` })),
        })}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Tags', path: '/tags' },
        ])}
      />

      <div className="mx-auto max-w-3xl">
        <h1 className="font-serif text-4xl font-light tracking-tight sm:text-5xl">Tags</h1>
        <p className="mt-4 max-w-xl font-serif text-lg leading-relaxed text-zinc-600">
          Browse the archive by topic. Each tag collects the related articles, projects and artworks.
        </p>

        {tags.length > 0 ? (
          <ul className="mt-12 flex flex-wrap gap-3">
            {tags.map((tag) => (
              <li key={tag.slug}>
                <Link
                  className="inline-flex border border-zinc-300 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-700 transition hover:border-zinc-900 hover:text-zinc-950"
                  href={`/tags/${encodeURIComponent(tag.slug)}`}
                >
                  {tag.name}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-10 font-sans text-sm text-zinc-500">
            No tags are published yet. Return to the{' '}
            <Link className="underline underline-offset-4" href="/">
              homepage
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
