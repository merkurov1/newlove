'use client'

import { useState, useEffect, Suspense } from 'react'
import TempleWrapper from '@/components/TempleWrapper'

const QUESTIONS_EN = [
  "What is the one physical object in your home you hate but cannot throw away?",
  "At what specific moment in your childhood did you realize adults were lying?",
  "What is the biggest lie you tell the world about yourself every day?",
  "If I deleted your digital presence right now, what % of your personality would remain?",
  "Open your last 5 photos. Do they show a life you enjoy or a life you perform?",
  "What is your primary digital sin: Envy (watching others), Wrath (arguing), or Sloth (scrolling)?",
  "What did you spend the most money on that brought you zero happiness?",
  "If locked in a silent room for 24 hours, would you worry about the future or regret the past?",
  "Finish the sentence: 'I am a person who...'",
  "Are you ready to see your true diagnosis?"
]

const QUESTIONS_RU = [
  "Назовите одну вещь в вашем доме, которую вы ненавидите, но не можете выбросить.",
  "В какой момент детства вы поняли, что взрослые врут, а мир небезопасен?",
  "Какую ложь о себе вы продаете миру каждый день?",
  "Если удалить все ваши соцсети прямо сейчас, какой процент личности останется?",
  "Ваши последние 5 фото в телефоне: это жизнь, которой вы наслаждаетесь, или спектакль для других?",
  "Ваш главный цифровой грех: Зависть (наблюдение), Гнев (спopы) или Уныние (скроллинг)?",
  "На что вы потратили кучу денег, и это не принесло счастья?",
  "Час в полной тишине: вы будете тревожиться о будущем или жалеть о прошлом?",
  "Закончите фразу: «Я человек, который...»",
  "Вы готовы узнать свой диагноз?"
]

// Компонент Штампа
const Stamp = ({ type }: { type: string }) => {
  const colors: Record<string, string> = {
    'VOID': 'text-gray-500 border-gray-500',
    'NOISE': 'text-red-600 border-red-600',
    'STONE': 'text-stone-400 border-stone-400',
    'UNFRAMED': 'text-white border-white'
  }
  const style = colors[type] || colors['VOID']

  return (
    <div className={`absolute top-10 right-10 md:top-20 md:right-20 transform rotate-12 opacity-0 animate-stamp z-10 pointer-events-none`}>
       <div className={`border-4 ${style} px-4 py-2 font-black text-4xl md:text-6xl uppercase tracking-widest`} 
            style={{ maskImage: 'url("https://s3-us-west-2.amazonaws.com/s.cdpn.io/8399/grunge.png")', WebkitMaskImage: 'url("https://s3-us-west-2.amazonaws.com/s.cdpn.io/8399/grunge.png")', maskSize: 'contain' }}>
         [{type}]
       </div>
    </div>
  )
}

