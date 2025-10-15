// components/AdminAutoRedirect.tsx
"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from '@/components/AuthContext';

export default function AdminAutoRedirect() {
  const { session, isLoading } = useAuth();
  const status = isLoading ? 'loading' : (session ? 'authenticated' : 'unauthenticated');
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let mounted = true;
    // If not authenticated, nothing to do
    if (status !== 'authenticated' || !session) return;

    // Prefer server-detected role via /api/user/role (covers DB-mapped roles)
    const checkServerRole = async () => {
      try {
        // Rely on cookie-based same-origin auth. Do NOT send Authorization header here,
        // so middleware and server checks use the same auth surface.
        const res = await fetch('/api/user/role', { credentials: 'same-origin' });
        if (!mounted) return;
        if (!res.ok) return;
        const j = await res.json().catch(() => null);
        const role = j?.role || ((session as any)?.user?.role) || null;
        if (role && String(role).toUpperCase() === 'ADMIN') {
          if (pathname !== '/admin') router.replace('/admin');
        }
      } catch (e) {
        // ignore network/errors — do not block the app
      }
    };

    checkServerRole();

    return () => { mounted = false; };
  }, [status, session, pathname, router]);

  return null;
}
