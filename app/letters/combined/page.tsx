import LettersArchive from '@/components/letters/LettersArchive';
import PostcardShop from '@/components/letters/PostcardShop';
import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import ReadMoreOrLoginClient from '@/components/letters/ReadMoreOrLoginClient';
import { parseRichTextContent } from '@/lib/contentParser';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const dynamic = 'force-dynamic';

export const metadata = sanitizeMetadata({
    title: 'Письма и открытки (combined) | Anton Merkurov',
    description: 'Консолидированная версия страниц архивов и писем для быстрого просмотра',
});

interface Props {
    params?: { slug?: string };
}

// Helper: render archive (copied from app/letters/page.tsx)
function ArchiveView() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-100 py-8 px-2">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-8">
                    <h1 className="text-2xl md:text-3xl font-medium text-gray-900 mb-2">📮 Письма и открытки (Сводная)</h1>
                    <p className="text-base text-gray-600 max-w-2xl mx-auto">
                        Архив авторской рассылки и заказ физических открыток — объединённая копия
                    </p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
                    <div className="space-y-6">
                        <div className="bg-white/90 backdrop-blur-sm border border-blue-50 rounded-2xl shadow-sm hover:shadow-md p-5 transition-all duration-200">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                    <span className="text-2xl">📧</span>
                                </div>
                                <h2 className="text-lg font-medium text-gray-900">Архив рассылки</h2>
                            </div>
                            <LettersArchive />
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="bg-white/90 backdrop-blur-sm border border-orange-50 rounded-2xl shadow-sm hover:shadow-md p-5 transition-all duration-200">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                                    <span className="text-2xl">🎨</span>
                                </div>
                                <h2 className="text-lg font-medium text-gray-900">Авторские открытки</h2>
                            </div>
                            <PostcardShop />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Helper: preview view (copied from app/letters/[slug]/page.tsx)
async function PreviewView({ slug }: { slug: string }) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    // If user logged in, redirect to full
    if (user) {
        redirect(`/letters/${slug}/full`);
    }

    const supabasePublic = createClient({ useServiceRole: true });
    const { data: letter, error } = await supabasePublic
        .from('letters')
        .select('id, title, slug, content, published, publishedAt, createdAt, authorId, users(name, email)')
        .eq('slug', slug)
        .eq('published', true)
        .single();

    if (error || !letter) {
        console.error('Letter fetch error:', error);
        notFound();
    }

    const letterAuthor = Array.isArray(letter.users) ? letter.users[0] : letter.users;
    const plainContent = parseRichTextContent(letter.content || '');
    const previewContent = plainContent.slice(0, 300);
    const hasMore = plainContent.length > 300;

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
            <div className="max-w-3xl mx-auto px-4 py-12">
                <article className="bg-white rounded-2xl shadow-sm border border-blue-100 p-8">
                    <header className="mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 mb-3">{letter.title}</h1>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span>{letterAuthor?.name || letterAuthor?.email?.split('@')[0] || 'Автор'}</span>
                            <span>•</span>
                            <time dateTime={letter.publishedAt || letter.createdAt}>{new Date(letter.publishedAt || letter.createdAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
                        </div>
                    </header>
                    <div className="prose prose-lg max-w-none">
                        <div className="text-gray-700 leading-relaxed">{previewContent}{hasMore && '...'}</div>
                    </div>
                    {hasMore && (
                        <div className="mt-8 pt-8 border-t border-gray-200">
                            <ReadMoreOrLoginClient />
                        </div>
                    )}
                </article>
            </div>
        </div>
    );
}

// Helper: full view (copied from app/letters/[slug]/full/page.tsx)
async function FullView({ slug }: { slug: string }) {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        redirect(`/letters/${slug}`);
    }

    const { data: letter, error } = await supabase
        .from('letters')
        .select('id, title, slug, content, published, publishedAt, createdAt, authorId, users(name, email)')
        .eq('slug', slug)
        .eq('published', true)
        .single();

    if (error || !letter) {
        console.error('Letter fetch error:', error);
        notFound();
    }

    const letterAuthor = Array.isArray(letter.users) ? letter.users[0] : letter.users;
    const { data: comments } = await supabase
        .from('letter_comments')
        .select('id, content, created_at, user_id, author_display, users(name, email)')
        .eq('letter_id', letter.id)
        .eq('is_public', true)
        .order('created_at', { ascending: true });

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
            <div className="max-w-3xl mx-auto px-4 py-12">
                <Link href="/letters" className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-6 text-sm">← Вернуться к архиву</Link>
                <article className="bg-white rounded-2xl shadow-sm border border-blue-100 p-8 mb-8">
                    <header className="mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 mb-3">{letter.title}</h1>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span>{letterAuthor?.name || letterAuthor?.email?.split('@')[0] || 'Автор'}</span>
                            <span>•</span>
                            <time dateTime={letter.publishedAt || letter.createdAt}>{new Date(letter.publishedAt || letter.createdAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
                        </div>
                    </header>
                    <div className="prose prose-lg max-w-none">
                        <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">{letter.content}</div>
                    </div>
                </article>

                <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-8">
                    <h2 className="text-xl font-semibold text-gray-900 mb-6">Комментарии {comments && comments.length > 0 && `(${comments.length})`}</h2>
                    {comments && comments.length > 0 ? (
                        <div className="space-y-6">
                            {comments.map((comment: any) => {
                                const commentUser = Array.isArray(comment.User) ? comment.User[0] : comment.User;
                                return (
                                    <div key={comment.id} className="border-b border-gray-100 last:border-0 pb-6 last:pb-0">
                                        <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium">{(comment.author_display || commentUser?.name || commentUser?.email)?.[0]?.toUpperCase() || 'U'}</div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="font-medium text-gray-900">{comment.author_display || commentUser?.name || commentUser?.email?.split('@')[0] || 'Пользователь'}</span>
                                                    <span className="text-xs text-gray-400">{new Date(comment.created_at).toLocaleDateString('ru-RU', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                                                </div>
                                                <p className="text-gray-700 whitespace-pre-wrap">{comment.content}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-gray-500 text-center py-8">Пока нет комментариев. Будьте первым!</p>
                    )}
                </div>
            </div>
        </div>
    );
}

// Default: if params.slug provided -> show preview/full, else show archive
export default async function CombinedPage({ params }: Props) {
    const slug = params?.slug as string | undefined;
    if (!slug) return ArchiveView();
    // if slug present, render preview; if user logged in, preview code redirects to full
    return await PreviewView({ slug });
}
