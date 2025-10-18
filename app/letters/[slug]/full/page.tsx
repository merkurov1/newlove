// ===== ФАЙЛ: app/letters/[slug]/full/page.tsx =====
// (ПОЛНЫЙ ЧИСТЫЙ КОД)

import { notFound, redirect } from 'next/navigation';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { cookies } from 'next/headers';
import BlockRenderer from '@/components/BlockRenderer';

// Переименованный импорт, чтобы избежать конфликта
import dynamicImport from 'next/dynamic';

import serializeForClient from '@/lib/serializeForClient';
// Наш новый хелпер
import { createServerClient } from '@/lib/supabase/server'; 

// Динамическая загрузка компонента комментариев
const LetterCommentsClient = dynamicImport(() => import('@/components/letters/LetterCommentsClient'), { ssr: false });

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: { params: { slug: string } }) {
    const slug = params.slug;
    return sanitizeMetadata({ title: `Письмо — ${slug}` });
}

export default async function LetterFullPage({ params }: Props) {
    const { slug } = params;

    // Новая логика получения пользователя и Supabase
    const cookieStore = cookies();
    const supabase = createServerClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();

    // Используем service-role клиент
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

    // Проверка на владельца/админа
    const isOwnerOrAdmin = user && (user.id === letter.authorId || String((user.user_metadata || {}).role || user.role || '').toUpperCase() === 'ADMIN');
    if (!letter.published && !isOwnerOrAdmin) return notFound();

    // Эта проверка теперь будет работать корректно
    if (!user) {
        const loginUrl = `/you/login?next=${encodeURIComponent(`/letters/${slug}/full`)}`;
        redirect(loginUrl);
    }

    let parsedBlocks: any[] = [];
    try {
        const raw = typeof letter.content === 'string' ? letter.content : JSON.stringify(letter.content);
        const parsed = JSON.parse(raw || '[]');
        parsedBlocks = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    } catch (e) {
        console.error('Failed to parse letter content', e, letter.content);
    }

    // Sanitize blocks for client transfer
    const safeParsed = serializeForClient(parsedBlocks || []) || [];

    return (
        <main className="max-w-3xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold mb-4">{letter.title}</h1>
            <div className="prose mb-6">
                {safeParsed.length > 0 ? <BlockRenderer blocks={safeParsed} /> : <p className="italic text-gray-500">Содержимое отсутствует.</p>}
            </div>

            <div className="mt-10 mb-6 border-t border-gray-200" />
 
           <LetterCommentsClient />
        </main>
    );
}

// Эта строка заставляет страницу рендериться динамически
export const dynamic = 'force-dynamic';
