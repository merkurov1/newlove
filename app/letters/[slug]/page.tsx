import { notFound } from 'next/navigation';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import BlockRenderer from '@/components/BlockRenderer';
import { safeData } from '@/lib/safeSerialize';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }) {
  const slug = params.slug;
  // Minimal metadata while we fetch content
  return sanitizeMetadata({ title: `Письмо — ${slug}` });
}

export default async function LetterPage({ params }: Props) {
  const { slug } = params;

  // Fetch context (user + supabase)
  const ctx = await getUserAndSupabaseForRequest((globalThis && (globalThis as any).request) || new Request('http://localhost')) || {};
  const { supabase, user } = ctx as any;

  // Fetch the letter by slug (published or not)
  let letter = null;
  try {
    if (!supabase) throw new Error('No supabase');
    const { data, error } = await supabase.from('letters').select('*').eq('slug', slug).maybeSingle();
    if (error) {
      console.error('Failed to load letter', error);
    } else {
      letter = data || null;
    }
  } catch (e) {
    console.error('Error fetching letter', e);
  }

  if (!letter) return notFound();

  // If letter is not published, only allow access to logged-in users (admins/author)
  const isOwnerOrAdmin = user && (user.id === letter.authorId || String((user.user_metadata || {}).role || user.role || '').toUpperCase() === 'ADMIN');
  if (!letter.published && !isOwnerOrAdmin) return notFound();

  // If user is not authenticated, show teaser only
  if (!user) {
    const teaser = typeof letter.content === 'string' ? JSON.parse(letter.content).slice(0, 2) : (Array.isArray(letter.content) ? letter.content.slice(0,2) : []);
    return (
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">{letter.title}</h1>
        <div className="prose mb-6">
          {teaser.length > 0 ? <BlockRenderer blocks={teaser} /> : <p className="italic text-gray-500">Краткое содержание недоступно.</p>}
        </div>
        <div className="p-4 bg-yellow-50 border border-yellow-100 rounded">
          <p className="mb-2">Содержание письма доступно только зарегистрированным пользователям.</p>
          <a href="/login" className="text-blue-600 hover:underline">Войти или зарегистрироваться →</a>
        </div>
      </main>
    );
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