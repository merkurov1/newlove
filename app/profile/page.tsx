import { createClient } from '@/lib/supabase/server';
import ProfileForm from '@/components/profile/ProfileForm';
import SubscriptionToggle from '@/components/profile/SubscriptionToggle';
import { UserCircle, Shield, Sparkles } from 'lucide-react';

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
    <div className="min-h-screen bg-gradient-to-b from-[#F6F4F0] via-[#F0ECE6] to-[#E8E3DA] text-zinc-900 font-sans selection:bg-zinc-900 selection:text-white pt-32 pb-24 px-6">
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* Page Header */}
        <div className="border-b border-zinc-200/80 pb-6 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-200/50 text-zinc-700 font-mono text-xs uppercase tracking-widest">
            <UserCircle size={14} />
            <span>Account Management</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-serif font-bold text-zinc-900 tracking-tight">
            Your Profile
          </h1>
          <p className="text-zinc-600 text-sm font-serif leading-relaxed">
            Manage your public identity, archetype settings, and digital preferences across the ecosystem.
          </p>
        </div>
        
        {/* Main Content Sections */}
        <div className="space-y-6">
          {/* Subscription / Status Card */}
          <div className="p-6 rounded-3xl bg-white/80 backdrop-blur-xl border border-zinc-200/80 shadow-[0_10px_30px_rgba(0,0,0,0.02)] space-y-3">
            <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-zinc-500">
              <Sparkles size={14} className="text-amber-600" />
              <span>Ecosystem Status</span>
            </div>
            <SubscriptionToggle initialSubscribed={profile?.is_subscribed || false} />
          </div>

          {/* Profile Form Card */}
          <div className="p-8 rounded-3xl bg-white/85 backdrop-blur-xl border border-zinc-200/80 shadow-[0_15px_40px_rgba(0,0,0,0.03)] space-y-6">
            <ProfileForm user={profile} />
          </div>
        </div>

      </div>
    </div>
  );
}
