import { metadata as rootMetadata } from '@/app/layout';
import { requireAdmin } from '@/lib/serverAuth';
import { redirect } from 'next/navigation';
import AdminNav from './AdminNav';

export const metadata = {
  title: {
    default: 'Admin — ' + (rootMetadata?.title?.default || 'Site'),
    template: '%s | Admin',
  },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Protect every admin page before it can query or render privileged data.
  // Middleware is deliberately not the source of truth because it runs in the
  // Edge runtime; this server layout has access to the authenticated session.
  try {
    await requireAdmin();
  } catch {
    redirect('/403');
  }

  // Keep admin layout minimal but ensure it provides a container and spacing
  // consistent with the root layout so pages don't jump styling-wise.
  return (
    <div
      className="min-h-screen bg-white"
      style={{ fontFamily: 'Inter, Helvetica, Arial, sans-serif', fontSize: 18, lineHeight: 1.7, color: '#222' }}
    >
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 pb-8 pt-28 lg:gap-8 lg:px-8">
        <AdminNav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
