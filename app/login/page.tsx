'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';
import { createClient } from '@/lib/supabase-browser';
import { ArrowLeft, KeyRound, Mail, Wallet, CheckCircle2 } from 'lucide-react';
export default function LoginPage() {
  const { user, isLoading, signInWithGoogle, signInWithPasskey } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [authMode, setAuthMode] = useState<'methods' | 'email'>('methods');
  const [email, setEmail] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isRegister, setIsRegister] = useState(false);
  const requestedReturnTo = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null;
  const returnTo = requestedReturnTo && requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//') ? requestedReturnTo : '/art-engine';

  useEffect(() => {
    setIsRegister(new URLSearchParams(window.location.search).get('mode') === 'register');
  }, []);

  useEffect(() => {
      if (!isLoading && user) {
      router.push(returnTo);
    }
  }, [user, isLoading, router]);

  // Отправка OTP через Supabase
  const handleEmailLogin = async (e: any) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(returnTo)}`,
        },
      });
      if (error) throw error;
      setEmailSent(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to dispatch secure access code');
    } finally {
      setSubmitting(false);
    }
  };

  // Проверка 6-значного кода (OTP)
  const handleVerifyOtp = async (e: any) => {
    e.preventDefault();
    if (otpToken.length !== 6) {
      setErrorMsg('Please enter a valid 6-digit verification code.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otpToken,
        type: 'email',
      });
      if (error) throw error;
      router.push(returnTo);
    } catch (err: any) {
      setErrorMsg(err.message || 'Invalid verification code');
    } finally {
      setSubmitting(false);
    }
  };

  // Обработка Passkey / WebAuthn
  const handlePasskeyLogin = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await signInWithPasskey();
      router.push(returnTo);
    } catch (err: any) {
      setErrorMsg(err.message || 'Passkey authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Вход через Web3-кошелек с подписанием сообщения (SIWE)
  const handleWalletLogin = async () => {
    setErrorMsg(null);
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      setErrorMsg('Web3 wallet not detected (e.g. MetaMask / Rabby)');
      return;
    }

    setSubmitting(true);
    try {
      const ethersMod = await import('ethers');
      const { ethers } = ethersMod as any;

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      const domain = window.location.host;
      const statement = 'Sign in to Merkurov Private Sanctuary';
      const issuedAt = new Date().toISOString();
      const message = `${domain} wants you to sign in with your Ethereum account:\n${address}\n\n${statement}\n\nIssued At: ${issuedAt}`;

      const signature = await signer.signMessage(message);

      const res = await fetch('/api/auth/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, message, signature }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      router.push(returnTo);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || 'Wallet authentication error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans flex flex-col justify-between px-6 py-12 selection:bg-black selection:text-white relative">
      
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Top bar */}
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between z-20">
        <Link 
          href="/" 
          className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-zinc-600 hover:text-black transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Return Home</span>
        </Link>
        <span className="font-mono text-xs uppercase tracking-[0.25em] text-zinc-400">
          Private Access
        </span>
      </div>

      {/* Center Liquid Glass Login Card */}
      <div className="max-w-md w-full mx-auto my-auto z-20 p-8 sm:p-12 rounded-3xl bg-white/80 backdrop-blur-2xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.04)] space-y-8 relative">
        <div className="space-y-3 text-center">
          <h1 className="text-3xl font-serif font-light tracking-tight text-zinc-900">
            {isRegister ? 'Create your profile' : 'Authentication'}
          </h1>
          <p className="font-serif text-sm text-zinc-600 leading-relaxed max-w-sm mx-auto">
            {isRegister ? 'Create one identity for your public profile, private office and creative ecosystem.' : 'Enter the private office ecosystem. Access your profile, archive and curated data stream.'}
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-mono text-[10px] uppercase">
            &gt; {errorMsg}
          </div>
        )}

        {authMode === 'methods' && (
          <div className="space-y-3.5">
            {/* GOOGLE OAUTH */}
            <button
              onClick={() => signInWithGoogle()}
              disabled={isLoading || submitting}
              className="w-full py-4 px-6 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-xs uppercase tracking-[0.2em] shadow-lg shadow-zinc-900/10 active:scale-95 transition-all flex items-center justify-center gap-3 cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.2 8.9 5 12 5z"/>
                <path fill="currentColor" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
                <path fill="currentColor" d="M5.3 14.7c-.2-.8-.4-1.7-.4-2.7s.2-1.9.4-2.7L1.6 6.4C.6 8.4 0 10.6 0 13s.6 4.6 1.6 6.6l3.7-2.9z"/>
                <path fill="currentColor" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.2-6.7-5.3L1.6 15.9C3.5 19.7 7.4 23 12 23z"/>
              </svg>
              <span>Continue with Google</span>
            </button>

            {/* PASSKEY / BIOMETRIC */}
            <button
              onClick={handlePasskeyLogin}
              disabled={isLoading || submitting}
              className="w-full py-4 px-6 rounded-full bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-900 font-mono text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-sm cursor-pointer"
            >
              <KeyRound size={16} className="text-zinc-700" />
              <span>Sign in with Passkey</span>
            </button>

            {/* WEB3 WALLET LOGIN */}
            <button
              onClick={handleWalletLogin}
              disabled={isLoading || submitting}
              className="w-full py-4 px-6 rounded-full bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-900 font-mono text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-sm cursor-pointer"
            >
              <Wallet size={16} className="text-zinc-700" />
              <span>Connect Web3 Wallet</span>
            </button>

            {/* EMAIL / MAGIC LINK / OTP TOGGLE */}
            <button
              onClick={() => setAuthMode('email')}
              className="w-full py-4 px-6 rounded-full bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-900 font-mono text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-sm cursor-pointer"
            >
              <Mail size={16} className="text-zinc-700" />
                  <span>{isRegister ? 'Create with Email & 6-Digit Code' : 'Email & 6-Digit Code (OTP)'}</span>
            </button>
          </div>
        )}

        {authMode === 'methods' && (
          <p className="pt-2 text-center font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {isRegister ? 'Already have an account?' : 'New here?'}{' '}
            <Link href={`${isRegister ? '/login' : '/register'}?next=${encodeURIComponent(returnTo)}`} className="text-zinc-900 underline underline-offset-4">
              {isRegister ? 'Sign in' : 'Create your profile'}
            </Link>
          </p>
        )}

        {authMode === 'email' && (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            {emailSent ? (
              <div className="p-6 rounded-2xl border border-zinc-200 bg-white/60 text-center space-y-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <p className="font-mono text-xs text-zinc-700 uppercase tracking-wider">
                  Verification code dispatched to <span className="text-black font-bold">{email}</span>
                </p>
                
                <div className="pt-2">
                  <label className="block font-mono text-[10px] text-zinc-500 uppercase tracking-widest mb-2">
                    Enter 6-Digit Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={otpToken}
                    onChange={(e: any) => setOtpToken(e.target.value)}
                    placeholder="000000"
                    className="w-full bg-white border border-zinc-300 rounded-2xl py-3 px-4 text-center text-black font-mono text-lg tracking-[0.5em] focus:outline-none focus:border-black transition-colors"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyOtp}
                    className="w-full mt-3 py-3 rounded-full bg-zinc-900 text-white font-mono text-xs uppercase tracking-[0.2em] cursor-pointer"
                  >
                    Verify Code
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => { setEmailSent(false); setOtpToken(''); }}
                  className="font-mono text-[10px] text-zinc-500 uppercase underline hover:text-black pt-2 block mx-auto"
                >
                  Use a different email
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
                    onChange={(e: any) => setEmail(e.target.value)}
                    placeholder="name@domain.com"
                    className="w-full bg-white border border-zinc-300 rounded-2xl py-3 px-4 text-black font-mono text-xs focus:outline-none focus:border-black transition-colors shadow-inner"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-4 px-6 rounded-full bg-zinc-900 text-white font-bold uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all font-mono text-[10px] shadow-md cursor-pointer"
                >
                  {submitting ? 'Sending...' : 'Send Secure Code'}
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('methods')}
                  className="w-full text-center font-mono text-[10px] text-zinc-500 uppercase tracking-widest hover:text-zinc-900 pt-2 block"
                >
                  ← Back to options
                </button>
              </>
            )}
          </form>
        )}
      </div>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center font-mono text-[10px] text-zinc-500 uppercase tracking-[0.3em] z-20">
        Merkurov Private Office &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
