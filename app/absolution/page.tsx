'use client';

import React, { useState, useEffect, useRef } from 'react';
import Suspense from 'react';
import { templeTrack } from '@/components/templeTrack';
import html2canvas from 'html2canvas';
import TempleWrapper from '@/components/TempleWrapper';
import Header from '@/components/Header';
import { Sparkles, Stamp, RotateCcw, Download, ShieldCheck } from 'lucide-react';

// --- CONFIG ---
const STAMP_DELAY = 1200;

// --- DYNAMIC LIGHTING (В стиле проекта) ---
function getTimeLighting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) {
    return {
      bg: 'bg-[#F5F2EB]',
      text: 'text-stone-900',
      subText: 'text-stone-600',
      glow: 'from-amber-200/30 via-orange-100/10 to-transparent',
      vignette: 'radial-gradient(circle at 50% 30%, rgba(255, 243, 224, 0.6) 0%, rgba(245, 242, 235, 1) 80%)',
      cardBg: 'bg-white/95 border-stone-200 text-stone-900 shadow-2xl backdrop-blur-2xl',
      inputBg: 'bg-white/90 border-stone-300 text-stone-900 placeholder-stone-400 focus:border-stone-900'
    };
  } else if (hour >= 11 && hour < 17) {
    return {
      bg: 'bg-[#FAF8F5]',
      text: 'text-stone-900',
      subText: 'text-stone-600',
      glow: 'from-stone-200/40 via-transparent to-transparent',
      vignette: 'radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.8) 0%, rgba(250, 248, 245, 1) 85%)',
      cardBg: 'bg-white/95 border-stone-200 text-stone-900 shadow-2xl backdrop-blur-2xl',
      inputBg: 'bg-white/90 border-stone-300 text-stone-900 placeholder-stone-400 focus:border-stone-900'
    };
  } else if (hour >= 17 && hour < 21) {
    return {
      bg: 'bg-[#1f1a18]',
      text: 'text-stone-100',
      subText: 'text-stone-300',
      glow: 'from-orange-900/30 via-rose-950/20 to-transparent',
      vignette: 'radial-gradient(circle at 50% 40%, rgba(70, 35, 25, 0.4) 0%, rgba(31, 26, 24, 1) 90%)',
      cardBg: 'bg-stone-900/95 border-stone-800 text-stone-100 shadow-2xl backdrop-blur-2xl',
      inputBg: 'bg-stone-950/60 border-stone-800 text-stone-100 placeholder-stone-500 focus:border-stone-400'
    };
  } else {
    return {
      bg: 'bg-[#0b0c10]',
      text: 'text-stone-200',
      subText: 'text-stone-400',
      glow: 'from-indigo-950/50 via-blue-950/20 to-transparent',
      vignette: 'radial-gradient(circle at 50% 30%, rgba(20, 25, 45, 0.5) 0%, rgba(11, 12, 16, 1) 90%)',
      cardBg: 'bg-zinc-900/95 border-zinc-800 text-zinc-100 shadow-2xl backdrop-blur-2xl',
      inputBg: 'bg-zinc-950/60 border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-zinc-400'
    };
  }
}

