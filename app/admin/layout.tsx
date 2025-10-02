// app/admin/layout.tsx
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { redirect } from 'next/navigation';
import AdminNav from './AdminNav';
import { NotificationProvider } from '@/components/admin/NotificationSystem';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== 'ADMIN') {
    redirect('/');
  }

  return (
    <NotificationProvider>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <AdminNav />
        <main className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full">
          {children}
        </main>
      </div>
    </NotificationProvider>
  );
}
