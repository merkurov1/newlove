"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient as createBrowserClient } from '@/lib/supabase-browser';
import ModernLoginModal from '@/components/ModernLoginModal';

export default function ReadMoreOrLoginClient({ slug }: { slug: string }) {
    const [hasSession, setHasSession] = useState<boolean | null>(null);
    const [modalOpen, setModalOpen] = useState(false);

    useEffect(() => {
        let mounted = true;
        async function check() {
            try {
                const supabase = createBrowserClient();
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
    }, [slug]);

    if (hasSession === null) {
        // while determining, render neutral placeholder to avoid layout shift
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

    // Before navigating to the full page, do a small preflight check to ensure
    // the server-side route allows access. This prevents the App Router from
    // mounting a page that would immediately throw because of serialization
    // or auth issues. The preflight is only used for logged-in users.
    const handleReadFull = async (e: any) => {
        e.preventDefault();
        try {
            const res = await fetch(`/api/letters/full/${encodeURIComponent(slug)}?_debug=1`, { credentials: 'same-origin' });
            if (res.status === 200) {
                // Allowed -> navigate
                window.location.href = `/letters/${slug}/full`;
                return;
            }
            if (res.status === 401) {
                // Not actually authenticated server-side -> open login modal
                handleOpen();
                return;
            }
            if (res.status === 404) {
                alert('Страница с полным текстом пока недоступна.');
                return;
            }
            // Other errors: open login as fallback
            handleOpen();
        } catch (err) {
            // Network or other errors: fall back to direct navigation
            try { window.location.href = `/letters/${slug}/full`; } catch (e) { handleOpen(); }
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
