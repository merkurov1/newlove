'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { templeTrack } from '@/components/templeTrack';
import html2canvas from 'html2canvas';
import { Sparkles, RotateCcw, Download } from 'lucide-react';

import * as TempleWrapperMod from '@/components/TempleWrapper';
const TempleWrapper = (TempleWrapperMod as any).default || (TempleWrapperMod as any).TempleWrapper || TempleWrapperMod;

import * as SoundToggleMod from '@/components/SoundToggle';
const SoundToggle = (SoundToggleMod as any).default || (SoundToggleMod as any).SoundToggle || (() => null);

const STAMP_DELAY = 1200;

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
    newConfession: "НОВАЯ ИСПОВЕДЬ"
  }
};

export default function AbsolutionPage() {
  const [lang, setLang] = useState<'en' | 'ru'>('en');
  const [step, setStep] = useState<'confess' | 'processing' | 'receipt'>('confess');
  const [name, setName] = useState('');
  const [sinKey, setSinKey] = useState<string>('doomscroll');
  const [ticketId, setTicketId] = useState('');
  
  const [showStamp, setShowStamp] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const receiptRef = useRef<HTMLDivElement | null>(null);

  const t = TRANSLATIONS[lang];
  const sinText = t.sins[sinKey as keyof typeof t.sins];

  useEffect(() => {
    setTicketId(`#${Math.random().toString(36).substring(2, 9).toUpperCase()}`);
    if ((window as any).Telegram?.WebApp) {
        (window as any).Telegram.WebApp.expand();
    }
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

  return (
    <div className="min-h-screen bg-black text-[#e5b863] font-mono flex flex-col justify-between relative overflow-x-hidden selection:bg-[#e5b863] selection:text-black">
      <div className="noise-overlay" />
      <React.Suspense fallback={null}>
        {typeof TempleWrapper === 'function' ? <TempleWrapper /> : null}
      </React.Suspense>

      {/* TOP BAR */}
      <div className="w-full max-w-md mx-auto px-6 pt-6 flex justify-between items-center z-30">
        <Link 
          href="/temple"
          className="text-xs tracking-widest text-[#886e36] hover:text-[#e5b863] transition-colors uppercase border border-[#443311] px-4 py-2 rounded-full bg-black/60 backdrop-blur-md cursor-pointer"
        >
          ← Temple
        </Link>
        <div className="flex items-center gap-3">
          {typeof SoundToggle === 'function' && <SoundToggle />}
          <div className="flex gap-2 text-xs tracking-widest bg-black/60 border border-[#443311] px-3 py-2 rounded-full backdrop-blur-md">
             <button onClick={() => setLang('en')} className={`${lang === 'en' ? 'font-bold text-[#e5b863] underline' : 'text-[#886e36] opacity-60'} cursor-pointer`}>EN</button>
             <span className="text-[#443311]">/</span>
             <button onClick={() => setLang('ru')} className={`${lang === 'ru' ? 'font-bold text-[#e5b863] underline' : 'text-[#886e36] opacity-60'} cursor-pointer`}>RU</button>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-20 w-full max-w-md mx-auto">
        
        {/* STAGE 1: CONFESSIONAL */}
        {step === 'confess' && (
          <div className="w-full p-8 rounded-2xl bg-black/85 border border-[#443311] shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in duration-500 space-y-6">
              <div className="text-center space-y-2">
                  <div className="w-10 h-10 mx-auto rounded-full bg-[#110c05] border border-[#443311] flex items-center justify-center text-[#e5b863]">
                      <Sparkles size={18} />
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-[0.2em] text-white uppercase">
                      {t.title}
                  </h1>
                  <p className="text-[10px] text-[#886e36] uppercase tracking-wider">
                      {t.subtitle}
                  </p>
              </div>

              <div className="space-y-5">
                  <div className="space-y-1.5">
                      <label className="text-[9px] uppercase tracking-[0.2em] text-[#886e36] block">Your Burden</label>
                      <select 
                          value={sinKey}
                          onChange={(e: any) => setSinKey(e.target.value)}
                          className="w-full bg-[#110c05] border border-[#443311] text-[#e5b863] p-3 text-xs uppercase tracking-wider rounded-xl focus:border-[#e5b863] focus:outline-none cursor-pointer"
                      >
                          {Object.entries(t.sins).map(([k, v]) => (
                              <option key={k} value={k} className="bg-black text-[#e5b863]">{v}</option>
                          ))}
                      </select>
                  </div>

                  <div className="space-y-1.5">
                      <label className="text-[9px] uppercase tracking-[0.2em] text-[#886e36] block">Sinner Identity</label>
                      <input 
                          type="text" 
                          value={name}
                          onChange={(e: any) => setName(e.target.value)}
                          placeholder={t.placeholder}
                          className="w-full bg-[#110c05] border border-[#443311] text-[#e5b863] py-3 px-4 text-xs uppercase tracking-wider rounded-xl focus:border-[#e5b863] focus:outline-none placeholder-[#443311]"
                      />
                  </div>

                  <button 
                      onClick={handleConfess}
                      className="w-full bg-gradient-to-r from-[#e5b863] to-[#ffeec7] text-black py-3.5 rounded-xl font-bold text-xs uppercase tracking-[0.2em] hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer shadow-[0_0_20px_rgba(229,184,99,0.2)]"
                  >
                      {t.btn}
                  </button>
              </div>
          </div>
        )}

        {/* STAGE 2: PROCESSING */}
        {step === 'processing' && (
          <div className="text-center p-10 rounded-2xl bg-black/85 border border-[#443311] shadow-2xl space-y-4">
              <div className="animate-spin text-3xl text-[#e5b863]">⏳</div>
              <div className="text-[10px] text-[#886e36] uppercase tracking-[0.3em] animate-pulse">
                  NEGOTIATING WITH ETERNITY...
              </div>
          </div>
        )}

        {/* STAGE 3: THE RECEIPT */}
        {step === 'receipt' && (
          <div className="flex flex-col items-center gap-6 animate-in slide-in-from-bottom-6 duration-700 w-full">
              
              <div 
                  ref={receiptRef}
                  className="bg-white text-stone-900 p-8 w-[320px] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.4)] border border-stone-200 relative rotate-1 font-mono"
              >
                  <div className="text-center border-b border-stone-900 border-dashed pb-4 mb-4">
                      <h2 className="text-base font-black tracking-widest text-stone-900">{t.receipt.header}</h2>
                      <p className="text-[9px] uppercase mt-1 text-stone-500">{new Date().toLocaleString()}</p>
                      <p className="text-[9px] uppercase text-stone-500">ID: {ticketId}</p>
                  </div>

                  <div className="space-y-3 mb-6 text-xs">
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
                      <p className="text-[9px] italic text-stone-600 mb-2">"{t.receipt.footer}"</p>
                      <p className="font-serif italic text-xs text-stone-700">{t.receipt.signature}</p>
                  </div>

                  {/* STAMP */}
                  <div 
                      className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border-[3px] border-rose-600 text-rose-600 py-2.5 px-5 text-xl font-black uppercase tracking-[0.2em] rotate-[-12deg] transition-all duration-500 pointer-events-none select-none bg-white/95 shadow-sm ${
                          showStamp ? 'opacity-100 scale-100' : 'opacity-0 scale-150'
                      }`}
                  >
                      ABSOLVED
                  </div>
              </div>

              {/* ACTIONS */}
              <div className="flex gap-3 w-full">
                  <button 
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex-1 bg-gradient-to-r from-[#e5b863] to-[#ffeec7] text-black py-3 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-md cursor-pointer hover:scale-[1.02] transition-all"
                  >
                      <Download size={14} />
                      <span>{isSaving ? 'SAVING...' : t.save}</span>
                  </button>
                  <button 
                      onClick={() => { setStep('confess'); setShowStamp(false); }}
                      className="px-5 py-3 rounded-xl border border-[#443311] bg-black text-[#e5b863] hover:border-[#e5b863] text-xs uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                      <RotateCcw size={14} />
                  </button>
              </div>
          </div>
        )}
      </main>

      <footer className="w-full text-center font-mono text-[9px] text-[#443311] uppercase tracking-[0.3em] py-6 z-20">
        Merkurov Private Office &copy; {new Date().getFullYear()}
      </footer>

      <style jsx global>{`
        .noise-overlay {
          position: fixed; inset: 0; pointer-events: none; opacity: 0.04;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          z-index: 1;
        }
      `}</style>
    </div>
  );
}
