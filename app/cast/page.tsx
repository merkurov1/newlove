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
    const newAnswers = [...answers, currentAnswer]
    setAnswers(newAnswers)
    setCurrentAnswer('')
    if (currentStep < 10) {
      setCurrentStep(currentStep + 1)
    } else {
      setLoading(true)
      try {
        const res = await fetch('/api/cast', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: newAnswers, language })
        })
        const data = await res.json()
        setAnalysis(data.analysis)
        setCurrentStep(11)
      } catch (error) {
        console.error('Error fetching analysis:', error)
        setAnalysis('Error occurred. Please try again.')
        setCurrentStep(11)
      } finally {
        setLoading(false)
      }
    }
  }

  const renderContent = () => {
    if (currentStep === 0) {
      return (
        <div className="text-center">
          <button
            onClick={() => handleLanguageSelect('en')}
            className="text-white hover:text-gray-500 transition-colors duration-300 text-2xl mb-4 block"
          >
            [ ENGLISH ]
          </button>
          <button
            onClick={() => handleLanguageSelect('ru')}
            className="text-white hover:text-gray-500 transition-colors duration-300 text-2xl block"
          >
            [ РУССКИЙ ]
          </button>
        </div>
      )
    }

    if (currentStep <= 10) {
      const question = questions[currentStep - 1]
      return (
        <div className="text-white text-center max-w-2xl">
          <p className="text-xl mb-8">{question}</p>
          <textarea
            value={currentAnswer}
            onChange={(e) => setCurrentAnswer(e.target.value)}
            className="w-full h-32 bg-gray-800 text-white p-4 mb-4 resize-none"
            placeholder="Your answer..."
          />
          <button
            onClick={handleNext}
            className="bg-white text-black px-6 py-2 hover:bg-gray-200 transition-colors duration-300"
            disabled={!currentAnswer.trim()}
          >
            {currentStep === 10 ? 'Analyze' : 'Next'}
          </button>
        </div>
      )
    }

    if (currentStep === 11) {
      return (
        <div className="text-white text-center max-w-4xl">
          {loading ? (
            <p>Loading analysis...</p>
          ) : (
            <pre className="whitespace-pre-wrap text-left">{analysis}</pre>
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