import UsersClient from '@/components/UsersClient';
import { getServerSupabaseClient } from '@/lib/serverAuth';

interface UserItem {
  id: string;
  name: string;
  email: string;
  image: string;
  role: string;
  _count: { articles: number; projects: number };
}

export default async function UsersPage() {
  // Получаем клиент Supabase с правами администратора (service role)
  const supabase = (getServerSupabaseClient as any)({ useServiceRole: true });
  
  const { data, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    throw new Error(error.message);
  }

  // Преобразуем пользователей с явной типизацией
  const users: UserItem[] = (data?.users || []).map((u: any) => ({
    id: u.id,
    name: u.user_metadata?.name || u.email?.split('@')[0] || 'User',
    email: u.email || '',
    image: u.user_metadata?.image || '',
    role: u.user_metadata?.role || 'USER',
    _count: { articles: 0, projects: 0 },
  }));

  // Безопасная сортировка по имени с явными типами
  users.sort((a: UserItem, b: UserItem) => a.name.localeCompare(b.name));

  return <UsersClient users={users} />;
}
