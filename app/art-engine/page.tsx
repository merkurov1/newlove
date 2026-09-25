'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

export default function ArtEngineDashboard() {
  const supabase = createClientComponentClient();

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'request'>('signin');
  
  // Auth Form State
  const [authEmail, setAuthEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [requestSuccess, setRequestSuccess] = useState(false);

  // Ingestion State
  const [input, setInput] = useState({ 
    artist: '', 
    title: '', 
    link: '', 
    raw: '', 
    image_url: '', 
    specs: { medium: '', dimensions: '', estimate: '', date: '', provenance: '' }
  });

  const [output, setOutput] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [autoProcessing, setAutoProcessing] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [copyStatus, setCopyStatus] = useState(false);
  const [statusText, setStatusText] = useState<string>('Ready for accession');

  // Vault Gallery State
  const [lots, setLots] = useState<any[]>([]);
  const [loadingLots, setLoadingLots] = useState(true);
  const [activeTab, setActiveTab] = useState<'parser' | 'vault'>('parser');

  // Auth Initialization
  useEffect(() => {
    async function initAuth() {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
      setUser(currentSession?.user || null);
      setLoadingUser(false);
    }

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, currentSession: Session | null) => {
      setSession(currentSession);
      setUser(currentSession?.user || null);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Fetch Lots for Vault
  const fetchLots = useCallback(async () => {
    setLoadingLots(true);
    const { data, error } = await supabase
      .from('lots')
      .select('id, artist, title, year, medium, estimate, image_path, source_url, auction_house, created_at')
      .order('created_at', { ascending: false })
      .limit(18);

    if (!error && data) {
      setLots(data);
    }
    setLoadingLots(false);
  }, [supabase]);

  useEffect(() => {
    fetchLots();
  }, [fetchLots]);

  const handleReset = () => {
    if (output && !isSaved) {
      if (!confirm('Discard unsaved curatorial dossier?')) return;
    }
    setInput({
      artist: '',
      title: '',
      link: '',
      raw: '',
      image_url: '',
      specs: { medium: '', dimensions: '', estimate: '', date: '', provenance: '' }
    });
    setOutput(null);
    setImgError(false);
    setIsSaved(false);
    setStatusText('Ready for accession');
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInput(prev => ({ ...prev, link: text }));
    } catch {
      // Ignore if permission denied
    }
  };

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    };

    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    return fetch(url, { ...options, headers });
  };

  // AUTH 1: Send OTP Code
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail) return;
    setAuthLoading(true);
    setAuthError('');

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail,
        options: { shouldCreateUser: true }
      });

      if (error) throw error;
      setOtpSent(true);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error sending code';
      setAuthError(errorMessage);
    } finally {
      setAuthLoading(false);
    }
  };

  // AUTH 2: Verify OTP Code
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !otpCode) return;
    setAuthLoading(true);
    setAuthError('');

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: authEmail,
        token: otpCode,
        type: 'email',
      });

      if (error) throw error;

      if (data.session) {
        setSession(data.session);
        setUser(data.user);
        setShowAuthModal(false);
        setOtpSent(false);
        setOtpCode('');
        setAuthEmail('');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Invalid code';
      setAuthError(errorMessage);
    } finally {
      setAuthLoading(false);
    }
  };

  // REQUEST ACCESS HANDLER
  const handleRequestAccess = async (e: React.FormEvent) => {
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Request error';
      setAuthError(errorMessage);
    } finally {
      setAuthLoading(false);
    }
  };

  // AUTH 3: Passkey / WebAuthn Sign-In
  const handlePasskeySignIn = async () => {
    setAuthLoading(true);
    setAuthError('');

    try {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('WebAuthn is not supported by this browser environment.');
      }

      const authClient = supabase.auth as any;
      if (typeof authClient.signInWithWebAuthn === 'function') {
        await authClient.signInWithWebAuthn();
      }

      const { data: { session: newSession } } = await supabase.auth.getSession();
      if (newSession) {
        setSession(newSession);
        setUser(newSession?.user || null);
        setShowAuthModal(false);
        return;
      }
      
      throw new Error('Passkey authentication session not established. Please use 6-digit email OTP.');
      
    } catch (err: unknown) {
      const { data: { session: fallbackSession } } = await supabase.auth.getSession();
      if (fallbackSession) {
        setSession(fallbackSession);
        setUser(fallbackSession?.user || null);
        setShowAuthModal(false);
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Passkey error';
        setAuthError(errorMessage);
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  // PIPELINE 1: PARSE URL
  const handleAutoParse = async () => {
    if (!input.link) return;
    setParsing(true);
    setImgError(false);
    setIsSaved(false);
    setStatusText('Extracting metadata...');

    try {
      const res = await authFetch('/api/admin/parse-url', {
        method: 'POST',
        body: JSON.stringify({ url: input.link })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || `Server returned status ${res.status}`);

      const bestImage = data.image_url || data.extracted?.imageUrl || '';
      let bestTitle = data.title || data.extracted?.title || '';
      let bestArtist = data.artist || data.extracted?.artist || '';
      const extractedSpecs = data.extracted?.specs || data.specs || {};

      if (!bestArtist && bestTitle) {
        const knownArtists = ['Banksy', 'Andy Warhol', 'KAWS', 'Damien Hirst', 'Pablo Picasso', 'Jean-Michel Basquiat'];
        const matched = knownArtists.find(a => bestTitle.toLowerCase().includes(a.toLowerCase()));
        if (matched) bestArtist = matched;
      }

      setInput(prev => ({
        ...prev,
        artist: bestArtist || prev.artist,
        title: bestTitle || prev.title,
        image_url: bestImage || prev.image_url,
        specs: { ...prev.specs, ...extractedSpecs },
        raw: JSON.stringify(data.extracted || data, null, 2)
      }));

      setStatusText(`Extracted: ${bestArtist || 'Unknown Work'}`);

      return { 
        bestArtist, 
        bestTitle, 
        bestImage, 
        specs: extractedSpecs,
        rawData: data.extracted || data 
      };

    } catch (e: unknown) { 
      const msg = e instanceof Error ? e.message : 'Parse error';
      setStatusText(`Error: ${msg}`);
      alert(`Parse failed: ${msg}`); 
      return null;
    } finally { 
      setParsing(false); 
    }
  };

  // PIPELINE 2: GENERATE ESSAY
  const generate = async (customContext?: { artist?: string; title?: string; specs?: any; rawData?: any }) => {
    setLoading(true);
    setStatusText('Synthesizing curatorial dossier...');

    const targetArtist = customContext?.artist || input.artist;
    const targetTitle = customContext?.title || input.title;
    const targetSpecs = customContext?.specs || input.specs;
    const targetRaw = customContext?.rawData || input.raw;

    try {
      const res = await authFetch('/api/admin/generate_lot', {
        method: 'POST',
        body: JSON.stringify({
          artist: targetArtist,
          title: targetTitle,
          link: input.link,
          specs: targetSpecs,
          rawData: targetRaw
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || `Server returned status ${res.status}`);

      const resultLot = data.lot || data;
      setOutput(resultLot);

      if (resultLot.artist) setInput(prev => ({ ...prev, artist: resultLot.artist }));
      if (resultLot.title) setInput(prev => ({ ...prev, title: resultLot.title }));

      setStatusText('Dossier synthesized');
      return resultLot;
    } catch (e: unknown) { 
      const msg = e instanceof Error ? e.message : 'Generation error';
      setStatusText(`Error: ${msg}`);
      alert(`Generation failed: ${msg}`); 
      return null;
    } finally { 
      setLoading(false); 
    }
  };

  // PIPELINE 3: SAVE TO VAULT
  const saveToVault = async (customOutput?: any, customImage?: string) => {
    const lotToSave = customOutput || output;
    if (!lotToSave || isSaved) return;
    setSaving(true);
    setStatusText('Persisting record to Vault...');

    const imageUrlToSend = customImage || input.image_url || lotToSave.image_url || lotToSave.imageUrl || '';

    try {
      const res = await authFetch('/api/admin/save-lot', {
        method: 'POST',
        body: JSON.stringify({
          artist: input.artist || lotToSave.artist,
          title: input.title || lotToSave.title,
          link: input.link,
          image_url: imageUrlToSend,
          specs: input.specs,
          ai_content: lotToSave
        })
      });

      const data = await res.json();
      if (data.success || data.lot_id || data.id) {
        setIsSaved(true);
        setStatusText('Cataloged in Vault');
        fetchLots();
      } else {
        throw new Error(data.error || 'API Error during save');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save error';
      setStatusText(`Save error: ${msg}`);
      alert(`Save Failed: ${msg}`);
    } finally { 
      setSaving(false); 
    }
  };

  // PIPELINE 4: ONE-CLICK AUTOMATION
  const handleOneClickPipeline = async () => {
    if (!input.link) return alert('Provide an auction link');
    setAutoProcessing(true);
    setIsSaved(false);
    
    const parseResult = await handleAutoParse();
    if (!parseResult) return setAutoProcessing(false);

    const aiResult = await generate({
      artist: parseResult.bestArtist,
      title: parseResult.bestTitle,
      specs: parseResult.specs,
      rawData: parseResult.rawData
    });
    if (!aiResult) return setAutoProcessing(false);

    await saveToVault(aiResult, parseResult.bestImage);
    setAutoProcessing(false);
  };

  const handleCopyDossier = () => {
    if (!output) return;
    const text = `# ${output.artist || input.artist}\n*${output.title || input.title}* (${output.year || ''})\n\n${output.curatorial_essay || ''}\n\nProvenance:\n${(output.provenance || []).map((p: string) => `- ${p}`).join('\n')}`;
    navigator.clipboard.writeText(text);
    setCopyStatus(true);
    setTimeout(() => setCopyStatus(false), 2000);
  };

  const getInitials = (name?: string) => {
    if (!name) return 'CE';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <>
      {/* Next.js Meta and Open Graph Tags for Social Media & Messengers */}
      <head>
        <title>Art Intelligence Terminal | Institutional Art Advisory</title>
        <meta name="description" content="Professional-grade terminal engineered for art dealers, family offices, and private banking art-lending specialists." />
        
        {/* Open Graph / Facebook / LinkedIn / Telegram / WhatsApp */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Art Intelligence Terminal | Curator Engine" />
        <meta property="og:description" content="Institutional art advisory, automated lot parsing, and high-end investment memoranda synthesis." />
        <meta property="og:url" content="https://merkurov.love" />
        <meta property="og:image" content="https://merkurov.love/og-image.jpg" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Art Intelligence Terminal | Curator Engine" />
        <meta name="twitter:description" content="Institutional art advisory and market intelligence terminal." />
        <meta name="twitter:image" content="https://merkurov.love/og-image.jpg" />
      </head>

      <div className="min-h-screen bg-[#FDFDFC] text-neutral-900 font-sans selection:bg-neutral-900 selection:text-white break-words">
        
        {/* AUTHENTICATION / REQUEST ACCESS MODAL (Mobile-Optimized) */}
        {showAuthModal && (
          <div className="fixed inset-0 z-50 bg-neutral-950/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white border border-neutral-200 max-w-md w-full p-5 sm:p-8 shadow-2xl space-y-5 my-auto max-h-[90vh] overflow-y-auto">
              
              <div className="flex justify-between items-start border-b border-neutral-200 pb-3">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-400 block mb-1">
                    {authMode === 'signin' ? 'AUTHORIZED ACCESS' : 'ACCREDITATION SUITE'}
                  </span>
                  <h3 className="text-lg sm:text-xl font-serif text-neutral-900">
                    {authMode === 'signin' ? 'Sign In' : 'Request Access'}
                  </h3>
                </div>
                <button 
                  onClick={() => { setShowAuthModal(false); setOtpSent(false); setAuthError(''); setRequestSuccess(false); }}
                  className="text-neutral-400 hover:text-neutral-900 text-sm font-mono p-2"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 border border-neutral-200 p-0.5 bg-neutral-50 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => { setAuthMode('signin'); setAuthError(''); setRequestSuccess(false); }}
                  className={`py-2.5 text-center uppercase tracking-wider transition ${authMode === 'signin' ? 'bg-white text-neutral-900 font-bold shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMode('request'); setAuthError(''); setOtpSent(false); }}
                  className={`py-2.5 text-center uppercase tracking-wider transition ${authMode === 'request' ? 'bg-white text-neutral-900 font-bold shadow-sm' : 'text-neutral-500 hover:text-neutral-900'}`}
                >
                  Request Access
                </button>
              </div>

              {authError && (
                <div className="bg-rose-50 border-l-2 border-rose-600 p-3 text-xs font-mono text-rose-800 break-words">
                  {authError}
                </div>
              )}

              {authMode === 'signin' ? (
                !otpSent ? (
                  <div className="space-y-5">
                    <form onSubmit={handleSendOtp} className="space-y-4">
                      <div>
                        <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest block mb-1.5">
                          Institutional Email Address
                        </label>
                        <input 
                          type="email"
                          required
                          placeholder="curator@privateoffice.com"
                          value={authEmail}
                          onChange={e => setAuthEmail(e.target.value)}
                          className="w-full bg-neutral-50 border border-neutral-300 px-3.5 py-3 text-xs sm:text-sm text-neutral-900 focus:outline-none focus:border-neutral-900 font-mono transition"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full bg-neutral-900 hover:bg-black text-white font-mono text-xs uppercase tracking-widest py-3.5 transition disabled:opacity-50 font-bold"
                      >
                        {authLoading ? 'Transmitting...' : 'Send 6-Digit OTP Code'}
                      </button>
                    </form>

                    <div className="relative border-t border-neutral-200 pt-5 text-center">
                      <span className="bg-white px-3 text-[10px] font-mono text-neutral-400 uppercase tracking-widest absolute -top-2.5 left-1/2 -translate-x-1/2">
                        OR SECURE PASSKEY
                      </span>
                      <button
                        type="button"
                        onClick={handlePasskeySignIn}
                        disabled={authLoading}
                        className="w-full bg-white hover:bg-neutral-50 text-neutral-900 border border-neutral-300 font-mono text-xs uppercase tracking-widest py-3.5 transition disabled:opacity-50 flex items-center justify-center gap-2 font-bold"
                      >
                        🛡️ Passkey (WebAuthn)
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <div>
                      <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">
                        Verification code sent to:
                      </label>
                      <p className="text-xs font-mono font-bold text-neutral-900 mb-3 break-all">{authEmail}</p>
                      
                      <input 
                        type="text"
                        required
                        maxLength={6}
                        placeholder="••••••"
                        value={otpCode}
                        onChange={e => setOtpCode(e.target.value.trim())}
                        className="w-full bg-neutral-50 border border-neutral-300 px-4 py-3 text-center text-lg tracking-[0.5em] text-neutral-900 focus:outline-none focus:border-neutral-900 font-mono transition"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full bg-neutral-900 hover:bg-black text-white font-mono text-xs uppercase tracking-widest py-3.5 transition disabled:opacity-50 font-bold"
                    >
                      {authLoading ? 'Verifying...' : 'Authorize Terminal Session'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setOtpSent(false)}
                      className="w-full text-center text-xs font-mono text-neutral-400 hover:text-neutral-900 underline pt-1 block"
                    >
                      ← Back to Email Input
                    </button>
                  </form>
                )
              ) : (
                requestSuccess ? (
                  <div className="py-4 text-center space-y-3 font-mono">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto text-lg font-bold">✓</div>
                    <h4 className="text-neutral-900 font-serif text-lg">Inquiry Registered</h4>
                    <p className="text-xs text-neutral-500 leading-relaxed max-w-xs mx-auto break-words">
                      Your institutional accreditation request for <span className="text-neutral-800 font-bold">{authEmail}</span> has been queued.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setShowAuthModal(false); setRequestSuccess(false); setAuthEmail(''); }}
                      className="w-full bg-neutral-900 text-white py-3 text-xs uppercase tracking-widest mt-2 font-bold"
                    >
                      Close Window
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleRequestAccess} className="space-y-4 font-mono">
                    <div>
                      <label className="text-[10px] text-neutral-500 uppercase tracking-widest block mb-1.5">
                        Professional / Institutional Email
                      </label>
                      <input 
                        type="email"
                        required
                        placeholder="director@artgallery.com"
                        value={authEmail}
                        onChange={e => setAuthEmail(e.target.value)}
                        className="w-full bg-neutral-50 border border-neutral-300 px-3.5 py-3 text-xs sm:text-sm text-neutral-900 focus:outline-none focus:border-neutral-900 transition"
                      />
                      <p className="text-[10px] text-neutral-400 mt-2 leading-relaxed">
                        Access is restricted to verified art dealers, family offices, museum curators, and financial institutions.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full bg-neutral-900 hover:bg-black text-white text-xs uppercase tracking-widest py-3.5 transition disabled:opacity-50 font-bold"
                    >
                      {authLoading ? 'Submitting Dossier...' : 'Submit Request'}
                    </button>
                  </form>
                )
              )}

            </div>
          </div>
        )}

        {/* Main Layout Container */}
        <div className="max-w-7xl mx-auto pt-6 sm:pt-16 pb-24 px-3 sm:px-6 lg:px-12 space-y-6 sm:space-y-10 overflow-x-hidden">
          
          <header className="flex flex-col items-center justify-center text-center border-b border-neutral-200/80 pb-8 bg-white px-4 sm:px-8 py-8 sm:py-12 border shadow-sm">
            <div className="space-y-2 max-w-2xl">
              <span className="text-[10px] sm:text-xs font-mono tracking-[0.15em] sm:tracking-[0.3em] uppercase text-neutral-400 font-semibold block px-1">
                Institutional Art Advisory & Market Intelligence
              </span>
              <h1 className="text-2xl sm:text-4xl md:text-5xl font-serif text-neutral-900 tracking-tight font-normal break-words">
                Art Intelligence Terminal
              </h1>
            </div>

            {user && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3 bg-neutral-50 border border-neutral-200 px-3 py-1.5 text-[11px] sm:text-xs font-mono max-w-full">
                <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                <span className="text-neutral-800 break-all">{user.email}</span>
                <button onClick={handleLogout} className="text-neutral-400 hover:text-neutral-900 underline ml-1 font-bold uppercase text-[10px]">Exit</button>
              </div>
            )}
          </header>

          {!loadingUser && !user ? (
            <div className="py-12 sm:py-28 max-w-4xl mx-auto text-center space-y-6 sm:space-y-10 bg-white border border-neutral-200/80 p-5 sm:p-20 shadow-sm">
              <div className="space-y-3">
                <h2 className="text-xl sm:text-3xl md:text-4xl font-serif text-neutral-900 leading-tight">
                  Fine Art Banking & Advisory Infrastructure
                </h2>
                
                <p className="text-xs sm:text-base md:text-lg font-serif text-neutral-600 leading-relaxed font-light max-w-2xl mx-auto pt-1">
                  Professional-grade terminal engineered for art dealers, family offices, and private banking art-lending specialists. Generate institutional-quality investment memoranda in seconds.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 font-mono">
                <button
                  onClick={() => { setAuthMode('signin'); setShowAuthModal(true); }}
                  className="bg-neutral-900 hover:bg-black text-white text-xs uppercase tracking-widest px-8 py-3.5 transition shadow-sm font-bold"
                >
                  Sign In
                </button>
                <button
                  onClick={() => { setAuthMode('request'); setShowAuthModal(true); }}
                  className="bg-white hover:bg-neutral-50 text-neutral-900 border border-neutral-300 text-xs uppercase tracking-widest px-8 py-3.5 transition font-bold"
                >
                  Request Access
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Navigation Tabs (Mobile Compact Scrollable) */}
              <nav className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center border-b border-neutral-200/80 bg-white px-4 sm:px-8 py-3 sm:py-4 gap-3 border shadow-sm">
                <div className="flex gap-4 sm:gap-8 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
                  <button
                    onClick={() => setActiveTab('parser')}
                    className={`font-mono text-[11px] sm:text-xs uppercase tracking-wider sm:tracking-widest transition py-1 whitespace-nowrap relative ${
                      activeTab === 'parser' 
                        ? 'text-neutral-900 font-bold after:absolute after:bottom-[-13px] sm:after:bottom-[-17px] after:left-0 after:right-0 after:h-[2px] after:bg-neutral-900' 
                        : 'text-neutral-400 hover:text-neutral-900'
                    }`}
                  >
                    01. Ingestion & Analysis
                  </button>
                  <button
                    onClick={() => setActiveTab('vault')}
                    className={`font-mono text-[11px] sm:text-xs uppercase tracking-wider sm:tracking-widest transition py-1 whitespace-nowrap relative ${
                      activeTab === 'vault' 
                        ? 'text-neutral-900 font-bold after:absolute after:bottom-[-13px] sm:after:bottom-[-17px] after:left-0 after:right-0 after:h-[2px] after:bg-neutral-900' 
                        : 'text-neutral-400 hover:text-neutral-900'
                    }`}
                  >
                    02. Vault ({lots.length})
                  </button>
                </div>

                {activeTab === 'parser' && (
                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-100">
                    <span className="text-[10px] sm:text-[11px] font-mono text-neutral-500 bg-neutral-50 border border-neutral-200 px-2.5 py-1 truncate max-w-[210px] sm:max-w-none">
                      {statusText}
                    </span>
                    <button 
                      onClick={handleReset}
                      className="text-[11px] font-mono text-neutral-400 hover:text-neutral-900 transition uppercase tracking-wider shrink-0 px-2 py-1"
                    >
                      Reset
                    </button>
                  </div>
                )}
              </nav>

              {activeTab === 'parser' && (
                <main className="grid lg:grid-cols-12 gap-6 sm:gap-8 items-start transition-opacity duration-300">
                  
                  {/* Left Column: Input Panel */}
                  <div className="lg:col-span-5 space-y-6">
                    <div className="bg-white border border-neutral-200/80 p-4 sm:p-6 space-y-4 shadow-sm">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block">
                          Auction Lot URL Target
                        </label>
                        <button 
                          onClick={handlePasteClipboard}
                          className="text-[10px] font-mono text-neutral-500 hover:text-neutral-900 transition underline py-1"
                        >
                          Paste Clipboard
                        </button>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input 
                          type="url"
                          placeholder="https://www.sothebys.com/en/buy/..." 
                          className="flex-1 bg-neutral-50 border border-neutral-300 px-3 py-2.5 text-xs text-neutral-900 focus:outline-none focus:border-neutral-900 transition font-mono placeholder:text-neutral-400 break-all"
                          value={input.link}
                          onChange={e => setInput({...input, link: e.target.value})}
                        />
                        <button 
                          onClick={handleAutoParse} 
                          disabled={parsing || autoProcessing || !input.link} 
                          className="bg-neutral-100 hover:bg-neutral-200 text-neutral-900 px-4 py-2.5 text-xs font-mono uppercase tracking-wider transition disabled:opacity-40 border border-neutral-300 shrink-0 font-bold"
                        >
                          {parsing ? 'Parsing...' : 'Parse'}
                        </button>
                      </div>

                      <button
                        onClick={handleOneClickPipeline}
                        disabled={parsing || loading || saving || autoProcessing || !input.link}
                        className="w-full bg-neutral-900 hover:bg-black text-white py-3.5 text-xs font-mono uppercase tracking-widest transition disabled:opacity-40 shadow-sm font-bold"
                      >
                        {autoProcessing ? 'Executing Pipeline...' : '⚡ One-Click Full Ingestion'}
                      </button>
                    </div>

                    <div className="bg-white border border-neutral-200/80 p-4 sm:p-6 space-y-5 shadow-sm">
                      <div className="flex justify-between items-center border-b border-neutral-100 pb-2.5">
                        <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">Asset Visual Verification</span>
                        {input.image_url && <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 px-2 py-0.5 border border-emerald-200 uppercase">Resolved</span>}
                      </div>

                      <div className="aspect-[4/3] w-full bg-neutral-50 border border-neutral-200 flex items-center justify-center relative overflow-hidden">
                        {input.image_url && !imgError ? (
                          <img 
                            src={input.image_url} 
                            className="object-contain max-h-full max-w-full p-3" 
                            alt="Artwork Preview" 
                            onError={() => setImgError(true)}
                          />
                        ) : (
                          <div className="text-center font-mono text-xs text-neutral-400">
                            {input.artist ? getInitials(input.artist) : 'NO VISUAL ATTACHED'}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-mono text-neutral-500 block mb-1 uppercase tracking-wider">Artist</label>
                          <input 
                            placeholder="Artist Name" 
                            className="w-full bg-neutral-50 border border-neutral-300 p-2.5 text-xs text-neutral-900 focus:outline-none focus:border-neutral-900 font-mono" 
                            value={input.artist} 
                            onChange={e => setInput({...input, artist: e.target.value})} 
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-mono text-neutral-500 block mb-1 uppercase tracking-wider">Title</label>
                          <input 
                            placeholder="Artwork Title" 
                            className="w-full bg-neutral-50 border border-neutral-300 p-2.5 text-xs text-neutral-900 focus:outline-none focus:border-neutral-900 font-mono" 
                            value={input.title} 
                            onChange={e => setInput({...input, title: e.target.value})} 
                          />
                        </div>
                      </div>

                      <button 
                        onClick={() => generate()} 
                        disabled={loading || autoProcessing} 
                        className="w-full bg-neutral-100 hover:bg-neutral-200 text-neutral-900 border border-neutral-300 py-3 text-xs font-mono uppercase tracking-widest transition disabled:opacity-40 font-bold"
                      >
                        {loading ? 'Synthesizing...' : 'Synthesize Curatorial Dossier'}
                      </button>
                    </div>

                  </div>

                  {/* Right Column: Output / Dossier Preview */}
                  <div className="lg:col-span-7">
                    {loading ? (
                      <div className="bg-white border border-neutral-200/80 p-8 sm:p-10 space-y-6 animate-pulse shadow-sm">
                        <div className="h-4 bg-neutral-200 w-1/4"></div>
                        <div className="h-8 bg-neutral-200 w-3/4"></div>
                        <div className="h-4 bg-neutral-200 w-1/2"></div>
                        <div className="space-y-3 pt-4">
                          <div className="h-3 bg-neutral-200 w-full"></div>
                          <div className="h-3 bg-neutral-200 w-5/6"></div>
                          <div className="h-3 bg-neutral-200 w-4/6"></div>
                        </div>
                      </div>
                    ) : output ? (
                      <div className="space-y-5">
                        
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white border border-neutral-200/80 p-3.5 sm:p-4 gap-3 shadow-sm">
                          <span className="text-xs font-mono text-neutral-500 uppercase tracking-widest font-bold">
                            Investment Memorandum
                          </span>
                          
                          <div className="flex flex-wrap gap-2.5 sm:gap-3 items-center w-full sm:w-auto justify-between sm:justify-end">
                            <button 
                              onClick={handleCopyDossier} 
                              className="text-xs font-mono text-neutral-600 hover:text-neutral-900 underline transition py-1"
                            >
                              {copyStatus ? 'Copied ✓' : 'Copy Text'}
                            </button>

                            <button 
                              onClick={() => setShowRawJson(!showRawJson)} 
                              className="text-xs font-mono text-neutral-600 hover:text-neutral-900 transition border px-2.5 py-1.5 bg-neutral-50"
                            >
                              {showRawJson ? 'View Card' : 'Raw JSON'}
                            </button>

                            <button 
                              onClick={() => saveToVault()} 
                              disabled={saving || autoProcessing || isSaved}
                              className={`px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider transition font-bold ${
                                isSaved 
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-default' 
                                  : 'bg-neutral-900 hover:bg-black text-white disabled:opacity-50 shadow-sm'
                              }`}
                            >
                              {saving ? 'Saving...' : isSaved ? 'Saved ✓' : 'Save'}
                            </button>
                          </div>
                        </div>

                        {showRawJson ? (
                          <div className="border border-neutral-200/80 p-4 sm:p-6 bg-white shadow-sm overflow-x-auto">
                            <pre className="text-neutral-800 font-mono text-[11px] sm:text-xs whitespace-pre-wrap max-h-[600px] overflow-y-auto break-all">
                              {JSON.stringify(output, null, 2)}
                            </pre>
                          </div>
                        ) : (
                          <div className="bg-white border border-neutral-200/80 p-5 sm:p-10 space-y-6 sm:space-y-8 max-h-[750px] overflow-y-auto shadow-sm">
                            
                            <div className="border-b border-neutral-200 pb-5 space-y-3">
                              <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                                <div>
                                  <span className="text-[10px] sm:text-xs font-mono text-neutral-400 uppercase tracking-widest">
                                    {output.auction_house || "AUCTION"} • LOT {output.lot_number || '—'}
                                  </span>
                                  <h2 className="text-xl sm:text-3xl font-serif text-neutral-900 mt-1 font-normal break-words">
                                    {output.artist || input.artist || "Unknown Artist"}
                                  </h2>
                                  {output.artist_dates && <p className="text-neutral-500 italic text-xs sm:text-sm mt-0.5">{output.artist_dates}</p>}
                                </div>
                                {output.estimate_raw && (
                                  <div className="text-left sm:text-right bg-neutral-50 p-2.5 sm:p-3 border border-neutral-200 w-full sm:w-auto">
                                    <span className="text-[9px] sm:text-[10px] font-mono text-neutral-400 uppercase block">Estimate Valuation</span>
                                    <span className="text-xs sm:text-sm font-mono text-neutral-900 font-bold">{output.estimate_raw}</span>
                                  </div>
                                )}
                              </div>

                              <div className="pt-2">
                                <h3 className="text-base sm:text-xl font-serif italic text-neutral-800 break-words">
                                  {output.title || input.title} {output.year && <span className="not-italic text-neutral-400 text-xs sm:text-sm">({output.year})</span>}
                                </h3>
                                {output.medium && <p className="text-xs text-neutral-600 mt-1.5 font-mono break-words">{output.medium}</p>}
                                {output.dimensions && <p className="text-xs font-mono text-neutral-500 mt-1 break-words">{output.dimensions}</p>}
                              </div>
                            </div>

                            {output.curatorial_essay && (
                              <div className="space-y-2.5">
                                <h4 className="text-[11px] sm:text-xs font-mono text-neutral-400 uppercase tracking-widest border-b border-neutral-100 pb-2 font-bold">
                                  Expert Curation & Market Analysis
                                </h4>
                                <div className="text-neutral-800 text-xs sm:text-sm font-serif leading-relaxed whitespace-pre-line break-words">
                                  {output.curatorial_essay}
                                </div>
                              </div>
                            )}

                            {output.provenance && output.provenance.length > 0 && (
                              <div className="space-y-2.5 pt-2">
                                <h4 className="text-[11px] sm:text-xs font-mono text-neutral-400 uppercase tracking-widest border-b border-neutral-100 pb-2 font-bold">
                                  Verified Provenance
                                </h4>
                                <ul className="space-y-1.5 text-xs text-neutral-600 font-mono">
                                  {output.provenance.map((item: string, idx: number) => (
                                    <li key={idx} className="flex gap-2 break-words">
                                      <span className="text-neutral-400 shrink-0">•</span>
                                      <span className="break-words">{item}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                          </div>
                        )}

                      </div>
                    ) : (
                      <div className="h-full min-h-[400px] sm:min-h-[500px] flex flex-col items-center justify-center border border-dashed border-neutral-300 bg-white p-6 sm:p-8 text-center shadow-sm">
                        <div className="text-3xl font-serif text-neutral-300 mb-2">†</div>
                        <h3 className="text-neutral-900 font-serif text-base sm:text-lg mb-1">Awaiting Lot Ingestion</h3>
                        <p className="text-neutral-400 text-xs font-mono max-w-sm leading-relaxed">
                          Enter a valid auction lot URL on the left panel to trigger automated parsing and memo synthesis.
                        </p>
                      </div>
                    )}
                  </div>

                </main>
              )}

              {activeTab === 'vault' && (
                <div className="space-y-5 transition-opacity duration-300">
                  <div className="flex justify-between items-center border-b border-neutral-200/80 bg-white p-4 sm:p-6 border shadow-sm">
                    <span className="text-xs font-mono text-neutral-500 uppercase tracking-widest font-bold">Secure Vault Archive</span>
                    <button onClick={fetchLots} className="text-xs font-mono text-neutral-900 hover:underline bg-neutral-100 px-3 py-1 border border-neutral-200">
                      Refresh ↻
                    </button>
                  </div>

                  {loadingLots ? (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {[1, 2, 3].map((n) => (
                        <div key={n} className="bg-white border border-neutral-200/80 p-5 space-y-4 animate-pulse shadow-sm">
                          <div className="aspect-[4/3] bg-neutral-200 w-full"></div>
                          <div className="h-4 bg-neutral-200 w-2/3"></div>
                          <div className="h-3 bg-neutral-200 w-1/3"></div>
                        </div>
                      ))}
                    </div>
                  ) : lots.length === 0 ? (
                    <div className="py-16 text-center font-mono text-xs text-neutral-400 bg-white border border-neutral-200/80 p-8">Vault archive is currently empty.</div>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {lots.map((lot) => {
                        const publicImg = lot.image_path?.startsWith('http')
                          ? lot.image_path
                          : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/artifacts/${lot.image_path}`;

                        return (
                          <Link
                            key={lot.id}
                            href={`/art-engine/lots/${lot.id}`}
                            className="group bg-white border border-neutral-200/80 overflow-hidden hover:border-neutral-900 transition flex flex-col shadow-sm"
                          >
                            <div className="aspect-[4/3] bg-neutral-50 relative overflow-hidden flex items-center justify-center p-3 border-b border-neutral-100">
                              {lot.image_path ? (
                                <img
                                  src={publicImg}
                                  alt={lot.title}
                                  className="object-contain max-h-full max-w-full group-hover:scale-105 transition duration-500"
                                />
                              ) : (
                                <div className="font-serif text-xl text-neutral-300">{getInitials(lot.artist)}</div>
                              )}
                            </div>

                            <div className="p-4 sm:p-6 flex-1 flex flex-col justify-between space-y-3">
                              <div>
                                <div className="flex justify-between items-start text-neutral-400 font-mono text-[10px] uppercase tracking-wider mb-1 gap-2">
                                  <span className="truncate">{lot.auction_house || 'AUCTION'}</span>
                                  <span className="text-neutral-900 font-bold shrink-0">{lot.estimate}</span>
                                </div>
                                <h2 className="text-base sm:text-lg font-serif text-neutral-900 group-hover:underline break-words">{lot.artist}</h2>
                                <p className="text-xs text-neutral-600 italic mt-0.5 break-words">{lot.title} {lot.year && `(${lot.year})`}</p>
                              </div>

                              <div className="text-[10px] font-mono text-neutral-400 border-t border-neutral-100 pt-3 flex justify-between items-center gap-2">
                                <span className="truncate">{lot.medium || 'Mixed Media'}</span>
                                <span className="text-neutral-900 font-bold shrink-0">View Memo →</span>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </>
  );
}