// --- TRANSLATIONS ---
const TRANSLATIONS = {
  en: {
    title: "CONFESS YOUR SINS",
    subtitle: "Submit your digital burden to the Sanctuary chaplain.",
    placeholder: "Identity / Name",
    sins: {
      doomscroll: "Doomscrolling past 3 AM",
      envy: "Envy: Stalking others' success",
      crypto: "Greed: Checking portfolio x100/day",
      ai: "Sloth: Using AI to write love letters",
      vanity: "Vanity: Googling my own name",
      wrath: "Wrath: Internet arguments",
      lust: "Lust: Digital voyeurism"
    },
    receipt: { header: "DEPT. OF KARMA", footer: "Silence is the only currency.", signature: "Pierrot, AI Chaplain" },
    btn: "SEEK ABSOLUTION",
    save: "SAVE RECEIPT",
    share: "SHARE",
    newConfession: "NEW CONFESSION"
  },
  ru: {
    title: "ИСПОВЕДАЙ ГРЕХИ",
    subtitle: "Передайте цифровое бремя капеллану Санктуария.",
    placeholder: "Имя / Личность",
    sins: {
      doomscroll: "Думскроллинг после 3:00",
      envy: "Зависть к чужой 'успешной' жизни",
      crypto: "Алчность: Проверка крипты 100 раз в день",
      ai: "Лень: Использование AI для личного",
      vanity: "Тщеславие: Гуглинг своего имени",
      wrath: "Гнев: Споры в комментариях",
      lust: "Похоть: Цифровой вуайеризм"
    },
    receipt: { header: "ДЕПАРТАМЕНТ КАРМЫ", footer: "Тишина — единственная валюта.", signature: "Пьеро, AI Капеллан" },
    btn: "ПОЛУЧИТЬ ОТПУЩЕНИЕ",
    save: "СОХРАНИТЬ ЧЕК",
    share: "ПОДЕЛИТЬСЯ",
    newConfession: "НОВАЯ ИСПОВЕДЬ"
  }
};

