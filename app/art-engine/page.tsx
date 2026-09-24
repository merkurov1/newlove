'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function ArtEngineDashboard() {
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Core Lot Input State (from working admin)
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

  // Lots state (Vault tab)
  const [lots, setLots] = useState<any[]>([]);
  const [loadingLots, setLoadingLots] = useState(true);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'parser' | 'vault'>('parser');

  useEffect(() => {
    async function getUser() {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setLoadingUser(false);
    }
    getUser();
    fetchLots();
  }, []);

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
    addLog('Reset form for new lot', 'info');
  };

  async function fetchLots() {
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
  }

  // AUTH HANDLERS
  async function handlePasskeyLogin() {
    try {
      setLoadingUser(true);
      const email = prompt('Введите email для входа:');
      if (!email) return setLoadingUser(false);

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/art-engine` },
      });

      if (error) throw error;
      alert('Ссылка отправлена на почту!');
    } catch (err: any) {
      alert(err.message || 'Ошибка авторизации');
    } finally {
      setLoadingUser(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
  }

  // 1. ПАРСИНГ И РАЗБОР СТРАНИЦЫ
  const handleAutoParse = async () => {
    if (!input.link) return alert('Paste auction link first');
    setParsing(true);
    setImgError(false);
    addLog(`Extracting metadata from link...`, 'info');

    try {
      const res = await fetch('/api/admin/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: input.link })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Parse failed on server');

      const bestImage = data.image_url || data.extracted?.imageUrl || '';
      let bestTitle = data.title || data.extracted?.title || '';
      let bestArtist = data.artist || data.extracted?.artist || '';
      const extractedSpecs = data.extracted?.specs || data.specs || {};

      // Фолбэк если имя художника попало в title
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

      addLog(`Extraction complete. Image resolved: ${bestImage ? 'YES' : 'NO'}`, 'success');
      
      return { 
        bestArtist, 
        bestTitle, 
        bestImage, 
        specs: extractedSpecs,
        rawData: data.extracted || data 
      };

    } catch (e: any) { 
      addLog(`PARSE ERROR: ${e.message}`, 'error');
      alert(`Parse failed: ${e.message}`); 
      return null;
    } finally { 
      setParsing(false); 
    }
  };

  // 2. ГЕНЕРАЦИЯ ОПИСАНИЯ ЧЕРЕЗ AI
  const generate = async (customContext?: { artist?: string; title?: string; specs?: any; rawData?: any }) => {
    setLoading(true);
    addLog('Synthesizing curatorial analysis via AI...', 'info');

    const targetArtist = customContext?.artist || input.artist;
    const targetTitle = customContext?.title || input.title;
    const targetSpecs = customContext?.specs || input.specs;
    const targetRaw = customContext?.rawData || input.raw;

    try {
      const res = await fetch('/api/admin/generate_lot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist: targetArtist,
          title: targetTitle,
          link: input.link,
          specs: targetSpecs,
          rawData: targetRaw
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Generation failed');

      const resultLot = data.lot || data;
      setOutput(resultLot);
      
      if (resultLot.artist) setInput(prev => ({ ...prev, artist: resultLot.artist }));
      if (resultLot.title) setInput(prev => ({ ...prev, title: resultLot.title }));

      addLog('Curatorial essay & structured tags generated.', 'success');
      return resultLot;
    } catch (e: any) { 
      addLog(`GEN ERROR: ${e.message}`, 'error');
      alert(`Generation failed: ${e.message}`); 
      return null;
    } finally { 
      setLoading(false); 
    }
  };

  // 3. СОХРАНЕНИЕ В VAULT (SUPABASE)
  const saveToVault = async (customOutput?: any, customImage?: string) => {
    const lotToSave = customOutput || output;
    if (!lotToSave) return alert('Generate or parse content first');
    setSaving(true);
    addLog('Encrypting and persisting lot to Supabase Vault...', 'info');

    const imageUrlToSend = customImage || input.image_url || lotToSave.image_url || lotToSave.imageUrl || '';

    try {
      const res = await fetch('/api/admin/save-lot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        addLog(`Successfully vaulted in DB. ID: ${data.lot_id || data.id}`, 'success');
        fetchLots();
      } else {
        throw new Error(data.error || 'API Error during save');
      }
    } catch (e: any) {
      addLog(`SAVE ERROR: ${e.message}`, 'error');
      alert(`Save Failed: ${e.message}`);
    } finally { 
      setSaving(false); 
    }
  };

  // 4. ОДНОКЛИКОВЫЙ ПАЙПЛАЙН
  const handleOneClickPipeline = async () => {
    if (!input.link) return alert('Paste auction link first');
    setAutoProcessing(true);
    addLog('Starting automated end-to-end pipeline...', 'info');
    
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
    addLog('Pipeline finished successfully.', 'success');
    setAutoProcessing(false);
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans pt-24 sm:pt-28 pb-20 px-4 sm:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* TOP BAR / ENGINE HEADER */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-mono text-emerald-400 tracking-widest uppercase">ART ENGINE v2.0</span>
            </div>
            <h1 className="text-3xl font-serif text-white mt-1">Art Intelligence Terminal</h1>
          </div>

          {/* AUTH STATUS & ACTION */}
          <div className="flex items-center gap-4 bg-zinc-900/80 border border-zinc-800 px-4 py-2 rounded-xl text-xs font-mono">
            {loadingUser ? (
              <span className="text-zinc-500">Checking session...</span>
            ) : user ? (
              <div className="flex items-center gap-3">
                <span className="text-zinc-400">Authenticated: <strong className="text-white">{user.email || 'Admin'}</strong></span>
                <button onClick={handleLogout} className="text-zinc-500 hover:text-white transition underline">Exit</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-zinc-400">Guest Mode</span>
                <button onClick={handlePasskeyLogin} className="bg-white text-black px-3 py-1 rounded font-semibold hover:bg-zinc-200 transition">
                  Passkey Login
                </button>
              </div>
            )}
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex justify-between items-center border-b border-zinc-800/80 pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('parser')}
              className={`px-5 py-2.5 rounded-lg font-mono text-xs uppercase tracking-wider transition ${
                activeTab === 'parser' 
                  ? 'bg-zinc-800 text-white border border-zinc-700' 
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              01. Ingestion & Pipeline
            </button>
            <button
              onClick={() => setActiveTab('vault')}
              className={`px-5 py-2.5 rounded-lg font-mono text-xs uppercase tracking-wider transition ${
                activeTab === 'vault' 
                  ? 'bg-zinc-800 text-white border border-zinc-700' 
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
              }`}
            >
              02. Vault Catalog ({lots.length})
            </button>
          </div>

          {activeTab === 'parser' && (
            <button 
              onClick={handleReset}
              className="text-xs font-mono text-zinc-400 hover:text-white px-3 py-1.5 rounded bg-zinc-900 border border-zinc-800 transition"
            >
              Clear / New Lot
            </button>
          )}
        </div>

        {/* TAB 1: PARSER TERMINAL */}
        {activeTab === 'parser' && (
          <main className="grid lg:grid-cols-12 gap-8 items-start">
            
            {/* LEFT COLUMN: CONTROL & INGESTION (5 COLS) */}
            <div className="lg:col-span-5 space-y-5">
              
              {/* LINK INGESTION PANEL */}
              <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 space-y-4 shadow-xl">
                <label className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
                  Auction Lot Source URL
                </label>
                
                <div className="flex gap-2">
                  <input 
                    type="url"
                    placeholder="https://www.christies.com/en/lot/..." 
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 transition font-mono placeholder:text-zinc-600"
                    value={input.link}
                    onChange={e => setInput({...input, link: e.target.value})}
                  />
                  <button 
                    onClick={handleAutoParse} 
                    disabled={parsing || autoProcessing} 
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2.5 rounded-lg text-xs font-mono font-medium transition disabled:opacity-50 shrink-0 border border-zinc-700"
                  >
                    {parsing ? '...' : 'PARSE'}
                  </button>
                </div>

                <button
                  onClick={handleOneClickPipeline}
                  disabled={parsing || loading || saving || autoProcessing}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 px-4 rounded-lg text-xs font-mono tracking-wider transition shadow-lg shadow-emerald-950/40 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {autoProcessing ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      <span>PROCESSING PIPELINE...</span>
                    </>
                  ) : (
                    <span>⚡ PROCESS LOT TO VAULT</span>
                  )}
                </button>
              </div>

              {/* LOT IMAGE & BASIC DETAILS METADATA */}
              <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Visual Preview</span>
                  {input.image_url && <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">IMAGE RESOLVED</span>}
                </div>

                <div className="relative aspect-[4/3] w-full bg-zinc-950 border border-zinc-800/80 rounded-lg overflow-hidden flex items-center justify-center group">
                  {input.image_url && !imgError ? (
                    <img 
                      src={input.image_url} 
                      className="object-contain max-h-full max-w-full p-2 transition duration-300 group-hover:scale-105" 
                      alt="Lot Preview" 
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <div className="text-center text-zinc-600 text-xs font-mono">
                      No image metadata extracted
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono text-zinc-500 block mb-1">ARTIST</label>
                    <input 
                      placeholder="Artist Name" 
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 font-mono" 
                      value={input.artist} 
                      onChange={e => setInput({...input, artist: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-zinc-500 block mb-1">TITLE</label>
                    <input 
                      placeholder="Artwork Title" 
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-500 font-mono" 
                      value={input.title} 
                      onChange={e => setInput({...input, title: e.target.value})} 
                    />
                  </div>
                </div>

                <button 
                  onClick={() => generate()} 
                  disabled={loading || autoProcessing} 
                  className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-medium py-2.5 rounded-lg text-xs font-mono transition disabled:opacity-50"
                >
                  {loading ? 'SYNTHESIZING WITH AI...' : 'GENERATE AI ESSAY'}
                </button>
              </div>

              {/* TERMINAL CONSOLE LOGS */}
              <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 font-mono text-[11px] space-y-2">
                <div className="text-zinc-500 font-bold uppercase text-[10px] tracking-wider pb-2 border-b border-zinc-900 flex justify-between">
                  <span>Execution Logs</span>
                  <span className="text-zinc-700">{logs.length} events</span>
                </div>
                <div className="h-28 overflow-y-auto space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-800">
                  {logs.length === 0 && <span className="text-zinc-700 italic">Ready to ingest lot data...</span>}
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
                  
                  {/* ACTION BAR */}
                  <div className="flex justify-between items-center bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-400">STATUS:</span>
                      <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">SYNTHESIZED</span>
                    </div>
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setShowRawJson(!showRawJson)} 
                        className="text-xs font-mono text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-950 transition"
                      >
                        {showRawJson ? 'VIEW CARD' : 'RAW JSON'}
                      </button>

                      <button 
                        onClick={() => saveToVault()} 
                        disabled={saving || autoProcessing}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg text-xs font-mono font-medium transition disabled:opacity-50"
                      >
                        {saving ? 'SAVING...' : '💾 SAVE TO VAULT'}
                      </button>
                    </div>
                  </div>

                  {/* CARD BODY */}
                  {showRawJson ? (
                    <div className="border border-zinc-800/80 rounded-xl p-6 bg-zinc-900/30">
                      <pre className="text-zinc-300 font-mono text-xs whitespace-pre-wrap overflow-x-auto max-h-[700px]">
                        {JSON.stringify(output, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-xl p-8 space-y-8 max-h-[780px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800">
                      
                      {/* HEADER & METADATA */}
                      <div className="border-b border-zinc-800/80 pb-6 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest">{output.auction_house || "AUCTION HOUSE"} • LOT {output.lot_number || '—'}</span>
                            <h2 className="text-2xl font-serif font-light text-white mt-1">{output.artist || input.artist || "Unknown Artist"}</h2>
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
                          <h3 className="text-lg font-serif italic text-zinc-200">{output.title || input.title} {output.year && <span className="not-italic text-zinc-500 text-sm">({output.year})</span>}</h3>
                          {output.medium && <p className="text-xs text-zinc-400 mt-1">{output.medium}</p>}
                          {output.dimensions && <p className="text-xs font-mono text-zinc-500 mt-0.5">{output.dimensions}</p>}
                        </div>
                      </div>

                      {/* CURATORIAL ESSAY */}
                      {output.curatorial_essay && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-mono text-zinc-400 uppercase tracking-widest border-b border-zinc-800/40 pb-2">Curatorial Analysis</h4>
                          <div className="text-zinc-300 text-sm font-serif leading-relaxed whitespace-pre-line">
                            {output.curatorial_essay}
                          </div>
                        </div>
                      )}

                      {/* PROVENANCE */}
                      {output.provenance && output.provenance.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-xs font-mono text-zinc-400 uppercase tracking-widest border-b border-zinc-800/40 pb-2">Provenance</h4>
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
                <div className="h-full min-h-[500px] flex flex-col items-center justify-center border border-dashed border-zinc-800/80 rounded-xl text-center p-8 bg-zinc-950/40">
                  <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-600">
                    ✦
                  </div>
                  <h3 className="text-zinc-400 font-mono text-sm mb-1">No Lot Ingested</h3>
                  <p className="text-zinc-600 text-xs max-w-sm">
                    Paste an auction lot URL from Christie's, Sotheby's, or Phillips and press Process to generate a catalog card.
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
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">INDEXED ARTIFACTS</span>
              <button onClick={fetchLots} className="text-xs font-mono text-emerald-400 hover:underline">
                REFRESH GALLERY ↻
              </button>
            </div>

            {loadingLots ? (
              <div className="py-12 text-center font-mono text-xs text-zinc-500">Loading cataloged lots...</div>
            ) : lots.length === 0 ? (
              <div className="py-12 text-center font-mono text-xs text-zinc-500">No lots in vault yet. Use the parser tab to enrich and add works.</div>
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
                      className="group bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 transition flex flex-col"
                    >
                      <div className="aspect-[4/3] bg-zinc-950 relative overflow-hidden flex items-center justify-center p-4 border-b border-zinc-800/60">
                        {lot.image_path ? (
                          <img
                            src={publicImg}
                            alt={lot.title}
                            className="object-contain max-h-full max-w-full group-hover:scale-105 transition duration-500"
                          />
                        ) : (
                          <div className="text-xs font-mono text-zinc-600">NO IMAGE</div>
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
