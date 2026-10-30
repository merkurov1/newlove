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

  const requestedReturnTo =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('next')
      : null;

  const returnTo =
    requestedReturnTo &&
    requestedReturnTo.startsWith('/') &&
    !requestedReturnTo.startsWith('//')
      ? requestedReturnTo
      : '/art-engine';

  useEffect(() => {
    setIsRegister(
      new URLSearchParams(window.location.search).get('mode') === 'register'
    );
  }, []);

  useEffect(() => {
    if (!isLoading && user) {
      router.push(returnTo);
    }
  }, [user, isLoading, router, returnTo]);

  const handleEmailLogin = async (e: React.FormEvent) => {
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
      setErrorMsg(err.message || 'Failed to dispatch secure access code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
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
      const statement = 'Sign in to Merkurov Ecosystem';
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
    <div className="relative flex min-h-screen flex-col justify-between bg-[#FAF8F5] px-6 py-10 text-stone-900 selection:bg-stone-900 selection:text-white sm:px-8">
      {/* Noise background overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-10 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Top Header */}
      <header className="relative z-20 mx-auto flex w-full max-w-4xl items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-stone-500 transition-colors hover:text-stone-900"
        >
          <ArrowLeft size={14} />
          <span>Home</span>
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-stone-400">
          Merkurov Access
        </span>
      </header>

      {/* Auth Card Container */}
      <div className="relative z-20 my-auto mx-auto w-full max-w-md py-6">
        {/* Toggle Mode Tabs */}
        <div className="mb-6 flex rounded-full border border-stone-200 bg-stone-100/80 p-1 shadow-inner backdrop-blur-md">
          <Link
            href={`/login?next=${encodeURIComponent(returnTo)}`}
            className={`flex-1 rounded-full py-2.5 text-center font-mono text-[11px] uppercase tracking-[0.18em] transition-all ${
              !isRegister
                ? 'bg-white text-stone-950 shadow-sm font-semibold'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            Sign In
          </Link>
          <Link
            href={`/login?mode=register&next=${encodeURIComponent(returnTo)}`}
            className={`flex-1 rounded-full py-2.5 text-center font-mono text-[11px] uppercase tracking-[0.18em] transition-all ${
              isRegister
                ? 'bg-white text-stone-950 shadow-sm font-semibold'
                : 'text-stone-500 hover:text-stone-900'
            }`}
          >
            Register
          </Link>
        </div>

        {/* Card Body */}
        <div className="space-y-7 rounded-[2rem] border border-stone-200/90 bg-white/85 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.03)] backdrop-blur-2xl sm:p-10">
          <div className="space-y-2 text-center">
            <h1 className="font-serif text-3xl font-light tracking-tight text-stone-900 sm:text-4xl">
              {isRegister ? 'Join Platform' : 'Welcome Back'}
            </h1>
            <p className="font-serif text-sm leading-relaxed text-stone-600">
              {isRegister
                ? 'Create a unified identity for your profile and creative workspace.'
                : 'Sign in to access your profile, published works, and account settings.'}
            </p>
          </div>

          {errorMsg && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 font-mono text-xs text-rose-700">
              {errorMsg}
            </div>
          )}

          {authMode === 'methods' && (
            <div className="space-y-3">
              {/* GOOGLE OAUTH */}
              <button
                type="button"
                onClick={() => signInWithGoogle()}
                disabled={isLoading || submitting}
                className="group flex h-13 w-full items-center justify-center gap-3 rounded-full border border-stone-200 bg-white px-6 font-mono text-xs uppercase tracking-[0.16em] text-stone-900 shadow-sm transition-all hover:border-stone-400 hover:bg-stone-50 active:scale-[0.98] disabled:opacity-50"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.13C3.25 21.32 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.25c-.25-.72-.38-1.49-.38-2.25s.13-1.53.38-2.25V6.62H1.26C.46 8.23 0 10.06 0 12s.46 3.77 1.26 5.38l4.02-3.13z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.25 2.68 1.26 6.62l4.02 3.13c.95-2.83 3.6-4.93 6.72-4.93z"
                  />
                </svg>
                <span>Google Account</span>
              </button>

              {/* PASSKEY / BIOMETRIC */}
              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={isLoading || submitting}
                className="flex h-13 w-full items-center justify-center gap-3 rounded-full border border-stone-200 bg-white px-6 font-mono text-xs uppercase tracking-[0.16em] text-stone-900 shadow-sm transition-all hover:border-stone-400 hover:bg-stone-50 active:scale-[0.98] disabled:opacity-50"
              >
                <KeyRound size={16} className="text-stone-700" />
                <span>Passkey / Biometric</span>
              </button>

              {/* WEB3 WALLET LOGIN */}
              <button
                type="button"
                onClick={handleWalletLogin}
                disabled={isLoading || submitting}
                className="flex h-13 w-full items-center justify-center gap-3 rounded-full border border-stone-200 bg-white px-6 font-mono text-xs uppercase tracking-[0.16em] text-stone-900 shadow-sm transition-all hover:border-stone-400 hover:bg-stone-50 active:scale-[0.98] disabled:opacity-50"
              >
                <Wallet size={16} className="text-stone-700" />
                <span>Web3 Wallet</span>
              </button>

              {/* EMAIL OTP TOGGLE */}
              <button
                type="button"
                onClick={() => setAuthMode('email')}
                className="flex h-13 w-full items-center justify-center gap-3 rounded-full bg-stone-950 px-6 font-mono text-xs uppercase tracking-[0.18em] text-white shadow-md transition-all hover:bg-stone-800 active:scale-[0.98]"
              >
                <Mail size={16} className="text-stone-300" />
                <span>One-Time Email Code</span>
              </button>
            </div>
          )}

          {authMode === 'email' && (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              {emailSent ? (
                <div className="space-y-5 rounded-2xl border border-stone-200 bg-stone-50/60 p-6 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                  <p className="font-mono text-xs uppercase tracking-wider text-stone-700">
                    Code sent to <span className="font-bold text-stone-950">{email}</span>
                  </p>

                  <div className="space-y-3 pt-1">
                    <label className="block font-mono text-[10px] uppercase tracking-widest text-stone-500">
                      Enter 6-Digit Verification Code
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={otpToken}
                      onChange={(e) => setOtpToken(e.target.value)}
                      placeholder="000000"
                      className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3.5 text-center font-mono text-xl tracking-[0.5em] text-stone-950 outline-none transition-colors focus:border-stone-950"
                    />
                    <button
                      type="button"
                      onClick={handleVerifyOtp}
                      disabled={submitting || otpToken.length !== 6}
                      className="h-12 w-full rounded-full bg-stone-950 font-mono text-xs uppercase tracking-[0.18em] text-white transition-all hover:bg-stone-800 disabled:opacity-50"
                    >
                      Verify & Sign In
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEmailSent(false);
                      setOtpToken('');
                    }}
                    className="block mx-auto font-mono text-[10px] uppercase tracking-widest text-stone-500 underline hover:text-stone-900"
                  >
                    Change Email
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-2 text-left">
                    <label className="block font-mono text-[10px] uppercase tracking-widest text-stone-500">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3.5 font-mono text-xs text-stone-900 outline-none transition-colors focus:border-stone-950"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="h-12 w-full rounded-full bg-stone-950 font-mono text-xs uppercase tracking-[0.18em] text-white transition-all hover:bg-stone-800 disabled:opacity-50"
                  >
                    {submitting ? 'Sending Code...' : 'Send Access Code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode('methods')}
                    className="block w-full text-center font-mono text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-900"
                  >
                    ← All Options
                  </button>
                </>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-20 mx-auto w-full max-w-4xl text-center font-mono text-[10px] uppercase tracking-[0.3em] text-stone-400">
        Anton Merkurov Platform &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
