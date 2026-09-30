import { createClient } from '@/lib/supabase/server';
import ProfileForm from '@/components/profile/ProfileForm';
import SubscriptionToggle from '@/components/profile/SubscriptionToggle';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const supabase = createClient();
  
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !authUser?.id) {
    const { default: ProfileGuest } = await import('@/components/profile/ProfileGuest');
    return <ProfileGuest />;
  }

  const { data: userData } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  const profile = userData || {
    id: authUser.id,
    email: authUser.email,
    name: authUser.user_metadata?.name || '',
    username: null,
    bio: null,
    website: null,
    is_subscribed: false,
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Ваш профиль</h1>
      <p className="text-gray-600 mb-8">Здесь вы можете обновить свою публичную информацию.</p>
      
      <div className="space-y-6">
        <SubscriptionToggle initialSubscribed={profile?.is_subscribed || false} />
        <ProfileForm user={profile} />
      </div>
    </div>
  );
}
