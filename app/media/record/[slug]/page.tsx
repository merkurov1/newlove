import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { articleJsonLd, breadcrumbJsonLd, creativeWorkJsonLd } from '@/lib/structuredData';
import { getMediaRecords } from '@/lib/mediaRecords';
import { description, pageMetadata, truncate } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Props = { params: { slug: string } };

async function getRecord(slug: string) {
  const decoded = decodeURIComponent(slug);
  const records = await getMediaRecords();
  return records.find((record) => record.slug === decoded) || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const record = await getRecord(params.slug);

  if (!record) {
    return pageMetadata({
      title: 'Media record not found | Anton Merkurov',
      description: 'The requested media archive record could not be found.',
      path: `/media/record/${encodeURIComponent(params.slug)}`,
      noindex: true,
    });
  }

  const path = `/media/record/${encodeURIComponent(record.slug)}`;
  const summary = description(
    record.summary ||
      `${record.title} — ${record.outlet}, ${record.date}. A media citation featuring Anton Merkurov.`
  );

  return pageMetadata({
    title: truncate(`${record.title} | Anton Merkurov`, 60),
    description: summary,
    path,
    image: undefined,
    imageAlt: record.title,
    type: 'article',
    publishedTime: record.date,
    keywords: [record.outlet, record.topic, record.kind, 'Anton Merkurov'],
  });
}

export default async function MediaRecordPage({ params }: Props) {
  const record = await getRecord(params.slug);
  if (!record) notFound();

  const path = `/media/record/${encodeURIComponent(record.slug)}`;
  const summary =
    record.summary ||
    `${record.title} — a ${record.kind} published by ${record.outlet} on ${record.date}.`;

  const articleKinds = new Set(['column', 'blog', 'interview', 'radio', 'video']);
  const presence: Record<string, string> = {
    quote: 'Quoted expert',
    mention: 'Mention',
    interview: 'Interview',
    radio: 'Radio',
    video: 'Video',
    column: 'Author column',
    blog: 'Blog',
    profile: 'Profile',
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] px-5 pb-24 pt-32 text-[#141210] sm:px-8 sm:pt-40">
      <JsonLd
        data={
          articleKinds.has(record.kind)
            ? articleJsonLd({
                path,
                headline: record.title,
                description: summary,
                datePublished: record.date,
                section: record.derivedTopic || record.topic,
                authorName: 'Anton Merkurov',
                citation: record.url,
                isBasedOn: record.url,
                inLanguage: record.lang.toLowerCase(),
              })
            : creativeWorkJsonLd({
                path,
                name: record.title,
                description: summary,
                datePublished: record.date,
                genre: record.kind,
                citation: record.url,
                isBasedOn: record.url,
                inLanguage: record.lang.toLowerCase(),
              })
        }
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Media Archive', path: '/media' },
          { name: record.title, path },
        ])}
      />

      <article className="mx-auto max-w-3xl">
        <nav
          aria-label="Breadcrumb"
          className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500"
        >
          <ol className="flex flex-wrap items-center gap-2">
            <li>
              <Link href="/">Home</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/media">Media Archive</Link>
            </li>
          </ol>
        </nav>

        <header className="mt-10 border-b border-stone-300 pb-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
            {record.outlet}
            {record.program ? ` · ${record.program}` : ''}
          </p>
          <h1 className="mt-4 font-serif text-3xl font-light leading-tight tracking-tight sm:text-5xl">
            {record.title}
          </h1>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-stone-500">
            <time dateTime={record.date}>{record.date}</time>
            <span>{record.lang}</span>
            <span>{presence[record.kind] || record.kind}</span>
            <span>{record.derivedTopic || record.topic}</span>
            {record.subtopics?.length ? <span>{record.subtopics.join(' · ')}</span> : null}
          </div>
        </header>

        {record.summary ? (
          <p className="mt-8 font-serif text-lg leading-relaxed text-stone-700 sm:text-xl">
            {record.summary}
          </p>
        ) : null}

        {/* TODO(anton): add missing publication dates/summaries in data/media.ts or Supabase. */}
        {record.note ? (
          <p className="mt-4 font-sans text-xs italic text-stone-500">{record.note}</p>
        ) : null}

        {record.verifiedQuotes && record.verifiedQuotes.length > 0 && (
          <section className="mt-10 border-t border-stone-300 pt-8">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
              Verified quotations
            </h2>
            <div className="mt-4 space-y-5">
              {record.verifiedQuotes.map((quote) => (
                <blockquote key={quote.id} className="border-l-2 border-[#A53A27] pl-4">
                  <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#A53A27]">
                    {quote.type === 'direct_quote'
                      ? 'Verified direct quote'
                      : quote.type === 'indirect_quote'
                        ? 'Verified paraphrase'
                        : 'Verified mention'}
                    {quote.language ? ` · ${quote.language}` : ''}
                  </p>
                  <p className="mt-2 font-serif text-lg leading-relaxed text-stone-800">
                    “{quote.text}”
                  </p>
                  {quote.translation && (
                    <p className="mt-2 border-t border-stone-200 pt-2 font-sans text-xs text-stone-500">
                      {quote.translation}
                      {quote.translationLanguage ? ` · ${quote.translationLanguage}` : ''}
                    </p>
                  )}
                </blockquote>
              ))}
            </div>
            <p className="mt-4 font-sans text-[10px] text-stone-500">
              Only quotes confirmed by the archive editor are shown as direct speech.
            </p>
          </section>
        )}

        {record.related && record.related.length > 0 && (
          <section className="mt-10 border-t border-stone-300 pt-8">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-500">
              Related publications
            </h2>
            <ul className="mt-4 space-y-2">
              {record.related.map((related) => (
                <li key={`${related.slug}-${related.relationType}`} className="text-sm">
                  <Link
                    className="underline decoration-stone-300 underline-offset-4 hover:decoration-stone-900"
                    href={`/media/record/${encodeURIComponent(related.slug)}`}
                  >
                    {related.outlet}: {related.title}
                  </Link>
                  <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.1em] text-stone-400">
                    {related.relationType}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-12 border-t border-stone-300 pt-8">
          <a
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] underline underline-offset-8 decoration-stone-400 hover:decoration-stone-900"
            href={record.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read the original publication at {record.outlet}
            <span aria-hidden="true">↗</span>
          </a>
          <p className="mt-4 font-sans text-xs text-stone-500">
            Citation archived by Anton Merkurov. The original publisher owns the copyright.
          </p>
        </div>

        <p className="mt-12">
          <Link
            className="font-mono text-xs uppercase tracking-[0.18em] text-stone-600 hover:text-stone-950"
            href="/media"
          >
            ← Back to the Media Archive
          </Link>
        </p>
      </article>
    </div>
  );
}