export default function AbsolutionPage() {
  const [lang, setLang] = useState<'en' | 'ru'>('en');
  const [step, setStep] = useState<'confess' | 'processing' | 'receipt'>('confess');
  const [name, setName] = useState('');
  const [sinKey, setSinKey] = useState<string>('doomscroll');
  const [ticketId, setTicketId] = useState('');
  const [lighting, setLighting] = useState(getTimeLighting());
  
  // UI States
  const [isTelegram, setIsTelegram] = useState(false);
  const [showStamp, setShowStamp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const receiptRef = useRef<HTMLDivElement | null>(null);

  const t = TRANSLATIONS[lang];
  const sinText = t.sins[sinKey as keyof typeof t.sins];

  useEffect(() => {
    setTicketId(`#${Math.random().toString(36).substring(2, 9).toUpperCase()}`);
    setLighting(getTimeLighting());

    const timer = setInterval(() => {
      setLighting(getTimeLighting());
    }, 60000);
    
    if ((window as any).Telegram?.WebApp) {
        setIsTelegram(true);
        (window as any).Telegram.WebApp.expand();
    }

    return () => clearInterval(timer);
  }, []);

  const triggerHaptic = (style: 'light' | 'medium' | 'heavy' | 'error') => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred(style);
    }
  };

  const handleConfess = async () => {
    if (!name.trim()) {
        triggerHaptic('error');
        return;
    }

    triggerHaptic('heavy');
    setStep('processing');
    
    templeTrack('confess', `Sin: ${sinKey}`);

    try {
      await fetch('/api/temple_logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'ABSOLUTION',
          message: `${name} confessed: "${sinText}" and received absolution.`,
          author: name
        })
      });
    } catch (e) {
      console.error('Failed to log absolution to temple:', e);
    }

    setTimeout(() => {
        setStep('receipt');
        triggerHaptic('medium');
        
        setTimeout(() => {
            setShowStamp(true);
            triggerHaptic('heavy');
        }, STAMP_DELAY);
    }, 2000);
  };

  const handleSave = async () => {
    const element = receiptRef.current;
    if (!element) return;
    
    triggerHaptic('light');
    setIsSaving(true);

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const image = canvas.toDataURL('image/png');

      const tg = (window as any).Telegram?.WebApp;
      if (tg && tg.showPopup) {
         tg.showPopup({
            title: 'Saved',
            message: 'Long press the image to save it to your gallery.',
            buttons: [{type: 'ok'}]
         });
      } else {
        const link = document.createElement('a');
        link.download = `Merkurov_Absolution_${ticketId}.png`;
        link.href = image;
        link.click();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const langToggleStyle = lighting.bg.includes('1f1a18') || lighting.bg.includes('0b0c10')
    ? 'bg-white/10 border-white/20 text-stone-200'
    : 'bg-white/85 border-stone-300 text-stone-800 shadow-sm';

  const primaryBtnStyle = lighting.bg.includes('1f1a18') || lighting.bg.includes('0b0c10')
    ? 'bg-white text-stone-900 hover:bg-stone-200 shadow-lg'
    : 'bg-stone-900 text-white hover:bg-stone-800 shadow-lg';

  return (
    <div 
      className={`min-h-screen ${lighting.bg} ${lighting.text} font-sans flex flex-col justify-between selection:bg-stone-900 selection:text-white relative overflow-x-hidden transition-colors duration-1000`}
      style={{ backgroundImage: lighting.vignette }}
    >
      <Header />
      <Suspense fallback={null}><TempleWrapper /></Suspense>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-32 pb-24 relative z-20">
        
        {/* LANGUAGE TOGGLE */}
        <div className={`absolute top-28 right-6 lg:right-12 flex gap-3 font-mono text-xs tracking-widest backdrop-blur-md px-4 py-2 rounded-full border z-30 transition-all ${langToggleStyle}`}>
           <button onClick={() => setLang('en')} className={`${lang === 'en' ? 'font-bold underline' : 'opacity-60'}`}>EN</button>
           <span className="opacity-40">/</span>
           <button onClick={() => setLang('ru')} className={`${lang === 'ru' ? 'font-bold underline' : 'opacity-60'}`}>RU</button>
        </div>

        {/* STAGE 1: CONFESSIONAL */}
        {step === 'confess' && (
          <div className={`w-full max-w-md p-8 sm:p-10 rounded-3xl ${lighting.cardBg} border animate-in fade-in zoom-in duration-500 space-y-8`}>
              <div className="text-center space-y-2">
                  <div className="w-10 h-10 mx-auto rounded-full bg-stone-500/10 flex items-center justify-center shadow-sm">
                      <Sparkles size={18} className="opacity-80" />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-serif font-light tracking-tight uppercase">
                      {t.title}
                  </h1>
                  <p className="text-xs font-serif italic opacity-75">
                      {t.subtitle}
                  </p>
              </div>

              <div className="space-y-6">
                  {/* SIN SELECTOR */}
                  <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase tracking-widest opacity-60 block">Your Burden</label>
                      <select 
                          value={sinKey}
                          onChange={(e: any) => setSinKey(e.target.value)}
                          className={`w-full border p-4 text-xs font-mono uppercase rounded-2xl focus:outline-none transition-all shadow-sm cursor-pointer ${lighting.inputBg}`}
                      >
                          {Object.entries(t.sins).map(([k, v]) => (
                              <option key={k} value={k} className="bg-stone-900 text-stone-100">{v}</option>
                          ))}
                      </select>
                  </div>

                  {/* NAME INPUT */}
                  <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase tracking-widest opacity-60 block">Sinner Identity</label>
                      <input 
                          type="text" 
                          value={name}
                          onChange={(e: any) => setName(e.target.value)}
                          placeholder={t.placeholder}
                          className={`w-full border py-3.5 px-4 text-sm font-mono focus:outline-none transition-colors uppercase rounded-2xl shadow-sm ${lighting.inputBg}`}
                      />
                  </div>

                  <button 
                      onClick={handleConfess}
                      className={`w-full py-4 rounded-full font-mono text-xs uppercase tracking-[0.2em] transition-all cursor-pointer ${primaryBtnStyle}`}
                  >
                      {t.btn}
                  </button>
              </div>
          </div>
        )}

        {/* STAGE 2: PROCESSING */}
        {step === 'processing' && (
          <div className={`text-center p-12 rounded-3xl ${lighting.cardBg} border shadow-xl space-y-4`}>
              <div className="animate-spin text-3xl">⏳</div>
              <div className="font-mono text-xs uppercase tracking-[0.3em] opacity-75 animate-pulse">
                  NEGOTIATING WITH ETERNITY...
              </div>
          </div>
        )}

        {/* STAGE 3: THE RECEIPT */}
        {step === 'receipt' && (
          <div className="flex flex-col items-center gap-8 animate-in slide-in-from-bottom-6 duration-700">
              
              {/* PAPER RECEIPT */}
              <div 
                  ref={receiptRef}
                  className="bg-white text-stone-900 p-8 w-[340px] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-stone-200 relative rotate-1 font-mono"
                  style={{ filter: 'contrast(1.05)' }}
              >
                  <div className="text-center border-b border-stone-900 border-dashed pb-4 mb-4">
                      <h2 className="text-lg font-black tracking-widest text-stone-900">{t.receipt.header}</h2>
                      <p className="text-[9px] uppercase mt-1 text-stone-500">{new Date().toLocaleString()}</p>
                      <p className="text-[9px] uppercase text-stone-500">ID: {ticketId}</p>
                  </div>

                  <div className="space-y-4 mb-8 text-xs">
                      <div className="flex justify-between border-b border-stone-100 pb-2">
                          <span className="text-stone-400">SINNER:</span>
                          <span className="font-bold uppercase text-stone-900">{name}</span>
                      </div>
                      <div className="flex flex-col border-b border-stone-100 pb-2">
                          <span className="text-stone-400 mb-1">CONFESSION:</span>
                          <span className="font-bold uppercase leading-tight text-stone-900">{sinText}</span>
                      </div>
                      <div className="flex justify-between items-center">
                          <span className="text-stone-400">KARMA DEBIT:</span>
                          <span className="font-bold text-sm text-stone-900">0.00</span>
                      </div>
                  </div>

                  <div className="text-center border-t border-stone-900 border-dashed pt-4">
                      <p className="text-[9px] italic text-stone-600 mb-3">"{t.receipt.footer}"</p>
                      <p className="font-serif italic text-sm text-stone-700">{t.receipt.signature}</p>
                  </div>

                  {/* STAMP */}
                  <div 
                      className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-[3px] border-rose-600/90 text-rose-600/90 py-3 px-6 text-2xl font-black uppercase tracking-[0.25em] rotate-[-12deg] transition-all duration-500 pointer-events-none select-none bg-white/95 shadow-sm ${
                          showStamp ? 'opacity-100 scale-100' : 'opacity-0 scale-150'
                      }`}
                      style={{
                          boxShadow: '0 0 0 4px rgba(225, 29, 72, 0.1)',
                      }}
                  >
                      ABSOLVED
                  </div>
              </div>

              {/* ACTIONS */}
              <div className="flex gap-4 opacity-0 animate-in fade-in delay-700 fill-mode-forwards">
                  <button 
                      onClick={handleSave}
                      disabled={isSaving}
                      className={`px-6 py-3.5 rounded-full font-mono text-xs font-bold tracking-widest uppercase transition-all flex items-center gap-2 shadow-md cursor-pointer ${primaryBtnStyle}`}
                  >
                      <Download size={14} />
                      <span>{isSaving ? 'SAVING...' : t.save}</span>
                  </button>
                  <button 
                      onClick={() => { setStep('confess'); setShowStamp(false); }}
                      className={`px-6 py-3.5 rounded-full font-mono text-xs font-bold tracking-widest uppercase transition-all flex items-center gap-2 shadow-sm cursor-pointer ${
                        lighting.bg.includes('1f1a18') || lighting.bg.includes('0b0c10')
                          ? 'bg-stone-800 text-stone-200 border border-stone-700 hover:bg-stone-700'
                          : 'bg-white text-stone-800 border border-stone-300 hover:bg-stone-50'
                      }`}
                  >
                      <RotateCcw size={14} />
                      <span>{t.newConfession}</span>
                  </button>
              </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className={`max-w-4xl mx-auto w-full text-center font-mono text-[10px] opacity-50 uppercase tracking-[0.3em] py-8 z-20`}>
        Merkurov Private Office &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
