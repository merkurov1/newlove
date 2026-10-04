import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import { Radio, Flame, Compass, ShieldCheck, Moon, Sparkles, Trash2 } from 'lucide-react';

interface ProfilePageProps {
  params: {
    username?: string;
  };
}

function getEventVisuals(eventType: string) {
  switch (eventType?.toUpperCase()) {
    case 'VIGIL':
    case 'VIGIL_SPARK':
      return { icon: Flame, color: 'text-amber-500', label: 'Vigil' };
    case 'ASH':
      return { icon: Trash2, color: 'text-rose-500', label: 'Let It Go' };
    case 'CAST':
      return { icon: Compass, color: 'text-indigo-400', label: 'Cast' };
    case 'ABSOLUTION':
      return { icon: ShieldCheck, color: 'text-emerald-400', label: 'Absolution' };
    case 'HEARTANDANGEL':
    case 'MEDITATION':
    case 'SILENCE':
      return { icon: Moon, color: 'text-purple-400', label: 'Calm' };
    case 'WHISPER':
      return { icon: Sparkles, color: 'text-amber-300', label: 'Whisper' };
    default:
      return { icon: Radio, color: 'text-stone-400', label: eventType || 'Log' };
  }
}

export default async function UserProfilePage({ params }: ProfilePageProps) {
  const rawParam = params?.username || '';
  const decodedParam = decodeURIComponent(rawParam).trim();

  if (!decodedParam) {
    return notFound();
  }

  const supabase = getServerSupabaseClient({ useServiceRole: true });
  if (!supabase) {
    return notFound();
  }

  let profileId = '';
  let profileName = decodedParam;
  let profileImage = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Angel1.png';

  const isUuid = decodedParam.length === 36 || /^[0-9a-fA-F-]{36}$/.test(decodedParam);

  // 1. Поиск пользователя в таблице 'users' (как в API-роуте)
  try {
    if (isUuid) {
      profileId = decodedParam;
      const { data } = await supabase.from('users').select('*').eq('id', decodedParam).maybeSingle();
      if (data) {
        profileName = data.name || data.full_name || data.username || decodedParam;
        if (data.image || data.avatar_url) profileImage = data.image || data.avatar_url;
      }
    } else {
      const { data } = await supabase.from('users').select('*').ilike('name', decodedParam).maybeSingle();
      if (data) {
        profileId = data.id;
        profileName = data.name || data.full_name || data.username || decodedParam;
        if (data.image || data.avatar_url) profileImage = data.image || data.avatar_url;
      }
    }
  } catch (e) {
    console.warn('Users table fetch warning:', e);
  }

  // 2. Загрузка логов из правильной таблицы 'temple_log' (по user_id ИЛИ author)
  let userLogs: any[] = [];
  try {
    let query = supabase.from('temple_log').select('*');

    if (profileId && !isUuid) {
      query = query.or(`user_id.eq.${profileId},author.ilike.${profileName}`);
    } else if (profileId) {
      query = query.eq('user_id', profileId);
    } else {
      query = query.ilike('author', profileName);
    }

    const { data: logsData, error } = await query.order('created_at', { ascending: false });
    
    if (!error && Array.isArray(logsData)) {
      userLogs = logsData.filter((item: any) => {
        const type = (item.event_type || '').toLowerCase();
        return type !== 'enter' && type !== 'nav' && type !== 'confess';
      });
    }
  } catch (e) {
    console.warn('temple_log fetch warning:', e);
  }

  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans px-6 pt-36 md:pt-44 pb-24 selection:bg-black selection:text-white relative">
      
      {/* Подложка с бумажной текстурой */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="max-w-3xl mx-auto space-y-8 relative z-20">
        
        {/* Навигация */}
        <div className="flex items-center justify-between">
          <Link 
            href="/heartandangel/world"
            className="px-5 py-2.5 rounded-full bg-white/80 border border-zinc-200 text-zinc-900 shadow-sm font-mono text-xs uppercase tracking-widest hover:border-black transition-all"
          >
            ← Back to World
          </Link>
        </div>

        {/* Шапка профайла */}
        <div className="bg-white/80 backdrop-blur-2xl border border-zinc-200/80 rounded-3xl p-8 shadow-sm flex flex-col sm:flex-row items-center gap-6">
          <div className="relative w-24 h-24 rounded-full overflow-hidden border border-zinc-300 shadow-inner bg-zinc-50 flex items-center justify-center shrink-0">
            <Image 
              src={profileImage} 
              alt={profileName} 
              fill 
              className="object-contain p-2"
              priority
            />
          </div>
          <div className="text-center sm:text-left space-y-1">
            <h1 className="font-serif text-3xl sm:text-4xl font-light text-zinc-900 tracking-tight">
              {profileName}
            </h1>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">
              Sanctuary Profile
            </p>
          </div>
        </div>

        {/* Список Offerings */}
        <div className="bg-white/80 backdrop-blur-2xl border border-zinc-200/80 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <h2 className="font-serif text-2xl font-light border-b border-zinc-200 pb-4 text-zinc-900">
            Offerings
          </h2>

          <div className="divide-y divide-zinc-100">
            {userLogs.length === 0 ? (
              <p className="font-mono text-xs opacity-60 uppercase tracking-widest py-12 text-center text-zinc-500">
                No offerings recorded for this profile yet.
              </p>
            ) : (
              userLogs.map((log: any, index: number) => {
                const eventType = (log?.event_type || 'WHISPER').toUpperCase();
                const visuals = getEventVisuals(eventType);
                const IconComponent = visuals.icon;
                const message = String(log?.message || '—');

                return (
                  <div 
                    key={log?.id || index} 
                    className="py-4 flex items-center justify-between gap-4 text-sm"
                  >
                    <div className="flex items-center gap-3.5 shrink-0">
                      <div className={`w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center ${visuals.color}`}>
                        <IconComponent size={16} />
                      </div>
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-800">
                        {visuals.label}
                      </span>
                    </div>

                    <div className="flex-1 font-serif font-light text-zinc-800 truncate px-2 text-left">
                      <span className="truncate opacity-90">{message}</span>
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
