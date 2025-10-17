// app/profile/page.js

// We'll use a dynamic import here to avoid build-time circular/interop issues
import { redirect } from 'next/navigation';
import ProfileForm from '@/components/profile/ProfileForm'; // Мы создадим этот компонент на след. шаге

export default async function ProfilePage() {
  const globalReq = globalThis?.request || new Request('http://localhost');
  // Import the canonical helper directly to avoid interop/export shape issues
  // that sometimes occur when the build produces different module formats.
  let user = null;
  let supabase = null;
  try {
    const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
    const res = await getUserAndSupabaseForRequest(globalReq) || {};
    user = res.user || null;
    supabase = res.supabase || null;
  } catch (e) {
    // If the helper fails during build/runtime, log and redirect to home so
    // the page doesn't crash the whole prerender process. We'll still allow
    // the client to surface an error if needed.
    console.error('profile/page: failed to obtain supabase/user for request', e);
    // Avoid redirect here; render guest prompt instead. Redirecting during
    // build/prerender can cause the entire page to fail. We'll let the
    // guest UI handle prompting to login.
    user = null;
  }
  // Если user не найден, показываем клиентский компонент с приглашением войти
  // вместо строгого редиректа — это даёт лучший UX: пользователь увидит
  // кнопку входа/модальное и сможет вернуться после логина.
  if (!user?.id) {
    // Render a lightweight client-side guest prompt — import dynamically
    const { default: ProfileGuest } = await import('@/components/profile/ProfileGuest');
    return (
      // @ts-expect-error ServerComponent returning a Client Component
      <ProfileGuest />
    );
  }

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
