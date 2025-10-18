// ===== ФАЙЛ: components/letters/ReadMoreOrLoginClient.tsx =====
// (ПОЛНЫЙ КОД С НОВОЙ ЛОГИКОЙ)

"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
// ----- НОВЫЙ ИМПОРТ -----
import { createClient } from '@/lib/supabase/client';
import ModernLoginModal from '@/components/ModernLoginModal';

export default function ReadMoreOrLoginClient({ slug }: { slug: string }) {
    const [hasSession, setHasSession] = useState<boolean | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    // ----- НОВЫЙ КЛИЕНТ -----
    const supabase = createClient();

    useEffect(() => {
        let mounted = true;
        async function check() {
            try {
                const { data } = await supabase.auth.getSession();
                const s = (data as any)?.session || null;
                if (!mounted) return;
                setHasSession(!!(s && s.user));
            } catch (e) {
                if (mounted) setHasSession(false);
            }
        }

        check();
        return () => { mounted = false; };
    }, [slug, supabase]); // <-- Добавили supabase в зависимости

    // ... (остальной код без изменений) ...

    if (hasSession === null) {
        return (
            <div className="flex gap-3">
                <div className="px-4 py-2 bg-gray-100 rounded animate-pulse w-24 h-9" />
                <div className="px-4 py-2 border rounded w-24 h-9" />
            </div>
        );
    }

    const handleOpen = () => {
        if (typeof window !== 'undefined') {
            try { localStorage.setItem('login_redirect_path', window.location.pathname + window.location.search); } catch (e) { }
            try { window.dispatchEvent(new Event('newlove:close-mobile-menu')); } catch (e) { }
        }
        setModalOpen(true);
    };

    const handleReadFull = async (e: any) => {
        e.preventDefault();
        try {
            // Use same-origin credentials so server can read cookies/session
            const res = await fetch(`/api/letters/full/${encodeURIComponent(slug)}?_debug=1`, { credentials: 'same-origin', cache: 'no-store' });
            if (!res) {
                handleOpen();
                return;
            }
            if (res.status === 200) {
                // Navigate via location to force full page load (server rendering)
                window.location.href = `/letters/${slug}/full`;
                return;
            }
            if (res.status === 401) {
                // not authenticated — open login modal
                handleOpen();
                return;
            }
            if (res.status === 404) {
                // Not available to this viewer
                alert('Страница с полным текстом недоступна.');
                return;
            }
            // Any other non-200 -> open login modal as a safe fallback
            handleOpen();
        } catch (err) {
            console.warn('Preflight check failed, opening login modal as fallback', err);
            handleOpen();
        }
    };

    return (
        <div className="flex gap-3">
            {hasSession ? (
                <a href={`/letters/${slug}/full`} onClick={handleReadFull} className="px-4 py-2 bg-blue-600 text-white rounded">Читать дальше</a>
            ) : (
                <>
                    <button onClick={handleOpen} className="px-4 py-2 border rounded">Войти</button>
                    {modalOpen && <ModernLoginModal onClose={() => setModalOpen(false)} />}
                </>
            )}
        </div>
    );
}
