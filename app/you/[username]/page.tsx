import React from 'react';
import Link from 'next/link';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { ArrowLeft, Flame, Trash2, Sparkles, ShieldCheck, Moon, Radio } from 'lucide-react';

export const dynamic = 'force-dynamic';

function getEventVisuals(eventType: string) {
  switch (eventType?.toUpperCase()) {
    case 'VIGIL':
    case 'VIGIL_SPARK':
      return { icon: Flame, label: 'Vigil' };
    case 'ASH':
      return { icon: Trash2, label: 'Let It Go' };
    case 'CAST':
      return { icon: Sparkles, label: 'Cast' };
    case 'ABSOLUTION':
      return { icon: ShieldCheck, label: 'Absolution' };
    case 'HEARTANDANGEL':
    case 'MEDITATION':
    case 'SILENCE':
      return { icon: Moon, label: 'Calm' };
    default:
      return { icon: Radio, label: eventType || 'Whisper' };
  }
}

function formatTime(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

interface PageProps {
  params: { id: string } | Promise<{ id: string }>;
}

export default async function PublicProfilePage({ params }: PageProps) {
  const resolvedParams = params instanceof Promise ? await params : params;
  const userId = resolvedParams?.id || 'unknown';

  let profile = null;
  let userLogs: any[] = [];

  try {
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    if (supabase && userId !== 'unknown') {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      let profileQuery = supabase.from('profiles').select('*');
      if (uuidRegex.test(userId)) {
        profileQuery = profileQuery.eq('id', userId);
      } else {
        profileQuery = profileQuery.eq('username', userId);
      }

      const { data: profileData } = await profileQuery.maybeSingle();
      profile = profileData;

      const currentProfileName = profileData?.full_name || profileData?.username || 'Anonymous';
      const { data: logsData } = await supabase
        .from('temple_log')
        .select('*')
        .or(`author.ilike.%${currentProfileName}%,user_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(30);

      if (logsData) {
        userLogs = logsData;
      }
    }
  } catch (e) {
    console.error('Error fetching profile data on server:', e);
  }

  const currentProfile = profile || {
    id: userId,
    full_name: 'Sanctuary Seeker',
    bio: 'A quiet traveler within the ecosystem.',
    role: 'Guardian',
  };

  const getInitials = (name?: string) => {
    if (!name) return 'H&A';
    return name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const vigilsCount = userLogs.filter(l => (l.event_type || '').toLowerCase().includes('vigil')).length;
  const ashesCount = userLogs.filter(l => (l.event_type || '').toLowerCase() === 'ash').length;

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 font-sans selection:bg-stone-900 selection:text-white antialiased pt-28 sm:pt-36">
      <main className="max-w-4xl mx-auto pb-32 px-6 lg:px-8 space-y-12">
        
        {/* BACK NAVIGATION */}
        <div>
          <Link 
            href="/heartandangel/world" 
            className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-stone-400 hover:text-stone-900 transition-colors"
          >
            <ArrowLeft size={13} />
            <span>Sanctuary World</span>
          </Link>
        </div>

        {/* DOSSIER HEADER */}
        <div className="bg-white border border-stone-200/90 p-8 sm:p-12 rounded-3xl space-y-8">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            
            {/* AVATAR / INITIALS */}
            <div className="w-20 h-20 rounded-2xl bg-stone-900 text-white flex items-center justify-center font-serif text-2xl tracking-widest shrink-0">
              {currentProfile?.avatar_url || currentProfile?.image ? (
                <img src={currentProfile.avatar_url || currentProfile.image} alt="Avatar" className="w-full h-full object-cover rounded-2xl" />
              ) : (
                getInitials(currentProfile?.full_name || currentProfile?.username)
              )}
            </div>

            {/* INFO */}
            <div className="space-y-3 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[10px] tracking-[0.2em] uppercase px-3 py-1 bg-stone-100 text-stone-600 rounded-md border border-stone-200">
                  {currentProfile?.role || 'Guardian'}
                </span>
                <span className="font-mono text-[10px] tracking-widest text-stone-400">
                  ID: {userId.slice(0, 8)}
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-serif font-light text-stone-900 tracking-tight">
                {currentProfile?.full_name || currentProfile?.username || 'Seeker'}
              </h1>

              {currentProfile?.bio && (
                <p className="font-serif italic text-stone-600 text-sm sm:text-base leading-relaxed max-w-xl">
                  {currentProfile.bio}
                </p>
              )}
            </div>
          </div>

          {/* METRICS BAR */}
          <div className="grid grid-cols-3 gap-6 border-t border-stone-100 pt-6 font-mono text-xs">
            <div>
              <span className="block text-[10px] text-stone-400 uppercase tracking-widest mb-1">Total Traces</span>
              <span className="text-stone-900 font-medium text-sm">{userLogs.length}</span>
            </div>
            <div>
              <span className="block text-[10px] text-stone-400 uppercase tracking-widest mb-1">Vigils</span>
              <span className="text-stone-900 font-medium text-sm">{vigilsCount}</span>
            </div>
            <div>
              <span className="block text-[10px] text-stone-400 uppercase tracking-widest mb-1">Ashes</span>
              <span className="text-stone-900 font-medium text-sm">{ashesCount}</span>
            </div>
          </div>
        </div>

        {/* ETHER LEDGER / LOGS */}
        <div className="space-y-6">
          <div className="flex justify-between items-baseline border-b border-stone-200 pb-3">
            <h2 className="font-serif text-xl font-light text-stone-900">Ether Ledger</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-400">Activity Stream</span>
          </div>

          {userLogs.length === 0 ? (
            <div className="bg-white border border-dashed border-stone-300 p-12 text-center rounded-3xl font-mono text-xs text-stone-400 uppercase tracking-wider">
              No offerings recorded in the ether.
            </div>
          ) : (
            <div className="space-y-2">
              {userLogs.map((log) => {
                const type = (log.event_type || 'WHISPER').toUpperCase();
                const visuals = getEventVisuals(type);
                const IconComp = visuals.icon;

                return (
                  <div 
                    key={log.id} 
                    className="bg-white border border-stone-200/80 px-6 py-4 rounded-2xl flex items-center justify-between gap-4 text-sm transition hover:border-stone-400"
                  >
                    <div className="flex items-center gap-3 shrink-0">
                      <IconComp size={15} className="text-stone-400" />
                      <span className="font-mono text-[11px] uppercase tracking-wider text-stone-800 w-24">
                        {visuals.label}
                      </span>
                    </div>

                    <div className="flex-1 font-serif font-light text-stone-700 truncate px-4">
                      {log.message}
                    </div>

                    <div className="font-mono text-[11px] text-stone-400 shrink-0 text-right">
                      {formatTime(log.created_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