export default function CastPage() {
  const [language, setLanguage] = useState<'en' | 'ru' | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [currentAnswer, setCurrentAnswer] = useState('')
  
  // Data State
  const [fullText, setFullText] = useState('')
  const [displayedText, setDisplayedText] = useState('')
  const [archetype, setArchetype] = useState('')
  const [recordId, setRecordId] = useState<string | null>(null)
  
  // UI State
  const [loading, setLoading] = useState(false)
  const [showStamp, setShowStamp] = useState(false)
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  const questions = language === 'en' ? QUESTIONS_EN : QUESTIONS_RU

  // Typewriter Effect
  useEffect(() => {
    if (currentStep === 11 && fullText) {
      let index = 0
      const interval = setInterval(() => {
        setDisplayedText((prev) => prev + fullText.charAt(index))
        index++
        if (index >= fullText.length) {
          clearInterval(interval)
          setTimeout(() => setShowStamp(true), 500) // Show stamp after text finishes
        }
      }, 15) // Speed of typing
      return () => clearInterval(interval)
    }
  }, [currentStep, fullText])

  const handleLanguageSelect = (lang: 'en' | 'ru') => {
    setLanguage(lang)
    setCurrentStep(1)
  }

  const handleNext = async () => {
    const newAnswers = [...answers, currentAnswer]
    setAnswers(newAnswers)
    setCurrentAnswer('')

    if (currentStep < 10) {
      setCurrentStep(currentStep + 1)
    } else {
      setCurrentStep(11)
      setLoading(true)
      
      try {
        const res = await fetch('/api/cast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: newAnswers, language })
        })
        const data = await res.json()
        
        setFullText(data.analysis)
        setArchetype(data.archetype)
        setRecordId(data.recordId) 

      } catch (error) {
        setFullText('Error connecting to the Core.')
      } finally {
        setLoading(false)
      }
    }
  }

  const handleEmailSubmit = async () => {
    if (!email || !recordId) return
    try {
        await fetch('/api/cast/capture', {
            method: 'POST',
            body: JSON.stringify({ recordId, email })
        })
        setEmailSent(true)
    } catch (e) { console.error(e) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && currentAnswer.trim()) {
      e.preventDefault()
      handleNext()
    }
  }

  // --- RENDER: INTRO ---
  if (currentStep === 0) {
     return (
        <div className="min-h-screen bg-black flex items-center justify-center font-mono relative">
            <Suspense fallback={null}><TempleWrapper /></Suspense>
            
            <div className="max-w-4xl px-6 grid md:grid-cols-2 gap-12">
                <div className="space-y-6">
                    <p className="text-gray-400 text-sm leading-relaxed">
                        I spent 20 years building a personal myth and 2 years deconstructing it with AI. 
                        I discovered that 90% of our personality is just digital noise. 
                        This Protocol finds the remaining 10% — the Truth.
                    </p>
                    <button onClick={() => handleLanguageSelect('en')} className="text-white text-lg tracking-widest hover:text-gray-400 transition-colors">
                        [ START IN ENGLISH ] →
                    </button>
                </div>
                <div className="space-y-6 md:border-l md:border-gray-800 md:pl-12">
                    <p className="text-gray-400 text-sm leading-relaxed">
                        Я потратил 20 лет на создание личного мифа и 2 года на его деконструкцию.
                        90% нашей личности — это цифровой шум.
                        Этот Протокол находит оставшиеся 10% — Истину.
                    </p>
                    <button onClick={() => handleLanguageSelect('ru')} className="text-white text-lg tracking-widest hover:text-gray-400 transition-colors">
                        [ НАЧАТЬ НА РУССКОМ ] →
                    </button>
                </div>
            </div>
        </div>
     )
  }

  // --- RENDER: QUESTIONS ---
  if (currentStep <= 10) {
     return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center px-6 font-mono animate-in fade-in relative">
           <Suspense fallback={null}><TempleWrapper /></Suspense>

           <div className="w-full max-w-2xl">
              <div className="flex justify-between text-xs text-gray-600 mb-12 uppercase tracking-widest">
                 <span>Query {currentStep < 10 ? `0${currentStep}` : currentStep}</span>
                 <span>Protocol v.1</span>
              </div>
              <p className="text-white text-xl md:text-2xl leading-relaxed mb-16 min-h-[100px] text-center">
                 {questions[currentStep - 1]}
              </p>
              <textarea 
                 autoFocus
                 value={currentAnswer}
                 onChange={(e) => setCurrentAnswer(e.target.value)}
                 onKeyDown={handleKeyDown}
                 className="w-full bg-transparent text-gray-300 text-center text-xl border-b border-gray-800 focus:border-white outline-none py-4 resize-none mb-12 placeholder-gray-900 transition-colors"
                 placeholder="..."
                 rows={1}
              />
              <div className="text-center">
                 <button onClick={handleNext} disabled={!currentAnswer.trim()} className="text-xs text-white border border-white px-8 py-3 hover:bg-white hover:text-black transition-all tracking-[0.2em] disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-white">
                    {currentStep === 10 ? (language === 'ru' ? 'ANALYZE' : 'ANALYZE') : (language === 'ru' ? 'NEXT' : 'NEXT')}
                 </button>
              </div>
           </div>
        </div>
     )
  }

  // --- RENDER: RESULT ---
  return (
    <div className="min-h-screen bg-black text-white font-mono p-6 md:p-12 overflow-y-auto relative">
       <Suspense fallback={null}><TempleWrapper /></Suspense>

       <div className="max-w-3xl mx-auto mt-12 relative">
          
          {loading ? (
             <div className="text-center mt-32">
                <div className="animate-pulse text-xs tracking-[0.3em]">PROCESSING DATA...</div>
             </div>
          ) : (
             <>
                {/* STAMP OVERLAY */}
                {showStamp && <Stamp type={archetype} />}

                {/* MAIN DOCUMENT */}
                <div className="border border-gray-800 p-8 md:p-16 bg-black relative shadow-[0_0_50px_rgba(255,255,255,0.05)]">
                   <div className="flex justify-between border-b border-gray-800 pb-6 mb-8 text-xs text-gray-500 tracking-widest uppercase">
                      <span>Subject: Anonymous</span>
                      <span>Date: {new Date().toLocaleDateString()}</span>
                   </div>
                   
                   <pre className="whitespace-pre-wrap text-sm md:text-base leading-loose text-gray-300 font-light min-h-[50vh]">
                      {displayedText}
                      <span className="animate-pulse">_</span>
                   </pre>
                </div>

                {/* UPSELL / LEVEL II BLOCK */}
                <div className={`mt-12 border-t border-gray-800 pt-12 transition-opacity duration-1000 ${showStamp ? 'opacity-100' : 'opacity-0'}`}>
                   <div className="grid md:grid-cols-2 gap-8 items-start">
                      <div>
                         <h3 className="text-red-600 text-xs tracking-[0.2em] mb-4 uppercase">
                            {language === 'ru' ? 'Внимание: Низкое Разрешение' : 'Warning: Low Resolution'}
                         </h3>
                         <p className="text-gray-500 text-xs leading-relaxed">
                            {language === 'ru' 
                              ? 'Этот слепок создан на основе 10 точек данных. Это набросок. Чтобы получить Истину, мне потребовалось 100 часов диалогов с Ядром. Я открываю доступ к Level II для тех, кто готов загрузить полные архивы.'
                              : 'This cast uses 10 data points. It is a sketch. Real deconstruction requires 100+ hours of processing. I am opening Level II for those ready to upload their full archives.'}
                         </p>
                      </div>

                      <div className="bg-zinc-900/50 p-6 border border-zinc-800">
                         {!emailSent ? (
                            <div className="flex flex-col gap-4">
                               <p className="text-xs text-gray-400 uppercase tracking-widest">
                                  {language === 'ru' ? 'Запросить доступ к Level II:' : 'Request Access to Level II:'}
                               </p>
                               <div className="flex gap-2">
                                  <input 
                                    type="email" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="email@address.com"
                                    className="bg-black border border-gray-700 text-white text-xs p-3 w-full outline-none focus:border-white transition-colors"
                                  />
                                  <button onClick={handleEmailSubmit} className="bg-white text-black text-xs px-4 uppercase hover:bg-gray-200">
                                     Submit
                                  </button>
                               </div>
                            </div>
                         ) : (
                            <div className="text-center py-4">
                               <span className="text-green-500 text-xs tracking-widest uppercase">
                                  {language === 'ru' ? '[ ЗАПРОС ПРИНЯТ ]' : '[ REQUEST ACCEPTED ]'}
                               </span>
                            </div>
                         )}
                      </div>
                   </div>
                </div>

                <div className="text-center mt-24 pb-12">
                   <a href="/" className="text-xs text-gray-700 hover:text-white transition-colors tracking-[0.2em] uppercase">
                      [ Exit Protocol ]
                   </a>
                </div>
             </>
          )}
       </div>
       
       <style jsx global>{`
         @keyframes stamp {
           0% { opacity: 0; transform: scale(2) rotate(12deg); }
           10% { opacity: 1; transform: scale(1) rotate(12deg); }
           100% { opacity: 0.8; transform: scale(1) rotate(12deg); }
         }
         .animate-stamp {
           animation: stamp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
         }
       `}</style>
    </div>
  )
}