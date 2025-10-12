
import UsersClient from '@/components/UsersClient';

// Серверный компонент для публичного списка пользователей через Supabase
import { createClient } from '@supabase/supabase-js';

export default async function UsersPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw new Error(error.message);
  // Преобразуем пользователей для UsersClient
  const users = (data.users || []).map(u => ({
    id: u.id,
    name: u.user_metadata?.name || '',
    email: u.email,
    image: u.user_metadata?.image || '',
    role: u.user_metadata?.role || 'USER',
    _count: { articles: 0, projects: 0 }, // TODO: добавить реальные данные, если нужно
  }));
  // Можно добавить сортировку по имени
  users.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return <UsersClient users={users} />;
}