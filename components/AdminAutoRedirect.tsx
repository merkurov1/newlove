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
    // Only auto-redirect admins to /admin when they land on the site's root/home page.
    // Previously we redirected from any page which caused surprising UX where admins
    // were bounced out of sections they were visiting. Limit the redirect to the
    // homepage so admins coming from other pages are not forced away.
    const allowedAutoRedirectPaths = ['/', ''];
  const currentPath = pathname || '/';
  if (!allowedAutoRedirectPaths.includes(currentPath)) return;

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
          // Detected ADMIN role. Do NOT perform an automatic redirect here.
          // Automatic redirects caused surprising UX (users being bounced away
          // from pages they were viewing). Let the UI surface an explicit
          // action/link to go to the admin area instead.
          // If you need an explicit auto-redirect, use a query param like
          // ?go_admin=1 or a user action to navigate programmatically.
          if (process.env.NODE_ENV === 'development') {
            // Helpful debug message for developers
            // eslint-disable-next-line no-console
            console.debug('[AdminAutoRedirect] admin detected, auto-redirect suppressed');
          }
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
