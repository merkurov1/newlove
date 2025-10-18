"use client";

import { useEffect, useState } from 'react';
import BlockRenderer from '@/components/BlockRenderer';

export default function LetterFullClient({ slug, initialTeaser, serverContainerId }: { slug: string; initialTeaser?: any[]; serverContainerId?: string }) {
    const [blocks, setBlocks] = useState<any[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        async function fetchFull() {
            setLoading(true);
            try {
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

        fetchFull();
        return () => { mounted = false; };
    }, [slug]);

    useEffect(() => {
        // If a server container was rendered, hide it when client mounts so
        // we don't visually duplicate the teaser when we render client-side
        // content. We hide it first and render the client-only full content
        // below.
        if (serverContainerId && typeof document !== 'undefined') {
            const el = document.getElementById(serverContainerId);
            if (el) el.style.display = 'none';
        }
    }, [serverContainerId]);

    return (
        <div>
            {loading && <div className="text-sm text-gray-500 mb-2">Загрузка полного текста...</div>}
            {error && <div className="text-sm text-red-600 mb-2">Ошибка: {error}</div>}
            {blocks && blocks.length > 0 ? <BlockRenderer blocks={blocks} /> : null}
        </div>
    );
}
