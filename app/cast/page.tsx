'use client'

import { useState } from 'react'

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

export default function CastPage() {
  const [language, setLanguage] = useState<'en' | 'ru' | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [fading, setFading] = useState(false)
  const [loading, setLoading] = useState(false)

  const questions = language === 'en' ? QUESTIONS_EN : QUESTIONS_RU

  const handleLanguageSelect = (lang: 'en' | 'ru') => {
    setFading(true)
    setTimeout(() => {
      setLanguage(lang)
      setCurrentStep(1)
      setFading(false)
    }, 500)
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

        if (!res.ok) throw new Error('Network response was not ok')

        const data = await res.json()
        setAnalysis(data.analysis || JSON.stringify(data, null, 2))

      } catch (error) {
        console.error('Error fetching analysis:', error)
        setAnalysis(language === 'ru' 
          ? 'Ошибка соединения с ядром. Попробуйте еще раз.' 
          : 'Connection error. Core unreachable.')
      } finally {
        setLoading(false)
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && currentAnswer.trim()) {
      e.preventDefault()
      handleNext()
    }
  }

  const renderContent = () => {
    // ШАГ 0: МАНИФЕСТ И ВЫБОР ЯЗЫКА
    if (currentStep === 0) {
      return (
        <div className="flex flex-col w-full max-w-5xl px-6 md:px-12 animate-in fade-in duration-700 font-mono">
            {/* Header */}
            <div className="w-full border-b border-gray-800 pb-4 mb-12 text-center md:text-left">
                <span className="text-xs text-gray-500 tracking-[0.2em] uppercase">Merkurov Protocol v.1.0</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-24">
                {/* English Block */}
                <div className="flex flex-col items-start space-y-6">
                    <p className="text-gray-400 text-sm leading-relaxed max-w-sm">
                        I spent 20 years building a personal myth and 2 years deconstructing it with AI. 
                        I discovered that 90% of our personality is just digital noise. 
                        I created this Protocol to find the remaining 10% — the Truth.
                        <br/><br/>
                        It requires total honesty. It hurts, but it clears the vision.
                    </p>
                    <button
                        onClick={() => handleLanguageSelect('en')}
                        className="group flex items-center gap-4 text-white text-lg tracking-widest hover:text-gray-400 transition-colors pt-4"
                    >
                        [ START IN ENGLISH ]
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                    </button>
                </div>

                {/* Russian Block */}
                <div className="flex flex-col items-start space-y-6 md:border-l md:border-gray-900 md:pl-12">
                    <p className="text-gray-400 text-sm leading-relaxed max-w-sm">
                        Я потратил 20 лет на создание личного мифа и 2 года на его деконструкцию с помощью нейросетей.
                        Я обнаружил, что 90% нашей личности — это просто цифровой шум.
                        Я создал этот Протокол, чтобы найти оставшиеся 10% — Истину.
                        <br/><br/>
                        Это требует полной честности. Это больно, но это проясняет зрение.
                    </p>
                    <button
                        onClick={() => handleLanguageSelect('ru')}
                        className="group flex items-center gap-4 text-white text-lg tracking-widest hover:text-gray-400 transition-colors pt-4"
                    >
                        [ НАЧАТЬ НА РУССКОМ ]
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                    </button>
                </div>
            </div>
        </div>
      )
    }

    // ШАГИ 1-10: ВОПРОСЫ
    if (currentStep <= 10) {
      const question = questions[currentStep - 1]
      return (
        <div className="flex flex-col items-center w-full max-w-2xl px-6 animate-in slide-in-from-bottom-4 duration-500">
          <div className="w-full flex justify-between items-end mb-12 border-b border-gray-900 pb-2">
            <span className="text-gray-600 font-mono text-xs">QUERY {currentStep < 10 ? `0${currentStep}` : currentStep}</span>
            <span className="text-gray-600 font-mono text-xs">/ 10</span>
          </div>
          
          <p className="text-white text-center text-lg md:text-2xl font-mono leading-relaxed mb-16 min-h-[100px]">
            {question}
          </p>
          
          <textarea
            autoFocus
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-gray-300 text-xl font-mono border-b border-gray-800 focus:border-white outline-none py-4 text-center resize-none placeholder-gray-800 transition-colors duration-300 mb-12"
            placeholder={language === 'ru' ? "Ответ..." : "Answer..."}
            rows={1}
          />
          
          <button
            onClick={handleNext}
            disabled={!currentAnswer.trim()}
            className={`px-12 py-4 font-mono text-xs tracking-[0.2em] border transition-all duration-300 ${
              !currentAnswer.trim() 
                ? 'border-gray-900 text-gray-900 cursor-not-allowed' 
                : 'border-white text-white hover:bg-white hover:text-black'
            }`}
          >
            {currentStep === 10 
              ? (language === 'ru' ? 'ПОДТВЕРДИТЬ' : 'CONFIRM') 
              : (language === 'ru' ? 'ДАЛЕЕ' : 'NEXT')}
          </button>
        </div>
      )
    }

    // ШАГ 11: РЕЗУЛЬТАТ
    if (currentStep === 11) {
      return (
        <div className="w-full max-w-3xl px-6 py-12 animate-in fade-in zoom-in duration-700">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[50vh]">
              <div className="w-16 h-[1px] bg-white mb-8 animate-pulse"></div>
              <p className="text-gray-500 font-mono text-xs tracking-[0.3em] uppercase animate-pulse">
                {language === 'ru' ? 'Деконструкция...' : 'Deconstructing...'}
              </p>
            </div>
          ) : (
            <div className="border border-white/20 bg-black p-8 md:p-16 relative shadow-2xl shadow-white/5">
              {/* Decorative corners */}
              <div className="absolute top-0 left-0 w-4 h-4 border-t border-l border-white"></div>
              <div className="absolute top-0 right-0 w-4 h-4 border-t border-r border-white"></div>
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-l border-white"></div>
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-white"></div>

              <div className="flex justify-between items-center mb-12 border-b border-gray-800 pb-6">
                <span className="text-xs text-gray-500 font-mono tracking-widest">MERKUROV.CAST</span>
                <span className="text-xs text-gray-500 font-mono">{new Date().toLocaleDateString()}</span>
              </div>
              
              <pre className="whitespace-pre-wrap text-gray-200 font-mono text-sm md:text-base leading-loose font-light">
                {analysis}
              </pre>

              <div className="mt-16 pt-8 border-t border-gray-800 text-center">
                <button 
                   onClick={() => window.location.reload()}
                   className="text-xs text-gray-600 hover:text-white transition-colors font-mono tracking-[0.2em] uppercase"
                >
                   {language === 'ru' ? '[ УНИЧТОЖИТЬ ЗАПИСЬ ]' : '[ DESTROY RECORD ]'}
                </button>
              </div>
            </div>
          )}
        </div>
      )
    }

    return null
  }

  return (
    <div className={`min-h-screen bg-black flex items-center justify-center transition-opacity duration-500 ${fading ? 'opacity-0' : 'opacity-100'}`}>
      {renderContent()}
    </div>
  )
}