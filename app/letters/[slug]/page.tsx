// ===== ФАЙЛ: app/letters/[slug]/page.tsx =====
// (ПОЛНЫЙ КОД С ОТКАТОМ К СТАРОМУ ХЕЛПЕРУ)

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

// ----- ИСПРАВЛЕНИЕ 1: Переименовываем импорт -----
import dynamicImport from 'next/dynamic'; // Было 'import dynamic ...'

// Используем 'dynamicImport' для загрузки компонента
const ReadMoreOrLoginClient = dynamicImport(() => import('@/components/letters/ReadMoreOrLoginClient'), { ssr: false });

// ----- ИСПРАВЛЕНИЕ 2: УДАЛЯЕМ 'cookies' и 'createServerClient' -----
// import { cookies } from 'next/headers'; 
// import { createServerClient } from '@/lib/supabase/server'; 

// ----- ИСПРАВЛЕНИЕ 3: ИМПОРТИРУЕМ СТАРЫЙ, РАБОЧИЙ ХЕЛПЕР -----
import { getServerSupabaseClient } from '@/lib/serverAuth'; // <-- ВОТ ОН

import BlockRenderer from '@/components/BlockRenderer';
import serializeForClient from '@/lib/serializeForClient';

// Мы по-прежнему оставляем это, чтобы страница не кешировалась
export const dynamic = 'force-dynamic';

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  return sanitizeMetadata({ title: `Письмо — ${slug}` });
}

export default async function LetterPage({ params }: Props) {
  const { slug } = params;

  // ----- ИСПРАВЛЕНИЕ 4: Используем СТАРЫЙ хелпер для загрузки письма -----
  let letter: any = null;
  try {
    const svc = getServerSupabaseClient({ useServiceRole: true }); // <-- СТАРЫЙ ХЕЛПЕР
    const { data, error } = await svc.from('letters').select('*').eq('slug', slug).maybeSingle();
    if (error) {
      console.error('Failed to load letter (service client)', error);
    } else {
      letter = data || null;
    }
  } catch (e) {
    console.error('Error fetching letter (service client)', e);
  }

  if (!letter) return notFound(); // <-- Это твой 404

  // ----- ИСПРАВЛЕНИЕ 5: ВРЕМЕННО УБИРАЕМ ПРОВЕРКУ НА АДМИНА -----
  // (Потому что старый хелпер не получает 'user' так же легко)
  // const isOwnerOrAdmin = user && (user.id === letter.authorId || ...);
  
  // Оставляем только проверку на 'published'.
  // Архив все равно отдает только опубликованные письма.
  if (!letter.published) return notFound();

  // ... остальной код файла без изменений ...

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
