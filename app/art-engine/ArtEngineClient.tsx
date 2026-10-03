'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-browser';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

export default function ArtEngineClient() {
  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'request'>('signin');
  
  // Auth Form State
  const [authEmail, setAuthEmail] = useState('');
  const [password, setPassword] = useState('');
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

  // Flexible admin check supporting recognized administrator emails and metadata
  const checkIsAdmin = (currentUser: User | null) => {
    if (!currentUser) return false;
    const email = currentUser.email?.toLowerCase() || '';
    if (
      email === 'merkurov@gmail.com' ||
      email === 'contact@merkurov.love' ||
      email.includes('merkurov') ||
      currentUser.user_metadata?.role === 'admin' ||
      currentUser.app_metadata?.role === 'admin'
    ) {
      return true;
    }
    return false;
  };

  // Auth Initialization
  useEffect(() => {
    async function initAuth() {
      try {
        const { data: { session: currentSession }, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        const currentUser = currentSession?.user || null;
        if (currentUser && !checkIsAdmin(currentUser)) {
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
        } else {
          setSession(currentSession);
          setUser(currentUser);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        setLoadingUser(false);
      }
    }

    initAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, currentSession: Session | null) => {
        const currentUser = currentSession?.user || null;
        if (currentUser && !checkIsAdmin(currentUser)) {
          supabase.auth.signOut();
          setSession(null);
          setUser(null);
        } else {
          setSession(currentSession);
          setUser(currentUser);
        }
        setLoadingUser(false);
      }
    );

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);

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
  }, []);

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
    const headers = new Headers(options.headers);
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    if (session?.access_token) {
      headers.set('Authorization', `Bearer ${session.access_token}`);
    }

    return fetch(url, { ...options, headers });
  };

  // AUTH 1: Email/Password Sign-In
  const handleEmailPasswordSignIn = async (e: any) => {
    e.preventDefault();
    if (!authEmail || !password) return;
    setAuthLoading(true);
    setAuthError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: password,
      });

      if (error) throw error;

      if (data.user && !checkIsAdmin(data.user)) {
        await supabase.auth.signOut();
        throw new Error('Access restricted to authorized administrators only.');
      }

      if (data.session) {
        setSession(data.session);
        setUser(data.user);
        setShowAuthModal(false);
        setAuthEmail('');
        setPassword('');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication error';
      setAuthError(errorMessage);
    } finally {
      setAuthLoading(false);
    }
  };

  // AUTH 2: Passkey / WebAuthn Sign-In
  const handlePasskeySignIn = async () => {
    setAuthLoading(true);
    setAuthError('');

    try {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('WebAuthn is not supported by this browser environment.');
      }

      const { error } = await (supabase.auth as any).signInWithPasskey();
      if (error) throw error;

      const { data: { session: newSession } } = await supabase.auth.getSession();
      const currentUser = newSession?.user || null;

      if (currentUser && !checkIsAdmin(currentUser)) {
        await supabase.auth.signOut();
        throw new Error('Passkey verified, but administrative privileges are missing.');
      }

      if (newSession) {
        setSession(newSession);
        setUser(currentUser);
        setShowAuthModal(false);
        return;
      }
      
      throw new Error('Passkey authentication session not established.');
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Passkey error';
      setAuthError(errorMessage);
    } finally {
      setAuthLoading(false);
    }
  };

  // REQUEST ACCESS HANDLER
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Request error';
      setAuthError(errorMessage);
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
    <div className="min-h-screen bg-white text-black selection:bg-black selection:text-white font-sans antialiased break-words">
      
      {/* AUTHENTICATION / REQUEST ACCESS MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-gray-200 max-w-md w-full p-8 shadow-2xl space-y-6 my-auto max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-start border-b border-gray-200 pb-4">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-gray-400 block mb-1">
                  {authMode === 'signin' ? 'ADMIN ACCESS' : 'ACCREDITATION SUITE'}
                </span>
                <h3 className="text-xl font-serif text-black">
                  {authMode === 'signin' ? 'Sign In' : 'Request Access'}
                </h3>
              </div>
              <button 
                onClick={() => { setShowAuthModal(false); setAuthError(''); setRequestSuccess(false); }}
                className="text-gray-400 hover:text-black text-sm font-mono p-2"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 border border-gray-200 p-0.5 bg-gray-50 text-xs font-mono">
              <button
                type="button"
                onClick={() => { setAuthMode('signin'); setAuthError(''); setRequestSuccess(false); }}
                className={`py-2 text-center uppercase tracking-wider transition ${authMode === 'signin' ? 'bg-white text-black font-bold shadow-sm' : 'text-gray-500 hover:text-black'}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('request'); setAuthError(''); }}
                className={`py-2 text-center uppercase tracking-wider transition ${authMode === 'request' ? 'bg-white text-black font-bold shadow-sm' : 'text-gray-500 hover:text-black'}`}
              >
                Request Access
              </button>
            </div>

            {authError && (
              <div className="bg-rose-50 border-l-2 border-rose-600 p-3 text-xs font-mono text-rose-800">
                {authError}
              </div>
            )}

            {authMode === 'signin' ? (
              <div className="space-y-5">
                <button
                  type="button"
                  onClick={handlePasskeySignIn}
                  disabled={authLoading}
                  className="w-full bg-white hover:bg-gray-50 text-black border border-gray-300 font-mono text-xs uppercase tracking-widest py-3 transition disabled:opacity-50 flex items-center justify-center gap-2 font-bold"
                >
                  🛡️ Sign in with Passkey
                </button>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-gray-200"></div>
                  <span className="flex-shrink mx-4 text-[10px] font-mono text-gray-400 uppercase tracking-widest">or password</span>
                  <div className="flex-grow border-t border-gray-200"></div>
                </div>

                <form onSubmit={handleEmailPasswordSignIn} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest block mb-1.5">
                      Email Address
                    </label>
                    <input 
                      type="email"
                      required
                      placeholder="merkurov@gmail.com"
                      value={authEmail}
                      onChange={(e: any) => setAuthEmail(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 px-3.5 py-2.5 text-sm text-black focus:outline-none focus:border-black font-mono transition"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono text-gray-500 uppercase tracking-widest block mb-1.5">
                      Password
                    </label>
                    <input 
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e: any) => setPassword(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-300 px-3.5 py-2.5 text-sm text-black focus:outline-none focus:border-black font-mono transition"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-black hover:bg-gray-800 text-white font-mono text-xs uppercase tracking-widest py-3.5 transition disabled:opacity-50 font-bold"
                  >
                    {authLoading ? 'Verifying...' : 'Bootstrap Admin Session'}
                  </button>
                </form>
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
                    className="w-full bg-black text-white py-3 text-xs uppercase tracking-widest mt-2 font-bold"
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
                      className="w-full bg-gray-50 border border-gray-300 px-3.5 py-2.5 text-sm text-black focus:outline-none focus:border-black transition"
                    />
                    <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                      Access is restricted to verified art dealers, family offices, museum curators, and financial institutions.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-black hover:bg-gray-800 text-white text-xs uppercase tracking-widest py-3.5 transition disabled:opacity-50 font-bold"
                  >
                    {authLoading ? 'Submitting Dossier...' : 'Submit Request'}
                  </button>
                </form>
              )
            )}

          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-7xl mx-auto pt-32 pb-24 px-6 md:px-12 space-y-8">
        
        {/* Terminal Header Info / Admin status if logged in */}
        {user && (
          <div className="flex flex-col items-center justify-center text-center border-b border-gray-200 pb-6 bg-gray-50 px-8 py-6">
            <div className="flex flex-wrap items-center justify-center gap-3 bg-white border border-gray-200 px-4 py-2 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
              <span className="text-black">{user.email} (Admin Session Active)</span>
              <button onClick={handleLogout} className="text-gray-400 hover:text-black underline ml-2 font-bold uppercase text-[10px]">Exit</button>
            </div>
          </div>
        )}

        {!loadingUser && !user ? (
          <div className="space-y-16 max-w-5xl mx-auto">
            {/* 1. ART INTELLIGENCE TERMINAL BANNER */}
            <div className="flex flex-col items-center justify-center text-center bg-gray-50 border border-gray-200 px-8 py-16">
              <div className="space-y-3 max-w-2xl">
                <span className="text-xs font-mono tracking-[0.3em] uppercase text-gray-400 font-semibold block">
                  Institutional Art Advisory & Market Intelligence
                </span>
                <h1 className="text-4xl md:text-6xl font-serif font-light text-black tracking-tight">
                  Art Intelligence Terminal
                </h1>
                <p className="font-serif italic text-gray-600 text-base md:text-lg pt-2">
                  Professional-grade terminal engineered for art dealers, family offices, and private banking art-lending specialists.
                </p>
              </div>
            </div>

            {/* 2. THREE INSTITUTIONAL CASE STUDIES (FONTANA STYLE) */}
            <div className="bg-white border border-gray-200 p-8 md:p-14 space-y-12">
              <div className="text-center space-y-3">
                <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-gray-400 block">
                  [ CURATOR ENGINE — INSTITUTIONAL CASE STUDIES ]
                </span>
                <h3 className="text-2xl md:text-3xl font-serif font-light text-black">
                  AI-Driven Art Valuation & Heritage Architecture
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Case 1: Fontana */}
                <Link href="/case-study/fontana" className="group bg-gray-50 border border-gray-200 p-6 flex flex-col justify-between hover:border-black transition-colors">
                  <div>
                    <div className="aspect-[4/3] bg-white mb-6 overflow-hidden relative border border-gray-200">
                      <img 
                        src="https://www.omnesmag.com/wp-content/uploads/2023/06/unnamed-3-1.jpg" 
                        alt="Lucio Fontana White Absolute" 
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                        Asset: Lucio Fontana (1968) // Valuation
                      </div>
                      <h4 className="font-serif text-xl text-black group-hover:text-gray-600 transition-colors">
                        THE WHITE ABSOLUTE
                      </h4>
                      <p className="font-serif italic text-gray-600 text-xs sm:text-sm leading-relaxed">
                        See how the Curator Engine analyzes liquidity, risk, and market arbitrage for institutional-grade assets.
                      </p>
                    </div>
                  </div>
                  <div className="pt-6 font-mono text-[11px] uppercase tracking-widest text-black flex items-center justify-between border-t border-gray-200 mt-6 font-bold">
                    <span>Analyze</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </Link>

                {/* Case 2: Garcia */}
                <Link href="/case-study/garcia" className="group bg-gray-50 border border-gray-200 p-6 flex flex-col justify-between hover:border-black transition-colors">
                  <div>
                    <div className="aspect-[4/3] bg-white mb-6 overflow-hidden relative border border-gray-200">
                      <img 
                        src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1047.jpeg" 
                        alt="Emil Garcia Poetics of Silence" 
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                        Asset: Emil Garcia // Packaging
                      </div>
                      <h4 className="font-serif text-xl text-black group-hover:text-gray-600 transition-colors">
                        POETICS OF SILENCE
                      </h4>
                      <p className="font-serif italic text-gray-600 text-xs sm:text-sm leading-relaxed">
                        Examine how AI-assisted provenance and structural framing transform non-conformist heritage into sovereign capital.
                      </p>
                    </div>
                  </div>
                  <div className="pt-6 font-mono text-[11px] uppercase tracking-widest text-black flex items-center justify-between border-t border-gray-200 mt-6 font-bold">
                    <span>Examine</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </Link>

                {/* Case 3: Pivovarov */}
                <Link href="/case-study/pivovarov" className="group bg-gray-50 border border-gray-200 p-6 flex flex-col justify-between hover:border-black transition-colors">
                  <div>
                    <div className="aspect-[4/3] bg-white mb-6 overflow-hidden relative border border-gray-200">
                      <img 
                        src="https://static.themoscowtimes.com/image/article_1360/4b/284adbd87bb8432b91f87b430babc29f.jpg" 
                        alt="Ilya Pivovarov Total Loneliness" 
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                        Asset: Ilya Pivovarov // Dossier
                      </div>
                      <h4 className="font-serif text-xl text-black group-hover:text-gray-600 transition-colors">
                        TOTAL LONELINESS
                      </h4>
                      <p className="font-serif italic text-gray-600 text-xs sm:text-sm leading-relaxed">
                        A foundational case study in Moscow Conceptualism, exploring inward-facing rigour and institutional endurance.
                      </p>
                    </div>
                  </div>
                  <div className="pt-6 font-mono text-[11px] uppercase tracking-widest text-black flex items-center justify-between border-t border-gray-200 mt-6 font-bold">
                    <span>Read Dossier</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </Link>
              </div>
            </div>

            {/* 3. FINE ART BANKING & ADVISORY INFRASTRUCTURE (LOGIN BOX) */}
            <div className="py-16 text-center space-y-8 bg-gray-50 border border-gray-200 p-12">
              <div className="space-y-3 max-w-xl mx-auto">
                <h2 className="text-3xl md:text-4xl font-serif font-light text-black">
                  Fine Art Banking & Advisory Infrastructure
                </h2>
                
                <p className="font-serif italic text-gray-600 text-base md:text-lg leading-relaxed">
                  Generate institutional-quality investment memoranda in seconds with absolute discretion.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row justify-center gap-4 font-mono">
                <button
                  onClick={() => { setAuthMode('signin'); setShowAuthModal(true); }}
                  className="bg-black hover:bg-gray-800 text-white text-xs uppercase tracking-widest px-10 py-4 transition font-bold"
                >
                  Sign In
                </button>
                <button
                  onClick={() => { setAuthMode('request'); setShowAuthModal(true); }}
                  className="bg-white hover:bg-gray-50 text-black border border-black text-xs uppercase tracking-widest px-10 py-4 transition font-bold"
                >
                  Request Access
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Navigation Tabs (Authenticated Terminal View) */}
            <nav className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center border-b border-gray-200 bg-gray-50 px-6 py-4 gap-3">
              <div className="flex gap-8 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
                <button
                  onClick={() => setActiveTab('parser')}
                  className={`font-mono text-xs uppercase tracking-widest transition py-1 whitespace-nowrap relative ${
                    activeTab === 'parser' 
                      ? 'text-black font-bold after:absolute after:bottom-[-17px] after:left-0 after:right-0 after:h-[2px] after:bg-black' 
                      : 'text-gray-400 hover:text-black'
                  }`}
                >
                  01. Ingestion & Analysis
                </button>
                <button
                  onClick={() => setActiveTab('vault')}
                  className={`font-mono text-xs uppercase tracking-widest transition py-1 whitespace-nowrap relative ${
                    activeTab === 'vault' 
                      ? 'text-black font-bold after:absolute after:bottom-[-17px] after:left-0 after:right-0 after:h-[2px] after:bg-black' 
                      : 'text-gray-400 hover:text-black'
                  }`}
                >
                  02. Vault ({lots.length})
                </button>
              </div>

              {activeTab === 'parser' && (
                <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-200">
                  <span className="text-xs font-mono text-gray-500 bg-white border border-gray-200 px-3 py-1 truncate max-w-[210px] sm:max-w-none">
                    {statusText}
                  </span>
                  <button 
                    onClick={handleReset}
                    className="text-xs font-mono text-gray-400 hover:text-black transition uppercase tracking-wider shrink-0 px-2 py-1"
                  >
                    Reset
                  </button>
                </div>
              )}
            </nav>

            {activeTab === 'parser' && (
              <main className="grid lg:grid-cols-12 gap-8 items-start transition-opacity duration-300">
                
                {/* Left Column: Input Panel */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-gray-50 border border-gray-200 p-6 space-y-4">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest block">
                        Auction Lot URL Target
                      </label>
                      <button 
                        onClick={handlePasteClipboard}
                        className="text-[10px] font-mono text-gray-500 hover:text-black transition underline py-1"
                      >
                        Paste Clipboard
                      </button>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input 
                        type="url"
                        placeholder="https://www.sothebys.com/en/buy/..." 
                        className="flex-1 bg-white border border-gray-300 px-3.5 py-3 text-xs text-black focus:outline-none focus:border-black transition font-mono placeholder:text-gray-400 break-all"
                        value={input.link}
                        onChange={(e: any) => setInput({...input, link: e.target.value})}
                      />
                      <button 
                        onClick={handleAutoParse} 
                        disabled={parsing || autoProcessing || !input.link} 
                        className="bg-gray-100 hover:bg-gray-200 text-black px-4 py-3 text-xs font-mono uppercase tracking-wider transition disabled:opacity-40 border border-gray-300 shrink-0 font-bold"
                      >
                        {parsing ? 'Parsing...' : 'Parse'}
                      </button>
                    </div>

                    <button
                      onClick={handleOneClickPipeline}
                      disabled={parsing || loading || saving || autoProcessing || !input.link}
                      className="w-full bg-black hover:bg-gray-800 text-white py-3.5 text-xs font-mono uppercase tracking-widest transition disabled:opacity-40 shadow-sm font-bold"
                    >
                      {autoProcessing ? 'Executing Pipeline...' : '⚡ One-Click Full Ingestion'}
                    </button>
                  </div>

                  <div className="bg-gray-50 border border-gray-200 p-6 space-y-5">
                    <div className="flex justify-between items-center border-b border-gray-200 pb-3">
                      <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Asset Visual Verification</span>
                      {input.image_url && <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 px-2.5 py-0.5 border border-emerald-200 uppercase">Resolved</span>}
                    </div>

                    <div className="aspect-[4/3] w-full bg-white border border-gray-200 flex items-center justify-center relative overflow-hidden">
                      {input.image_url && !imgError ? (
                        <img 
                          src={input.image_url} 
                          className="object-contain max-h-full max-w-full p-3" 
                          alt="Artwork Preview" 
                          onError={() => setImgError(true)}
                        />
                      ) : (
                        <div className="text-center font-mono text-xs text-gray-400">
                          {input.artist ? getInitials(input.artist) : 'NO VISUAL ATTACHED'}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-mono text-gray-500 block mb-1 uppercase tracking-wider">Artist</label>
                        <input 
                          placeholder="Artist Name" 
                          className="w-full bg-white border border-gray-300 p-3 text-xs text-black focus:outline-none focus:border-black font-mono" 
                          value={input.artist} 
                          onChange={(e: any) => setInput({...input, artist: e.target.value})} 
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-gray-500 block mb-1 uppercase tracking-wider">Title</label>
                        <input 
                          placeholder="Artwork Title" 
                          className="w-full bg-white border border-gray-300 p-3 text-xs text-black focus:outline-none focus:border-black font-mono" 
                          value={input.title} 
                          onChange={(e: any) => setInput({...input, title: e.target.value})} 
                        />
                      </div>
                    </div>

                    <button 
                      onClick={() => generate()} 
                      disabled={loading || autoProcessing} 
                      className="w-full bg-gray-100 hover:bg-gray-200 text-black border border-gray-300 py-3.5 text-xs font-mono uppercase tracking-widest transition disabled:opacity-40 font-bold"
                    >
                      {loading ? 'Synthesizing...' : 'Synthesize Curatorial Dossier'}
                    </button>
                  </div>

                </div>

                {/* Right Column: Output / Dossier Preview */}
                <div className="lg:col-span-7">
                  {loading ? (
                    <div className="bg-gray-50 border border-gray-200 p-10 space-y-6 animate-pulse">
                      <div className="h-4 bg-gray-200 w-1/4"></div>
                      <div className="h-8 bg-gray-200 w-3/4"></div>
                      <div className="h-4 bg-gray-200 w-1/2"></div>
                      <div className="space-y-3 pt-4">
                        <div className="h-3 bg-gray-200 w-full"></div>
                        <div className="h-3 bg-gray-200 w-5/6"></div>
                        <div className="h-3 bg-gray-200 w-4/6"></div>
                      </div>
                    </div>
                  ) : output ? (
                    <div className="space-y-5">
                      
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-50 border border-gray-200 p-4 gap-3">
                        <span className="text-xs font-mono text-gray-500 uppercase tracking-widest font-bold">
                          Investment Memorandum
                        </span>
                        
                        <div className="flex flex-wrap gap-3 items-center w-full sm:w-auto justify-between sm:justify-end">
                          <button 
                            onClick={handleCopyDossier} 
                            className="text-xs font-mono text-gray-600 hover:text-black underline transition py-1"
                          >
                            {copyStatus ? 'Copied ✓' : 'Copy Text'}
                          </button>

                          <button 
                            onClick={() => setShowRawJson(!showRawJson)} 
                            className="text-xs font-mono text-gray-600 hover:text-black transition border px-3 py-1.5 bg-white"
                          >
                            {showRawJson ? 'View Card' : 'Raw JSON'}
                          </button>

                          <button 
                            onClick={() => saveToVault()} 
                            disabled={saving || autoProcessing || isSaved}
                            className={`px-4 py-1.5 text-xs font-mono uppercase tracking-wider transition font-bold ${
                              isSaved 
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 cursor-default' 
                                : 'bg-black hover:bg-gray-800 text-white disabled:opacity-50'
                            }`}
                          >
                            {saving ? 'Saving...' : isSaved ? 'Saved ✓' : 'Save'}
                          </button>
                        </div>
                      </div>

                      {showRawJson ? (
                        <div className="border border-gray-200 p-6 bg-gray-50 overflow-x-auto">
                          <pre className="text-black font-mono text-xs whitespace-pre-wrap max-h-[600px] overflow-y-auto">
                            {JSON.stringify(output, null, 2)}
                          </pre>
                        </div>
                      ) : (
                        <div className="bg-gray-50 border border-gray-200 p-8 md:p-12 space-y-8 max-h-[750px] overflow-y-auto">
                          
                          <div className="border-b border-gray-200 pb-6 space-y-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                              <div>
                                <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">
                                  {output.auction_house || "AUCTION"} • LOT {output.lot_number || '—'}
                                </span>
                                <h2 className="text-2xl md:text-3xl font-serif text-black mt-1 font-normal">
                                  {output.artist || input.artist || "Unknown Artist"}
                                </h2>
                                {output.artist_dates && <p className="text-gray-500 italic text-sm mt-0.5">{output.artist_dates}</p>}
                              </div>
                              {output.estimate_raw && (
                                <div className="text-left sm:text-right bg-white p-3 border border-gray-200 w-full sm:w-auto">
                                  <span className="text-[10px] font-mono text-gray-400 uppercase block">Estimate Valuation</span>
                                  <span className="text-sm font-mono text-black font-bold">{output.estimate_raw}</span>
                                </div>
                              )}
                            </div>

                            <div className="pt-2">
                              <h3 className="text-lg md:text-xl font-serif italic text-black">
                                {output.title || input.title} {output.year && <span className="not-italic text-gray-400 text-sm">({output.year})</span>}
                              </h3>
                              {output.medium && <p className="text-xs text-gray-600 mt-2 font-mono">{output.medium}</p>}
                              {output.dimensions && <p className="text-xs font-mono text-gray-500 mt-1">{output.dimensions}</p>}
                            </div>
                          </div>

                          {output.curatorial_essay && (
                            <div className="space-y-3">
                              <h4 className="text-xs font-mono text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2 font-bold">
                                Expert Curation & Market Analysis
                              </h4>
                              <div className="text-black text-sm font-serif leading-relaxed whitespace-pre-line">
                                {output.curatorial_essay}
                              </div>
                            </div>
                          )}

                          {output.provenance && output.provenance.length > 0 && (
                            <div className="space-y-3 pt-2">
                              <h4 className="text-xs font-mono text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2 font-bold">
                                Verified Provenance
                              </h4>
                              <ul className="space-y-2 text-xs text-gray-600 font-mono">
                                {output.provenance.map((item: string, idx: number) => (
                                  <li key={idx} className="flex gap-2">
                                    <span className="text-gray-400 shrink-0">•</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                        </div>
                      )}

                    </div>
                  ) : (
                    <div className="h-full min-h-[500px] flex flex-col items-center justify-center border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
                      <div className="text-3xl font-serif text-gray-300 mb-2">†</div>
                      <h3 className="text-black font-serif text-lg mb-1">Awaiting Lot Ingestion</h3>
                      <p className="text-gray-400 text-xs font-mono max-w-sm leading-relaxed">
                        Enter a valid auction lot URL on the left panel to trigger automated parsing and memo synthesis.
                      </p>
                    </div>
                  )}
                </div>

              </main>
            )}

            {activeTab === 'vault' && (
              <div className="space-y-6 transition-opacity duration-300">
                <div className="flex justify-between items-center border-b border-gray-200 bg-gray-50 p-6">
                  <span className="text-xs font-mono text-gray-500 uppercase tracking-widest font-bold">Secure Vault Archive</span>
                  <button onClick={fetchLots} className="text-xs font-mono text-black hover:underline bg-white px-4 py-2 border border-gray-200">
                    Refresh ↻
                  </button>
                </div>

                {loadingLots ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="bg-gray-50 border border-gray-200 p-6 space-y-4 animate-pulse">
                        <div className="aspect-[4/3] bg-gray-200 w-full"></div>
                        <div className="h-4 bg-gray-200 w-2/3"></div>
                        <div className="h-3 bg-gray-200 w-1/3"></div>
                      </div>
                    ))}
                  </div>
                ) : lots.length === 0 ? (
                  <div className="py-16 text-center font-mono text-xs text-gray-400 bg-gray-50 border border-gray-200 p-8">Vault archive is currently empty.</div>
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
                          className="group bg-gray-50 border border-gray-200 overflow-hidden hover:border-black transition flex flex-col"
                        >
                          <div className="aspect-[4/3] bg-white relative overflow-hidden flex items-center justify-center p-3 border-b border-gray-200">
                            {lot.image_path ? (
                              <img
                                src={publicImg}
                                alt={lot.title}
                                className="object-contain max-h-full max-w-full group-hover:scale-105 transition duration-700"
                              />
                            ) : (
                              <div className="font-serif text-xl text-gray-300">{getInitials(lot.artist)}</div>
                            )}
                          </div>

                          <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                            <div>
                              <div className="flex justify-between items-start text-gray-400 font-mono text-[10px] uppercase tracking-wider mb-2 gap-2">
                                <span className="truncate">{lot.auction_house || 'AUCTION'}</span>
                                <span className="text-black font-bold shrink-0">{lot.estimate}</span>
                              </div>
                              <h2 className="text-lg font-serif text-black group-hover:underline">{lot.artist}</h2>
                              <p className="text-xs text-gray-600 italic mt-1">{lot.title} {lot.year && `(${lot.year})`}</p>
                            </div>

                            <div className="text-[10px] font-mono text-gray-400 border-t border-gray-200 pt-3 flex justify-between items-center">
                              <span className="truncate">{lot.medium || 'Mixed Media'}</span>
                              <span className="text-black font-bold shrink-0">View Memo →</span>
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
  );
}
