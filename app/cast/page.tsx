'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import Link from 'next/link';
import { templeTrack } from '@/components/templeTrack';
import { useAuth } from '@/components/AuthContext';

const formatQuestionText = (text: string): string => {
    if (!text) return '';
    return text.replace(/\*\*(.*?)\*\*/g, '<b class="font-bold text-white">$1</b>');
}

const QUESTIONS_EN = [
  "Which object in your home do you keep because it reminds you of **failed ambition** or a **bad compromise**?",
  "At what age or event did you first realize the **person closest to you** could not protect you?",
  "Which public virtue of yours (competence, calmness) is actually your **biggest defensive mechanism**?",
  "If I deleted your digital presence right now, what % of your personality would remain?",
  "Open your last 5 photos. Do they show a life you enjoy or a life you perform?",
  "What is the **most shameful** digital behavior you continue to engage in (scrolling, voyeurism, seeking validation)?",
  "What is the **largest material asset** you acquired purely for **status confirmation**, not happiness?",
  "In complete silence: do you attempt to **structure** future steps or **deconstruct** past mistakes?",
  "Finish the sentence: 'I am a person who...'",
  "Are you ready to see your true diagnosis?"
]

const QUESTIONS_RU = [
  "Какой один предмет в вашем доме вы храните, потому что он напоминает о **нереализованном потенциале** или **неудачном компромиссе**?",
  "В каком возрасте или событии вы впервые поняли, что **самый близкий вам человек** не может вас защитить?",
  "Какое ваше публичное достоинство (компетентность, спокойствие) на самом деле **ваш самый большой защитный механизм**?",
  "Если удалить все ваши соцсети прямо сейчас, какой процент личности останется?",
  "Ваши последние 5 фото в телефоне: это жизнь, которой вы наслаждаетесь, или спектакль для других?",
  "Что в вашем цифровом поведении — **самое стыдное**, но вы продолжаете это делать (скроллинг, подглядывание, поиск валидации)?",
  "Какой **самый крупный материальный актив** вы приобрели исключительно для **утверждения своего статуса**, а не для счастья?",
  "В полной тишине: вы пытаетесь **структурировать** будущие шаги или **деконструировать** прошлые ошибки?",
  "Закончите фразу: «Я человек, который...»",
  "Вы готовы узнать свой диагноз?"
]

const Stamp = ({ type }: { type: string }) => {
  const colors: Record<string, string> = {
    'VOID': 'text-gray-500 border-gray-500',
    'NOISE': 'text-red-600 border-red-600',
    'STONE': 'text-stone-400 border-stone-400',
    'UNFRAMED': 'text-white border-white'
  }
  const style = colors[type] || colors['VOID']

  return (
    <div className={`absolute top-10 right-4 md:top-20 md:right-20 transform rotate-12 opacity-0 animate-stamp z-20 pointer-events-none`}>
       <div className={`border-4 ${style} px-4 py-2 font-black text-4xl md:text-6xl uppercase tracking-widest mix-blend-difference`} 
            style={{ 
              maskImage: 'url("https://s3-us-west-2.amazonaws.com/s.cdpn.io/8399/grunge.png")', 
              WebkitMaskImage: 'url("https://s3-us-west-2.amazonaws.com/s.cdpn.io/8399/grunge.png")', 
              maskSize: 'contain' 
            }}>
         [{type}]
       </div>
    </div>
  )
}

const useProcessing = (isLoading: boolean) => {
    const [step, setStep] = useState(0);
    const [text, setText] = useState('');
    
    const messages = useMemo(() => [
        'CORE ACCESS GRANTED...',
        'ANALYZING INERTIA AND DIGITAL NOISE...',
        'CALCULATING AGENCY INDEX...',
        'GENERATING PSYCHOLOGICAL CAST...'
    ], []);

    useEffect(() => {
        if (!isLoading) {
            setStep(0); setText(''); return;
        }
        let currentStep = 0;
        setText(messages[currentStep]);
        const interval = setInterval(() => {
            currentStep++;
            if (currentStep < messages.length) setText(messages[currentStep]);
        }, 1200); 
        return () => clearInterval(interval);
    }, [isLoading, messages]);

    return { processingText: text };
};

