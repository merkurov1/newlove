import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import dynamic from 'next/dynamic';

const ReadMoreOrLoginClient = dynamic(() => import('@/components/letters/ReadMoreOrLoginClient'), { ssr: false });
import { cookies } from 'next/headers';
import BlockRenderer from '@/components/BlockRenderer';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  // Minimal metadata while we fetch content
  return sanitizeMetadata({ title: `Письмо — ${slug}` });
}

export default async function LetterPage({ params }: Props) {
  const { slug } = params;

  // Fetch request-scoped user (if any) for permission checks but use the
  // service-role supabase client for the canonical server-side read. Using
  // the service client avoids RLS/anon-key surprises that can cause a
  // false-negative (missing) letter and a 404.
  // Build a cookie-aware Request so the request-scoped helper can pick up
  // the user's session during SSR (next/headers provides cookies())
  let req: Request | null = (globalThis && (globalThis as any).request) || null;
  if (!req) {
    const cookieHeader = cookies()
      .getAll()
      .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
      .join('; ');
    req = new Request('http://localhost', { headers: { cookie: cookieHeader } });
  }

  const ctx = await getUserAndSupabaseForRequest(req) || {};
  const { user } = ctx as any;

  // Use service-role client for reliable server reads
  let letter: any = null;
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const svc = getServerSupabaseClient({ useServiceRole: true });
    const { data, error } = await svc.from('letters').select('*').eq('slug', slug).maybeSingle();
    if (error) {
      console.error('Failed to load letter (service client)', error);
    } else {
      letter = data || null;
    }
  } catch (e) {
    console.error('Error fetching letter (service client)', e);
  }

  if (!letter) return notFound();

  // If letter is not published, only allow access to logged-in users (admins/author)
  const isOwnerOrAdmin = user && (user.id === letter.authorId || String((user.user_metadata || {}).role || user.role || '').toUpperCase() === 'ADMIN');
  if (!letter.published && !isOwnerOrAdmin) return notFound();


  // Parse content into blocks (we'll use a teaser for unauthenticated viewers)
  let parsedBlocks = [];
  try {
    const raw = typeof letter.content === 'string' ? letter.content : JSON.stringify(letter.content);
    const parsed = JSON.parse(raw || '[]');
    parsedBlocks = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } catch (e) {
    console.error('Failed to parse letter content', e, letter.content);
  }

  // For server-side render always show a single-block teaser to avoid
  // duplicating content when the client hydrates and replaces it with
  // the full body for authenticated users. The client component will
  // attempt to fetch the full content when appropriate.
  // Deep-clone parsed blocks to ensure only plain JSON objects (no
  // Dates, class instances or null-prototype objects) are passed into
  // any client components rendered by BlockRenderer (e.g. GalleryGrid).
  const safeParsed = JSON.parse(JSON.stringify(parsedBlocks || []));
  const teaser = (safeParsed || []).slice(0, 1);
  const toRender = teaser;

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">{letter.title}</h1>
      <div className="prose mb-6">
        <div>
          {toRender.length > 0 ? <BlockRenderer blocks={toRender} /> : <p className="italic text-gray-500">Содержимое отсутствует.</p>}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-sm text-gray-600 mb-3">Для просмотра полного текста и комментариев перейдите на страницу с полным содержимым.</p>
        {/* Client component decides based on client session whether to show 'Читать дальше' */}
        <div>
          <ReadMoreOrLoginClient slug={slug} />
        </div>
      </div>
    </main>
  );
}