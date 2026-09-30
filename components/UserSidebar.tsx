"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { User, Users, Settings } from 'lucide-react';
import { useAuth } from './AuthContext';
import { createClient as createBrowserClient } from '@/lib/supabase-browser';

export default function UserSidebar() {
  const { user, profile, roles, isLoading } = useAuth();
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const checkRole = async () => {
      try {
        const sb = createBrowserClient();
        const { data: sessData } = await sb.auth.getSession();
        const sess = (sessData || {}).session || null;
        if (!sess) return;

        const res = await fetch('/api/user/role', { credentials: 'same-origin' });
        const json = await res.json().catch(() => null);
        if (!mounted) return;
        if (json && json.role) setEffectiveRole(String(json.role).toUpperCase());
      } catch (e) {
        // ignore
      }
    };
    checkRole();
    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading || !user) return null;

  const username = profile?.username || user?.user_metadata?.username || (user as any)?.username || null;
  const profileHref = username ? `/you/${username}` : '/profile';

  const roleFromClient =
    Array.isArray(roles) && roles.length
      ? roles[0]
      : ((user as any)?.role && String((user as any).role).toUpperCase()) || 'USER';
  const roleNorm = effectiveRole || roleFromClient || 'USER';

  const userImage =
    profile?.image ||
    profile?.avatar_url ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    (user as any)?.image ||
    null;
  const userName = profile?.name || user?.user_metadata?.name || user?.email || '';
  const isAdmin = roleNorm === 'ADMIN';

  return (
    <div className="w-full border-t border-zinc-200/60 bg-white/40 backdrop-blur-xl flex flex-row items-center justify-center py-3 px-6 gap-6 text-zinc-700">
      {userImage && (
        <div className="w-9 h-9 rounded-full overflow-hidden border border-zinc-200 shadow-inner flex-shrink-0">
          <Image
            src={userImage}
            alt={userName}
            width={36}
            height={36}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <nav className="flex flex-row items-center gap-3">
        <Link
          href={profileHref}
          className="flex items-center gap-2 px-3.5 py-2 rounded-full hover:bg-white/80 text-xs font-mono uppercase tracking-wider transition-all border border-transparent hover:border-zinc-200 shadow-sm"
          title="Profile"
        >
          <User size={15} className="text-zinc-500" />
          <span>Profile</span>
        </Link>

        <Link
          href="/users"
          className="flex items-center gap-2 px-3.5 py-2 rounded-full hover:bg-white/80 text-xs font-mono uppercase tracking-wider transition-all border border-transparent hover:border-zinc-200 shadow-sm"
          title="Community"
        >
          <Users size={15} className="text-zinc-500" />
          <span>Community</span>
        </Link>

        {isAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-2 px-3.5 py-2 rounded-full hover:bg-pink-50/80 text-xs font-mono uppercase tracking-wider text-pink-700 transition-all border border-pink-200/60 shadow-sm"
            title="Admin Panel"
          >
            <Settings size={15} className="text-pink-600" />
            <span>Admin</span>
          </Link>
        )}
      </nav>

      {!username && (
        <div className="hidden md:block text-[11px] font-mono text-amber-700 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
          Set username in profile to enable public link
        </div>
      )}
    </div>
  );
}
