'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';
import { ArrowLeft, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const { user, isLoading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.push('/temple');
    }
  }, [user, isLoading, router]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans flex flex-col justify-between px-6 py-12 selection:bg-black selection:text-white relative">
      
      {/* Background grain */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25'filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Top bar */}
      <div className="max-w-4xl mx-w-full w-full mx-auto flex items-center justify-between z-20">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-zinc-600 hover:text-black transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Return Home</span>
        </Link>
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-400">Merkurov Access</span>
      </div>

      {/* Center login card */}
      <div className="max-w-md w-full mx-auto my-auto z-20 p-8 sm:p-10 rounded-3xl bg-white/80 backdrop-blur-2xl border border-zinc-200 shadow-[0_20px_50px_rgba(0,0,0,0.04)] text-center space-y-8">
        <div className="space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-zinc-900 text-white flex items-center justify-center shadow-md">
            <Sparkles size={20} />
          </div>
          <h1 className="text-3xl font-serif font-light tracking-tight text-zinc-900">Digital Sanctuary</h1>
          <p className="text-sm text-zinc-500 font-normal leading-relaxed">
            Authenticate to access your profile, psychometric tests history, and ritual data stream.
          </p>
        </div>

        <button
          onClick={() => signInWithGoogle()}
          disabled={isLoading}
          className="w-full py-4 px-6 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-xs uppercase tracking-[0.2em] shadow-lg shadow-zinc-900/10 active:scale-95 transition-all flex items-center justify-center gap-3"
        >
          <span>Continue with Google</span>
        </button>

        <div className="text-[11px] font-mono text-zinc-400 tracking-wider">
          Secure Internal Supabase Protocol
        </div>
      </div>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center font-mono text-[10px] text-zinc-400 uppercase tracking-[0.3em] z-20">
        Merkurov Private Office &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
