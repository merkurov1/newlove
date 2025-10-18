// ===== ФАЙЛ: app/letters/[slug]/page.tsx =====
// (ПОЛНЫЙ КОД С ИСПРАВЛЕНИЕМ)

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

// ----- ИСПРАВЛЕНИЕ 1: Переименовываем импорт -----
import dynamicImport from 'next/dynamic'; // Было 'import dynamic ...'

// Используем 'dynamicImport' для загрузки компонента
const ReadMoreOrLoginClient = dynamicImport(() => import('@/components/letters/ReadMoreOrLoginClient'), { ssr: false });

import { cookies } from 'next/headers';
import BlockRenderer from '@/components/BlockRenderer';
import serializeForClient from '@/lib/serializeForClient';
// НОВЫЙ ИМПОРТ из наших предыдущих шагов
import { createServerClient } from '@/lib/supabase/server'; 

// ----- ИСПРАВЛЕНИЕ 2: 'export const dynamic' теперь не конфликтует -----
// Эта строка заставит страницу всегда рендериться динамически
export const dynamic = 'force-dynamic';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  // Minimal metadata while we fetch content
  return sanitizeMetadata({ title: `Письмо — ${slug}` });
}

export default async function LetterPage({ params }: Props) {
  const { slug } = params;

  // Новая логика получения пользователя и Supabase
  const cookieStore = cookies();
  const supabase = createServerClient(cookieStore);
  // Эта функция теперь будет выполняться при каждом запросе
  const { data: { user } } = await supabase.auth.getUser();

  // Используем service-role клиент для надежного чтения данных
  const supabaseService = createServerClient(cookieStore, { useServiceRole: true });
  let letter: any = null;
  
  try {
    const { data, error } = await supabaseService.from('letters').select('*').eq('slug', slug).maybeSingle();
    if (error) {
      console.error('Failed to load letter (service client)', error);
    } else {
      letter = data || null;
    }
  } catch (e) {
    console.error('Error fetching letter (service client)', e);
  }

  if (!letter) return notFound();

  // Эта проверка теперь будет работать корректно, т.к. 'user' будет актуальным
  const isOwnerOrAdmin = user && (user.id === letter.authorId || String((user.user_metadata || {}).role || user.role || '').toUpperCase() === 'ADMIN');
  
  // Эта проверка была причиной 404 для тебя
  if (!letter.published && !isOwnerOrAdmin) return notFound();

  // Parse content into blocks (we'll use a teaser for unauthenticated viewers)
  let parsedBlocks: any[] = [];
  try {
    const raw = typeof letter.content === 'string' ? letter.content : JSON.stringify(letter.content);
    const parsed = JSON.parse(raw || '[]');
    parsedBlocks = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } catch (e) {
    console.error('Failed to parse letter content', e, letter.content);
  }

  // Use centralized serializer to produce plain JSON objects safe for
  // passing into Client Components.
  const safeParsed = serializeForClient(parsedBlocks || []) || [];
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
