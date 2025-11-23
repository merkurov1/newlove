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
  const [currentStep, setCurrentStep] = useState(0) // 0: lang select, 1-10: questions, 11: analysis
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
    // 1. Сохраняем ответ локально
    const newAnswers = [...answers, currentAnswer]
    setAnswers(newAnswers)
    setCurrentAnswer('') // Очищаем поле

    if (currentStep < 10) {
      // Если это не последний вопрос, просто идем дальше
      setCurrentStep(currentStep + 1)
    } else {
      // 2. ЭТО ПОСЛЕДНИЙ ШАГ. Сразу переключаем интерфейс!
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
        
        // Проверяем, есть ли поле analysis, если нет - выводим сырой ответ для дебага
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

  // Обработчик нажатия Enter (для удобства на десктопе)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && currentAnswer.trim()) {
      e.preventDefault()
      handleNext()
    }
  }

  const renderContent = () => {
    // ШАГ 0: Выбор языка
    if (currentStep === 0) {
      return (
        <div className="flex flex-col items-center gap-8 animate-in fade-in duration-700">
          <button
            onClick={() => handleLanguageSelect('en')}
            className="text-gray-400 hover:text-white transition-colors duration-300 text-xl tracking-widest font-mono"
          >
            [ ENGLISH ]
          </button>
          <button
            onClick={() => handleLanguageSelect('ru')}
            className="text-gray-400 hover:text-white transition-colors duration-300 text-xl tracking-widest font-mono"
          >
            [ РУССКИЙ ]
          </button>
        </div>
      )
    }

    // ШАГИ 1-10: Вопросы
    if (currentStep <= 10) {
      const question = questions[currentStep - 1]
      return (
        <div className="flex flex-col items-center w-full max-w-2xl px-6">
          <p className="text-gray-300 text-center text-lg md:text-xl font-mono mb-12 min-h-[80px]">
            {currentStep < 10 ? `0${currentStep}` : currentStep} / 10 <br/><br/>
            {question}
          </p>
          
          <textarea
            autoFocus
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-white text-xl md:text-2xl font-mono border-b border-gray-800 focus:border-white outline-none py-4 text-center resize-none placeholder-gray-800 transition-colors duration-300 mb-12"
            placeholder={language === 'ru' ? "..." : "..."}
            rows={1}
          />
          
          <button
            onClick={handleNext}
            disabled={!currentAnswer.trim()}
            className={`px-8 py-3 font-mono text-sm tracking-widest border transition-all duration-300 ${
              !currentAnswer.trim() 
                ? 'border-gray-900 text-gray-900 cursor-not-allowed' 
                : 'border-white text-white hover:bg-white hover:text-black'
            }`}
          >
            {currentStep === 10 
              ? (language === 'ru' ? 'ПОЛУЧИТЬ ДИАГНОЗ' : 'INITIALIZE ANALYSIS') 
              : (language === 'ru' ? 'ДАЛЕЕ' : 'NEXT')}
          </button>
        </div>
      )
    }

    // ШАГ 11: Результат / Загрузка
    if (currentStep === 11) {
      return (
        <div className="w-full max-w-3xl px-6 py-12 animate-in fade-in zoom-in duration-500">
          {loading ? (
            <div className="text-center">
              <div className="inline-block w-3 h-3 bg-white mb-4 animate-ping"></div>
              <p className="text-gray-500 font-mono text-sm tracking-widest animate-pulse">
                {language === 'ru' ? 'СИНХРОНИЗАЦИЯ С ЯДРОМ...' : 'UPLOADING TO CORE...'}
              </p>
            </div>
          ) : (
            <div className="border border-white/20 p-8 md:p-12 bg-black shadow-2xl shadow-white/5">
              <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
                <span className="text-xs text-gray-500 font-mono">MERKUROV.LOVE // CAST</span>
                <span className="text-xs text-gray-500 font-mono">{new Date().toLocaleDateString()}</span>
              </div>
              
              <pre className="whitespace-pre-wrap text-gray-200 font-mono text-sm md:text-base leading-relaxed">
                {analysis}
              </pre>

              <div className="mt-12 pt-8 border-t border-gray-800 text-center">
                <a href="/" className="text-xs text-gray-600 hover:text-white transition-colors font-mono uppercase">
                   {language === 'ru' ? '[ ВЕРНУТЬСЯ В ТЕНЬ ]' : '[ RETURN TO SHADOW ]'}
                </a>
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