'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { isCustomFooterRoute } from '@/lib/temple/routes';

/**
 * Local-only chrome suppression for the isolated owner workspace.
 * Public pages keep their header, footer and Pierrot untouched.
 */
export default function SiteChromeVisibility() {
  const pathname = usePathname() || '/';

  useEffect(() => {
    const ownerWorkspace =
      pathname === '/admin/pierrot' || pathname.startsWith('/admin/pierrot/');

    if (ownerWorkspace) {
      document.body.setAttribute('data-pierrot-workspace', 'true');
    } else {
      document.body.removeAttribute('data-pierrot-workspace');
    }

    if (isCustomFooterRoute(pathname)) {
      document.body.classList.add('custom-footer-route');
    } else {
      document.body.classList.remove('custom-footer-route');
    }

    return () => {
      document.body.removeAttribute('data-pierrot-workspace');
      document.body.classList.remove('custom-footer-route');
    };
  }, [pathname]);

  return null;
}
