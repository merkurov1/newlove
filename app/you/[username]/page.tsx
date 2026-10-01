import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Globe, ShieldCheck, ScanFace, Sparkles, Radio } from 'lucide-react';
import Header from '@/components/Header';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: {
    username: string;
  };
}

export default async function UserProfilePage({ params }: PageProps) {
  const { username } = params;
  const supabase = await createClient();

  // 1. Запрашиваем профиль пользователя по уникальному username
  const { data: profile, error } = await supabase
    .from('users')
    .select('*')
    .ilike('username', username)
    .maybeSingle();

  if (error || !profile) {
    notFound();
  }

  const targetId = profile.id || profile.user_id;

  // 2. Параллельная выборка связанных данных (Casts & Temple Logs)
  let userCasts: any[] = [];
  let userLogs: any[] = [];

  if (targetId) {
    const [castsRes, logsByUserIdRes] = await Promise.all([
      supabase
        .from('casts')
        .select('*')
        .eq('user_id', targetId)
        .order('created_at', { ascending: false }),
      supabase
        .from('temple_log')
        .select('*')
        .eq('user_id', targetId)
        .order('created_at', { ascending: false })
    ]);
    
    if (castsRes.data) userCasts = castsRes.data;
    
    if (logsByUserIdRes.data && logsByUserIdRes.data.length > 0) {
      userLogs = logsByUserIdRes.data;
    } else if (profile.name) {
      const { data: logsByName } = await supabase
        .from('temple_log')
        .select('*')
        .eq('author', profile.name)
        .order('created_at', { ascending: false });
      if (logsByName) userLogs = logsByName;
    }
  }

  const userInitials = profile.name ? profile.name.substring(0, 2).toUpperCase() : 'AM';
  const roleNorm = profile.role ? String(profile.role).toUpperCase() : 'USER';
  const isAdmin = roleNorm === 'ADMIN';

  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans selection:bg-black selection:text-white flex flex-col justify-between antialiased relative overflow-x-hidden">
      
      <Header />

      {/* MAIN CONTAINER */}
      <div className="max-w-3xl mx-auto w-full px-6 pt-36 md:pt-44 pb-24 space-y-10 relative z-20 flex-1">
        
        {/* Navigation / Back link */}
        <div>
          <Link
            href="/temple"
            className="inline-flex items-center gap-2 text-[11px] font-mono font-medium text-zinc-500 hover:text-[#111111] transition-colors uppercase tracking-[0.2em]"
          >
            <ArrowLeft size={14} />
            <span>Return to Sanctuary</span>
          </Link>
        </div>

        {/* PROFILE CARD */}
        <div className="p-8 sm:p-10 rounded-3xl bg-white/75 backdrop-blur-2xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-8">
          
          {/* Avatar & Header Info */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-tr from-zinc-900 to-zinc-700 text-white font-medium text-2xl flex items-center justify-center shadow-xl ring-4 ring-white flex-shrink-0">
              {profile.image || profile.avatar_url ? (
                <img src={profile.image || profile.avatar_url} alt={profile.name || username} className="w-full h-full object-cover" />
              ) : (
                <span>{userInitials}</span>
              )}
            </div>

            <div className="space-y-3 overflow-hidden flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <h1 className="text-2xl sm:text-3xl font-serif font-medium text-[#111111] tracking-tight">
                  {profile.name || username}
                </h1>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-50 border border-pink-200/60 text-pink-700 text-[10px] font-mono uppercase tracking-[0.2em]">
                    <ShieldCheck size={12} />
                    Admin
                  </span>
                )}
                {profile.is_subscribed && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/60 text-amber-800 text-[10px] font-mono uppercase tracking-[0.2em]">
                    <Sparkles size={12} />
                    Subscriber
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-zinc-400 tracking-widest">
                @{profile.username || username}
              </p>

              {/* Quick Activity Stats */}
              <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-6 text-xs font-mono text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <ScanFace size={14} className="text-indigo-600" />
                  <span>{userCasts.length} Casts</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Radio size={14} className="text-amber-600" />
                  <span>{userLogs.length} Temple Transmissions</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bio Section */}
          {profile.bio && (
            <div className="pt-6 border-t border-zinc-200/80 space-y-2">
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">Biography</h3>
              <p className="text-base text-zinc-800 leading-relaxed font-serif whitespace-pre-wrap">
                {profile.bio}
              </p>
            </div>
          )}

          {/* Website Link */}
          {profile.website && (
            <div className="pt-6 border-t border-zinc-200/80 space-y-2">
              <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">External Archive</h3>
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-[#111111] hover:opacity-65 transition-opacity underline underline-offset-4 decoration-zinc-300 font-mono"
              >
                <Globe size={15} className="text-zinc-500" />
                <span>{profile.website.replace(/^https?:\/\//, '')}</span>
              </a>
            </div>
          )}

        </div>

        {/* CASTS / ARCHETYPES HISTORY SECTION */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">
              Psychometric Casts & Manifestations ({userCasts.length})
            </h3>
            <Link href="/cast" className="text-xs font-mono text-[#111111] hover:underline uppercase tracking-wider">
              + New Cast
            </Link>
          </div>

          {userCasts.length === 0 ? (
            <div className="p-10 rounded-3xl bg-white/40 border border-zinc-200/80 text-center text-zinc-400 font-mono text-xs uppercase tracking-widest">
              No archetypes manifested yet.
            </div>
          ) : (
            <div className="space-y-4">
              {userCasts.map((cast) => (
                <div key={cast.id} className="p-6 rounded-3xl bg-white/80 backdrop-blur-xl border border-zinc-200/80 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-indigo-700 font-mono text-xs font-bold uppercase tracking-wider">
                      <ScanFace size={16} />
                      <span>Archetype: {cast.archetype}</span>
                    </div>
                    <span className="text-zinc-400 font-mono text-xs">
                      {new Date(cast.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {cast.analysis?.executive_summary && (
                    <p className="text-sm text-zinc-700 leading-relaxed font-serif">
                      {cast.analysis.executive_summary}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TEMPLE TRANSMISSIONS / LOGS SECTION */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-mono uppercase tracking-[0.2em] text-zinc-500">
              Temple Transmissions ({userLogs.length})
            </h3>
          </div>

          {userLogs.length === 0 ? (
            <div className="p-10 rounded-3xl bg-white/40 border border-zinc-200/80 text-center text-zinc-400 font-mono text-xs uppercase tracking-widest">
              No transmissions recorded yet.
            </div>
          ) : (
            <div className="space-y-4">
              {userLogs.map((log) => (
                <div key={log.id} className="p-6 rounded-3xl bg-white/80 backdrop-blur-xl border border-zinc-200/80 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-700 font-mono text-xs font-bold uppercase tracking-wider">
                      <Radio size={16} />
                      <span>{log.title || log.event_type || 'Sanctuary Entry'}</span>
                    </div>
                    <span className="text-zinc-400 font-mono text-xs">
                      {new Date(log.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {log.message && (
                    <p className="text-sm text-zinc-700 leading-relaxed font-serif whitespace-pre-wrap">
                      {log.message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* FOOTER DIRECTORY */}
      <footer className="w-full max-w-4xl mx-auto flex justify-between items-center px-6 py-6 border-t border-zinc-200/80 font-mono text-xs text-zinc-500 uppercase tracking-[0.25em] mt-16 z-20">
        <span>Merkurov Private Office</span>
        <span>Digital Heritage Architecture</span>
      </footer>

    </main>
  );
}
