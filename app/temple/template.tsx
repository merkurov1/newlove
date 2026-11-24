'use client';

import { usePathname } from 'next/navigation';
import TemplePageTransition from '@/components/TemplePageTransition';

export default function TempleTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() || '';
  const isTempleRoute =
    pathname === '/temple' || pathname.startsWith('/temple/');

  /*
   * Ritual modals are intercepted above /temple while the URL changes to the
   * ritual path. Keep the Temple motion key stable in that case so the page
   * stays mounted, visible and focusable behind the compact modal.
   */
  return (
    <TemplePageTransition
      routeKey={isTempleRoute ? pathname : '/temple'}
    >
      {children}
    </TemplePageTransition>
  );
}
