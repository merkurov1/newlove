'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { templeTrack } from '@/components/templeTrack';
import html2canvas from 'html2canvas';
import TempleWrapper from '@/components/TempleWrapper';
import Header from '@/components/Header';
import { Sparkles, Stamp, RotateCcw, Download } from 'lucide-react';

// --- CONFIG ---
const STAMP_DELAY = 1200;

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
  
  // UI States
  const [isTelegram, setIsTelegram] = useState(false);
  const [showStamp, setShowStamp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  const t = TRANSLATIONS[lang];
  const sinText = t.sins[sinKey as keyof typeof t.sins];

  useEffect(() => {
    setTicketId(`#${Math.random().toString(36).substr(2, 9).toUpperCase()}`);
    
    if ((window as any).Telegram?.WebApp) {
        setIsTelegram(true);
        (window as any).Telegram.WebApp.expand();
    }
  }, []);

  const triggerHaptic = (style: 'light' | 'medium' | 'heavy' | 'error') => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.HapticFeedback) {
        tg.HapticFeedback.impactOccurred(style);
    }
  };

  const handleConfess = () => {
    if (!name.trim()) {
        triggerHaptic('error');
        return;
    }

    triggerHaptic('heavy');
    setStep('processing');
    
    templeTrack('confess', `Sin: ${sinKey}`);

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
    if (!receiptRef.current) return;
    triggerHaptic('light');
    setIsSaving(true);

    try {
      const canvas = await html2canvas(receiptRef.current, {
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

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans flex flex-col justify-between selection:bg-black selection:text-white relative overflow-x-hidden">
      
      {/* Background grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <Header />
      <Suspense fallback={null}><TempleWrapper /></Suspense>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-32 pb-24 relative z-20">
        
        {/* LANGUAGE TOGGLE */}
        <div className="absolute top-28 right-6 lg:right-12 flex gap-3 font-mono text-xs tracking-widest bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-zinc-200 shadow-sm">
           <button onClick={() => setLang('en')} className={`${lang === 'en' ? 'text-black font-bold underline' : 'text-zinc-400'}`}>EN</button>
           <span className="text-zinc-300">/</span>
           <button onClick={() => setLang('ru')} className={`${lang === 'ru' ? 'text-black font-bold underline' : 'text-zinc-400'}`}>RU</button>
        </div>

        {/* STAGE 1: CONFESSIONAL */}
        {step === 'confess' && (
          <div className="w-full max-w-md p-8 sm:p-10 rounded-3xl bg-white/80 backdrop-blur-2xl border border-zinc-200/80 shadow-[0_20px_50px_rgba(0,0,0,0.04)] animate-in fade-in zoom-in duration-500 space-y-8">
              <div className="text-center space-y-2">
                  <div className="w-10 h-10 mx-auto rounded-full bg-zinc-900 text-white flex items-center justify-center shadow-md">
                      <Sparkles size={18} />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-serif font-light tracking-tight text-zinc-900 uppercase">
                      {t.title}
                  </h1>
                  <p className="text-xs text-zinc-500 font-serif italic">
                      {t.subtitle}
                  </p>
              </div>

              <div className="space-y-6">
                  {/* SIN SELECTOR */}
                  <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block">Your Burden</label>
                      <select 
                          value={sinKey}
                          onChange={(e) => setSinKey(e.target.value)}
                          className="w-full bg-white/90 border border-zinc-300 p-4 text-xs font-mono uppercase rounded-2xl focus:outline-none focus:border-black transition-all shadow-sm"
                      >
                          {Object.entries(t.sins).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                          ))}
                      </select>
                  </div>

                  {/* NAME INPUT */}
                  <div className="space-y-2">
                      <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 block">Sinner Identity</label>
                      <input 
                          type="text" 
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder={t.placeholder}
                          className="w-full bg-white/90 border border-zinc-300 py-3.5 px-4 text-sm font-mono placeholder-zinc-400 focus:outline-none focus:border-black transition-colors uppercase rounded-2xl shadow-sm"
                      />
                  </div>

                  <button 
                      onClick={handleConfess}
                      className="w-full bg-zinc-900 text-white py-4 rounded-full font-mono text-xs uppercase tracking-[0.2em] shadow-lg shadow-zinc-900/10 hover:bg-zinc-800 active:scale-95 transition-all"
                  >
                      {t.btn}
                  </button>
              </div>
          </div>
        )}

        {/* STAGE 2: PROCESSING */}
        {step === 'processing' && (
          <div className="text-center p-12 rounded-3xl bg-white/80 backdrop-blur-2xl border border-zinc-200 shadow-xl space-y-4">
              <div className="animate-spin text-3xl">⏳</div>
              <div className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-600 animate-pulse">
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
                  className="bg-white p-8 w-[340px] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.08)] border border-zinc-200 relative rotate-1 font-mono"
                  style={{ filter: 'contrast(1.05)' }}
              >
                  <div className="text-center border-b border-black border-dashed pb-4 mb-4">
                      <h2 className="text-lg font-black tracking-widest text-zinc-900">{t.receipt.header}</h2>
                      <p className="text-[9px] uppercase mt-1 text-zinc-500">{new Date().toLocaleString()}</p>
                      <p className="text-[9px] uppercase text-zinc-500">ID: {ticketId}</p>
                  </div>

                  <div className="space-y-4 mb-8 text-xs">
                      <div className="flex justify-between border-b border-zinc-100 pb-2">
                          <span className="text-zinc-400">SINNER:</span>
                          <span className="font-bold uppercase text-zinc-900">{name}</span>
                      </div>
                      <div className="flex flex-col border-b border-zinc-100 pb-2">
                          <span className="text-zinc-400 mb-1">CONFESSION:</span>
                          <span className="font-bold uppercase leading-tight text-zinc-900">{sinText}</span>
                      </div>
                      <div className="flex justify-between items-center">
                          <span className="text-zinc-400">KARMA DEBIT:</span>
                          <span className="font-bold text-sm text-zinc-900">0.00</span>
                      </div>
                  </div>

                  <div className="text-center border-t border-black border-dashed pt-4">
                      <p className="text-[9px] italic text-zinc-600 mb-3">"{t.receipt.footer}"</p>
                      <p className="font-serif italic text-sm text-zinc-700">{t.receipt.signature}</p>
                  </div>

                  {/* STABLE THEMED ABSOLVED STAMP */}
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
                      className="bg-zinc-900 text-white px-6 py-3.5 rounded-full font-mono text-xs font-bold tracking-widest uppercase hover:bg-zinc-800 transition-all flex items-center gap-2 shadow-md"
                  >
                      <Download size={14} />
                      <span>{isSaving ? 'SAVING...' : t.save}</span>
                  </button>
                  <button 
                      onClick={() => { setStep('confess'); setShowStamp(false); }}
                      className="bg-white text-zinc-800 border border-zinc-300 px-6 py-3.5 rounded-full font-mono text-xs font-bold tracking-widest uppercase hover:bg-zinc-50 transition-all flex items-center gap-2 shadow-sm"
                  >
                      <RotateCcw size={14} />
                      <span>{t.newConfession}</span>
                  </button>
              </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center font-mono text-[10px] text-zinc-400 uppercase tracking-[0.3em] py-8 z-20">
        Merkurov Private Office &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
