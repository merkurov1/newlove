'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-browser';
import { useAuth } from '@/components/AuthContext';
import { KeyRound, Mail, CheckCircle2 } from 'lucide-react';
import ArtEngineWorkspace from '@/components/art-engine/ArtEngineWorkspace';

export default function ArtEngineClient() {
  const auth = useAuth() as any;
  const user = auth?.user;
  const isLoadingUser = auth?.isLoading;

  // Auth Modal State for Guest Login
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'request'>('signin');
  const [loginMethod, setLoginMethod] = useState<'main' | 'email'>('main');
  const [authEmail, setAuthEmail] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [requestSuccess, setRequestSuccess] = useState(false);

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession?.access_token) {
      headers.set('Authorization', `Bearer ${currentSession.access_token}`);
    }

    return fetch(url, { ...options, headers });
  };

  // Auth Handlers for Modal
  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login?next=%2Fart-engine`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setAuthError(err?.message || 'Google authentication error');
      setAuthLoading(false);
    }
  };

  const handlePasskeySignIn = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('WebAuthn is not supported by this browser.');
      }
      const { error } = await (supabase.auth as any).signInWithPasskey();
      if (error) throw error;
      setShowAuthModal(false);
    } catch (err: any) {
      setAuthError(err?.message || 'Passkey error');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailLogin = async (e: any) => {
    e.preventDefault();
    if (!authEmail) return;
    setAuthLoading(true);
    setAuthError('');

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/login?next=%2Fart-engine`,
        }
      });
      if (error) throw error;
      setEmailSent(true);
    } catch (err: any) {
      setAuthError(err.message || 'Failed to dispatch secure access code');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (e: any) => {
    e.preventDefault();
    if (otpToken.length !== 6) {
      setAuthError('Please enter a valid 6-digit verification code.');
      return;
    }
    setAuthLoading(true);
    setAuthError('');

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: authEmail,
        token: otpToken,
        type: 'email'
      });
      if (error) throw error;
      setShowAuthModal(false);
    } catch (err: any) {
      setAuthError(err.message || 'Invalid verification code');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRequestAccess = async (e: any) => {
    e.preventDefault();
    if (!authEmail) return;
    setAuthLoading(true);
    setAuthError('');

    try {
      const res = await fetch('/api/admin/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }

      setRequestSuccess(true);
    } catch (err: any) {
      setAuthError(err.message || 'Request error');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#111] selection:bg-black selection:text-white font-sans antialiased break-words">
      
      {/* AUTHENTICATION / REQUEST ACCESS MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-gray-200 max-w-md w-full p-8 shadow-2xl space-y-6 my-auto max-h-[90vh] overflow-y-auto rounded-3xl">
            
            <div className="flex justify-between items-start border-b border-gray-200 pb-4">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400 block mb-1">
                  {authMode === 'signin' ? 'ADMIN ACCESS' : 'ACCREDITATION SUITE'}
                </span>
                <h3 className="text-xl font-serif text-[#111]">
                  {authMode === 'signin' ? 'Sign In' : 'Request Access'}
                </h3>
              </div>
              <button 
                onClick={() => { setShowAuthModal(false); setAuthError(''); setRequestSuccess(false); setLoginMethod('main'); }}
                className="text-gray-400 hover:text-black text-sm font-mono p-2"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 border border-gray-200 p-0.5 bg-gray-50 text-xs font-mono rounded-xl">
              <button
                type="button"
                onClick={() => { setAuthMode('signin'); setAuthError(''); setRequestSuccess(false); }}
                className={`py-2.5 text-center uppercase tracking-wider transition rounded-lg ${authMode === 'signin' ? 'bg-white text-black font-bold shadow-sm' : 'text-gray-500 hover:text-black'}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('request'); setAuthError(''); }}
                className={`py-2.5 text-center uppercase tracking-wider transition rounded-lg ${authMode === 'request' ? 'bg-white text-black font-bold shadow-sm' : 'text-gray-500 hover:text-black'}`}
              >
                Request Access
              </button>
            </div>

            {authError && (
              <div className="bg-rose-50 border-l-2 border-rose-600 p-3 text-xs font-mono text-rose-800 rounded-xl">
                {authError}
              </div>
            )}

            {authMode === 'signin' ? (
              <div className="space-y-4">
                {loginMethod === 'main' ? (
                  <>
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={authLoading}
                      className="w-full bg-black hover:bg-gray-800 text-white font-mono text-xs uppercase tracking-[0.2em] py-4 px-6 transition disabled:opacity-50 flex items-center justify-center gap-3 font-bold rounded-2xl shadow-sm"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.2 8.9 5 12 5z"/>
                        <path fill="currentColor" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/>
                        <path fill="currentColor" d="M5.3 14.7c-.2-.8-.4-1.7-.4-2.7s.2-1.9.4-2.7L1.6 6.4C.6 8.4 0 10.6 0 13s.6 4.6 1.6 6.6l3.7-2.9z"/>
                        <path fill="currentColor" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.2-6.7-5.3L1.6 15.9C3.5 19.7 7.4 23 12 23z"/>
                      </svg>
                      <span>Continue with Google</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePasskeySignIn}
                      disabled={authLoading}
                      className="w-full bg-white hover:bg-gray-50 text-black border border-gray-300 font-mono text-xs uppercase tracking-widest py-3.5 transition disabled:opacity-50 flex items-center justify-center gap-2 font-bold rounded-2xl shadow-sm"
                    >
                      <KeyRound size={16} /> Sign in with Passkey
                    </button>

                    <button
                      type="button"
                      onClick={() => setLoginMethod('email')}
                      className="w-full bg-white hover:bg-gray-50 text-black border border-gray-300 font-mono text-xs uppercase tracking-widest py-3.5 transition disabled:opacity-50 flex items-center justify-center gap-2 font-bold rounded-2xl shadow-sm"
                    >
                      <Mail size={16} /> Email &amp; 6-Digit Code
                    </button>
                  </>
                ) : (
                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    {emailSent ? (
                      <div className="p-4 rounded-2xl border border-gray-200 bg-gray-50 text-center space-y-3">
                        <CheckCircle2 className="w-7 h-7 text-emerald-600 mx-auto" />
                        <p className="font-mono text-xs text-gray-700">
                          Code sent to <span className="font-bold">{authEmail}</span>
                        </p>
                        <div>
                          <input
                            type="text"
                            maxLength={6}
                            value={otpToken}
                            onChange={(e: any) => setOtpToken(e.target.value)}
                            placeholder="000000"
                            className="w-full bg-white border border-gray-300 rounded-xl py-3 text-center text-black font-mono text-lg tracking-[0.4em] focus:outline-none focus:border-black"
                          />
                          <button
                            type="button"
                            onClick={handleVerifyOtp}
                            className="w-full mt-2.5 py-3 rounded-xl bg-black text-white font-mono text-xs uppercase tracking-widest font-bold"
                          >
                            Verify Code
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setEmailSent(false); setOtpToken(''); }}
                          className="font-mono text-[10px] text-gray-500 uppercase underline"
                        >
                          Change email
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest block mb-1.5">
                            Email Address
                          </label>
                          <input 
                            type="email"
                            required
                            placeholder="name@domain.com"
                            value={authEmail}
                            onChange={(e: any) => setAuthEmail(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-300 px-3.5 py-3 text-sm text-black focus:outline-none focus:border-black font-mono rounded-xl"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={authLoading}
                          className="w-full bg-black hover:bg-gray-800 text-white font-mono text-xs uppercase tracking-widest py-3.5 transition font-bold rounded-xl"
                        >
                          {authLoading ? 'Sending...' : 'Send Secure Code'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setLoginMethod('main')}
                          className="w-full text-center font-mono text-[10px] text-gray-500 uppercase tracking-widest hover:text-black pt-1 block"
                        >
                          ← Back to options
                        </button>
                      </>
                    )}
                  </form>
                )}
              </div>
            ) : (
              requestSuccess ? (
                <div className="py-4 text-center space-y-3 font-mono">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto text-lg font-bold">✓</div>
                  <h4 className="text-black font-serif text-lg">Inquiry Registered</h4>
                  <p className="text-xs text-gray-500 leading-relaxed max-w-xs mx-auto">
                    Your institutional accreditation request for <span className="text-black font-bold">{authEmail}</span> has been queued.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setShowAuthModal(false); setRequestSuccess(false); setAuthEmail(''); }}
                    className="w-full bg-black text-white py-3 text-xs uppercase tracking-widest mt-2 font-bold rounded-xl"
                  >
                    Close Window
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRequestAccess} className="space-y-4 font-mono">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1.5">
                      Professional / Institutional Email
                    </label>
                    <input 
                      type="email"
                      required
                      placeholder="director@artgallery.com"
                      value={authEmail}
                      onChange={(e: any) => setAuthEmail(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 px-3.5 py-3 text-sm text-black focus:outline-none focus:border-black transition rounded-xl"
                    />
                    <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                      Access is restricted to verified art dealers, family offices, museum curators, and financial institutions.
                      This request is for terminal access only. Advisory, analysis or acquisition work is a separate service inquiry.
                    </p>
                    <p className="text-[10px] text-gray-500 mt-2 leading-relaxed">
                      <Link href="/advising" className="underline hover:text-black">
                        Discuss advisory work instead →
                      </Link>
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-black hover:bg-gray-800 text-white text-xs uppercase tracking-widest py-3.5 transition disabled:opacity-50 font-bold rounded-xl"
                  >
                    {authLoading ? 'Submitting Dossier...' : 'Submit Request'}
                  </button>
                </form>
              )
            )}

          </div>
        </div>
      )}

      <div className={user ? 'pt-24 sm:pt-28 pb-0' : 'max-w-7xl mx-auto pt-28 pb-24 px-6 md:px-12 space-y-8'}>
        
        {!isLoadingUser && !user ? (
          /* COMPACT ACCESS GATE FOR UNAUTHENTICATED USERS */
          <div className="mx-auto flex min-h-[58vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#9A9083]">
              Private workspace
            </span>
            <h2 className="mt-3 font-serif text-4xl font-light tracking-tight text-[#211F1F] sm:text-6xl">
              Art Engine
            </h2>
            <p className="mt-4 max-w-lg font-serif text-base italic leading-relaxed text-[#6B6358] sm:text-lg">
              Auction lot extraction, original catalogue images and a private Vault.
              Christie’s, Sotheby’s, Phillips and Bonhams.
            </p>

            <div className="mt-8 flex flex-col gap-3 font-mono sm:flex-row">
              <button
                onClick={() => { setAuthMode('signin'); setShowAuthModal(true); }}
                className="rounded-full bg-black px-8 py-3.5 text-[10px] uppercase tracking-[0.18em] text-white transition hover:bg-gray-800"
              >
                Sign In
              </button>
              <button
                onClick={() => { setAuthMode('request'); setShowAuthModal(true); }}
                className="rounded-full border border-black bg-white px-8 py-3.5 text-[10px] uppercase tracking-[0.18em] text-black transition hover:bg-gray-50"
              >
                Request Access
              </button>
            </div>

            <p className="mt-8 font-mono text-[9px] uppercase tracking-[0.16em] text-[#9A9083]">
              Extraction · Original images · Attempt history
            </p>
          </div>
        ) : (
          <ArtEngineWorkspace authFetch={authFetch} />
        )}

      </div>
    </div>
  );
}
