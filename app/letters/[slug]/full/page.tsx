import { notFound } from 'next/navigation';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import { cookies } from 'next/headers';
import BlockRenderer from '@/components/BlockRenderer';
import dynamicImport from 'next/dynamic';

const LetterCommentsClient = dynamicImport(() => import('@/components/letters/LetterCommentsClient'), { ssr: false });

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: { params: { slug: string } }) {
    const slug = params.slug;
    return sanitizeMetadata({ title: `Письмо — ${slug}` });
}

export default async function LetterFullPage({ params }: Props) {
    const { slug } = params;

    // Build cookie-aware Request for server-scoped session detection
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

    // If unpublished, require owner/admin
    const isOwnerOrAdmin = user && (user.id === letter.authorId || String((user.user_metadata || {}).role || user.role || '').toUpperCase() === 'ADMIN');
    if (!letter.published && !isOwnerOrAdmin) return notFound();

    // Require authenticated user for full view and comments
    if (!user) {
        // Server redirect to login page preserving current URL
        const loginUrl = `/you/login?next=${encodeURIComponent(`/letters/${slug}/full`)}`;
        return new Response(null, { status: 302, headers: { Location: loginUrl } }) as any;
    }

    let parsedBlocks = [];
    try {
        const raw = typeof letter.content === 'string' ? letter.content : JSON.stringify(letter.content);
        const parsed = JSON.parse(raw || '[]');
        parsedBlocks = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
        // Deep-clone to strip any non-plain prototypes (Dates, class instances)
        parsedBlocks = JSON.parse(JSON.stringify(parsedBlocks));
    } catch (e) {
        console.error('Failed to parse letter content', e, letter.content);
    }

    return (
        <main className="max-w-3xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-bold mb-4">{letter.title}</h1>
            <div className="prose mb-6">
                {parsedBlocks.length > 0 ? <BlockRenderer blocks={parsedBlocks} /> : <p className="italic text-gray-500">Содержимое отсутствует.</p>}
            </div>

            <div className="mt-10 mb-6 border-t border-gray-200" />

            <LetterCommentsClient />
        </main>
    );
}

export const dynamic = 'force-dynamic';
