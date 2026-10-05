'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';
import { Sparkles, ArrowRight, Terminal, RefreshCw } from 'lucide-react';

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
    'VOID': 'text-zinc-500 border-zinc-500',
    'NOISE': 'text-red-500 border-red-500',
    'STONE': 'text-stone-400 border-stone-400',
    'UNFRAMED': 'text-white border-white'
  }
  const style = colors[type] || colors['VOID']

  return (
    <div className="absolute top-6 right-6 md:top-10 md:right-10 transform rotate-6 opacity-0 animate-in fade-in zoom-in duration-500 z-20 pointer-events-none">
       <div className={`border-2 md:border-4 ${style} px-4 py-2 font-black text-2xl md:text-4xl uppercase tracking-widest backdrop-blur-sm bg-black/40 shadow-[0_0_30px_rgba(0,0,0,0.8)]`}>
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
        'ANALYZING AGENCY & DIGITAL NOISE...',
        'CALCULATING ARCHETYPE INDEX...',
        'MANIFESTING PSYCHOLOGICAL CAST...'
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
  
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [fullText, setFullText] = useState('');
  const [displayedText, setDisplayedText] = useState('');
  const [archetype, setArchetype] = useState('');
  
  const [loading, setLoading] = useState(false);
  const { processingText } = useProcessing(loading); 
  const [showStamp, setShowStamp] = useState(false);
  
  // Состояние для захвата почты (использует ваш /api/cast/capture)
  const [email, setEmail] = useState('');
  const [recordId, setRecordId] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const questions = language === 'en' ? QUESTIONS_EN : QUESTIONS_RU;
  const isAnswerValid = currentAnswer.trim().length > 2;

  useEffect(() => {
      if (currentStep === 11 && fullText) {
         let index = 0;
         setDisplayedText('');
         const interval = setInterval(() => {
            setDisplayedText((prev) => prev + fullText.charAt(index));
            index++;
            if (index >= fullText.length) {
               clearInterval(interval);
               setTimeout(() => setShowStamp(true), 400); 
            }
         }, 6);
         return () => clearInterval(interval);
      }
   }, [currentStep, fullText]);

  const handleLanguageSelect = (lang: 'en' | 'ru') => {
    setLanguage(lang);
    setCurrentStep(1);
  }
  
  const formatAnalysisText = (parsed: any, archetype: string): string => {
    if (!parsed || typeof parsed !== 'object') return String(parsed || 'Analysis structure incomplete.');

    const scores = parsed.scores || {};
    const scoresText = Object.keys(scores).map(k => `${k}: ${scores[k]}`).join(' / ');

    const labels = language === 'ru' ? {
        scores: "БАЛЛЫ АРХЕТИПОВ",
        executive_summary: "РЕЗЮМЕ",
        structural_weaknesses: "СТРУКТУРНЫЕ СЛАБОСТИ",
        core_assets: "КЛЮЧЕВЫЕ АКТИВЫ",
        strategic_directive: "СТРАТЕГИЧЕСКАЯ ДИРЕКТИВА"
    } : {
        scores: "ARCHETYPE SCORES",
        executive_summary: "EXECUTIVE SUMMARY",
        structural_weaknesses: "STRUCTURAL WEAKNESSES",
        core_assets: "CORE ASSETS",
        strategic_directive: "STRATEGIC DIRECTIVE"
    };
    
    let formatted = `[ ${language === 'ru' ? 'АРХЕТИП' : 'ARCHETYPE'} ]\n${archetype}\n\n`;
    formatted += `[ ${labels.scores} ]\n${scoresText}\n\n`;
    formatted += `[ ${labels.executive_summary} ]\n${parsed.executive_summary || ''}\n\n`;
    formatted += `[ ${labels.structural_weaknesses} ]\n${parsed.structural_weaknesses || ''}\n\n`;
    formatted += `[ ${labels.core_assets} ]\n${parsed.core_assets || ''}\n\n`;
    formatted += `[ ${labels.strategic_directive} ]\n${parsed.strategic_directive || ''}\n`;

    return formatted;
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
            
        setAnalysisData(data.analysis);
        setArchetype(data.archetype);
        setRecordId(data.recordId);
        
        const formatted = formatAnalysisText(data.analysis, data.archetype);
        setFullText(formatted);

      } catch (error) {
        setFullText('Error connecting to the Core. Connection severed.');
      } finally {
        setLoading(false);
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && isAnswerValid) {
      e.preventDefault();
      handleNext();
    }
  }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !recordId) return;

    try {
        const res = await fetch('/api/cast/capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recordId, email })
        });
        if (res.ok) setEmailSent(true);
    } catch (err) {
        console.error(err);
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-mono flex flex-col relative selection:bg-orange-500/30 overflow-x-hidden antialiased">
      {/* Шаг 0: Выбор языка */}
      {currentStep === 0 && (
         <div className="flex-1 flex items-center justify-center p-6 relative z-10 mt-16">
            <div className="max-w-4xl w-full grid md:grid-cols-2 gap-8 animate-in fade-in duration-700">
                <div className="space-y-6 flex flex-col justify-center bg-zinc-900/40 border border-zinc-800/80 p-8 rounded-2xl backdrop-blur-xl">
                    <div className="flex items-center gap-2 text-xs text-orange-500 uppercase tracking-widest">
                       <Terminal size={14} /> Protocol 01
                    </div>
                    <p className="text-zinc-300 text-sm md:text-base leading-relaxed tracking-wide">
                        I spent 20 years building a personal myth and 2 years deconstructing it with AI. 
                        This Protocol deconstructs your answers and measures your Agency Index.
                    </p>
                    <button 
                        onClick={() => handleLanguageSelect('en')} 
                        className="group flex items-center justify-between text-white text-sm tracking-[0.2em] transition-all bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-6 py-4 rounded-xl cursor-pointer"
                    >
                        <span>[ START IN ENGLISH ]</span> 
                        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform text-orange-500" />
                    </button>
                </div>

                <div className="space-y-6 flex flex-col justify-center bg-zinc-900/40 border border-zinc-800/80 p-8 rounded-2xl backdrop-blur-xl">
                    <div className="flex items-center gap-2 text-xs text-orange-500 uppercase tracking-widest">
                       <Terminal size={14} /> Протокол 01
                    </div>
                    <p className="text-zinc-300 text-sm md:text-base leading-relaxed tracking-wide">
                        Этот Протокол анализирует ваши ответы, вычисляет Индекс Агентности и определяет ваш психологический архетип.
                    </p>
                    <button 
                        onClick={() => handleLanguageSelect('ru')} 
                        className="group flex items-center justify-between text-white text-sm tracking-[0.2em] transition-all bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-6 py-4 rounded-xl cursor-pointer"
                    >
                        <span>[ НАЧАТЬ НА РУССКОМ ]</span> 
                        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform text-orange-500" />
                    </button>
                </div>
            </div>
         </div>
      )}

      {/* Вопросы 1–10 */}
      {currentStep > 0 && currentStep <= 10 && (
         <div className="flex-1 flex flex-col items-center justify-center px-6 py-20 relative z-10 max-w-2xl mx-auto w-full">
            <div className="w-full flex flex-col justify-center">
              <div className="flex justify-between items-center text-xs text-zinc-500 mb-6 uppercase tracking-[0.25em]">
                 <span className="flex items-center gap-1.5"><Sparkles size={12} className="text-orange-500" /> Query {currentStep < 10 ? `0${currentStep}` : currentStep} / 10</span>
                 <span>Cast Protocol</span>
              </div>
              
              <div 
                 className="text-white text-lg md:text-xl leading-relaxed mb-8 min-h-[90px] bg-zinc-950/60 border border-zinc-800 p-6 rounded-2xl backdrop-blur-md"
                 dangerouslySetInnerHTML={{ __html: formatQuestionText(questions[currentStep - 1]) }}
              />
              
              <textarea 
                 autoFocus
                 value={currentAnswer}
                 onChange={(e) => setCurrentAnswer(e.target.value)}
                 onKeyDown={handleKeyDown}
                 className="w-full bg-zinc-900/60 text-zinc-200 text-base border border-zinc-800 focus:border-orange-500 focus:bg-black outline-none p-5 resize-none mb-6 placeholder-zinc-600 transition-all rounded-xl min-h-[130px] shadow-inner"
                 placeholder={language === 'ru' ? "Пишите честно..." : "Answer honestly..."}
              />
              
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                 <span className="text-[10px] text-zinc-600 uppercase tracking-widest order-2 sm:order-1">
                    {language === 'ru' ? '[ PRESS ENTER ДЛЯ ОТПРАВКИ ]' : '[ PRESS ENTER TO TRANSMIT ]'}
                 </span>
                 <button 
                    onClick={handleNext} 
                    disabled={!isAnswerValid} 
                    className="w-full sm:w-auto text-xs text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-8 py-4 transition-all tracking-[0.2em] disabled:opacity-25 disabled:cursor-not-allowed uppercase font-bold rounded-xl cursor-pointer order-1 sm:order-2 shadow-lg"
                 >
                    {currentStep === 10 ? (language === 'ru' ? 'АНАЛИЗ' : 'ANALYZE') : (language === 'ru' ? 'ДАЛЕЕ' : 'NEXT')}
                 </button>
              </div>
           </div>
         </div>
      )}

      {/* Шаг 11: Результаты и Окно захвата почты */}
      {currentStep === 11 && (
        <div className="flex-1 max-w-3xl mx-auto w-full px-6 pt-32 pb-20 relative z-10">
          {loading ? (
             <div className="flex flex-col items-center justify-center h-[50vh]">
                <div className="animate-pulse text-xs md:text-sm tracking-[0.3em] text-orange-400 flex items-center gap-2">
                   <RefreshCw className="animate-spin" size={16} />
                   {processingText || 'INITIATING CORE...'}
                </div>
                <div className="w-64 h-1 bg-zinc-900 mt-8 overflow-hidden rounded-full">
                    <div className="h-full bg-orange-500 animate-progress-indeterminate"></div>
                </div>
             </div>
          ) : (
             <>
                <div className="border border-zinc-800/80 p-6 md:p-10 bg-zinc-900/40 backdrop-blur-2xl relative shadow-2xl rounded-3xl overflow-hidden mb-8">
                   {showStamp && <Stamp type={archetype} />}
                   
                   <div className="flex justify-between border-b border-zinc-800 pb-4 mb-6 text-[10px] text-zinc-500 tracking-[0.2em] uppercase">
                      <span>Subject: {user?.email || 'Anonymous'}</span>
                      <span>Protocol ID: {recordId ? recordId.slice(0, 8) : 'LOCAL'}</span>
                   </div>
                   
                   <pre className="whitespace-pre-wrap text-xs md:text-sm leading-loose text-zinc-300 font-light font-mono">
                      {displayedText}
                      <span className="animate-pulse bg-orange-500 text-black px-1 ml-1 inline-block w-2"> </span>
                   </pre>
                </div>

                {/* Блок захвата почты (если пользователь не залогинен или хочет зафиксировать результат) */}
                {!user && recordId && (
                   <div className="border border-zinc-800 p-6 md:p-8 bg-zinc-950/80 rounded-2xl mb-8 backdrop-blur-xl">
                      <h3 className="text-sm uppercase tracking-widest text-white mb-2">
                         {language === 'ru' ? 'Сохранить результат в Архиве' : 'Persist Result in Archive'}
                      </h3>
                      <p className="text-xs text-zinc-400 mb-4">
                         {language === 'ru' ? 'Введите email, чтобы привязать профиль и получить копию.' : 'Enter email to secure your archetype and receive records.'}
                      </p>
                      {emailSent ? (
                         <div className="text-xs text-orange-400 uppercase tracking-widest py-3">
                            {language === 'ru' ? '✓ Протокол зафиксирован за вашим email' : '✓ Protocol secured to your email'}
                         </div>
                      ) : (
                         <form onSubmit={handleEmailSubmit} className="flex flex-col sm:flex-row gap-3">
                            <input 
                               type="email" 
                               required
                               placeholder="name@domain.com"
                               value={email}
                               onChange={(e) => setEmail(e.target.value)}
                               className="flex-1 bg-zinc-900 text-zinc-200 text-sm border border-zinc-800 focus:border-orange-500 outline-none px-4 py-3 rounded-xl"
                            />
                            <button type="submit" className="text-xs font-bold uppercase tracking-widest bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-6 py-3 rounded-xl transition-all cursor-pointer">
                               {language === 'ru' ? 'Сохранить' : 'Secure'}
                            </button>
                         </form>
                      )}
                   </div>
                )}

                <div className="text-center mt-8">
                   <Link href="/temple" className="text-xs text-zinc-500 hover:text-white transition-colors tracking-[0.3em] uppercase border border-zinc-800 px-6 py-3 rounded-full inline-block bg-zinc-900/50">
                      [ Return to Temple ]
                   </Link>
                </div>
             </>
          )}
        </div>
      )}
    </div>
  );
}
