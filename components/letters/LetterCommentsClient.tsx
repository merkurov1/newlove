// ===== ФАЙЛ: components/letters/LetterCommentsClient.tsx =====
// (ПОЛНЫЙ КОД С НОВОЙ ЛОГИКОЙ)

"use client";

import { useEffect, useState } from 'react';
// ----- НОВЫЙ ИМПОРТ -----
import { createClient } from '@/lib/supabase/client'; 

export default function LetterCommentsClient({ slug, serverContainerId }: { slug?: string; serverContainerId?: string }) {
    const [comments, setComments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ----- НОВЫЙ КЛИЕНТ -----
    const supabase = createClient(); 
    
    const [hasSession, setHasSession] = useState<boolean | null>(null);
    const [newContent, setNewContent] = useState('');
    const [posting, setPosting] = useState(false);

    useEffect(() => {
        let mounted = true;
        async function load() {
            setLoading(true);
            try {
                let theSlug = slug;
                if (!theSlug && typeof window !== 'undefined') {
                    const parts = window.location.pathname.split('/').filter(Boolean);
                    const idx = parts.indexOf('letters');
                    if (idx >= 0 && parts.length > idx + 1) theSlug = parts[idx + 1];
                }
                
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
                if (!theSlug) {
                    setError('missing_slug');
                    return;
                }
                // Мы не чинили /api/letters/.../comments, но он должен работать
                const res = await fetch(`/api/letters/${encodeURIComponent(theSlug)}/comments`, { credentials: 'same-origin' });
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
    // ----- ДОБАВИЛИ 'supabase' В ЗАВИСИМОСТИ -----
    }, [slug, supabase]); 

    // ... (остальной код handlePost и return без изменений) ...

    async function handlePost(e: any) {
        e.preventDefault();
        if (!newContent.trim()) return;
        setPosting(true);
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
            let postSlug = slug;
            if (!postSlug && typeof window !== 'undefined') {
                const parts = window.location.pathname.split('/').filter(Boolean);
                const idx = parts.indexOf('letters');
                if (idx >= 0 && parts.length > idx + 1) postSlug = parts[idx + 1];
            }
            if (!postSlug) {
                setError('missing_slug');
                setPosting(false);
                return;
            }
            const res = await fetch(`/api/letters/${encodeURIComponent(postSlug)}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: newContent }), credentials: 'same-origin' });
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
                     Комментарии доступны только для зарегистрированных пользователей. <a href="#" onClick={(e) => { e.preventDefault(); try { window.dispatchEvent(new Event('newlove:open-login')); } catch (er) {} }} className="text-blue-600 underline">Войдите</a> или <a href="#" onClick={(e) => { e.preventDefault(); try { window.dispatchEvent(new Event('newlove:open-login')); } catch (er) {} }} className="text-blue-600 underline">зарегистрируйтесь</a>.
                </div>
            )}
            {error && error !== 'unauthenticated' && <div className="text-sm text-red-600">Ошибка: {error}</div>}
            {!loading && !error && comments.length === 0 && <div className="text-sm text-gray-500 mb-3">Пока нет комментариев — будьте первым!</div>}

    
                 <ul className="space-y-4">
                {comments.map((c) => (
                    <li key={c.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                           <div className="text-sm text-gray-700 font-semibold">{c.author_display || 'Аноним'}</div>
                            <div className="text-xs text-gray-400">{new Date(c.created_at).toLocaleString()}</div>
                        </div>
                        <div className="text-gray-800">{c.content}</div>
                    </li>
                ))}
            </ul>

            <form onSubmit={handlePost} className="mt-6">
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-md">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Оставить комментарий</label>
                           <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)} className="w-full p-3 border border-gray-100 rounded-md resize-none focus:ring-2 focus:ring-blue-200" rows={4} placeholder="Поделитесь мыслями или отзывом..." />
                    <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                       <button disabled={posting || error === 'unauthenticated' || hasSession === false} type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md shadow">Отправить</button>
                            <button type="button" onClick={() => setNewContent('')} className="px-3 py-2 border rounded-md">Очистить</button>
                        </div>
                        <div className="text-xs text-gray-500">Будьте вежливы — соблюдайте правила 
                        сообщества</div>
                    </div>
                </div>
            </form>
        </div>
    );
}
