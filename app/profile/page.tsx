import { createClient } from '@/lib/supabase/server';
import ProfileForm from '@/components/profile/ProfileForm';
import SubscriptionToggle from '@/components/profile/SubscriptionToggle';
import { UserCircle, Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const supabase = await createClient();
  
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
    <main className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans selection:bg-black selection:text-white pt-36 md:pt-44 pb-24 px-6 relative overflow-x-hidden">
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* Page Header */}
        <div className="border-b border-zinc-200/80 pb-6 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 border border-zinc-200/80 text-zinc-700 font-mono text-[10px] uppercase tracking-[0.2em] shadow-sm backdrop-blur-md">
            <UserCircle size={14} />
            <span>Account Management</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-serif font-medium text-[#111111] tracking-tight">
            Your Profile
          </h1>
          <p className="text-zinc-600 text-sm font-serif leading-relaxed">
            Manage your public identity, archetype settings, and digital preferences across the ecosystem.
          </p>
        </div>
        
        {/* Main Content Sections */}
        <div className="space-y-6">
          {/* Subscription / Status Card */}
          <div className="p-6 rounded-3xl bg-white/75 backdrop-blur-2xl border border-zinc-200/80 shadow-[0_16px_40px_rgba(0,0,0,0.03)] space-y-3">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              <Sparkles size={14} className="text-amber-600" />
              <span>Ecosystem Status</span>
            </div>
            <SubscriptionToggle initialSubscribed={profile?.is_subscribed || false} />
          </div>

          {/* Profile Form Card */}
          <div className="p-8 rounded-3xl bg-white/80 backdrop-blur-2xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-6">
            <ProfileForm user={profile} />
          </div>
        </div>

      </div>
    </main>
  );
}
