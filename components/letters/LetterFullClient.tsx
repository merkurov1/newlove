"use client";

import { useEffect, useState } from 'react';
import BlockRenderer from '@/components/BlockRenderer';
import { createClient as createBrowserClient } from '@/lib/supabase-browser';

export default function LetterFullClient({ slug, initialTeaser, serverContainerId }: { slug: string; initialTeaser?: any[]; serverContainerId?: string }) {
    const [blocks, setBlocks] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const supabase = createBrowserClient();
    const [hasSession, setHasSession] = useState<boolean | null>(null);

    useEffect(() => {
        let mounted = true;
        async function checkAndFetch() {
            setLoading(true);
            try {
                // Check client session first to avoid unnecessary fetches and to
                // ensure we only hide the server-rendered teaser for authenticated viewers.
                const { data } = await supabase.auth.getSession();
                const s = (data as any)?.session || null;
                if (!mounted) return;
                if (!s || !s.user) {
                    // Not authenticated — do not attempt to fetch full content.
                    setHasSession(false);
                    return;
                }
                setHasSession(true);

                const res = await fetch(`/api/letters/full/${encodeURIComponent(slug)}`, { credentials: 'same-origin' });
                if (res.status === 200) {
                    const data = await res.json();
                    if (mounted) setBlocks(data.blocks || []);
                } else if (res.status === 401) {
                    // unauthenticated - keep teaser
                } else {
                    const json = await res.json().catch(() => ({}));
                    setError(json.error || 'failed');
                }
            } catch (e) {
                setError(String(e));
            } finally {
                if (mounted) setLoading(false);
            }
        }

        checkAndFetch();
        return () => { mounted = false; };
    }, [slug, supabase]);

    useEffect(() => {
        // Only hide the server container if we're actually replacing it with
        // client-rendered content (i.e. authenticated user and blocks are
        // available or being loaded). This prevents guests from seeing an
        // empty area when the client does not fetch full content.
        if (!serverContainerId || typeof document === 'undefined') return;
        const el = document.getElementById(serverContainerId);
        if (!el) return;
        // If we determined there is no session, keep the server teaser visible.
        if (hasSession === false) return;
        // If we have blocks (or we are loading and expecting blocks), hide the server teaser.
        if (blocks && blocks.length > 0) {
            el.style.display = 'none';
        } else if (hasSession === true && !loading && !error) {
            // If user is authenticated but there are no blocks, still hide
            // the server teaser (empty content will be shown client-side).
            el.style.display = 'none';
        }
    }, [serverContainerId, blocks, loading, error, hasSession]);

    return (
        <div>
            {loading && <div className="text-sm text-gray-500 mb-2">Загрузка полного текста...</div>}
            {error && <div className="text-sm text-red-600 mb-2">Ошибка: {error}</div>}
            {blocks && blocks.length > 0 ? <BlockRenderer blocks={blocks} /> : null}
        </div>
    );
}
