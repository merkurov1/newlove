// ===== ФАЙЛ: app/letters/[slug]/full/page.tsx =====
// (ПОЛНЫЙ КОД С ОТКАТОМ К СТАРЫМ ХЕЛПЕРАМ)

import { notFound, redirect } from 'next/navigation';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

// ----- ИСПРАВЛЕНИЕ 1: ИСПОЛЬЗУЕМ СТАРЫЕ, РАБОЧИЕ ХЕЛПЕРЫ -----
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import { getServerSupabaseClient } from '@/lib/serverAuth'; // <-- Рабочий хелпер

import { cookies } from 'next/headers';
import BlockRenderer from '@/components/BlockRenderer';

// ----- ИСПРАВЛЕНИЕ 2: Переименовываем импорт -----
import dynamicImport from 'next/dynamic'; 

import serializeForClient from '@/lib/serializeForClient';

const LetterCommentsClient = dynamicImport(() => import('@/components/letters/LetterCommentsClient'), { ssr: false });
type Props = { params: { slug: string } };

export async function generateMetadata({ params }: { params: { slug: string } }) {
    const slug = params.slug;
    return sanitizeMetadata({ title: `Письмо — ${slug}` });
}

export default async function LetterFullPage({ params }: Props) {
    const { slug } = params;

    // ----- ИСПРАВЛЕНИЕ 3: Возвращаем ОРИГИНАЛЬНУЮ логику -----
    // (которая была в твоих файлах)
    let req: Request | null = (globalThis && (globalThis as any).request) || null;
    if (!req) {
        const cookieHeader = cookies()
            .getAll()
            .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
            .join('; ');
        req = new Request('http://localhost', { headers: { cookie: cookieHeader } });
    }

    // Эта функция была сломана, но мы ее починим в lib/getUserAndSupabaseForRequest.ts
    const ctx = await getUserAndSupabaseForRequest(req) || {};
    const { user } = ctx as any;

    // Используем service-role клиент (он у нас работает)
    let letter: any = null;
    try {
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

    // Эта проверка теперь должна сработать
    const isOwnerOrAdmin = user && (user.id === letter.authorId || String((user.user_metadata || {}).role || user.role || '').toUpperCase() === 'ADMIN');
    if (!letter.published && !isOwnerOrAdmin) return notFound();

    // Эта проверка теперь не должна перекидывать
    if (!user) {
        const loginUrl = `/you/login?next=${encodeURIComponent(`/letters/${slug}/full`)}`;
        redirect(loginUrl);
    }

    // ... остальной код без изменений ...

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

// Оставляем это, чтобы страница не кешировалась
export const dynamic = 'force-dynamic';
