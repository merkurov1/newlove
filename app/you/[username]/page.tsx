import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Globe, User, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: {
    username: string;
  };
}

export default async function UserProfilePage({ params }: PageProps) {
  const { username } = params;
  const supabase = createClient();

  // Запрашиваем профиль пользователя по уникальному username
  const { data: profile, error } = await supabase
    .from('users')
    .select('*')
    .ilike('username', username)
    .maybeSingle();

  if (error || !profile) {
    notFound();
  }

  const userInitials = profile.name ? profile.name.substring(0, 2).toUpperCase() : 'AM';
  const roleNorm = profile.role ? String(profile.role).toUpperCase() : 'USER';
  const isAdmin = roleNorm === 'ADMIN';

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FAF8F5] flex flex-col justify-between px-6 sm:px-12 pt-32 md:pt-40 pb-12 antialiased relative">
      
      {/* Subtle Paper Grain Overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25'filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* MAIN CONTAINER */}
      <main className="max-w-2xl mx-w-2xl mx-auto w-full my-auto space-y-8 relative z-20">
        
        {/* Navigation / Back link */}
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-mono font-medium text-zinc-500 hover:text-zinc-900 transition-colors uppercase tracking-widest"
          >
            <ArrowLeft size={14} />
            <span>Return to Archive</span>
          </Link>
        </div>

        {/* PROFILE CARD */}
        <div className="p-8 sm:p-12 rounded-3xl bg-white/70 backdrop-blur-3xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-8">
          
          {/* Avatar & Header Info */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-tr from-zinc-900 to-zinc-700 text-white font-medium text-xl flex items-center justify-center shadow-xl ring-4 ring-white/90 flex-shrink-0">
              {profile.image || profile.avatar_url ? (
                <img src={profile.image || profile.avatar_url} alt={profile.name || username} className="w-full h-full object-cover" />
              ) : (
                <span>{userInitials}</span>
              )}
            </div>

            <div className="space-y-2 overflow-hidden flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <h1 className="text-2xl sm:text-3xl font-serif font-normal text-zinc-900 tracking-tight">
                  {profile.name || username}
                </h1>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-50 border border-pink-200/60 text-pink-700 text-[10px] font-mono uppercase tracking-widest">
                    <ShieldCheck size={12} />
                    Admin
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-zinc-400 tracking-wider">
                @{profile.username || username}
              </p>
            </div>
          </div>

          {/* Bio Section */}
          {profile.bio && (
            <div className="pt-4 border-t border-zinc-200/60">
              <h3 className="text-[11px] font-mono uppercase tracking-widest text-zinc-400 mb-2">Biography</h3>
              <p className="text-base text-zinc-800 leading-relaxed font-normal whitespace-pre-wrap">
                {profile.bio}
              </p>
            </div>
          )}

          {/* Website Link */}
          {profile.website && (
            <div className="pt-4 border-t border-zinc-200/60">
              <h3 className="text-[11px] font-mono uppercase tracking-widest text-zinc-400 mb-2">External Link</h3>
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-zinc-900 hover:opacity-60 transition-opacity underline underline-offset-4 decoration-zinc-300"
              >
                <Globe size={15} className="text-zinc-500" />
                <span>{profile.website.replace(/^https?:\/\//, '')}</span>
              </a>
            </div>
          )}

        </div>

      </main>

      {/* FOOTER DIRECTORY */}
      <footer className="w-full max-w-4xl mx-auto flex justify-between items-center pt-6 border-t border-zinc-300/80 shrink-0 font-mono text-xs text-zinc-500 uppercase tracking-[0.25em] mt-16 z-20">
        <span>Merkurov Private Office</span>
        <span>Digital Heritage Architecture</span>
      </footer>

    </div>
  );
}
