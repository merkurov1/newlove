// app/profile/page.js

import { getUserAndSupabaseFromRequest } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import ProfileForm from '@/components/profile/ProfileForm'; // Мы создадим этот компонент на след. шаге

export default async function ProfilePage() {
  const { user, supabase } = await getUserAndSupabaseFromRequest(globalThis?.request || new Request('http://localhost'));
  // Если user не найден, редиректим
  if (!user?.id) redirect('/');

  let userData = null;
  if (supabase) {
    const { data, error } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
    if (error) {
      console.error('Supabase fetch user error', error);
    } else {
      userData = data;
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Ваш профиль</h1>
      <p className="text-gray-600 mb-8">Здесь вы можете обновить свою публичную информацию.</p>
      
      {/* Передаем данные пользователя в клиентский компонент формы */}
      <ProfileForm user={userData} />
    </div>
  );
}
