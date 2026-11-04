'use client';

import { usePathname } from 'next/navigation';
import AdminNav from './AdminNav';

const WORKSPACE_PATHS = new Set([
  '/admin/pierrot',
  '/admin/pierrot/brain',
  '/admin/pierrot/flow',
  '/admin/pierrot/dash',
  '/admin/pierrot/settings',
]);

function isOwnerWorkspace(pathname: string): boolean {
  if (WORKSPACE_PATHS.has(pathname)) return true;

  return ['/brain', '/flow', '/dash', '/settings'].some((suffix) =>
    pathname.startsWith(`/admin/pierrot${suffix}/`)
  );
}

/**
 * Keeps the legacy admin chrome untouched everywhere except the isolated
 * Pierrot owner workspace. The public site is never affected.
 */
export default function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '';

  if (isOwnerWorkspace(pathname)) {
    return <>{children}</>;
  }

  return (
    <div
      className="min-h-screen bg-[#FAF9F7] text-[#211F1F]"
      style={{
        fontFamily: 'Inter, Helvetica, Arial, sans-serif',
        fontSize: 15,
        lineHeight: 1.55,
      }}
    >
      <div className="mx-auto grid max-w-[1680px] grid-cols-1 gap-6 px-4 pb-12 pt-28 sm:px-6 lg:grid-cols-[224px_minmax(0,1fr)] lg:gap-10 lg:px-10 lg:pt-28">
        <AdminNav />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
