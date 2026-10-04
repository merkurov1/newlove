'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import Header from '@/components/Header';
import { ArrowLeft, Flame, Trash2, ShieldCheck, Moon, Sparkles, Radio } from 'lucide-react';

function getEventVisuals(eventType: string) {
  switch (eventType?.toUpperCase()) {
    case 'VIGIL':
    case 'VIGIL_SPARK':
      return { icon: Flame, color: 'text-amber-500', label: 'Vigil' };
    case 'ASH':
      return { icon: Trash2, color: 'text-rose-500', label: 'Let It Go' };
    case 'CAST':
      return { icon: Sparkles, color: 'text-indigo-400', label: 'Cast' };
    case 'ABSOLUTION':
      return { icon: ShieldCheck, color: 'text-emerald-400', label: 'Absolution' };
    case 'HEARTANDANGEL':
    case 'MEDITATION':
    case 'SILENCE':
      return { icon: Moon, color: 'text-purple-400', label: 'Calm' };
    default:
      return { icon: Radio, color: 'text-stone-400', label: eventType || 'Whisper' };
  }
}

function formatTime(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

export default function PublicProfilePage() {
  const params = useParams();
  const userId = params?.id as string;
  
  const supabase = createClient();

  const [profile, setProfile] = useState<any>(null);
  const [userLogs, setUserLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfileData() {
      if (!userId) return;
      setLoading(true);

      try {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        
        let profileQuery = supabase.from('profiles').select('*');
        if (uuidRegex.test(userId)) {
          profileQuery = profileQuery.eq('id', userId);
        } else {
          profileQuery = profileQuery.eq('username', userId);
        }

        const { data: profileData, error: profileError } = await profileQuery.maybeSingle();

        let currentProfile = profileData;
        if (profileError || !profileData) {
          currentProfile = {
            id: userId,
            full_name: 'Sanctuary Seeker',
            bio: 'A quiet traveler within the Heart & Angel ecosystem.',
            role: 'Guardian',
          };
        }
        setProfile(currentProfile);

        const authorName = currentProfile.full_name || currentProfile.username || 'Anonymous';
        const { data: logsData } = await supabase
          .from('temple_log')
          .select('*')
          .or(`author.ilike.%${authorName}%,user_id.eq.${userId}`)
          .order('created_at', { ascending: false })
          .limit(20);

        if (logsData) {
          setUserLogs(logsData);
        }
      } catch (e) {
        console.error('Error fetching sanctuary profile:', e);
      } finally {
        setLoading(false);
      }
    }

    fetchProfileData();
  }, [userId, supabase]);

  const getInitials = (name?: string) => {
    if (!name) return 'H&A';
    return name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  };

  if (loading || !userId) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] text-stone-900 font-sans flex flex-col justify-between">
        <Header />
        <div className="max-w-4xl mx-auto w-full px-6 py-32 text-center my-auto space-y-4 animate-pulse">
          <div className="w-16 h-16 bg-stone-200 rounded-full mx-auto" />
          <div className="h-6 bg-stone-200 w-48 mx-auto rounded" />
          <div className="h-4 bg-stone-200 w-72 mx-auto rounded" />
        </div>
      </div>
    );
  }

  const vigilsCount = userLogs.filter(l => (l.event_type || '').toLowerCase().includes('vigil')).length;
  const ashesCount = userLogs.filter(l => (l.event_type || '').toLowerCase() === 'ash').length;

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 font-sans selection:bg-stone-900 selection:text-white antialiased">
      <Header />

      <main className="max-w-4xl mx-auto pt-32 sm:pt-36 pb-24 px-4 sm:px-6 lg:px-8 space-y-10">
        <div>
          <Link 
            href="/heartandangel/world" 
            className="inline-flex items-center gap-2 font-serif text-xs uppercase tracking-widest text-stone-500 hover:text-stone-900 transition-colors"
          >
            <ArrowLeft size={14} />
            <span>Back to Sanctuary World</span>
          </Link>
        </div>

        <div className="bg-white/85 backdrop-blur-md border border-stone-200 p-8 sm:p-10 rounded-3xl space-y-8 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
            <div className="w-20 h-20 rounded-2xl bg-stone-900 text-white flex items-center justify-center font-serif text-2xl tracking-widest shrink-0 shadow-md">
              {profile?.avatar_url || profile?.image ? (
                <img src={profile.avatar_url || profile.image} alt="Avatar" className="w-full h-full object-cover rounded-2xl" />
              ) : (
                getInitials(profile?.full_name || profile?.username)
              )}
            </div>

            <div className="space-y-2 flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase px-3 py-1 bg-stone-100 border border-stone-200 text-stone-600 rounded-full">
                  {profile?.role || 'Sanctuary Guardian'}
                </span>
                <span className="font-mono text-[10px] tracking-widest text-stone-400">
                  ID: {userId.slice(0, 8)}...
                </span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-serif font-light text-stone-900 tracking-tight">
                {profile?.full_name || profile?.username || 'Seeker Dossier'}
              </h1>

              {profile?.bio && (
                <p className="font-serif italic text-stone-600 text-sm sm:text-base max-w-2xl leading-relaxed pt-1">
                  {profile.bio}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-t border-stone-200/80 pt-6 font-mono text-xs text-stone-500">
            <div>
              <span className="block text-[10px] text-stone-400 uppercase tracking-widest">Total Offerings</span>
              <span className="text-stone-900 font-bold text-sm">{userLogs.length} Traces</span>
            </div>
            <div>
              <span className="block text-[10px] text-stone-400 uppercase tracking-widest">Vigil Sparks</span>
              <span className="text-amber-600 font-bold text-sm">{vigilsCount} Lit</span>
            </div>
            <div>
              <span className="block text-[10px] text-stone-400 uppercase tracking-widest">Ashes Released</span>
              <span className="text-rose-600 font-bold text-sm">{ashesCount} Let Go</span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex justify-between items-center border-b border-stone-200 pb-4">
            <h2 className="text-xl font-serif text-stone-900">Sanctuary Traces &amp; Offerings</h2>
            <span className="font-mono text-xs text-stone-400 uppercase tracking-widest">Ether Ledger</span>
          </div>

          {userLogs.length === 0 ? (
            <div className="bg-white/85 backdrop-blur-md border border-dashed border-stone-300 p-12 text-center rounded-3xl space-y-2 font-mono">
              <p className="text-xs text-stone-400 uppercase tracking-wider">No offerings recorded in the ether for this seeker yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {userLogs.map((log) => {
                const type = (log.event_type || 'WHISPER').toUpperCase();
                const visuals = getEventVisuals(type);
                const IconComp = visuals.icon;

                return (
                  <div 
                    key={log.id} 
                    className="bg-white/90 border border-stone-200 p-4 sm:p-5 rounded-2xl shadow-sm flex items-center justify-between gap-4 text-xs sm:text-sm transition hover:border-stone-400"
                  >
                    <div className="flex items-center gap-3 shrink-0">
                      <div className={`w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center ${visuals.color}`}>
                        <IconComp size={16} />
                      </div>
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-stone-800">{visuals.label}</span>
                    </div>

                    <div className="flex-1 font-serif text-xs sm:text-sm font-light text-stone-700 truncate px-2 text-left">
                      {log.message}
                    </div>

                    <div className="font-mono text-[10px] text-stone-400 shrink-0 text-right">
                      {formatTime(log.created_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </main>

      <footer className="max-w-4xl mx-auto w-full px-6 py-12 text-center font-mono text-[10px] text-stone-400 uppercase tracking-[0.3em] border-t border-stone-200/60">
        Heart &amp; Angel Sanctuary &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
