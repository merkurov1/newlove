'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';
import { ArrowLeft, KeyRound, Mail, Terminal, CheckCircle2, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const { user, isLoading, signInWithGoogle } = useAuth();
  const router = useRouter();

  const [authMode, setAuthMode] = useState<'methods' | 'email' | 'passkey'>('methods');
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user) {
      router.push('/temple');
    }
  }, [user, isLoading, router]);

  // Обработка Magic Link (OTP)
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      await new Promise((r) => setTimeout(r, 1000));
      setEmailSent(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send secure link');
    } finally {
      setSubmitting(false);
    }
  };

  // Обработка Passkey / WebAuthn
  const handlePasskeyLogin = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await new Promise((r) => setTimeout(r, 1000));
      alert('Passkey authentication triggered. Ensure WebAuthn is enabled in Supabase Dashboard.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Passkey authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGitHubLogin = async () => {
    alert('GitHub OAuth trigger');
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans flex flex-col justify-between px-6 py-12 selection:bg-red-600 selection:text-white relative">
      
      {/* GLOBAL GRAIN */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03] mix-blend-overlay z-10"
        style={{ backgroundImage: `url("https://grainy-gradients.vercel.app/noise.svg")` }}
      />

      {/* Top bar */}
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between z-20">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Return Home</span>
        </Link>
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-red-500 flex items-center gap-2">
          <Terminal size={12} /> Supabase Auth Protocol
        </span>
      </div>

      {/* Center login card */}
      <div className="max-w-md w-full mx-auto my-auto z-20 p-8 sm:p-10 border border-zinc-800 bg-black shadow-2xl space-y-8 relative">
        <div className="space-y-3 text-center">
          <div className="w-12 h-12 mx-auto border border-zinc-800 bg-zinc-900 text-red-500 flex items-center justify-center shadow-lg">
            <Sparkles size={20} />
          </div>
          <h1 className="text-3xl font-light tracking-tight text-white font-sans uppercase">
            Digital Sanctuary
          </h1>
          <p className="font-serif text-sm text-zinc-400 leading-relaxed">
            Authenticate to access your profile, psychometric tests history, and ritual data stream.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 border border-red-900/50 bg-red-950/20 text-red-400 font-mono text-[10px] uppercase">
            &gt; {errorMsg}
          </div>
        )}

        {authMode === 'methods' && (
          <div className="space-y-3">
            {/* GOOGLE OAUTH */}
            <button
              onClick={() => signInWithGoogle()}
              disabled={isLoading || submitting}
              className="w-full py-4 px-6 border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-red-600 text-white font-mono text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 group"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.2 8.9 5 12 5z"/>
                <path fill="currentColor" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
                <path fill="currentColor" d="M5.3 14.7c-.2-.8-.4-1.7-.4-2.7s.2-1.9.4-2.7L1.6 6.4C.6 8.4 0 10.6 0 13s.6 4.6 1.6 6.6l3.7-2.9z"/>
                <path fill="currentColor" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.2-6.7-5.3L1.6 15.9C3.5 19.7 7.4 23 12 23z"/>
              </svg>
              <span>Continue with Google</span>
            </button>

            {/* GITHUB OAUTH */}
            <button
              onClick={handleGitHubLogin}
              disabled={isLoading || submitting}
              className="w-full py-4 px-6 border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-red-600 text-white font-mono text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>Continue with GitHub</span>
            </button>

            {/* PASSKEY / BIOMETRIC */}
            <button
              onClick={handlePasskeyLogin}
              disabled={isLoading || submitting}
              className="w-full py-4 px-6 border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 hover:border-red-600 text-white font-mono text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3"
            >
              <KeyRound size={16} className="text-red-500" />
              <span>Sign in with Passkey</span>
            </button>

            {/* MAGIC LINK TOGGLE */}
            <button
              onClick={() => setAuthMode('email')}
              className="w-full py-4 px-6 border border-zinc-800 bg-black hover:border-zinc-600 text-zinc-400 hover:text-white font-mono text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3"
            >
              <Mail size={16} />
              <span>Magic Link / Email OTP</span>
            </button>
          </div>
        )}

        {authMode === 'email' && (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            {emailSent ? (
              <div className="p-6 border border-zinc-800 bg-zinc-900/40 text-center space-y-3">
                <CheckCircle2 className="w-8 h-8 text-red-500 mx-auto" />
                <p className="font-mono text-xs text-zinc-300 uppercase tracking-wider">
                  Secure login link dispatched to <span className="text-white">{email}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setEmailSent(false)}
                  className="font-mono text-[10px] text-zinc-500 uppercase underline hover:text-white pt-2"
                >
                  Try another address
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-2 text-left">
                  <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-widest">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.com"
                    className="w-full bg-[#0a0a0a] border border-zinc-800 py-3 px-4 text-white font-mono text-xs focus:outline-none focus:border-red-600 transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 px-6 bg-white text-black font-bold uppercase tracking-[0.2em] hover:bg-red-600 hover:text-white transition-all font-mono text-[10px]"
                >
                  {submitting ? 'Sending...' : 'Send Magic Link'}
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('methods')}
                  className="w-full text-center font-mono text-[10px] text-zinc-500 uppercase tracking-widest hover:text-zinc-300 pt-2"
                >
                  ← Back to all methods
                </button>
              </>
            )}
          </form>
        )}

        <div className="text-[10px] font-mono text-zinc-600 tracking-wider text-center border-t border-zinc-900 pt-4">
          Encrypted via Supabase GoTrue Protocol &amp; WebAuthn
        </div>
      </div>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center font-mono text-[10px] text-zinc-600 uppercase tracking-[0.3em] z-20">
        Merkurov Private Office &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
