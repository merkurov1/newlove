'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';
import { createClient } from '@/lib/supabase-browser';
import {
  loginReturnPathFromReferrer,
  resolveLoginReturnPath,
  safeLoginReturnPath,
} from '@/lib/auth/returnPath';
import { ArrowLeft, CheckCircle2, KeyRound, Mail, Wallet } from 'lucide-react';

type PendingMethod = 'google' | 'passkey' | 'wallet' | 'email' | null;

const DEFAULT_RETURN_PATH = '/art-engine';

const CALLBACK_ERROR_MESSAGE =
  'We could not complete sign-in. Please try again or choose another method.';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallback;
}

function LoginClient() {
  const { user, isLoading, signInWithGoogle, signInWithPasskey } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [pending, setPending] = useState<PendingMethod>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState(DEFAULT_RETURN_PATH);
  const [returnPathReady, setReturnPathReady] = useState(false);

  const callbackErrorHandledRef = useRef(false);
  const otpInputRef = useRef<HTMLInputElement | null>(null);

  const isRegister = searchParams?.get('mode') === 'register';
  const requestedReturnTo = searchParams?.get('next') ?? null;

  // Resolve the return path only on the client. The initial render stays
  // identical on the server and in the browser, avoiding a hydration mismatch.
  useEffect(() => {
    let stored: string | null = null;

    try {
      stored = window.localStorage.getItem('login_redirect_path');
    } catch {
      // Private browsing can make localStorage unavailable.
    }

    const referrer = loginReturnPathFromReferrer(document.referrer, window.location.origin);
    const resolved = resolveLoginReturnPath({
      requested: requestedReturnTo,
      stored,
      referrer,
      fallback: DEFAULT_RETURN_PATH,
    });

    setReturnTo(resolved);
    setReturnPathReady(true);

    try {
      // AuthContext reads this value when it builds the OAuth redirect.
      window.localStorage.setItem('login_redirect_path', resolved);
    } catch {
      // The in-memory value still drives router.push(returnTo).
    }
  }, [requestedReturnTo]);

  useEffect(() => {
    if (callbackErrorHandledRef.current) return;

    const callbackError = searchParams?.get('error');
    if (!callbackError) return;

    callbackErrorHandledRef.current = true;
    setErrorMsg(CALLBACK_ERROR_MESSAGE);
  }, [searchParams]);

  useEffect(() => {
    if (!isLoading && user && returnPathReady) {
      router.push(returnTo);
    }
  }, [user, isLoading, router, returnTo, returnPathReady]);

  useEffect(() => {
    if (emailSent) {
      otpInputRef.current?.focus();
    }
  }, [emailSent]);

  const linkNext =
    safeLoginReturnPath(requestedReturnTo) ?? safeLoginReturnPath(returnTo) ?? DEFAULT_RETURN_PATH;

  const isBusy = pending !== null;

  const handleGoogleLogin = async () => {
    if (isBusy) return;

    setPending('google');
    setErrorMsg(null);

    try {
      await signInWithGoogle();
    } catch (error) {
      setErrorMsg(errorMessage(error, 'Google sign-in could not be started.'));
      setPending(null);
    }
  };

  const handlePasskeyLogin = async () => {
    if (isBusy) return;

    setPending('passkey');
    setErrorMsg(null);

    try {
      await signInWithPasskey();
      router.push(returnTo);
    } catch (error) {
      setErrorMsg(errorMessage(error, 'Passkey authentication failed.'));
      setPending(null);
    }
  };

  const handleWalletLogin = async () => {
    if (isBusy) return;

    setErrorMsg(null);

    if (typeof window === 'undefined' || !(window as any).ethereum) {
      setErrorMsg('No Web3 wallet was detected. Install MetaMask, Rabby, or use another method.');
      return;
    }

    setPending('wallet');

    try {
      const ethersMod = await import('ethers');
      const { ethers } = ethersMod as any;

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      await provider.send('eth_requestAccounts', []);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      const nonceResponse = await fetch('/api/auth/wallet/nonce', { method: 'POST' });
      const nonceData = await nonceResponse.json().catch(() => ({}));
      if (!nonceResponse.ok || typeof nonceData.nonce !== 'string') {
        throw new Error(nonceData.error || 'Wallet sign-in is unavailable.');
      }

      const domain = window.location.host;
      const statement = 'Sign in to Merkurov Ecosystem';
      const issuedAt = new Date().toISOString();
      const message = [
        `${domain} wants you to sign in with your Ethereum account:`,
        address,
        '',
        statement,
        '',
        `URI: ${window.location.origin}`,
        'Version: 1',
        'Chain ID: 1',
        `Nonce: ${nonceData.nonce}`,
        `Issued At: ${issuedAt}`,
      ].join('\n');

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
    } catch (error) {
      setErrorMsg(errorMessage(error, 'Wallet authentication failed.'));
      setPending(null);
    }
  };

  const handleEmailLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isBusy) return;

    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setErrorMsg('Enter your email address to receive a sign-in code.');
      return;
    }

    setPending('email');
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(returnTo)}`,
          shouldCreateUser: true,
        },
      });

      if (error) throw error;

      setEmail(normalizedEmail);
      setEmailSent(true);
    } catch (error) {
      setErrorMsg(errorMessage(error, 'The sign-in code could not be sent.'));
    } finally {
      setPending(null);
    }
  };

  const handleVerifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isBusy) return;

    if (otpToken.length !== 6) {
      setErrorMsg('Enter the six-digit code from your email.');
      return;
    }

    setPending('email');
    setErrorMsg(null);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otpToken,
        type: 'email',
      });

      if (error) throw error;

      router.push(returnTo);
    } catch (error) {
      setErrorMsg(errorMessage(error, 'That verification code is not valid.'));
      setPending(null);
    }
  };

  const resetEmailFlow = () => {
    setEmailSent(false);
    setOtpToken('');
    setErrorMsg(null);
  };

  return (
    <div className="min-h-[70vh] bg-[#FAF8F5] px-5 pb-24 pt-28 text-[#111111] selection:bg-black selection:text-white sm:px-8 sm:pt-36">
      <div className="mx-auto w-full max-w-[30rem]">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-2 text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Home</span>
          </Link>
          <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-400">
            {isRegister ? 'New account' : 'Account access'}
          </span>
        </div>

        <header className="mt-10 border-b border-zinc-900/15 pb-7 sm:mt-14">
          <h1 className="font-serif text-4xl font-normal leading-[1.05] tracking-tight text-[#111111] sm:text-5xl">
            {isRegister ? 'Create your account' : 'Sign in'}
          </h1>
          <p className="mt-4 max-w-md font-serif text-base leading-relaxed text-zinc-600 sm:text-lg">
            {isRegister
              ? 'Confirm your identity with any method below. Your Newlove account is created on first use.'
              : 'Choose how you would like to confirm your identity.'}
          </p>
        </header>

        <nav aria-label="Authentication mode" className="mt-6 flex items-center gap-6">
          <Link
            href={`/login?next=${encodeURIComponent(linkNext)}`}
            aria-current={!isRegister ? 'page' : undefined}
            className={`min-h-[44px] border-b-2 pb-2 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 ${
              !isRegister
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            Sign in
          </Link>
          <Link
            href={`/login?mode=register&next=${encodeURIComponent(linkNext)}`}
            aria-current={isRegister ? 'page' : undefined}
            className={`min-h-[44px] border-b-2 pb-2 text-[11px] font-medium uppercase tracking-[0.18em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 ${
              isRegister
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-900'
            }`}
          >
            Register
          </Link>
        </nav>

        {errorMsg && (
          <div
            role="alert"
            aria-live="assertive"
            className="mt-6 border-l-2 border-red-700 bg-red-50/70 px-4 py-3 text-sm leading-relaxed text-red-800"
          >
            {errorMsg}
          </div>
        )}

        <div className="mt-7 space-y-3">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading || isBusy}
            aria-busy={pending === 'google'}
            className="group flex min-h-[52px] w-full items-center justify-center gap-3 border border-zinc-900 bg-zinc-900 px-5 text-[11px] font-medium uppercase tracking-[0.18em] text-white transition-colors hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#FFFFFF"
                d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.37z"
              />
              <path
                fill="#FFFFFF"
                opacity=".78"
                d="M12 22c2.7 0 4.96-.9 6.62-2.4l-3.24-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.6-4.12H3.05v2.58A10 10 0 0 0 12 22z"
              />
              <path
                fill="#FFFFFF"
                opacity=".58"
                d="M6.4 13.94a6 6 0 0 1 0-3.88V7.48H3.05a10 10 0 0 0 0 9.04l3.35-2.58z"
              />
              <path
                fill="#FFFFFF"
                opacity=".9"
                d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.95 5.48l3.35 2.58C7.2 7.7 9.4 5.94 12 5.94z"
              />
            </svg>
            <span>{pending === 'google' ? 'Opening Google…' : 'Continue with Google'}</span>
          </button>

          <div className="flex items-center gap-4 py-2" aria-hidden="true">
            <span className="h-px flex-1 bg-zinc-900/10" />
            <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-400">or</span>
            <span className="h-px flex-1 bg-zinc-900/10" />
          </div>

          {emailSent ? (
            <div
              role="status"
              aria-live="polite"
              className="border border-zinc-900/15 bg-white p-5 sm:p-6"
            >
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-serif text-lg leading-snug text-zinc-900">Check your inbox</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                    We sent a six-digit code to{' '}
                    <span className="font-medium text-zinc-900">{email}</span>.
                  </p>
                </div>
              </div>

              <form onSubmit={handleVerifyOtp} className="mt-5 space-y-3">
                <label
                  htmlFor="login-otp"
                  className="block text-[10px] uppercase tracking-[0.2em] text-zinc-500"
                >
                  Verification code
                </label>
                <input
                  ref={otpInputRef}
                  id="login-otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otpToken}
                  onChange={(event) =>
                    setOtpToken(event.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="000000"
                  aria-describedby="login-otp-hint"
                  className="w-full border border-zinc-300 bg-white px-4 py-3 text-center font-mono text-xl tracking-[0.45em] text-zinc-900 outline-none transition-colors focus:border-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                />
                <p id="login-otp-hint" className="text-xs leading-relaxed text-zinc-500">
                  The code expires shortly. You can request a new one if it does not arrive.
                </p>
                <button
                  type="submit"
                  disabled={pending === 'email' || otpToken.length !== 6}
                  className="min-h-[48px] w-full border border-zinc-900 bg-zinc-900 px-5 text-[11px] font-medium uppercase tracking-[0.18em] text-white transition-colors hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pending === 'email' ? 'Verifying…' : 'Verify and sign in'}
                </button>
                <button
                  type="button"
                  onClick={resetEmailFlow}
                  className="min-h-[44px] w-full text-center text-[10px] uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900"
                >
                  Use a different email
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleEmailLogin} className="space-y-3">
              <label htmlFor="login-email" className="sr-only">
                Email address
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email address"
                className="min-h-[52px] w-full border border-zinc-300 bg-white px-4 text-base text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
              />
              <button
                type="submit"
                disabled={isLoading || isBusy}
                className="min-h-[48px] w-full border border-zinc-900 bg-transparent px-5 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending === 'email'
                  ? 'Sending code…'
                  : isRegister
                    ? 'Send registration code'
                    : 'Send sign-in code'}
              </button>
            </form>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={isLoading || isBusy}
              aria-busy={pending === 'passkey'}
              className="flex min-h-[48px] items-center justify-center gap-2 border border-zinc-300 bg-transparent px-3 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-800 transition-colors hover:border-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <KeyRound size={15} aria-hidden="true" />
              <span>{pending === 'passkey' ? 'Waiting…' : 'Passkey'}</span>
            </button>
            <button
              type="button"
              onClick={handleWalletLogin}
              disabled={isLoading || isBusy}
              aria-busy={pending === 'wallet'}
              className="flex min-h-[48px] items-center justify-center gap-2 border border-zinc-300 bg-transparent px-3 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-800 transition-colors hover:border-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Wallet size={15} aria-hidden="true" />
              <span>{pending === 'wallet' ? 'Waiting…' : 'Wallet'}</span>
            </button>
          </div>
        </div>

        <p className="mt-8 border-t border-zinc-900/10 pt-5 font-serif text-sm leading-relaxed text-zinc-500">
          No password to remember. The same identity methods sign you in and create your account.
        </p>

        <p className="mt-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-zinc-400">
          <Mail size={13} aria-hidden="true" />
          <span>Email sign-in uses a one-time code</span>
        </p>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="min-h-[70vh] bg-[#FAF8F5] px-5 pb-24 pt-28 sm:px-8 sm:pt-36">
      <div className="mx-auto w-full max-w-[30rem] space-y-6" aria-hidden="true">
        <div className="h-3 w-24 bg-zinc-200" />
        <div className="h-12 w-72 max-w-full bg-zinc-200/80" />
        <div className="h-4 w-full max-w-sm bg-zinc-200/60" />
        <div className="h-[52px] w-full bg-zinc-200/70" />
        <div className="h-[52px] w-full bg-zinc-200/50" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginClient />
    </Suspense>
  );
}
