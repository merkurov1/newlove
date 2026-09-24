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
  
  // Auth Form State
  const [authEmail, setAuthEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

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

  // Paste from Clipboard
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setInput(prev => ({ ...prev, link: text }));
    } catch {
      // Ignore if permission is denied
    }
  };

  // Helper for Authenticated Fetching
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

  // AUTH 3: Passkey Sign-In
  const handlePasskeySignIn = async () => {
    setAuthLoading(true);
    setAuthError('');

    try {
      const { data, error } = await supabase.auth.mfa.authenticate({
        factorId: 'webauthn',
      });

      if (error) {
        throw new Error('Passkey login not recognized on this device.');
      }

      if (data) {
        const { data: { session: newSession } } = await supabase.auth.getSession();
        setSession(newSession);
        setUser(newSession?.user || null);
        setShowAuthModal(false);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Passkey error';
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

  // Copy Dossier Markdown
  const handleCopyDossier = () => {
    if (!output) return;
    const text = `# ${output.artist || input.artist}\n*${output.title || input.title}* (${output.year || ''})\n\n${output.curatorial_essay || ''}\n\nProvenance:\n${(output.provenance || []).map((p: string) => `- ${p}`).join('\n')}`;
    navigator.clipboard.writeText(text);
    setCopyStatus(true);
    setTimeout(() => setCopyStatus(false), 2000);
  };

  const getInitials = (name?: string) => {
    if (!name) return 'A';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans pt-24 pb-32 px-6 sm:px-12 selection:bg-neutral-900 selection:text-white">
      
      {/* AUTHENTICATION MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white border border-neutral-200 rounded-none max-w-md w-full p-8 shadow-xl space-y-6">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-4">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 block">ACCESS CONTROL</span>
                <h3 className="text-xl font-serif text-neutral-900">Curator Sign-In</h3>
              </div>
              <button 
                onClick={() => { setShowAuthModal(false); setOtpSent(false); setAuthError(''); }}
                className="text-neutral-400 hover:text-neutral-900 text-sm font-mono"
              >
                ✕
              </button>
            </div>

            {authError && (
              <div className="bg-neutral-100 border-l-2 border-neutral-900 p-3 text-xs font-mono text-neutral-800">
                {authError}
              </div>
            )}

            {!otpSent ? (
              <div className="space-y-6">
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest block mb-2">
                      Enter Email for Verification Code
                    </label>
                    <input 
                      type="email"
                      required
                      placeholder="curator@merkurov.love"
                      value={authEmail}
                      onChange={e => setAuthEmail(e.target.value)}
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-none px-4 py-3 text-sm text-neutral-900 focus:outline-none focus:border-neutral-900 font-mono transition"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full bg-neutral-900 hover:bg-black text-white font-mono text-xs uppercase tracking-widest py-3.5 transition disabled:opacity-50"
                  >
                    {authLoading ? 'Sending Code...' : 'Send 6-Digit Code'}
                  </button>
                </form>

                <div className="relative border-t border-neutral-200 pt-6 text-center">
                  <span className="bg-white px-3 text-[10px] font-mono text-neutral-400 uppercase tracking-widest absolute -top-2.5 left-1/2 -translate-x-1/2">
                    OR
                  </span>
                  <button
                    type="button"
                    onClick={handlePasskeySignIn}
                    disabled={authLoading}
                    className="w-full bg-neutral-100 hover:bg-neutral-200 text-neutral-900 border border-neutral-200 font-mono text-xs uppercase tracking-widest py-3.5 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    🔑 Sign In with Passkey / WebAuthn
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div>
                  <label className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest block mb-1">
                    Code Sent To:
                  </label>
                  <p className="text-xs font-mono font-bold text-neutral-900 mb-3">{authEmail}</p>
                  
                  <input 
                    type="text"
                    required
                    maxLength={6}
                    placeholder="123456"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.trim())}
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-none px-4 py-3 text-center text-lg tracking-[0.5em] text-neutral-900 focus:outline-none focus:border-neutral-900 font-mono transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-neutral-900 hover:bg-black text-white font-mono text-xs uppercase tracking-widest py-3.5 transition disabled:opacity-50"
                >
                  {authLoading ? 'Verifying...' : 'Verify & Sign In'}
                </button>

                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  className="w-full text-center text-xs font-mono text-neutral-400 hover:text-neutral-900 underline pt-2 block"
                >
                  ← Back to Email
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* HEADER */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6 border-b border-neutral-200 pb-8">
          <div className="space-y-2">
            <span className="text-[10px] font-mono tracking-widest uppercase text-neutral-400 block">
              CURATOR ENGINE / WHITE CUBE EDITION
            </span>
            <h1 className="text-3xl sm:text-4xl font-serif text-neutral-900 tracking-tight font-normal">
              Art Intelligence Terminal
            </h1>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono text-neutral-500">
            {loadingUser ? (
              <span>Authenticating...</span>
            ) : user ? (
              <div className="flex items-center gap-3 bg-neutral-100 border border-neutral-200 px-4 py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-900" />
                <span className="text-neutral-700">{user.email}</span>
                <button onClick={handleLogout} className="text-neutral-400 hover:text-neutral-900 underline ml-2">Exit</button>
              </div>
            ) : (
              <button 
                onClick={() => setShowAuthModal(true)}
                className="bg-neutral-900 text-white px-5 py-2 hover:bg-black transition tracking-widest uppercase text-[11px]"
              >
                Sign In
              </button>
            )}
          </div>
        </header>

        {/* TABS & NAVIGATION */}
        <nav className="flex justify-between items-center border-b border-neutral-200 pb-4">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab('parser')}
              className={`font-mono text-xs uppercase tracking-widest transition pb-2 relative ${
                activeTab === 'parser' 
                  ? 'text-neutral-900 font-bold after:absolute after:bottom-[-17px] after:left-0 after:right-0 after:h-[2px] after:bg-neutral-900' 
                  : 'text-neutral-400 hover:text-neutral-900'
              }`}
            >
              01. Ingestion
            </button>
            <button
              onClick={() => setActiveTab('vault')}
              className={`font-mono text-xs uppercase tracking-widest transition pb-2 relative ${
                activeTab === 'vault' 
                  ? 'text-neutral-900 font-bold after:absolute after:bottom-[-17px] after:left-0 after:right-0 after:h-[2px] after:bg-neutral-900' 
                  : 'text-neutral-400 hover:text-neutral-900'
              }`}
            >
              02. Vault Archive ({lots.length})
            </button>
          </div>

          {activeTab === 'parser' && (
            <div className="flex items-center gap-4">
              <span className="text-[11px] font-mono text-neutral-400 hidden sm:inline">Status: {statusText}</span>
              <button 
                onClick={handleReset}
                className="text-xs font-mono text-neutral-400 hover:text-neutral-900 transition uppercase tracking-wider"
              >
                Clear
              </button>
            </div>
          )}
        </nav>

        {/* TAB 1: PARSER TERMINAL */}
        {activeTab === 'parser' && (
          <main className="grid lg:grid-cols-12 gap-12 items-start transition-opacity duration-300 ease-in-out">
            
            {/* LEFT COLUMN: CONTROL (5 COLS) */}
            <div className="lg:col-span-5 space-y-8">
              
              {/* SOURCE URL INPUT */}
              <div className="bg-white border border-neutral-200 p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block">
                    Auction Lot Link
                  </label>
                  <button 
                    onClick={handlePasteClipboard}
                    className="text-[10px] font-mono text-neutral-400 hover:text-neutral-900 transition underline"
                  >
                    Paste Link
                  </button>
                </div>
                
                <div className="flex gap-2">
                  <input 
                    type="url"
                    placeholder="https://www.sothebys.com/en/buy/..." 
                    className="flex-1 bg-neutral-50 border border-neutral-200 px-3.5 py-2.5 text-xs text-neutral-900 focus:outline-none focus:border-neutral-900 transition font-mono placeholder:text-neutral-300"
                    value={input.link}
                    onChange={e => setInput({...input, link: e.target.value})}
                  />
                  <button 
                    onClick={handleAutoParse} 
                    disabled={parsing || autoProcessing || !input.link} 
                    className="bg-neutral-100 hover:bg-neutral-200 text-neutral-900 px-4 py-2.5 text-xs font-mono uppercase tracking-wider transition disabled:opacity-40 border border-neutral-200 shrink-0"
                  >
                    {parsing ? 'Parsing...' : 'Parse'}
                  </button>
                </div>

                <button
                  onClick={handleOneClickPipeline}
                  disabled={parsing || loading || saving || autoProcessing || !input.link}
                  className="w-full bg-neutral-900 hover:bg-black text-white py-3.5 text-xs font-mono uppercase tracking-widest transition disabled:opacity-40"
                >
                  {autoProcessing ? 'Processing Pipeline...' : 'Process Lot to Vault'}
                </button>
              </div>

              {/* VISUAL PREVIEW & SPECIFICATIONS */}
              <div className="bg-white border border-neutral-200 p-6 space-y-6">
                <div className="flex justify-between items-center border-b border-neutral-100 pb-3">
                  <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">Visual Work</span>
                  {input.image_url && <span className="text-[10px] font-mono text-neutral-900 uppercase">Resolved</span>}
                </div>

                <div className="aspect-[4/3] w-full bg-neutral-50 border border-neutral-200 flex items-center justify-center relative overflow-hidden">
                  {input.image_url && !imgError ? (
                    <img 
                      src={input.image_url} 
                      className="object-contain max-h-full max-w-full p-4" 
                      alt="Artwork Preview" 
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <div className="text-center font-mono text-xs text-neutral-300">
                      {input.artist ? getInitials(input.artist) : 'NO VISUAL'}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-mono text-neutral-400 block mb-1 uppercase tracking-wider">Artist</label>
                    <input 
                      placeholder="Artist Name" 
                      className="w-full bg-neutral-50 border border-neutral-200 p-2.5 text-xs text-neutral-900 focus:outline-none focus:border-neutral-900 font-mono" 
                      value={input.artist} 
                      onChange={e => setInput({...input, artist: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-neutral-400 block mb-1 uppercase tracking-wider">Title</label>
                    <input 
                      placeholder="Artwork Title" 
                      className="w-full bg-neutral-50 border border-neutral-200 p-2.5 text-xs text-neutral-900 focus:outline-none focus:border-neutral-900 font-mono" 
                      value={input.title} 
                      onChange={e => setInput({...input, title: e.target.value})} 
                    />
                  </div>
                </div>

                <button 
                  onClick={() => generate()} 
                  disabled={loading || autoProcessing} 
                  className="w-full bg-neutral-100 hover:bg-neutral-200 text-neutral-900 border border-neutral-200 py-3 text-xs font-mono uppercase tracking-widest transition disabled:opacity-40"
                >
                  {loading ? 'Synthesizing Essay...' : 'Synthesize Dossier'}
                </button>
              </div>

            </div>

            {/* RIGHT COLUMN: CURATORIAL DOSSIER PREVIEW (7 COLS) */}
            <div className="lg:col-span-7">
              {loading ? (
                /* SKELETON LOADER */
                <div className="bg-white border border-neutral-200 p-10 space-y-8 animate-pulse">
                  <div className="h-4 bg-neutral-200 w-1/4"></div>
                  <div className="h-8 bg-neutral-200 w-3/4"></div>
                  <div className="h-4 bg-neutral-200 w-1/2"></div>
                  <div className="space-y-3 pt-6">
                    <div className="h-3 bg-neutral-200 w-full"></div>
                    <div className="h-3 bg-neutral-200 w-5/6"></div>
                    <div className="h-3 bg-neutral-200 w-4/6"></div>
                  </div>
                </div>
              ) : output ? (
                <div className="space-y-6">
                  
                  {/* DOSSIER ACTION BAR */}
                  <div className="flex justify-between items-center bg-white border border-neutral-200 p-4">
                    <span className="text-xs font-mono text-neutral-400 uppercase tracking-widest">
                      Curatorial Dossier
                    </span>
                    
                    <div className="flex gap-3 items-center">
                      <button 
                        onClick={handleCopyDossier} 
                        className="text-xs font-mono text-neutral-600 hover:text-neutral-900 underline transition"
                      >
                        {copyStatus ? 'Copied ✓' : 'Copy Text'}
                      </button>

                      <button 
                        onClick={() => setShowRawJson(!showRawJson)} 
                        className="text-xs font-mono text-neutral-600 hover:text-neutral-900 transition"
                      >
                        {showRawJson ? 'View Card' : 'JSON'}
                      </button>

                      <button 
                        onClick={() => saveToVault()} 
                        disabled={saving || autoProcessing || isSaved}
                        className={`px-4 py-1.5 text-xs font-mono uppercase tracking-wider transition ${
                          isSaved 
                            ? 'bg-neutral-200 text-neutral-600 cursor-default' 
                            : 'bg-neutral-900 hover:bg-black text-white disabled:opacity-50'
                        }`}
                      >
                        {saving ? 'Saving...' : isSaved ? 'Saved in Vault ✓' : 'Save to Vault'}
                      </button>
                    </div>
                  </div>

                  {/* DOSSIER BODY */}
                  {showRawJson ? (
                    <div className="border border-neutral-200 p-6 bg-white">
                      <pre className="text-neutral-800 font-mono text-xs whitespace-pre-wrap overflow-x-auto max-h-[600px]">
                        {JSON.stringify(output, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="bg-white border border-neutral-200 p-10 space-y-8 max-h-[750px] overflow-y-auto">
                      
                      {/* HEADER */}
                      <div className="border-b border-neutral-200 pb-6 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-mono text-neutral-400 uppercase tracking-widest">
                              {output.auction_house || "AUCTION"} • LOT {output.lot_number || '—'}
                            </span>
                            <h2 className="text-3xl font-serif text-neutral-900 mt-2 font-normal">
                              {output.artist || input.artist || "Unknown Artist"}
                            </h2>
                            {output.artist_dates && <p className="text-neutral-500 italic text-sm mt-0.5">{output.artist_dates}</p>}
                          </div>
                          {output.estimate_raw && (
                            <div className="text-right">
                              <span className="text-[10px] font-mono text-neutral-400 uppercase block">Estimate</span>
                              <span className="text-sm font-mono text-neutral-900">{output.estimate_raw}</span>
                            </div>
                          )}
                        </div>

                        <div className="pt-4">
                          <h3 className="text-xl font-serif italic text-neutral-800">
                            {output.title || input.title} {output.year && <span className="not-italic text-neutral-400 text-sm">({output.year})</span>}
                          </h3>
                          {output.medium && <p className="text-xs text-neutral-500 mt-2">{output.medium}</p>}
                          {output.dimensions && <p className="text-xs font-mono text-neutral-400 mt-1">{output.dimensions}</p>}
                        </div>
                      </div>

                      {/* ESSAY WITH DROP CAP */}
                      {output.curatorial_essay && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-mono text-neutral-400 uppercase tracking-widest border-b border-neutral-100 pb-2">
                            Curatorial Analysis
                          </h4>
                          <div className="text-neutral-800 text-sm font-serif leading-relaxed whitespace-pre-line first-letter:float-left first-letter:text-3xl first-letter:font-serif first-letter:mr-2 first-letter:font-bold">
                            {output.curatorial_essay}
                          </div>
                        </div>
                      )}

                      {/* PROVENANCE */}
                      {output.provenance && output.provenance.length > 0 && (
                        <div className="space-y-3 pt-4">
                          <h4 className="text-xs font-mono text-neutral-400 uppercase tracking-widest border-b border-neutral-100 pb-2">
                            Provenance
                          </h4>
                          <ul className="space-y-2 text-xs text-neutral-600 font-mono">
                            {output.provenance.map((item: string, idx: number) => (
                              <li key={idx} className="flex gap-2">
                                <span className="text-neutral-300">•</span>
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
                <div className="h-full min-h-[500px] flex flex-col items-center justify-center border border-dashed border-neutral-200 bg-white p-8 text-center">
                  <div className="text-3xl font-serif text-neutral-300 mb-2">†</div>
                  <h3 className="text-neutral-900 font-serif text-lg mb-1">Awaiting Ingestion</h3>
                  <p className="text-neutral-400 text-xs font-mono max-w-sm leading-relaxed">
                    Paste an auction lot URL to extract specs and generate a curatorial essay.
                  </p>
                </div>
              )}
            </div>

          </main>
        )}

        {/* TAB 2: VAULT GALLERY */}
        {activeTab === 'vault' && (
          <div className="space-y-6 transition-opacity duration-300 ease-in-out">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-4">
              <span className="text-xs font-mono text-neutral-400 uppercase tracking-widest">Vault Catalog</span>
              <button onClick={fetchLots} className="text-xs font-mono text-neutral-900 hover:underline">
                Refresh ↻
              </button>
            </div>

            {loadingLots ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="bg-white border border-neutral-200 p-6 space-y-4 animate-pulse">
                    <div className="aspect-[4/3] bg-neutral-200 w-full"></div>
                    <div className="h-4 bg-neutral-200 w-2/3"></div>
                    <div className="h-3 bg-neutral-200 w-1/3"></div>
                  </div>
                ))}
              </div>
            ) : lots.length === 0 ? (
              <div className="py-20 text-center font-mono text-xs text-neutral-400">Vault archive is currently empty.</div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
                {lots.map((lot) => {
                  const publicImg = lot.image_path?.startsWith('http')
                    ? lot.image_path
                    : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/artifacts/${lot.image_path}`;

                  return (
                    <Link
                      key={lot.id}
                      href={`/art-engine/lots/${lot.id}`}
                      className="group bg-white border border-neutral-200 overflow-hidden hover:border-neutral-900 transition flex flex-col"
                    >
                      <div className="aspect-[4/3] bg-neutral-50 relative overflow-hidden flex items-center justify-center p-4 border-b border-neutral-100">
                        {lot.image_path ? (
                          <img
                            src={publicImg}
                            alt={lot.title}
                            className="object-contain max-h-full max-w-full group-hover:scale-105 transition duration-500"
                          />
                        ) : (
                          <div className="font-serif text-2xl text-neutral-300">{getInitials(lot.artist)}</div>
                        )}
                      </div>

                      <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                        <div>
                          <div className="flex justify-between items-start text-neutral-400 font-mono text-[10px] uppercase tracking-wider mb-1">
                            <span>{lot.auction_house || 'AUCTION'}</span>
                            <span>{lot.estimate}</span>
                          </div>
                          <h2 className="text-lg font-serif text-neutral-900 group-hover:underline">{lot.artist}</h2>
                          <p className="text-xs text-neutral-500 italic mt-0.5">{lot.title} {lot.year && `(${lot.year})`}</p>
                        </div>

                        <div className="text-[10px] font-mono text-neutral-400 border-t border-neutral-100 pt-3 flex justify-between items-center">
                          <span className="truncate max-w-[180px]">{lot.medium || 'Mixed Media'}</span>
                          <span className="text-neutral-900">Dossier →</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
