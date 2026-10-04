'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Radio, Flame, Compass, ShieldCheck, Moon, Sparkles, Trash2, Activity } from 'lucide-react';

interface ProfilePost {
  id: string | number;
  type: string;
  label: string;
  author: string;
  content: string;
  icon: any;
  color: string;
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

export default function ProfilePage() {
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function fetchUserLogs() {
      try {
        const res = await fetch('/api/temple_logs', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (!json || !Array.isArray(json.data)) return;

        const formatted: ProfilePost[] = json.data
          .filter((item: any) => {
            const type = (item.event_type || '').toLowerCase();
            return type !== 'enter' && type !== 'nav' && type !== 'confess';
          })
          .map((item: any, index: number) => {
            const type = (item.event_type || 'WHISPER').toUpperCase();
            const visuals = getEventVisuals(type);
            const cleanContent = String(item.message ?? '');

            return {
              id: item.id ?? `${item.created_at}-${index}`,
              type,
              label: visuals.label,
              author: item.author || 'Anonymous',
              content: cleanContent,
              icon: visuals.icon,
              color: visuals.color
            };
          });

        setPosts(formatted);
      } catch (e) {
        console.warn('Failed to load profile logs', e);
      } finally {
        setLoaded(true);
      }
    }

    fetchUserLogs();
  }, []);

  return (
    <div className="relative w-full min-h-[100dvh] bg-[#FAF8F5] text-stone-900 font-sans p-6 sm:p-12 flex flex-col items-center">
      <div className="w-full max-w-3xl mx-auto space-y-8">
        
        {/* Навигация назад */}
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
          <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-stone-300 shadow-inner bg-stone-100 flex items-center justify-center">
            {/* Аватар / Иконка */}
            <Image 
              src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/heartandangel/Angel1.png" 
              alt="Profile Avatar"
              fill
              className="object-contain p-2"
            />
          </div>
          <div className="text-center sm:text-left space-y-1">
            <h1 className="font-serif text-3xl font-normal text-stone-900">Sanctuary Profile</h1>
            <p className="font-mono text-xs uppercase tracking-widest text-stone-500">Connected to the Ether</p>
          </div>
        </div>

        {/* Список логов / Offerings (без дат и слова Seeker) */}
        <div className="bg-white/90 border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-xl backdrop-blur-md space-y-6">
          <h2 className="font-serif text-xl border-b pb-3 border-stone-200">Recent Offerings</h2>

          <div className="divide-y divide-stone-100">
            {!loaded ? (
              <p className="font-mono text-xs opacity-60 uppercase tracking-widest animate-pulse py-8 text-center">Loading offerings...</p>
            ) : posts.length === 0 ? (
              <p className="font-mono text-xs opacity-60 uppercase tracking-widest py-8 text-center">No offerings recorded yet.</p>
            ) : (
              posts.map((post) => {
                const IconComponent = post.icon || Radio;
                return (
                  <div key={post.id} className="py-4 flex items-center justify-between gap-4 text-sm">
                    <div className="flex items-center gap-3 shrink-0">
                      <div className={`w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center ${post.color}`}>
                        <IconComponent size={16} />
                      </div>
                      <span className="font-mono text-xs font-bold uppercase tracking-wider">{post.label}</span>
                    </div>

                    <div className="flex-1 font-serif font-light text-stone-800 truncate px-2 flex items-center gap-2 text-left">
                      <span className="font-medium text-stone-900 shrink-0">{post.author}</span>
                      <span className="opacity-40">•</span>
                      <span className="truncate opacity-90">{post.content}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
