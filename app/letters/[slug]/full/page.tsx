// ===== ФАЙЛ: app/letters/[slug]/full/page.tsx =====
// (ПОЛНЫЙ КОД С ИЗМЕНЕНИЯМИ)

import { notFound, redirect } from 'next/navigation';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
// import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest'; // <- УДАЛИТЬ
import { cookies } from 'next/headers';
import BlockRenderer from '@/components/BlockRenderer';
import dynamicImport from 'next/dynamic';
import serializeForClient from '@/lib/serializeForClient';
import { createServerClient } from '@/lib/supabase/server'; // <-- НОВЫЙ ИМПОРТ

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

    // *** КЛЮЧЕВОЙ МОМЕНТ ***
    // Эта проверка теперь будет работать, так как 'user' будет корректно определен
    if (!user) {
        const loginUrl = `/you/login?next=${encodeURIComponent(`/letters/${slug}/full`)}`;
        redirect(loginUrl);
    }

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

export const dynamic = 'force-dynamic';
