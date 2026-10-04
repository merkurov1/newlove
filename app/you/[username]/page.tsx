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
  const rawUsername = params?.username || '';
  const decodedUsername = decodeURIComponent(rawUsername).trim();

  if (!decodedUsername) {
    return notFound();
  }

  const supabase = getServerSupabaseClient({ useServiceRole: true });

  // 1. Поиск профиля в базе данных или fallback
  let profileName = decodedUsername;
  let profileImage = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Angel1.png';

  if (supabase) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .or(`username.ilike.${decodedUsername},name.ilike.${decodedUsername}`)
      .maybeSingle();

    if (profileData) {
      profileName = profileData.name || profileData.full_name || decodedUsername;
      if (profileData.image || profileData.avatar_url) {
        profileImage = profileData.image || profileData.avatar_url;
      }
    }
  }

  // 2. Загрузка логов храма только для этого автора
  let userLogs: any[] = [];
  if (supabase) {
    const { data: logsData } = await supabase
      .from('temple_logs')
      .select('*')
      .ilike('author', decodedUsername)
      .order('created_at', { ascending: false });

    if (Array.isArray(logsData)) {
      userLogs = logsData.filter((item: any) => {
        const type = (item.event_type || '').toLowerCase();
        return type !== 'enter' && type !== 'nav' && type !== 'confess';
      });
    }
  }

  return (
    <main className="min-h-screen bg-[#FAF8F5] text-stone-900 font-sans px-6 pt-32 pb-24 selection:bg-stone-200">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Навигация */}
        <div className="flex items-center justify-between">
          <Link 
            href="/heartandangel/world"
            className="px-5 py-2.5 rounded-full bg-white/80 border border-stone-300 text-stone-900 shadow-sm text-xs font-serif tracking-wider hover:bg-white transition-all"
          >
            ← Back to World
          </Link>
        </div>

        {/* Шапка профайла */}
        <div className="bg-white/90 border border-stone-200 rounded-3xl p-8 shadow-xl backdrop-blur-md flex flex-col sm:flex-row items-center gap-6">
          <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-stone-300 shadow-inner bg-stone-100 flex items-center justify-center shrink-0">
            <Image 
              src={profileImage} 
              alt={profileName} 
              fill 
              className="object-contain p-2"
              priority
            />
          </div>
          <div className="text-center sm:text-left space-y-1">
            <h1 className="font-serif text-3xl sm:text-4xl font-normal text-stone-900 tracking-tight">
              {profileName}
            </h1>
            <p className="font-mono text-xs uppercase tracking-widest text-stone-500">
              Sanctuary Profile
            </p>
          </div>
        </div>

        {/* Список Offerings */}
        <div className="bg-white/90 border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-xl backdrop-blur-md space-y-6">
          <h2 className="font-serif text-xl border-b pb-3 border-stone-200 text-stone-900">
            Offerings
          </h2>

          <div className="divide-y divide-stone-100">
            {userLogs.length === 0 ? (
              <p className="font-mono text-xs opacity-60 uppercase tracking-widest py-8 text-center text-stone-500">
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
                      <div className={`w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center ${visuals.color}`}>
                        <IconComponent size={16} />
                      </div>
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-stone-800">
                        {visuals.label}
                      </span>
                    </div>

                    <div className="flex-1 font-serif font-light text-stone-800 truncate px-2 text-left">
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
