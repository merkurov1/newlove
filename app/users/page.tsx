import UsersClient from '@/components/UsersClient';
import { getServerSupabaseClient, requireAdmin } from '@/lib/serverAuth';
import { redirect } from 'next/navigation';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const metadata = sanitizeMetadata({
  title: 'Users Directory',
  robots: { index: false, follow: false },
});

interface UserItem {
  id: string;
  name: string;
  email: string;
  image: string;
  role: string;
  _count: { articles: number; projects: number };
}

export default async function UsersPage() {
  try {
    await requireAdmin();
  } catch {
    redirect('/403');
  }

  // Получаем клиент Supabase с правами администратора (service role)
  const supabase = (getServerSupabaseClient as any)({ useServiceRole: true });

  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    throw new Error(error.message);
  }

  const ids = (data?.users || []).map((u: any) => u.id);
  const appRoles = new Map<string, string>();

  if (ids.length > 0) {
    const { data: rows } = await supabase.from('users').select('id,role,name').in('id', ids);

    for (const row of rows || []) {
      if (typeof row.id === 'string') {
        appRoles.set(row.id, String(row.role || 'USER').toUpperCase());
      }
    }
  }

  // Преобразуем пользователей с явной типизацией
  const users: UserItem[] = (data?.users || []).map((u: any) => ({
    id: u.id,
    name: u.user_metadata?.name || u.email?.split('@')[0] || 'User',
    email: u.email || '',
    image: u.user_metadata?.image || '',
    role: appRoles.get(u.id) === 'ADMIN' ? 'ADMIN' : 'USER',
    _count: { articles: 0, projects: 0 },
  }));

  // Безопасная сортировка по имени с явными типами
  users.sort((a: UserItem, b: UserItem) => a.name.localeCompare(b.name));

  return <UsersClient users={users} />;
}
