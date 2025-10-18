// ===== ФАЙЛ: app/letters/[slug]/full/page.tsx =====
// (ПОЛНЫЙ КОД С НОВОЙ ЛОГИКОЙ)

import { notFound, redirect } from 'next/navigation';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import BlockRenderer from '@/components/BlockRenderer';
import dynamicImport from 'next/dynamic';
import serializeForClient from '@/lib/serializeForClient';

// ----- НОВЫЙ ИМПОРТ -----
import { createClient } from '@/lib/supabase/server';

const LetterCommentsClient = dynamicImport(() => import('@/components/letters/LetterCommentsClient'), { ssr: false });
type Props = { params: { slug: string } };

export async function generateMetadata({ params }: { params: { slug: string } }) {
    const slug = params.slug;
    return sanitizeMetadata({ title: `Письмо — ${slug}` });
}

export default async function LetterFullPage({ params }: Props) {
    const { slug } = params;

    // ----- НОВАЯ, ПРОСТАЯ ЛОГИКА АУТЕНТИФИКАЦИИ -----
    const supabase = createClient(); // Обычный клиент
    const { data: { user } } = await supabase.auth.getUser(); // Получаем user

    // Service-role клиент для чтения
    const supabaseService = createClient({ useServiceRole: true });
    let letter: any = null;

    try {
        const { data, error } = await supabaseService.from('letters').select('*').eq('slug', slug).maybeSingle();
        if (error) console.error('Failed to load letter (service client)', error);
        else letter = data || null;
    } catch (e) {
        console.error('Error fetching letter (service client)', e);
    }

    if (!letter) return notFound();

    // Эта проверка теперь будет работать
    const isOwnerOrAdmin = user && (user.id === letter.authorId || String((user.user_metadata || {}).role || user.role || '').toUpperCase() === 'ADMIN');
    if (!letter.published && !isOwnerOrAdmin) return notFound();

    // Эта проверка (на 'user') теперь тоже будет работать
    if (!user) {
        const loginUrl = `/you/login?next=${encodeURIComponent(`/letters/${slug}/full`)}`;
        redirect(loginUrl);
    }

    // ... (остальной код без изменений) ...
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
