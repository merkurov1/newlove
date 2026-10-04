import { notFound } from 'next/navigation';
import Image from 'next/image';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { Flame, Moon, Compass, ShieldCheck, Sparkles, Radio, Trash2 } from 'lucide-react';

interface ProfilePageProps {
  params: {
    username: string;
  };
}

function getEventVisuals(eventType: string) {
  switch ((eventType || '').toUpperCase()) {
    case 'VIGIL':
    case 'VIGIL_SPARK':
      return { icon: Flame, label: 'Vigil' };
    case 'ASH':
      return { icon: Trash2, label: 'Let It Go' };
    case 'CAST':
      return { icon: Compass, label: 'Cast' };
    case 'ABSOLUTION':
      return { icon: ShieldCheck, label: 'Absolution' };
    case 'HEARTANDANGEL':
    case 'MEDITATION':
    case 'SILENCE':
      return { icon: Moon, label: 'Calm' };
    case 'WHISPER':
      return { icon: Sparkles, label: 'Whisper' };
    default:
      return { icon: Radio, label: eventType || 'Log' };
  }
}

function formatTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function UserProfilePage({ params }: ProfilePageProps) {
  const { username } = params;
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  if (!supabase || !username) {
    return notFound();
  }

  // 1. Загрузка профиля из базы
  let profileQuery = supabase.from('profiles').select('*');
  const decodedId = decodeURIComponent(username);
  
  if (decodedId.length === 36 || /^[0-9a-fA-F-]{36}$/.test(decodedId)) {
    profileQuery = profileQuery.eq('id', decodedId);
  } else {
    profileQuery = profileQuery.or(`username.eq.${decodedId},name.eq.${decodedId}`);
  }

  const { data: profileData, error: profileError } = await profileQuery.maybeSingle();

  if (profileError || !profileData) {
    return notFound();
  }

  const profile = profileData;
  const profileName = profile.name || profile.full_name || 'Anonymous';
  const profileImage = profile.image || profile.avatar_url || null;
  const memberSince = formatTime(profile.created_at);

  // 2. Загрузка логов с гарантированной защитой от null
  let userLogs: any[] = [];
  try {
    const { data: logsData } = await supabase
      .from('temple_logs')
      .select('*')
      .or(`author.ilike.%${profileName}%,user_id.eq.${profile.id}`)
      .order('created_at', { ascending: false })
      .limit(20);

    if (Array.isArray(logsData)) {
      userLogs = logsData;
    }
  } catch (e) {
    console.warn('Failed to load temple logs for profile', e);
  }

  return (
    <main className="min-h-screen bg-[#FAF8F5] text-stone-900 font-sans px-6 pt-32 pb-24 selection:bg-stone-200">
      <div className="max-w-2xl mx-auto space-y-12">
        
        {/* ХЕДЕР ПРОФИЛЯ */}
        <div className="flex flex-col items-center text-center space-y-5">
          {profileImage ? (
            <div className="w-24 h-24 rounded-full overflow-hidden border border-stone-300 shadow-sm">
              <Image 
                src={profileImage} 
                alt={profileName} 
                width={96} 
                height={96} 
                className="w-full h-full object-cover"
                priority
              />
            </div>
          ) : (
            <div className="w-24 h-24 rounded-full bg-stone-900 text-white font-sans font-bold text-2xl flex items-center justify-center shadow-sm">
              {profileName.substring(0, 2).toUpperCase()}
            </div>
          )}

          <div className="space-y-1.5">
            <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-stone-900">
              {profileName}
            </h1>
            
            {memberSince && (
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-stone-500">
                Since {memberSince}
              </p>
            )}
          </div>
        </div>

        {/* РЕЕСТР ДЕЙСТВИЙ (TEMPLE LOGS) */}
        <div className="space-y-6 pt-6 border-t border-stone-200/80">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-stone-500">
              Sanctuary Ledger
            </h2>
            <span className="font-mono text-xs text-stone-400">
              {userLogs.length} {userLogs.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          <div className="space-y-3">
            {userLogs.length === 0 ? (
              <div className="py-12 text-center">
                <p className="font-serif italic text-sm text-stone-400">
                  * No traces in the ether yet.*
                </p>
              </div>
            ) : (
              userLogs.map((log: any) => {
                const eventType = log?.event_type || 'WHISPER';
                const visuals = getEventVisuals(eventType);
                const IconComponent = visuals.icon;
                const logTime = formatTime(log?.created_at);

                return (
                  <div 
                    key={log?.id || Math.random()} 
                    className="flex items-center justify-between p-4 rounded-2xl bg-white/80 backdrop-blur-md border border-stone-200/70 shadow-[0_2px_15px_rgba(0,0,0,0.02)] transition-all"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 shrink-0">
                        <IconComponent size={16} />
                      </div>
                      <div className="min-w-0 text-left">
                        <div className="font-mono text-xs font-bold uppercase tracking-wider text-stone-800">
                          {visuals.label}
                        </div>
                        <div className="font-serif text-sm text-stone-600 truncate mt-0.5">
                          {log?.message || '—'}
                        </div>
                      </div>
                    </div>

                    <div className="font-mono text-[11px] text-stone-400 shrink-0 pl-4">
                      {logTime}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </main>
  );
}
