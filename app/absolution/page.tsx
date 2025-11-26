'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { templeTrack } from '@/components/templeTrack';
import html2canvas from 'html2canvas';
import TempleWrapper from '@/components/TempleWrapper';

// --- CONFIG ---
const STAMP_DELAY = 1500;

// --- TRANSLATIONS (Keep them, they are good assets) ---
const TRANSLATIONS = {
  en: {
    title: "CONFESS YOUR SINS",
    placeholder: "Identity (Name)",
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
    share: "SHARE"
  },
  ru: {
    title: "ИСПОВЕДАЙ ГРЕХИ",
    placeholder: "Имя (Личность)",
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
    share: "ПОДЕЛИТЬСЯ"
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
    // Generate ID once
    setTicketId(`#${Math.random().toString(36).substr(2, 9).toUpperCase()}`);
    
    // Check Telegram Environment
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
    
    // Analytics
    templeTrack('confess', `Sin: ${sinKey}`);

    // Simulation of bureaucratic delay
    setTimeout(() => {
        setStep('receipt');
        triggerHaptic('medium');
        
        // Stamp animation delay
        setTimeout(() => {
            setShowStamp(true);
            triggerHaptic('heavy');
        }, STAMP_DELAY);
    }, 2500);
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

      // TELEGRAM STRATEGY:
      // iOS WebApp doesn't support 'download' attribute well.
      // We show the image in a modal and ask user to long-press.
      const tg = (window as any).Telegram?.WebApp;
      if (tg && tg.showPopup) {
         tg.showPopup({
            title: 'Saved',
            message: 'Long press the image to save it to your gallery.',
            buttons: [{type: 'ok'}]
         });
      } else {
        // Desktop / Standard Web
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
    <div className="min-h-screen bg-zinc-100 text-black font-mono flex flex-col items-center justify-center p-4 relative overflow-hidden transition-colors duration-700">
      <Suspense fallback={null}><TempleWrapper /></Suspense>

      {/* LANGUAGE TOGGLE */}
      <div className="absolute top-6 right-6 z-20 flex gap-2 text-[10px] tracking-widest font-bold">
         <button onClick={() => setLang('en')} className={`${lang === 'en' ? 'text-black underline' : 'text-zinc-400'}`}>EN</button>
         <button onClick={() => setLang('ru')} className={`${lang === 'ru' ? 'text-black underline' : 'text-zinc-400'}`}>RU</button>
      </div>

      {/* STAGE 1: CONFESSIONAL */}
      {step === 'confess' && (
        <div className="w-full max-w-md animate-in fade-in zoom-in duration-500">
            <h1 className="text-3xl md:text-4xl font-black mb-8 text-center tracking-tighter uppercase leading-none">
                {t.title}
            </h1>

            <div className="space-y-6">
                {/* SIN SELECTOR */}
                <div className="relative">
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1 block">Your Burden</label>
                    <select 
                        value={sinKey}
                        onChange={(e) => setSinKey(e.target.value)}
                        className="w-full bg-white border-2 border-black p-4 text-sm font-bold uppercase appearance-none rounded-none focus:outline-none focus:ring-4 focus:ring-zinc-200 transition-all"
                        style={{ backgroundImage: 'none' }}
                    >
                        {Object.entries(t.sins).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                    <div className="absolute right-4 bottom-4 pointer-events-none">▼</div>
                </div>

                {/* NAME INPUT */}
                <div>
                    <label className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1 block">Sinner Identity</label>
                    <input 
                        type="text" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t.placeholder}
                        className="w-full bg-transparent border-b-2 border-black py-2 text-xl font-bold placeholder-zinc-300 focus:outline-none focus:border-red-600 transition-colors uppercase rounded-none"
                    />
                </div>

                <button 
                    onClick={handleConfess}
                    className="w-full bg-black text-white py-6 mt-8 font-bold tracking-[0.2em] hover:bg-zinc-800 transition-transform active:scale-95 text-xs uppercase"
                >
                    {t.btn}
                </button>
            </div>
        </div>
      )}

      {/* STAGE 2: PROCESSING (The Waiting Room) */}
      {step === 'processing' && (
        <div className="text-center">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            <div className="text-xs tracking-[0.3em] animate-pulse">NEGOTIATING WITH ETERNITY...</div>
        </div>
      )}

      {/* STAGE 3: THE RECEIPT */}
      {step === 'receipt' && (
        <div className="flex flex-col items-center gap-8 animate-in slide-in-from-bottom-10 duration-700">
            
            {/* PAPER RECEIPT */}
            <div 
                ref={receiptRef}
                className="bg-white p-8 w-[340px] shadow-2xl relative rotate-1"
                style={{ 
                    filter: 'contrast(1.2) brightness(1.05)',
                    boxShadow: '0 10px 30px -10px rgba(0,0,0,0.3)'
                }}
            >
                {/* TEXTURE OVERLAY FOR THERMAL LOOK */}
                <div className="absolute inset-0 opacity-10 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/noise-lines.png')]"></div>

                <div className="text-center border-b-2 border-black border-dashed pb-4 mb-4">
                    <h2 className="text-xl font-black tracking-widest">{t.receipt.header}</h2>
                    <p className="text-[10px] uppercase mt-1 text-zinc-600">{new Date().toLocaleString()}</p>
                    <p className="text-[10px] uppercase text-zinc-600">ID: {ticketId}</p>
                </div>

                <div className="space-y-4 mb-8 font-mono text-sm">
                    <div className="flex justify-between">
                        <span className="text-zinc-500">SINNER:</span>
                        <span className="font-bold uppercase">{name}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-zinc-500 mb-1">CONFESSION:</span>
                        <span className="font-bold uppercase leading-tight">{sinText}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                        <span className="text-zinc-500">COST:</span>
                        <span className="font-bold text-xl">0.00</span>
                    </div>
                </div>

                <div className="text-center border-t-2 border-black border-dashed pt-4">
                    <p className="text-[9px] italic mb-4">"{t.receipt.footer}"</p>
                    <p className="font-dancing-script text-lg transform -rotate-3 text-zinc-600">{t.receipt.signature}</p>
                </div>

                {/* THE STAMP */}
                <div 
                    className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 border-4 border-red-600 text-red-600 p-2 text-4xl font-black uppercase tracking-widest rotate-[-15deg] opacity-0 transition-all duration-300 pointer-events-none mix-blend-multiply ${showStamp ? 'opacity-80 scale-100' : 'scale-150'}`}
                    style={{ 
                        maskImage: 'url("https://s3-us-west-2.amazonaws.com/s.cdpn.io/8399/grunge.png")',
                        WebkitMaskImage: 'url("https://s3-us-west-2.amazonaws.com/s.cdpn.io/8399/grunge.png")',
                        maskSize: 'contain'
                    }}
                >
                    ABSOLVED
                </div>
            </div>

            {/* ACTIONS */}
            <div className="flex gap-4 opacity-0 animate-in fade-in delay-1000 fill-mode-forwards">
                <button 
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-black text-white px-6 py-3 text-xs font-bold tracking-widest uppercase hover:bg-zinc-800"
                >
                    {isSaving ? 'SAVING...' : t.save}
                </button>
                <button 
                    onClick={() => setStep('confess')}
                    className="border border-black px-6 py-3 text-xs font-bold tracking-widest uppercase hover:bg-zinc-200"
                >
                    NEW
                </button>
            </div>
        </div>
      )}
      
      <style jsx global>{`
         @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
         body { font-family: 'Space Mono', monospace; }
      `}</style>
    </div>
  );
}