export default function CastPage() {
  const { user } = useAuth();
  const [language, setLanguage] = useState<'en' | 'ru' | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState('');
  
  const [fullText, setFullText] = useState('');
  const [displayedText, setDisplayedText] = useState('');
  const [archetype, setArchetype] = useState('');
  const [recordId, setRecordId] = useState<string | null>(null);
  
  const [loading, setLoading] = useState(false);
  const { processingText } = useProcessing(loading); 
  const [showStamp, setShowStamp] = useState(false);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);

  const questions = language === 'en' ? QUESTIONS_EN : QUESTIONS_RU;
  const isAnswerValid = currentAnswer.trim().length > 2;

  useEffect(() => {
      templeTrack('enter', 'User opened Cast page');
   }, []);

   useEffect(() => {
      if (currentStep === 11 && fullText) {
         let index = 0;
         const interval = setInterval(() => {
            setDisplayedText((prev) => prev + fullText.charAt(index));
            index++;
            if (index >= fullText.length) {
               clearInterval(interval);
               setTimeout(() => setShowStamp(true), 500); 
            }
         }, 10);
         return () => clearInterval(interval);
      }
   }, [currentStep, fullText]);

  const handleLanguageSelect = (lang: 'en' | 'ru') => {
    setLanguage(lang);
    setCurrentStep(1);
  }
  
  const formatAnalysisText = (analysis: any, archetype: string): string => {
    try {
        const parsed = typeof analysis === 'string' ? JSON.parse(analysis) : analysis;
        if (!parsed || typeof parsed !== 'object') return String(analysis || 'Analysis structure incomplete.');

        const scores = parsed.scores || {};
        const scoresText = Object.keys(scores)
            .sort((a, b) => scores[b] - scores[a]) 
            .map(k => `${k}: ${scores[k]}`).join(' / ');

        const headings = language === 'ru' ? {
            scores: "СЧЕТ",
            executive_summary: "РЕЗЮМЕ (AGENCY INDEX)",
            structural_weaknesses: "СТРУКТУРНЫЕ СЛАБОСТИ",
            core_assets: "КЛЮЧЕВЫЕ АКТИВЫ",
            strategic_directive: "СТРАТЕГИЧЕСКАЯ ДИРЕКТИВА"
        } : {
            scores: "SCOREBOARD",
            executive_summary: "EXECUTIVE SUMMARY (AGENCY INDEX)",
            structural_weaknesses: "STRUCTURAL WEAKNESSES",
            core_assets: "CORE ASSETS",
            strategic_directive: "STRATEGIC DIRECTIVE"
        };
        
        let formatted = `\n[ ${language === 'ru' ? 'АРХЕТИП' : 'ARCHETYPE'} ]\n${archetype}\n\n`;
        formatted += `\n[ ${headings.scores} ]\n${scoresText}\n\n`;
        formatted += `\n[ ${headings.executive_summary} ]\n${parsed.executive_summary || ''}\n\n`;
        formatted += `\n[ ${headings.structural_weaknesses} ]\n${parsed.structural_weaknesses || ''}\n\n`;
        formatted += `\n[ ${headings.core_assets} ]\n${parsed.core_assets || ''}\n\n`;
        formatted += `\n[ ${headings.strategic_directive} ]\n${parsed.strategic_directive || ''}\n\n`;

        return formatted;
    } catch (e) {
        return String(analysis || 'Error formatting analysis.');
    }
  }

  const handleNext = async () => {
    if (!isAnswerValid && currentStep < 10) return;

    const newAnswers = [...answers, currentAnswer];
    setAnswers(newAnswers);
    setCurrentAnswer('');

    if (currentStep < 10) {
      setCurrentStep(currentStep + 1);
    } else {
      setCurrentStep(11);
      setLoading(true);
      
      try {
        const session = (window as any)?.__supabase_session;
        const token = session?.access_token || '';

        const res = await fetch('/api/cast', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ answers: newAnswers, language })
        });
        const data = await res.json();
            
        const formatted = formatAnalysisText(data.analysis, data.archetype);

        setFullText(formatted);
        setArchetype(data.archetype);
        setRecordId(data.recordId); 

      } catch (error) {
        setFullText('Error connecting to the Core. Connection severed.');
      } finally {
        setLoading(false);
      }
    }
  }

  const handleEmailSubmit = async () => {
    if (!email || !recordId) return;
    try {
        await fetch('/api/cast/capture', {
            method: 'POST',
            body: JSON.stringify({ recordId, email })
        });
        setEmailSent(true);
    } catch (e) { console.error(e); }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && isAnswerValid) {
      e.preventDefault();
      handleNext();
    }
  }

  if (currentStep === 0) {
     return (
        <div className="min-h-screen bg-black flex items-center justify-center font-mono relative p-6">
            <div className="max-w-4xl w-full grid md:grid-cols-2 gap-12 animate-in fade-in duration-700">
                <div className="space-y-8 flex flex-col justify-center">
                    <p className="text-gray-400 text-sm md:text-base leading-relaxed tracking-wide">
                        I spent 20 years building a personal myth and 2 years deconstructing it with AI. 
                        I discovered that 90% of our personality is just <span className="text-white">digital noise</span>. 
                        This Protocol finds the remaining 10% — the Truth.
                    </p>
                    <button 
                        onClick={() => handleLanguageSelect('en')} 
                        className="group flex items-center gap-4 text-white text-lg tracking-[0.2em] transition-all hover:opacity-70 text-left"
                    >
                        [ START IN ENGLISH ] <span className="group-hover:translate-x-2 transition-transform">→</span>
                    </button>
                </div>
                <div className="space-y-8 md:border-l md:border-zinc-800 md:pl-12 flex flex-col justify-center">
                    <p className="text-gray-400 text-sm md:text-base leading-relaxed tracking-wide">
                        Я потратил 20 лет на создание личного мифа и 2 года на его деконструкцию.
                        90% нашей личности — это <span className="text-white">цифровой шум</span>.
                        Этот Протокол находит оставшиеся 10% — Истину.
                    </p>
                    <button 
                        onClick={() => handleLanguageSelect('ru')} 
                        className="group flex items-center gap-4 text-white text-lg tracking-[0.2em] transition-all hover:opacity-70 text-left"
                    >
                        [ НАЧАТЬ НА РУССКОМ ] <span className="group-hover:translate-x-2 transition-transform">→</span>
                    </button>
                </div>
            </div>
            <div className="absolute bottom-6 left-6">
               <Link href="/temple" className="text-xs text-zinc-600 hover:text-white uppercase tracking-widest">[ Return to Temple ]</Link>
            </div>
        </div>
     );
  }

  if (currentStep <= 10) {
     return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 font-mono animate-in fade-in duration-500 relative">
           <div className="w-full max-w-2xl flex flex-col min-h-[60vh] justify-center">
              <div className="flex justify-between text-[10px] text-zinc-600 mb-8 uppercase tracking-[0.3em]">
                 <span>Query {currentStep < 10 ? `0${currentStep}` : currentStep} / 10</span>
                 <span>Protocol v.2.5</span>
              </div>
              
              <div 
                 className="text-white text-xl md:text-2xl leading-relaxed mb-12 min-h-[80px]"
                 dangerouslySetInnerHTML={{ __html: formatQuestionText(questions[currentStep - 1]) }}
              />
              
              <textarea 
                 autoFocus
                 value={currentAnswer}
                 onChange={(e) => setCurrentAnswer(e.target.value)}
                 onKeyDown={handleKeyDown}
                 className="w-full bg-zinc-950/50 text-gray-300 text-lg border border-zinc-800 focus:border-white focus:bg-black outline-none p-6 resize-none mb-8 placeholder-zinc-800 transition-all rounded-sm min-h-[120px]"
                 placeholder={language === 'ru' ? "Пишите честно..." : "Answer honestly..."}
              />
              
              <div className="flex flex-col items-center gap-4">
                 <button 
                    onClick={handleNext} 
                    disabled={!isAnswerValid} 
                    className="text-xs text-black bg-white border border-white px-12 py-4 hover:bg-gray-200 transition-all tracking-[0.2em] disabled:opacity-20 disabled:cursor-not-allowed uppercase font-bold"
                 >
                    {currentStep === 10 ? (language === 'ru' ? 'АНАЛИЗ' : 'ANALYZE') : (language === 'ru' ? 'ДАЛЕЕ' : 'NEXT')}
                 </button>
                 <span className="text-[10px] text-zinc-700 uppercase tracking-widest">
                    {language === 'ru' ? '[ ENTER ДЛЯ ВВОДА ]' : '[ PRESS ENTER ]'}
                 </span>
              </div>
           </div>
        </div>
     );
  }

  return (
    <div className="min-h-screen bg-black text-white font-mono p-4 md:p-12 overflow-y-auto relative">
       <div className="max-w-3xl mx-auto mt-12 relative pb-20">
          {loading ? (
             <div className="flex flex-col items-center justify-center h-[50vh]">
                <div className="animate-pulse text-xs md:text-sm tracking-[0.3em] text-zinc-400">
                   {processingText || 'INITIATING CORE...'}
                </div>
                <div className="w-64 h-1 bg-zinc-900 mt-8 overflow-hidden">
                    <div className="h-full bg-white animate-progress-indeterminate"></div>
                </div>
             </div>
          ) : (
             <>
                {showStamp && <Stamp type={archetype} />}
                <div className="border border-zinc-800 p-6 md:p-12 bg-black relative shadow-[0_0_100px_rgba(255,255,255,0.03)] min-h-[60vh]">
                   <div className="flex justify-between border-b border-zinc-900 pb-6 mb-8 text-[10px] text-zinc-500 tracking-[0.2em] uppercase">
                      <span>Subject: {user?.email || 'Anonymous'}</span>
                      <span>Date: {new Date().toLocaleDateString()}</span>
                   </div>
                   
                   <pre className="whitespace-pre-wrap text-sm md:text-base leading-loose text-zinc-300 font-light font-mono">
                      {displayedText}
                      <span className="animate-pulse bg-white text-black px-1 ml-1"> </span>
                   </pre>
                </div>

                <div className="text-center mt-24">
                   <Link href="/temple" className="text-[10px] text-zinc-700 hover:text-white transition-colors tracking-[0.3em] uppercase">
                      [ Return to Temple ]
                   </Link>
                </div>
             </>
          )}
       </div>
    </div>
  );
}
