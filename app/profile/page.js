// app/profile/page.js

// We'll use a dynamic import here to avoid build-time circular/interop issues
import { redirect } from 'next/navigation';
import ProfileForm from '@/components/profile/ProfileForm'; // Мы создадим этот компонент на след. шаге
import { safeData } from '@/lib/safeSerialize';

export default async function ProfilePage() {
  const globalReq = globalThis?.request || new Request('http://localhost');
  const mod = await import('@/lib/supabase-server');
  const getUserAndSupabaseFromRequest = mod.getUserAndSupabaseFromRequest || mod.default;
  const { user, supabase } = await getUserAndSupabaseFromRequest(globalReq);
  // Если user не найден, редиректим
  if (!user?.id) redirect('/');

  let userData = null;
  if (supabase) {
    const { data, error } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
    if (error) {
      console.error('Supabase fetch user error', error);
    } else {
      // Ensure the object is JSON-serializable for Next prerender
      userData = safeData(data || null);
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
