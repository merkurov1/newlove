// app/profile/page.js

import { createClient } from '@/lib/supabase/server';
import ProfileForm from '@/components/profile/ProfileForm';
import SubscriptionToggle from '@/components/profile/SubscriptionToggle';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  // Use server-side Supabase client
  const supabase = createClient();
  
  // Get current user from session
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !authUser?.id) {
    // User not logged in - show guest prompt
    const { default: ProfileGuest } = await import('@/components/profile/ProfileGuest');
    return <ProfileGuest />;
  }

  // Fetch user data from users table
  let userData = null;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();
    
    if (error) {
      console.error('Supabase fetch user error', error);
    } else if (!data) {
      // User doesn't exist in public.users yet - create from auth.users
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          id: authUser.id,
          email: authUser.email,
          name: authUser.user_metadata?.name || authUser.email?.split('@')[0],
        })
        .select()
        .single();
      
      if (insertError) {
        console.error('Error creating user profile:', insertError);
        // Fallback to auth data
        userData = {
          id: authUser.id,
          email: authUser.email,
          name: authUser.user_metadata?.name || '',
          username: null,
          bio: null,
          website: null,
          is_subscribed: false,
        };
      } else {
        userData = newUser;
      }
    } else {
      userData = data;
    }
  } catch (e) {
    console.error('Error fetching user data:', e);
    // Fallback to auth data
    userData = {
      id: authUser.id,
      email: authUser.email,
      name: authUser.user_metadata?.name || '',
      username: null,
      bio: null,
      website: null,
      is_subscribed: false,
    };
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Ваш профиль</h1>
      <p className="text-gray-600 mb-8">Здесь вы можете обновить свою публичную информацию.</p>
      
      <div className="space-y-6">
        {/* Subscription Toggle */}
        <SubscriptionToggle initialSubscribed={userData?.is_subscribed || false} />
        
        {/* Profile Form */}
        <ProfileForm user={userData} />
      </div>
    </div>
  );
}
