'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase-browser';
import { useAuth } from '@/components/AuthContext';
import { Clipboard, KeyRound, Mail, CheckCircle2 } from 'lucide-react';

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

  // Ingestion State
  const [input, setInput] = useState({ 
    artist: '', 
    title: '',
    link: '',
    raw: '',
    image_url: '',
    source_description: '',
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

  // Vault Gallery State
  const [lots, setLots] = useState<any[]>([]);
  const [loadingLots, setLoadingLots] = useState(true);
  const [lotsError, setLotsError] = useState('');
  const [activeTab, setActiveTab] = useState<'parser' | 'vault'>('parser');

  // Fetch Lots for Vault
  const fetchLots = useCallback(async () => {
    setLoadingLots(true);
    setLotsError('');
    if (!user) {
      setLots([]);
      setLoadingLots(false);
      return;
    }
    const { data, error } = await supabase
      .from('lots')
      .select('id, artist, title, year, medium, estimate, image_path, source_url, auction_house, created_at')
      .order('created_at', { ascending: false })
      .limit(18);

    if (!error && data) {
      setLots(data);
    } else if (error) {
      setLotsError('Unable to load the secure vault.');
    }
    setLoadingLots(false);
  }, [user]);

  useEffect(() => {
    fetchLots();
  }, [fetchLots]);

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

  const handleAutoParse = async () => {
    if (!input.link) return null;
    try {
      const parsed = new URL(input.link);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    } catch {
      alert('Enter a valid HTTP or HTTPS auction URL');
      return null;
    }
    setParsing(true);
    setImgError(false);
    setIsSaved(false);

    try {
      const res = await authFetch('/api/admin/parse-url', {
        method: 'POST',
        body: JSON.stringify({ url: input.link })
      });

      let data: any = {};
      const responseText = await res.text();
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`Server response error (${res.status}): ${responseText.slice(0, 100)}`);
      }

      if (!res.ok) throw new Error(data.details || data.error || `Server status ${res.status}`);

      const bestImage = data.image_url || data.extracted?.imageUrl || '';
      let bestTitle = data.title || data.extracted?.title || '';
      let bestArtist = data.artist || data.extracted?.artist || '';
      const extractedSpecs = data.extracted?.specs || data.specs || {};
      const sourceDesc = data.extracted?.description || data.description || '';

      if (!bestArtist && bestTitle) {
        const knownArtists = ['Banksy', 'Andy Warhol', 'KAWS', 'Damien Hirst', 'Pablo Picasso', 'Jean-Michel Basquiat'];
        const matched = knownArtists.find(a => bestTitle.toLowerCase().includes(a.toLowerCase()));
        if (matched) bestArtist = matched;
      }

      const rawDataObj = data.extracted || data;

      setInput(prev => ({
        ...prev,
        artist: bestArtist || prev.artist,
        title: bestTitle || prev.title,
        image_url: bestImage || prev.image_url,
        source_description: sourceDesc || prev.source_description,
        specs: { ...prev.specs, ...extractedSpecs },
        raw: JSON.stringify(rawDataObj, null, 2)
      }));

      return { 
        bestArtist, 
        bestTitle, 
        bestImage, 
        sourceDescription: sourceDesc,
        specs: extractedSpecs,
        rawData: rawDataObj 
      };

    } catch (e: any) { 
      const msg = e?.message || 'Parse error';
      alert(`Parse failed: ${msg}`); 
      return null;
    } finally { 
      setParsing(false); 
    }
  };

  const generate = async (customContext?: { 
    artist?: string; 
    title?: string; 
    specs?: any; 
    sourceDescription?: string;
    rawData?: any 
  }) => {
    setLoading(true);

    const targetArtist = customContext?.artist ?? input.artist;
    const targetTitle = customContext?.title ?? input.title;
    const targetSpecs = customContext?.specs ?? input.specs;
    const targetSourceDesc = customContext?.sourceDescription ?? input.source_description;
    const targetRaw = customContext?.rawData ?? (input.raw ? JSON.parse(input.raw) : null);

    try {
      const res = await authFetch('/api/admin/generate_lot', {
        method: 'POST',
        body: JSON.stringify({
          artist: targetArtist,
          title: targetTitle,
          link: input.link,
          specs: targetSpecs,
          source_description: targetSourceDesc,
          rawData: targetRaw
        })
      });

      let data: any = {};
      const responseText = await res.text();
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`Server response error (${res.status}): ${responseText.slice(0, 100)}`);
      }

      if (!res.ok) throw new Error(data.details || data.error || `Server status ${res.status}`);

      const resultLot = data.lot || data;
      setOutput(resultLot);

      if (resultLot.artist) setInput(prev => ({ ...prev, artist: resultLot.artist }));
      if (resultLot.title) setInput(prev => ({ ...prev, title: resultLot.title }));

      return resultLot;
    } catch (e: any) { 
      const msg = e?.message || 'Generation error';
      alert(`Generation failed: ${msg}`); 
      return null;
    } finally { 
      setLoading(false); 
    }
  };

  const saveToVault = async (customOutput?: any, customContext?: { artist?: string; title?: string; image_url?: string; specs?: any; sourceDescription?: string }) => {
    const lotToSave = customOutput || output;
    if (!lotToSave || isSaved) return;
    setSaving(true);

    const artistToSend = customContext?.artist || input.artist || lotToSave.artist || '';
    const titleToSend = customContext?.title || input.title || lotToSave.title || '';
    const imageUrlToSend = customContext?.image_url || input.image_url || lotToSave.image_url || lotToSave.imageUrl || '';
    const specsToSend = customContext?.specs || input.specs || {};
    const sourceDescToSend = customContext?.sourceDescription || input.source_description || lotToSave.source_description || null;

    try {
      const res = await authFetch('/api/admin/save-lot', {
        method: 'POST',
        body: JSON.stringify({
          artist: artistToSend,
          title: titleToSend,
          link: input.link,
          image_url: imageUrlToSend,
          specs: specsToSend,
          ai_content: {
            ...lotToSave,
            source_description: sourceDescToSend,
          }
        })
      });

      let data: any = {};
      const responseText = await res.text();
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(`Server response error (${res.status}): ${responseText.slice(0, 100)}`);
      }

      if (!res.ok) throw new Error(data.error || `Server status ${res.status}`);

      if (data.success || data.lot_id || data.id) {
        setIsSaved(true);
        fetchLots();
      } else {
        throw new Error(data.error || 'API Error during save');
      }
    } catch (e: any) {
      const msg = e?.message || 'Save error';
      alert(`Save Failed: ${msg}`);
    } finally { 
      setSaving(false); 
    }
  };

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
      sourceDescription: parseResult.sourceDescription,
      rawData: parseResult.rawData
    });
    if (!aiResult) return setAutoProcessing(false);

    await saveToVault(aiResult, {
      artist: parseResult.bestArtist,
      title: parseResult.bestTitle,
      image_url: parseResult.bestImage,
      specs: parseResult.specs,
      sourceDescription: parseResult.sourceDescription
    });

    setAutoProcessing(false);
  };

  const handleCopyDossier = () => {
    if (!output) return;
    const provenance = Array.isArray(output.provenance)
      ? output.provenance.map((item: unknown) => String(item)).join('\n')
      : String(output.provenance || '');
    const text = `# ${output.artist || input.artist}\n*${output.title || input.title}* (${output.year || ''})\n\n${output.curatorial_essay || ''}\n\nProvenance:\n${provenance}`;
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopyStatus(true);
    setTimeout(() => setCopyStatus(false), 2000);
  };

  const getInitials = (name?: string) => {
    if (!name) return 'CE';
    return name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
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

      <div className="max-w-7xl mx-auto pt-28 pb-24 px-6 md:px-12 space-y-8">
        
        {!isLoadingUser && !user ? (
          /* PROMO LANDING FOR UNAUTHENTICATED USERS */
          <div className="space-y-16 max-w-5xl mx-auto">
            <div className="flex flex-col items-center justify-center text-center bg-white/80 backdrop-blur-xl border border-gray-200/80 px-8 py-16 rounded-3xl shadow-sm">
              <div className="space-y-4 max-w-2xl">
                <span className="font-mono text-xs tracking-[0.3em] uppercase text-gray-400 font-semibold block">
                  Institutional Art Advisory & Market Intelligence
                </span>
                <h1 className="text-5xl md:text-7xl font-serif font-light text-[#111] tracking-tight">
                  Art Intelligence Terminal
                </h1>
                <p className="font-serif italic text-gray-600 text-lg md:text-xl pt-2 leading-relaxed">
                  Professional-grade terminal engineered for art dealers, family offices, and private banking art-lending specialists.
                </p>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl border border-gray-200/80 p-8 md:p-14 space-y-12 shadow-sm rounded-3xl">
              <div className="text-center space-y-3">
                <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-gray-400 block">
                  [ CURATOR ENGINE — INSTITUTIONAL CASE STUDIES ]
                </span>
                <h3 className="text-3xl md:text-4xl font-serif font-light text-[#111]">
                  AI-Driven Art Valuation & Heritage Architecture
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <Link href="/case-study/fontana" className="group bg-white border border-gray-200/80 p-6 flex flex-col justify-between hover:border-black transition-all duration-300 shadow-sm rounded-2xl">
                  <div>
                    <div className="aspect-[4/3] bg-gray-50 mb-6 overflow-hidden relative border border-gray-100 rounded-xl">
                      <img 
                        src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1022.jpeg" 
                        alt="Lucio Fontana White Absolute" 
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                        Asset: Lucio Fontana (1968) // Valuation
                      </div>
                      <h4 className="font-serif text-2xl text-[#111] group-hover:text-gray-600 transition-colors">
                        THE WHITE ABSOLUTE
                      </h4>
                      <p className="font-serif italic text-gray-600 text-xs sm:text-sm leading-relaxed">
                        See how the Curator Engine analyzes liquidity, risk, and market arbitrage for institutional-grade assets.
                      </p>
                    </div>
                  </div>
                  <div className="pt-6 font-mono text-[11px] uppercase tracking-widest text-[#111] flex items-center justify-between border-t border-gray-100 mt-6 font-bold">
                    <span>Analyze</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </Link>

                <Link href="/case-study/garcia" className="group bg-white border border-gray-200/80 p-6 flex flex-col justify-between hover:border-black transition-all duration-300 shadow-sm rounded-2xl">
                  <div>
                    <div className="aspect-[4/3] bg-gray-50 mb-6 overflow-hidden relative border border-gray-100 rounded-xl">
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
                      <h4 className="font-serif text-2xl text-[#111] group-hover:text-gray-600 transition-colors">
                        POETICS OF SILENCE
                      </h4>
                      <p className="font-serif italic text-gray-600 text-xs sm:text-sm leading-relaxed">
                        Examine how AI-assisted provenance and structural framing transform non-conformist heritage into sovereign capital.
                      </p>
                    </div>
                  </div>
                  <div className="pt-6 font-mono text-[11px] uppercase tracking-widest text-[#111] flex items-center justify-between border-t border-gray-100 mt-6 font-bold">
                    <span>Examine</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </Link>

                <Link href="/case-study/pivovarov" className="group bg-white border border-gray-200/80 p-6 flex flex-col justify-between hover:border-black transition-all duration-300 shadow-sm rounded-2xl">
                  <div>
                    <div className="aspect-[4/3] bg-gray-50 mb-6 overflow-hidden relative border border-gray-100 rounded-xl">
                      <img 
                        src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_1039.jpeg" 
                        alt="Viktor Pivovarov Total Loneliness" 
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                        Asset: Viktor Pivovarov // Dossier
                      </div>
                      <h4 className="font-serif text-2xl text-[#111] group-hover:text-gray-600 transition-colors">
                        TOTAL LONELINESS
                      </h4>
                      <p className="font-serif italic text-gray-600 text-xs sm:text-sm leading-relaxed">
                        A foundational case study in Moscow Conceptualism, exploring inward-facing rigour and institutional endurance.
                      </p>
                    </div>
                  </div>
                  <div className="pt-6 font-mono text-[11px] uppercase tracking-widest text-[#111] flex items-center justify-between border-t border-gray-100 mt-6 font-bold">
                    <span>Read Dossier</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </Link>
              </div>
            </div>

            <div className="py-16 text-center space-y-8 bg-white/80 backdrop-blur-xl border border-gray-200/80 p-12 shadow-sm rounded-3xl">
              <div className="space-y-4 max-w-xl mx-auto">
                <h2 className="text-3xl md:text-5xl font-serif font-light text-[#111]">
                  Fine Art Banking & Advisory Infrastructure
                </h2>
                <p className="font-serif italic text-gray-600 text-lg md:text-xl leading-relaxed">
                  Generate institutional-quality investment memoranda in seconds with absolute discretion.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row justify-center gap-4 font-mono">
                <button
                  onClick={() => { setAuthMode('signin'); setShowAuthModal(true); }}
                  className="bg-black hover:bg-gray-800 text-white text-xs uppercase tracking-widest px-10 py-4 transition font-bold rounded-full shadow-sm"
                >
                  Sign In
                </button>
                <button
                  onClick={() => { setAuthMode('request'); setShowAuthModal(true); }}
                  className="bg-white hover:bg-gray-50 text-black border border-black text-xs uppercase tracking-widest px-10 py-4 transition font-bold rounded-full shadow-sm"
                >
                  Request Access
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* AUTHENTICATED ART ENGINE INTERFACE */
          <>
            {/* FIRST LINE: INPUT FIELD, ACTION BUTTONS & VAULT SWITCH */}
            <div className="bg-white/80 backdrop-blur-xl border border-gray-200/80 p-5 rounded-3xl shadow-sm">
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
                
                {/* Input URL Field */}
                <div className="relative flex-1 flex items-center">
                  <input 
                    type="url"
                    placeholder="https://www.sothebys.com/en/buy/..." 
                    className="w-full bg-white border border-gray-200 pl-4 pr-10 py-3.5 text-xs text-black focus:outline-none focus:border-black transition font-mono placeholder:text-gray-400 break-all rounded-2xl shadow-sm"
                    value={input.link}
                    onChange={(e: any) => setInput({...input, link: e.target.value})}
                  />
                  <button 
                    onClick={handlePasteClipboard}
                    title="Paste from clipboard"
                    className="absolute right-3.5 text-gray-400 hover:text-black transition p-1"
                  >
                    <Clipboard size={15} />
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <button 
                    onClick={handleAutoParse} 
                    disabled={parsing || autoProcessing || !input.link} 
                    className="bg-white hover:bg-gray-50 text-black px-6 py-3.5 text-xs font-mono uppercase tracking-wider transition disabled:opacity-40 border border-gray-200 font-bold rounded-2xl shadow-sm whitespace-nowrap"
                  >
                    {parsing ? 'Parsing...' : 'Parse'}
                  </button>
                  
                  <button
                    onClick={handleOneClickPipeline}
                    disabled={parsing || loading || saving || autoProcessing || !input.link}
                    className="bg-black hover:bg-gray-800 text-white px-6 py-3.5 text-xs font-mono uppercase tracking-widest transition disabled:opacity-40 shadow-sm font-bold rounded-2xl whitespace-nowrap"
                  >
                    {autoProcessing ? 'Executing...' : '⚡ Full Pipeline'}
                  </button>

                  {/* Vault Selector Button */}
                  <button
                    onClick={() => setActiveTab(activeTab === 'parser' ? 'vault' : 'parser')}
                    className={`px-6 py-3.5 text-xs font-mono uppercase tracking-widest transition font-bold rounded-2xl border shadow-sm whitespace-nowrap ${
                      activeTab === 'vault'
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-black hover:text-black'
                    }`}
                  >
                    Vault ({lots.length})
                  </button>
                </div>

              </div>
            </div>

            {activeTab === 'parser' && (
              <main className="grid lg:grid-cols-12 gap-8 items-start">
                
                {/* LEFT COLUMN: IMAGE & METADATA (ARTIST / TITLE) */}
                <div className="lg:col-span-5 space-y-6">
                  
                  <div className="bg-white/80 backdrop-blur-xl border border-gray-200/80 p-6 space-y-6 rounded-3xl shadow-sm">
                    
                    {/* Visual Artwork Container */}
                    <div className="aspect-[4/3] w-full bg-white border border-gray-200 flex items-center justify-center relative overflow-hidden rounded-2xl shadow-inner">
                      {input.image_url && !imgError ? (
                        <img 
                          src={input.image_url} 
                          className="object-contain max-h-full max-w-full p-4" 
                          alt="Artwork Preview" 
                          onError={() => setImgError(true)}
                        />
                      ) : (
                        <div className="text-center font-mono text-xs text-gray-400">
                          {input.artist ? getInitials(input.artist) : 'NO VISUAL ATTACHED'}
                        </div>
                      )}
                    </div>

                    {/* Artist & Title Input Fields */}
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-mono text-gray-500 block mb-1.5 uppercase tracking-wider font-bold">Artist</label>
                        <input 
                          placeholder="Artist Name" 
                          className="w-full bg-white border border-gray-200 p-3.5 text-xs text-black focus:outline-none focus:border-black font-mono rounded-2xl shadow-sm" 
                          value={input.artist} 
                          onChange={(e: any) => setInput({...input, artist: e.target.value})} 
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-gray-500 block mb-1.5 uppercase tracking-wider font-bold">Title</label>
                        <input 
                          placeholder="Artwork Title" 
                          className="w-full bg-white border border-gray-200 p-3.5 text-xs text-black focus:outline-none focus:border-black font-mono rounded-2xl shadow-sm" 
                          value={input.title} 
                          onChange={(e: any) => setInput({...input, title: e.target.value})} 
                        />
                      </div>
                    </div>

                    <button 
                      onClick={() => generate()} 
                      disabled={loading || autoProcessing} 
                      className="w-full bg-white hover:bg-gray-50 text-black border border-gray-200 py-4 text-xs font-mono uppercase tracking-widest transition disabled:opacity-40 font-bold rounded-2xl shadow-sm"
                    >
                      {loading ? 'Synthesizing...' : 'Synthesize Curatorial Dossier'}
                    </button>
                  </div>

                </div>

                {/* RIGHT COLUMN: TERMINAL LOGS & MEMORANDUM */}
                <div className="lg:col-span-7 space-y-5">
                  {loading ? (
                    <div className="bg-white/80 backdrop-blur-xl border border-gray-200/80 p-10 space-y-6 animate-pulse rounded-3xl shadow-sm">
                      <div className="h-4 bg-gray-200 w-1/4 rounded"></div>
                      <div className="h-8 bg-gray-200 w-3/4 rounded"></div>
                      <div className="h-4 bg-gray-200 w-1/2 rounded"></div>
                      <div className="space-y-3 pt-4">
                        <div className="h-3 bg-gray-200 w-full rounded"></div>
                        <div className="h-3 bg-gray-200 w-5/6 rounded"></div>
                        <div className="h-3 bg-gray-200 w-4/6 rounded"></div>
                      </div>
                    </div>
                  ) : output ? (
                    <div className="space-y-5">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white/80 backdrop-blur-xl border border-gray-200/80 p-4 sm:p-5 gap-3 rounded-3xl shadow-sm">
                        <span className="text-xs font-mono text-gray-500 uppercase tracking-widest font-bold">
                          Investment Memorandum & Logs
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
                            className="text-xs font-mono text-gray-700 hover:text-black transition border border-gray-200 px-4 py-2 bg-white rounded-2xl shadow-sm"
                          >
                            {showRawJson ? 'View Card' : 'Raw JSON'}
                          </button>

                          <button 
                            onClick={() => saveToVault()} 
                            disabled={saving || autoProcessing || isSaved}
                            className={`px-5 py-2 text-xs font-mono uppercase tracking-wider transition font-bold rounded-2xl shadow-sm ${
                              isSaved 
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default' 
                                : 'bg-black hover:bg-gray-800 text-white disabled:opacity-50'
                            }`}
                          >
                            {saving ? 'Saving...' : isSaved ? 'Saved ✓' : 'Save'}
                          </button>
                        </div>
                      </div>

                      {showRawJson ? (
                        <div className="border border-gray-200/80 p-6 bg-white/80 backdrop-blur-xl overflow-x-auto rounded-3xl shadow-sm">
                          <pre className="text-black font-mono text-xs whitespace-pre-wrap max-h-[600px] overflow-y-auto">
                            {JSON.stringify(output, null, 2)}
                          </pre>
                        </div>
                      ) : (
                        <div className="bg-white/80 backdrop-blur-xl border border-gray-200/80 p-8 md:p-12 space-y-8 max-h-[750px] overflow-y-auto rounded-3xl shadow-sm">
                          <div className="border-b border-gray-200 pb-6 space-y-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                              <div>
                                <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">
                                  {output.auction_house || "AUCTION"} • LOT {output.lot_number || '—'}
                                </span>
                                <h2 className="text-3xl md:text-4xl font-serif text-[#111] mt-1 font-normal">
                                  {output.artist || input.artist || "Unknown Artist"}
                                </h2>
                                {output.artist_dates && <p className="text-gray-500 italic text-sm mt-0.5">{output.artist_dates}</p>}
                              </div>
                              {output.estimate_raw && (
                                <div className="text-left sm:text-right bg-white p-4 border border-gray-200 w-full sm:w-auto rounded-2xl shadow-sm">
                                  <span className="text-[10px] font-mono text-gray-400 uppercase block">Estimate Valuation</span>
                                  <span className="text-sm font-mono text-black font-bold">{output.estimate_raw}</span>
                                </div>
                              )}
                            </div>

                            <div className="pt-2">
                              <h3 className="text-xl md:text-2xl font-serif italic text-[#111]">
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

                          {Array.isArray(output.provenance) && output.provenance.length > 0 && (
                            <div className="space-y-3 pt-2">
                              <h4 className="text-xs font-mono text-gray-400 uppercase tracking-widest border-b border-gray-200 pb-2 font-bold">
                                Reported Provenance
                              </h4>
                              <ul className="space-y-2 text-xs text-gray-600 font-mono">
                                {output.provenance.map((item: unknown, idx: number) => (
                                  <li key={idx} className="flex gap-2">
                                    <span className="text-gray-400 shrink-0">•</span>
                                    <span>{String(item)}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-full min-h-[500px] flex flex-col justify-center items-center text-center border border-gray-200/80 bg-white/80 backdrop-blur-xl p-10 rounded-3xl shadow-sm">
                      <div className="space-y-3">
                        <div className="text-3xl font-serif text-gray-300">†</div>
                        <h3 className="text-[#111] font-serif text-xl">Terminal Execution Log</h3>
                        <p className="text-gray-400 text-xs font-mono max-w-sm mx-auto leading-relaxed">
                          Enter an auction lot URL in the bar above to run automated extraction, vision verification, and curatorial memorandum generation.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </main>
            )}

            {activeTab === 'vault' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center border border-gray-200/80 bg-white/80 backdrop-blur-xl p-6 rounded-3xl shadow-sm">
                  <span className="text-xs font-mono text-gray-500 uppercase tracking-widest font-bold">Secure Vault Archive</span>
                  <button onClick={fetchLots} className="text-xs font-mono text-black hover:underline bg-white px-5 py-2.5 border border-gray-200 rounded-2xl shadow-sm font-bold">
                    Refresh ↻
                  </button>
                </div>

                {loadingLots ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="bg-white/80 backdrop-blur-xl border border-gray-200 p-6 space-y-4 animate-pulse rounded-3xl shadow-sm">
                        <div className="aspect-[4/3] bg-gray-200 w-full rounded-2xl"></div>
                        <div className="h-4 bg-gray-200 w-2/3 rounded"></div>
                        <div className="h-3 bg-gray-200 w-1/3 rounded"></div>
                      </div>
                    ))}
                  </div>
                ) : lotsError ? (
                  <div className="py-16 text-center font-mono text-xs text-red-600 bg-white/80 backdrop-blur-xl border border-red-200 p-8 rounded-3xl shadow-sm">{lotsError}</div>
                ) : lots.length === 0 ? (
                  <div className="py-16 text-center font-mono text-xs text-gray-400 bg-white/80 backdrop-blur-xl border border-red-200 p-8 rounded-3xl shadow-sm">Vault archive is currently empty.</div>
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
                          className="group bg-white/80 backdrop-blur-xl border border-gray-200/80 overflow-hidden hover:border-black transition flex flex-col rounded-3xl shadow-sm hover:shadow-xl duration-300"
                        >
                          <div className="aspect-[4/3] bg-white relative overflow-hidden flex items-center justify-center p-4 border-b border-gray-100">
                            {lot.image_path ? (
                              <img
                                src={publicImg}
                                alt={lot.title}
                                className="object-contain max-h-full max-w-full group-hover:scale-105 transition duration-700 rounded-2xl"
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
                              <h2 className="text-xl font-serif text-[#111] group-hover:underline">{lot.artist}</h2>
                              <p className="text-xs text-gray-600 italic mt-1">{lot.title} {lot.year && `(${lot.year})`}</p>
                            </div>

                            <div className="text-[10px] font-mono text-gray-400 border-t border-gray-100 pt-3 flex justify-between items-center">
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
