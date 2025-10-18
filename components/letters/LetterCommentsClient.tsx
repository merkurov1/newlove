"use client";

import { useEffect, useState } from 'react';
import { createClient as createBrowserClient } from '@/lib/supabase-browser';

export default function LetterCommentsClient({ slug }: { slug: string }) {
    const [comments, setComments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const supabase = createBrowserClient();
    const [hasSession, setHasSession] = useState<boolean | null>(null);
    const [newContent, setNewContent] = useState('');
    const [posting, setPosting] = useState(false);

    useEffect(() => {
        let mounted = true;
        async function load() {
            setLoading(true);
            try {
                // Check local client session first; if not authenticated, avoid
                // hitting the API and show the login prompt.
                const { data } = await supabase.auth.getSession();
                const s = (data as any)?.session || null;
                if (!mounted) return;
                if (!s || !s.user) {
                    setHasSession(false);
                    setComments([]);
                    setError('unauthenticated');
                    return;
                }
                setHasSession(true);

                const res = await fetch(`/api/letters/${encodeURIComponent(slug)}/comments`, { credentials: 'same-origin' });
                if (res.status === 401) {
                    if (mounted) {
                        setComments([]);
                        setError('unauthenticated');
                    }
                    return;
                }
                const json = await res.json();
                if (mounted) setComments(json.comments || []);
            } catch (e) {
                if (mounted) setError(String(e));
            } finally {
                if (mounted) setLoading(false);
            }
        }
        load();
        return () => { mounted = false; };
    }, [slug]);

    async function handlePost(e: any) {
        e.preventDefault();
        if (!newContent.trim()) return;
        setPosting(true);
        // Ensure user is authenticated before posting
        try {
            const { data } = await supabase.auth.getSession();
            const s = (data as any)?.session || null;
            if (!s || !s.user) {
                setError('unauthenticated');
                setPosting(false);
                return;
            }

            const optimistic = { id: `tmp-${Date.now()}`, content: newContent, created_at: new Date().toISOString(), author_display: 'Вы' };
            setComments((c) => [...c, optimistic]);
            const res = await fetch(`/api/letters/${encodeURIComponent(slug)}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: newContent }), credentials: 'same-origin' });
            const json = await res.json();
            if (json && json.comment) {
                setComments((c) => c.map((it) => (it.id === optimistic.id ? json.comment : it)));
            }
            setNewContent('');
        } catch (e) {
            setError(String(e));
        } finally {
            setPosting(false);
        }
    }

    return (
        <div className="mt-8">
            <h3 className="text-lg font-semibold mb-3">Комментарии</h3>
            {loading && <div className="text-sm text-gray-500">Загрузка комментариев...</div>}
            {error === 'unauthenticated' && (
                <div className="text-sm text-gray-600 mb-3">
                    Комментарии доступны только для зарегистрированных пользователей. <a href="/you/login" className="text-blue-600 underline">Войдите</a> или <a href="/onboard" className="text-blue-600 underline">зарегистрируйтесь</a>.
                </div>
            )}
            {error && error !== 'unauthenticated' && <div className="text-sm text-red-600">Ошибка: {error}</div>}
            {!loading && !error && comments.length === 0 && <div className="text-sm text-gray-500 mb-3">Пока нет комментариев — будьте первым!</div>}
            <ul className="space-y-4">
                {comments.map((c) => (
                    <li key={c.id} className="bg-white/90 p-3 rounded border border-gray-100">
                        <div className="text-sm text-gray-700 mb-1">{c.author_display || 'Аноним'}</div>
                        <div className="text-gray-800">{c.content}</div>
                        <div className="text-xs text-gray-400 mt-2">{new Date(c.created_at).toLocaleString()}</div>
                    </li>
                ))}
            </ul>

            <form onSubmit={handlePost} className="mt-4">
                <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} className="w-full p-2 border rounded resize-none" rows={3} placeholder="Оставить комментарий..." />
                <div className="mt-2 flex items-center gap-2">
                    <button disabled={posting || error === 'unauthenticated' || hasSession === false} type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">Отправить</button>
                    <button type="button" onClick={() => setNewContent('')} className="px-3 py-2 border rounded">Очистить</button>
                </div>
            </form>
        </div>
    );
}
