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
  const [authEmail, setAuthEmail] = useState('');
  const [authSending, setAuthSending] = useState(false);

  // Ingestion & Pipeline State
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
  const [autoProcessing, setAutoProcessing] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [logs, setLogs] = useState<Array<{ time: string; msg: string; type?: 'info' | 'error' | 'success' }>>([]);

  // Vault Gallery State
  const [lots, setLots] = useState<any[]>([]);
  const [loadingLots, setLoadingLots] = useState(true);
  const [activeTab, setActiveTab] = useState<'parser' | 'vault'>('parser');

  // Initialize Session & Auth Listener (Strict Types Fix)
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

  // Log Helper
  const addLog = (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [{ time, msg, type }, ...prev]);
  };

  const handleReset = () => {
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
    addLog('Reset ingestion pipeline for new lot.', 'info');
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

  // AUTH HANDLERS
  const handleMagicLinkLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail) return;
    setAuthSending(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail,
        options: { emailRedirectTo: `${window.location.origin}/art-engine` },
      });

      if (error) throw error;
      alert('🔒 Magic link sent to your email. Check your inbox to sign in.');
      setShowAuthModal(false);
      setAuthEmail('');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication error';
      alert(errorMessage);
    } finally {
      setAuthSending(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    addLog('User signed out.', 'info');
  };

  // PIPELINE 1: PARSE URL
  const handleAutoParse = async () => {
    if (!input.link) return alert('Enter an auction URL first');
    setParsing(true);
    setImgError(false);
    addLog(`Ingesting metadata from source...`, 'info');

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

      addLog(`Extracted lot: "${bestArtist || 'Unknown'}" — ${bestImage ? 'Visual Attached' : 'No Visual'}`, 'success');

      return { 
        bestArtist, 
        bestTitle, 
        bestImage, 
        specs: extractedSpecs,
        rawData: data.extracted || data 
      };

    } catch (e: unknown) { 
      const msg = e instanceof Error ? e.message : 'Parse error';
      addLog(`PARSE ERROR: ${msg}`, 'error');
      alert(`Parse failed: ${msg}`); 
      return null;
    } finally { 
      setParsing(false); 
    }
  };

  // PIPELINE 2: GENERATE ESSAY
  const generate = async (customContext?: { artist?: string; title?: string; specs?: any; rawData?: any }) => {
    setLoading(true);
    addLog('Synthesizing curatorial dossier with AI Engine...', 'info');

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

      addLog('Curatorial analysis, provenance, and structured tags synthesized.', 'success');
      return resultLot;
    } catch (e: unknown) { 
      const msg = e instanceof Error ? e.message : 'Generation error';
      addLog(`GEN ERROR: ${msg}`, 'error');
      alert(`Generation failed: ${msg}`); 
      return null;
    } finally { 
      setLoading(false); 
    }
  };

  // PIPELINE 3: SAVE TO VAULT
  const saveToVault = async (customOutput?: any, customImage?: string) => {
    const lotToSave = customOutput || output;
    if (!lotToSave) return alert('Generate or parse content before saving');
    setSaving(true);
    addLog('Persisting lot dossier to Supabase Vault...', 'info');

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
        addLog(`Lot vaulted successfully [ID: ${data.lot_id || data.id}]`, 'success');
        fetchLots();
      } else {
        throw new Error(data.error || 'API Error during save');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save error';
      addLog(`SAVE ERROR: ${msg}`, 'error');
      alert(`Save Failed: ${msg}`);
    } finally { 
      setSaving(false); 
    }
  };

  // PIPELINE 4: ONE-CLICK AUTOMATION
  const handleOneClickPipeline = async () => {
    if (!input.link) return alert('Enter an auction URL first');
    setAutoProcessing(true);
    addLog('Executing end-to-end autonomous ingestion pipeline...', 'info');

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
    addLog('Pipeline completed successfully.', 'success');
    setAutoProcessing(false);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans antialiased pt-20 pb-24 px-4 sm:px-8 selection:bg-zinc-800 selection:text-zinc-100">
      
      {/* AUTH MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
              <div>
                <span className="text-[10px] font-mono uppercase text-emerald-400 tracking-widest block">AUTHENTICATION</span>
                <h3 className="text-lg font-serif text-white">Art Engine Terminal Access</h3>
              </div>
              <button 
                onClick={() => setShowAuthModal(false)}
                className="text-zinc-500 hover:text-white font-mono text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleMagicLinkLogin} className="space-y-4">
              <div>
                <label className="text-xs font-mono text-zinc-400 block mb-2">EMAIL ADDRESS</label>
                <input 
                  type="email"
                  required
                  placeholder="curator@merkurov.love"
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={authSending}
                className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-medium py-3 rounded-xl text-xs font-mono tracking-wider transition disabled:opacity-50"
              >
                {authSending ? 'SENDING MAGIC LINK...' : 'SEND MAGIC LINK / PASSKEY'}
              </button>
            </form>

            <p className="text-[11px] text-zinc-500 font-mono leading-relaxed">
              Sign-in provides write and edit privileges to the Supabase Art Vault.
            </p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER / EXECUTIVE DASHBOARD */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800/80 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-[11px] font-mono text-emerald-400 tracking-widest uppercase font-semibold">
                CURATORIAL AI ENGINE v2.4
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif text-white tracking-tight">
              Art Intelligence & Cataloging System
            </h1>
          </div>

          {/* AUTHENTICATION BAR */}
          <div className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-800/80 px-4 py-2 rounded-xl text-xs font-mono">
            {loadingUser ? (
              <span className="text-zinc-500">Checking credentials...</span>
            ) : user ? (
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-zinc-300">Authorized: <strong className="text-white">{user.email || 'Curator'}</strong></span>
                <button 
                  onClick={handleLogout} 
                  className="text-zinc-500 hover:text-zinc-300 transition underline ml-2"
                >
                  Exit
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-zinc-500">Read-Only Session</span>
                <button 
                  onClick={() => setShowAuthModal(true)} 
                  className="bg-zinc-100 hover:bg-white text-zinc-950 px-3.5 py-1.5 rounded-lg font-medium transition"
                >
                  Authenticate
                </button>
              </div>
            )}
          </div>
        </div>

        {/* TABS & PIPELINE CONTROLS */}
        <div className="flex justify-between items-center border-b border-zinc-800/80 pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('parser')}
              className={`px-4 py-2 rounded-lg font-mono text-xs uppercase tracking-wider transition ${
                activeTab === 'parser' 
                  ? 'bg-zinc-800/90 text-white border border-zinc-700/80 shadow-inner' 
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
              }`}
            >
              01. Ingestion Pipeline
            </button>
            <button
              onClick={() => setActiveTab('vault')}
              className={`px-4 py-2 rounded-lg font-mono text-xs uppercase tracking-wider transition ${
                activeTab === 'vault' 
                  ? 'bg-zinc-800/90 text-white border border-zinc-700/80 shadow-inner' 
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
              }`}
            >
              02. Vault Catalog ({lots.length})
            </button>
          </div>

          {activeTab === 'parser' && (
            <button 
              onClick={handleReset}
              className="text-xs font-mono text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 transition"
            >
              Clear Form
            </button>
          )}
        </div>

        {/* TAB 1: PARSER TERMINAL */}
        {activeTab === 'parser' && (
          <main className="grid lg:grid-cols-12 gap-8 items-start">
            
            {/* LEFT COLUMN: CONTROL & INGESTION (5 COLS) */}
            <div className="lg:col-span-5 space-y-5">
              
              {/* SOURCE URL PANEL */}
              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 space-y-4 backdrop-blur-sm">
                <label className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest block">
                  Auction Source Link
                </label>
                
                <div className="flex gap-2">
                  <input 
                    type="url"
                    placeholder="https://www.sothebys.com/en/buy/auction/..." 
                    className="flex-1 bg-zinc-950 border border-zinc-800/80 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 transition font-mono placeholder:text-zinc-600"
                    value={input.link}
                    onChange={e => setInput({...input, link: e.target.value})}
                  />
                  <button 
                    onClick={handleAutoParse} 
                    disabled={parsing || autoProcessing} 
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2.5 rounded-xl text-xs font-mono font-medium transition disabled:opacity-50 border border-zinc-700/60 shrink-0"
                  >
                    {parsing ? '...' : 'PARSE'}
                  </button>
                </div>

                <button
                  onClick={handleOneClickPipeline}
                  disabled={parsing || loading || saving || autoProcessing}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 px-4 rounded-xl text-xs font-mono tracking-wider transition shadow-lg shadow-emerald-950/30 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {autoProcessing ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>EXECUTING PIPELINE...</span>
                    </>
                  ) : (
                    <span>⚡ PROCESS LOT TO VAULT</span>
                  )}
                </button>
              </div>

              {/* METADATA PREVIEW & OVERRIDES */}
              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-5 space-y-4 backdrop-blur-sm">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">Artwork Preview</span>
                  {input.image_url && (
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                      IMAGE ATTACHED
                    </span>
                  )}
                </div>

                <div className="relative aspect-[4/3] w-full bg-zinc-950 border border-zinc-800/80 rounded-xl overflow-hidden flex items-center justify-center group">
                  {input.image_url && !imgError ? (
                    <img 
                      src={input.image_url} 
                      className="object-contain max-h-full max-w-full p-2 transition duration-500 group-hover:scale-105" 
                      alt="Lot Visual" 
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <div className="text-center text-zinc-600 text-xs font-mono">
                      No artwork visual loaded
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-zinc-500 block mb-1">ARTIST</label>
                    <input 
                      placeholder="Artist Name" 
                      className="w-full bg-zinc-950 border border-zinc-800/80 rounded-xl p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 font-mono" 
                      value={input.artist} 
                      onChange={e => setInput({...input, artist: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-zinc-500 block mb-1">TITLE</label>
                    <input 
                      placeholder="Artwork Title" 
                      className="w-full bg-zinc-950 border border-zinc-800/80 rounded-xl p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-600 font-mono" 
                      value={input.title} 
                      onChange={e => setInput({...input, title: e.target.value})} 
                    />
                  </div>
                </div>

                <button 
                  onClick={() => generate()} 
                  disabled={loading || autoProcessing} 
                  className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-medium py-2.5 rounded-xl text-xs font-mono transition disabled:opacity-50"
                >
                  {loading ? 'SYNTHESIZING WITH AI...' : 'GENERATE AI ESSAY'}
                </button>
              </div>

              {/* TERMINAL LOG CONSOLE */}
              <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-4 font-mono text-[11px] space-y-2">
                <div className="text-zinc-500 font-semibold uppercase text-[10px] tracking-wider pb-2 border-b border-zinc-900 flex justify-between">
                  <span>Pipeline Execution Logs</span>
                  <span className="text-zinc-600">{logs.length} events</span>
                </div>
                <div className="h-32 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-800 pr-1">
                  {logs.length === 0 && <span className="text-zinc-700 italic">Waiting for input...</span>}
                  {logs.map((l, i) => (
                    <div key={i} className="flex gap-2 leading-tight">
                      <span className="text-zinc-600 shrink-0">[{l.time}]</span>
                      <span className={l.type === 'error' ? 'text-red-400' : l.type === 'success' ? 'text-emerald-400' : 'text-zinc-400'}>
                        {l.msg}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: CURATORIAL CARD PREVIEW (7 COLS) */}
            <div className="lg:col-span-7">
              {output ? (
                <div className="space-y-4">
                  
                  {/* CARD ACTION BAR */}
                  <div className="flex justify-between items-center bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-400">DOSSIER STATUS:</span>
                      <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-0.5 rounded-full">
                        SYNTHESIZED
                      </span>
                    </div>
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setShowRawJson(!showRawJson)} 
                        className="text-xs font-mono text-zinc-400 hover:text-white px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-950 transition"
                      >
                        {showRawJson ? 'VIEW CARD' : 'RAW JSON'}
                      </button>

                      <button 
                        onClick={() => saveToVault()} 
                        disabled={saving || autoProcessing}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-xl text-xs font-mono font-medium transition disabled:opacity-50"
                      >
                        {saving ? 'SAVING...' : '💾 SAVE TO VAULT'}
                      </button>
                    </div>
                  </div>

                  {/* DOSSIER BODY */}
                  {showRawJson ? (
                    <div className="border border-zinc-800/80 rounded-2xl p-6 bg-zinc-950/60">
                      <pre className="text-zinc-300 font-mono text-xs whitespace-pre-wrap overflow-x-auto max-h-[700px]">
                        {JSON.stringify(output, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-2xl p-8 space-y-8 max-h-[780px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
                      
                      {/* DOSSIER HEADER */}
                      <div className="border-b border-zinc-800/80 pb-6 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest">
                              {output.auction_house || "AUCTION HOUSE"} • LOT {output.lot_number || '—'}
                            </span>
                            <h2 className="text-2xl font-serif text-white mt-1">
                              {output.artist || input.artist || "Unknown Artist"}
                            </h2>
                            {output.artist_dates && <p className="text-zinc-400 italic text-sm">{output.artist_dates}</p>}
                          </div>
                          {output.estimate_raw && (
                            <div className="text-right">
                              <span className="text-[10px] font-mono text-zinc-500 uppercase block">Estimate</span>
                              <span className="text-sm font-mono text-zinc-200 font-medium">{output.estimate_raw}</span>
                            </div>
                          )}
                        </div>

                        <div className="pt-2">
                          <h3 className="text-lg font-serif italic text-zinc-200">
                            {output.title || input.title} {output.year && <span className="not-italic text-zinc-500 text-sm">({output.year})</span>}
                          </h3>
                          {output.medium && <p className="text-xs text-zinc-400 mt-1">{output.medium}</p>}
                          {output.dimensions && <p className="text-xs font-mono text-zinc-500 mt-0.5">{output.dimensions}</p>}
                        </div>
                      </div>

                      {/* CURATORIAL ESSAY */}
                      {output.curatorial_essay && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-mono text-zinc-400 uppercase tracking-widest border-b border-zinc-800/40 pb-2">
                            Curatorial Essay & Analysis
                          </h4>
                          <div className="text-zinc-300 text-sm font-serif leading-relaxed whitespace-pre-line">
                            {output.curatorial_essay}
                          </div>
                        </div>
                      )}

                      {/* PROVENANCE */}
                      {output.provenance && output.provenance.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-mono text-zinc-400 uppercase tracking-widest border-b border-zinc-800/40 pb-2">
                            Provenance
                          </h4>
                          <ul className="space-y-1.5 text-xs text-zinc-400 font-mono">
                            {output.provenance.map((item: string, idx: number) => (
                              <li key={idx} className="flex gap-2">
                                <span className="text-zinc-600">•</span>
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
                <div className="h-full min-h-[520px] flex flex-col items-center justify-center border border-dashed border-zinc-800/80 rounded-2xl text-center p-8 bg-zinc-950/30">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-500 text-lg">
                    ✦
                  </div>
                  <h3 className="text-zinc-300 font-serif text-base mb-1">No Lot Loaded</h3>
                  <p className="text-zinc-500 text-xs max-w-sm font-mono leading-relaxed">
                    Paste an auction URL and click Process to parse details and generate a curatorial dossier.
                  </p>
                </div>
              )}
            </div>

          </main>
        )}

        {/* TAB 2: VAULT GALLERY */}
        {activeTab === 'vault' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">SAVED VAULT ARTIFACTS</span>
              <button onClick={fetchLots} className="text-xs font-mono text-emerald-400 hover:underline">
                REFRESH CATALOG ↻
              </button>
            </div>

            {loadingLots ? (
              <div className="py-16 text-center font-mono text-xs text-zinc-500">Loading cataloged artifacts...</div>
            ) : lots.length === 0 ? (
              <div className="py-16 text-center font-mono text-xs text-zinc-500">No lots in vault yet. Use the pipeline to process works.</div>
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
                      className="group bg-zinc-900/30 border border-zinc-800/80 rounded-2xl overflow-hidden hover:border-zinc-600 transition flex flex-col backdrop-blur-sm"
                    >
                      <div className="aspect-[4/3] bg-zinc-950 relative overflow-hidden flex items-center justify-center p-4 border-b border-zinc-800/60">
                        {lot.image_path ? (
                          <img
                            src={publicImg}
                            alt={lot.title}
                            className="object-contain max-h-full max-w-full group-hover:scale-105 transition duration-500"
                          />
                        ) : (
                          <div className="text-xs font-mono text-zinc-700">NO VISUAL</div>
                        )}
                      </div>

                      <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                        <div>
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">{lot.auction_house || 'AUCTION'}</span>
                            {lot.estimate && <span className="text-[11px] font-mono text-zinc-400">{lot.estimate}</span>}
                          </div>
                          <h2 className="text-base font-serif text-white group-hover:text-emerald-400 transition mt-1">{lot.artist}</h2>
                          <p className="text-xs text-zinc-400 italic">{lot.title} {lot.year && `(${lot.year})`}</p>
                        </div>

                        <div className="text-[10px] font-mono text-zinc-500 border-t border-zinc-800/60 pt-3 flex justify-between items-center">
                          <span className="truncate max-w-[180px]">{lot.medium || 'Mixed Media'}</span>
                          <span>DOSSIER →</span>
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
