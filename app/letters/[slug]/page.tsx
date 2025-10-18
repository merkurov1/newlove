import { notFound, redirect } from 'next/navigation';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import { cookies } from 'next/headers';
import BlockRenderer from '@/components/BlockRenderer';
import { safeData } from '@/lib/safeSerialize';

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

  // Enforce authentication: all letters require a logged-in user to view.
  // If not authenticated, redirect to the login page and include the
  // return path so the user can continue after signing in.
  if (!user) {
    const nextPath = encodeURIComponent(`/letters/${slug}`);
    redirect(`/login?next=${nextPath}`);
  }

  // Authenticated: show full content
  let blocks = [];
  try {
    const raw = typeof letter.content === 'string' ? letter.content : JSON.stringify(letter.content);
    const parsed = JSON.parse(raw || '[]');
    blocks = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } catch (e) {
    console.error('Failed to parse letter content', e, letter.content);
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-4">{letter.title}</h1>
      <div className="prose mb-6">
        {blocks.length > 0 ? <BlockRenderer blocks={blocks} /> : <p className="italic text-gray-500">Содержимое отсутствует.</p>}
      </div>
    </main>
  );
}