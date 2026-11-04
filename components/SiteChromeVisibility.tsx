'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Local-only chrome suppression for the isolated owner workspace.
 * Public pages keep their header, footer and Pierrot untouched.
 */
export default function SiteChromeVisibility() {
  const pathname = usePathname() || '/';

  useEffect(() => {
    const ownerWorkspace =
      pathname === '/admin/pierrot' ||
      pathname.startsWith('/admin/pierrot/brain') ||
      pathname.startsWith('/admin/pierrot/flow') ||
      pathname.startsWith('/admin/pierrot/dash');

    if (ownerWorkspace) {
      document.body.setAttribute('data-pierrot-workspace', 'true');
    } else {
      document.body.removeAttribute('data-pierrot-workspace');
    }

    return () => {
      document.body.removeAttribute('data-pierrot-workspace');
    };
  }, [pathname]);

  return null;
}
