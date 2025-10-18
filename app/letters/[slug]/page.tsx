// ===== ФАЙЛ: app/letters/[slug]/page.tsx =====
// (ВОЗВРАЩАЕМ НОВЫЙ ХЕЛПЕР)

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import dynamicImport from 'next/dynamic'; // <-- Переименованный импорт
import { cookies } from 'next/headers';
import BlockRenderer from '@/components/BlockRenderer';
import serializeForClient from '@/lib/serializeForClient';

// ----- ВОЗВРАЩАЕМ НОВЫЙ ХЕЛПЕР -----
import { createServerClient } from '@/lib/supabase/server'; 

const ReadMoreOrLoginClient = dynamicImport(() => import('@/components/letters/ReadMoreOrLoginClient'), { ssr: false });

export const dynamic = 'force-dynamic'; // <-- Делаем динамической

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  return sanitizeMetadata({ title: `Письмо — ${slug}` });
}

export default async function LetterPage({ params }: Props) {
  const { slug } = params;

  // ----- ВОЗВРАЩАЕМ НОВУЮ ЛОГИКУ -----
  const cookieStore = cookies();
  const supabase = createServerClient(cookieStore); // Обычный клиент
  const { data: { user } } = await supabase.auth.getUser(); // Получаем user

  // Service-role клиент для чтения
  const supabaseService = createServerClient(cookieStore, { useServiceRole: true });
  let letter: any = null;
  
  try {
    const { data, error } = await supabaseService.from('letters').select('*').eq('slug', slug).maybeSingle();
    if (error) console.error('Failed to load letter (service client)', error);
    else letter = data || null;
  } catch (e) {
    console.error('Error fetching letter (service client)', e);
  }

  if (!letter) return notFound();

  // Эта проверка теперь будет работать, т.к. 'user' корректный
  const isOwnerOrAdmin = user && (user.id === letter.authorId || String((user.user_metadata || {}).role || user.role || '').toUpperCase() === 'ADMIN');
  
  // Эта проверка - причина 404 (но теперь 'isOwnerOrAdmin' будет true)
  if (!letter.published && !isOwnerOrAdmin) return notFound();

  // ... (остальной код файла без изменений) ...
  let parsedBlocks: any[] = [];
  try {
    const raw = typeof letter.content === 'string' ? letter.content : JSON.stringify(letter.content);
    const parsed = JSON.parse(raw || '[]');
    parsedBlocks = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
  } catch (e) {
    console.error('Failed to parse letter content', e, letter.content);
  }

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
        <div>
          <ReadMoreOrLoginClient slug={slug} />
        </div>
      </div>
    </main>
  );
}
