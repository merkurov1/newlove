'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Terminal,
} from 'lucide-react';

import { useAuth } from '@/components/AuthContext';
import TempleTopBar from '@/components/TempleTopBar';
import { createClient } from '@/lib/supabase/client';

const QUESTIONS_EN = [
  'Which object in your home do you keep because it reminds you of **failed ambition** or a **bad compromise**?',
  'At what age or event did you first realize the **person closest to you** could not protect you?',
  'Which public virtue of yours (competence, calmness) is actually your **biggest defensive mechanism**?',
  'If I deleted your digital presence right now, what % of your personality would remain?',
  'Open your last 5 photos. Do they show a life you enjoy or a life you perform?',
  'What is the **most shameful** digital behavior you continue to engage in (scrolling, voyeurism, seeking validation)?',
  'What is the **largest material asset** you acquired purely for **status confirmation**, not happiness?',
  'In complete silence: do you attempt to **structure** future steps or **deconstruct** past mistakes?',
  "Finish the sentence: 'I am a person who...'",
  'Are you ready to see your true diagnosis?',
];

const QUESTIONS_RU = [
  'Какой один предмет в вашем доме вы храните, потому что он напоминает о **нереализованном потенциале** или **неудачном компромиссе**?',
  'В каком возрасте или событии вы впервые поняли, что **самый близкий вам человек** не может вас защитить?',
  'Какое ваше публичное достоинство (компетентность, спокойствие) на самом деле **ваш самый большой защитный механизм**?',
  'Если удалить все ваши соцсети прямо сейчас, какой процент личности останется?',
  'Ваши последние 5 фото в телефоне: это жизнь, которой вы наслаждаетесь, или спектакль для других?',
  'Что в вашем цифровом поведении — **самое стыдное**, но вы продолжаете это делать (скроллинг, подглядывание, поиск валидации)?',
  'Какой **самый крупный материальный актив** вы приобрели исключительно для **утверждения своего статуса**, а не для счастья?',
  'В полной тишине: вы пытаетесь **структурировать** будущие шаги или **деконструировать** прошлые ошибки?',
  'Закончите фразу: «Я человек, который...»',
  'Вы готовы узнать свой диагноз?',
];

const ARCHETYPES = [
  'VOID',
  'NOISE',
  'STONE',
  'UNFRAMED',
] as const;

type Archetype = (typeof ARCHETYPES)[number];

interface AnalysisData {
  archetype: Archetype;
  agency_index: number;
  scores: Record<Archetype, number>;
  executive_summary: string;
  structural_weaknesses: string;
  core_assets: string;
  strategic_directive: string;
}

interface CastResponse {
  analysis?: AnalysisData;
  archetype?: string;
  agencyIndex?: number;
  recordId?: string;
  captureToken?: string;
  error?: string;
}

function isValidArchetype(
  value: unknown
): value is Archetype {
  return (
    typeof value === 'string' &&
    ARCHETYPES.includes(
      value.toUpperCase() as Archetype
    )
  );
}

function renderQuestionText(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return parts.map((part, index) => {
    if (
      part.startsWith('**') &&
      part.endsWith('**')
    ) {
      return (
        <strong
          key={index}
          className="font-semibold text-stone-100"
        >
          {part.slice(2, -2)}
        </strong>
      );
    }

    return (
      <span key={index}>
        {part}
      </span>
    );
  });
}

function Stamp({
  type,
}: {
  type: string;
}) {
  const colors: Record<string, string> = {
    VOID: 'text-stone-500 border-stone-500',
    NOISE: 'text-amber-400 border-amber-400',
    STONE: 'text-stone-300 border-stone-300',
    UNFRAMED: 'text-stone-100 border-stone-100',
  };

  const style = colors[type] || colors.VOID;

  return (
    <div className="pointer-events-none absolute right-5 top-5 z-20 rotate-6 opacity-0 animate-in fade-in zoom-in duration-500 md:right-8 md:top-8">
      <div
        className={`border-2 ${style} bg-stone-950/50 px-3 py-2 font-mono text-xl font-bold uppercase tracking-[0.16em] backdrop-blur-sm md:px-4 md:py-2 md:text-3xl`}
      >
        [{type}]
      </div>
    </div>
  );
}

function useProcessing(isLoading: boolean) {
  const [text, setText] = useState('');

  const messages = useMemo(
    () => [
      'CORE ACCESS GRANTED...',
      'ANALYZING AGENCY & DIGITAL NOISE...',
      'CALCULATING ARCHETYPE INDEX...',
      'MANIFESTING PSYCHOLOGICAL CAST...',
    ],
    []
  );

  useEffect(() => {
    if (!isLoading) {
      setText('');
      return;
    }

    let currentStep = 0;

    setText(messages[0]);

    const interval = window.setInterval(() => {
      currentStep += 1;

      if (currentStep < messages.length) {
        setText(messages[currentStep]);
      }
    }, 1200);

    return () =>
      window.clearInterval(interval);
  }, [isLoading, messages]);

  return {
    processingText: text,
  };
}

export default function CastClient() {
  const { user } = useAuth();

  const [language, setLanguage] =
    useState<'en' | 'ru' | null>(null);

  const [currentStep, setCurrentStep] =
    useState(0);

  const [answers, setAnswers] =
    useState<string[]>([]);

  const [currentAnswer, setCurrentAnswer] =
    useState('');

  const [analysisData, setAnalysisData] =
    useState<AnalysisData | null>(null);

  const [displayedText, setDisplayedText] =
    useState('');

  const [archetype, setArchetype] =
    useState<Archetype | ''>('');

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  const [showStamp, setShowStamp] =
    useState(false);

  const [email, setEmail] =
    useState('');

  const [recordId, setRecordId] =
    useState<string | null>(null);

  const [captureToken, setCaptureToken] =
    useState<string | null>(null);

  const [emailSent, setEmailSent] =
    useState(false);

  const [emailLoading, setEmailLoading] =
    useState(false);

  const [emailError, setEmailError] =
    useState('');

  const { processingText } =
    useProcessing(loading);

  const supabase = useMemo(
    () => createClient(),
    []
  );

  const questions =
    language === 'en'
      ? QUESTIONS_EN
      : language === 'ru'
        ? QUESTIONS_RU
        : [];

  const currentQuestion =
    currentStep >= 1 &&
    currentStep <= 10
      ? questions[currentStep - 1]
      : '';

  const isAnswerValid =
    currentAnswer.trim().length > 2;

  useEffect(() => {
    if (
      currentStep !== 11 ||
      !analysisData
    ) {
      return;
    }

    const formatted =
      formatAnalysisText(
        analysisData,
        language
      );

    let index = 0;
    let timeoutId: number | null = null;

    setDisplayedText('');
    setShowStamp(false);

    const interval = window.setInterval(() => {
      const nextChunk = formatted.slice(
        index,
        index + 3
      );

      index += nextChunk.length;

      setDisplayedText(
        formatted.slice(0, index)
      );

      if (index >= formatted.length) {
        window.clearInterval(interval);

        timeoutId = window.setTimeout(
          () => setShowStamp(true),
          400
        );
      }
    }, 18);

    return () => {
      window.clearInterval(interval);

      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    currentStep,
    analysisData,
    language,
  ]);

  function handleLanguageSelect(
    lang: 'en' | 'ru'
  ) {
    setLanguage(lang);
    setCurrentStep(1);
    setAnswers([]);
    setCurrentAnswer('');
    setError('');
    setAnalysisData(null);
    setDisplayedText('');
    setArchetype('');
    setRecordId(null);
    setCaptureToken(null);
    setShowStamp(false);
    setEmail('');
    setEmailSent(false);
    setEmailError('');
  }

  function formatAnalysisText(
    parsed: AnalysisData,
    resultArchetype: 'en' | 'ru' | null
  ) {
    const labels =
      resultArchetype === 'ru'
        ? {
            agency: 'ИНДЕКС АГЕНТНОСТИ',
            scores: 'БАЛЛЫ АРХЕТИПОВ',
            summary: 'РЕЗЮМЕ',
            weaknesses:
              'СТРУКТУРНЫЕ СЛАБОСТИ',
            assets: 'КЛЮЧЕВЫЕ АКТИВЫ',
            directive:
              'СТРАТЕГИЧЕСКАЯ ДИРЕКТИВА',
          }
        : {
            agency: 'AGENCY INDEX',
            scores: 'ARCHETYPE SCORES',
            summary: 'EXECUTIVE SUMMARY',
            weaknesses:
              'STRUCTURAL WEAKNESSES',
            assets: 'CORE ASSETS',
            directive: 'STRATEGIC DIRECTIVE',
          };

    return [
      `[ ${
        resultArchetype === 'ru'
          ? 'АРХЕТИП'
          : 'ARCHETYPE'
      } ]`,
      parsed.archetype,
      '',
      `[ ${labels.agency} ]`,
      `${parsed.agency_index}/100`,
      '',
      `[ ${labels.scores} ]`,
      `VOID: ${parsed.scores.VOID} / STONE: ${parsed.scores.STONE} / NOISE: ${parsed.scores.NOISE} / UNFRAMED: ${parsed.scores.UNFRAMED}`,
      '',
      `[ ${labels.summary} ]`,
      parsed.executive_summary,
      '',
      `[ ${labels.weaknesses} ]`,
      parsed.structural_weaknesses,
      '',
      `[ ${labels.assets} ]`,
      parsed.core_assets,
      '',
      `[ ${labels.directive} ]`,
      parsed.strategic_directive,
    ].join('\n');
  }

  async function runAnalysis(
    finalAnswers: string[]
  ) {
    setLoading(true);
    setError('');
    setDisplayedText('');
    setAnalysisData(null);
    setArchetype('');
    setRecordId(null);
    setCaptureToken(null);
    setShowStamp(false);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const token =
        session?.access_token || '';

      const res = await fetch(
        '/api/cast',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
            ...(token
              ? {
                  Authorization:
                    `Bearer ${token}`,
                }
              : {}),
          },
          body: JSON.stringify({
            answers: finalAnswers,
            language,
          }),
        }
      );

      let data: CastResponse;

      try {
        data = await res.json();
      } catch {
        throw new Error(
          'Invalid response from the Core.'
        );
      }

      if (!res.ok) {
        throw new Error(
          data.error ||
            'The Core could not complete the analysis.'
        );
      }

      if (
        !data.analysis ||
        !data.archetype ||
        !data.recordId ||
        !data.captureToken
      ) {
        throw new Error(
          'The Core returned an incomplete psychological cast.'
        );
      }

      const normalizedArchetype =
        data.archetype.toUpperCase();

      if (
        !isValidArchetype(
          normalizedArchetype
        )
      ) {
        throw new Error(
          'The Core returned an invalid archetype.'
        );
      }

      if (
        data.analysis.agency_index < 0 ||
        data.analysis.agency_index > 100
      ) {
        throw new Error(
          'The Core returned an invalid Agency Index.'
        );
      }

      setAnalysisData(data.analysis);
      setArchetype(
        normalizedArchetype
      );
      setRecordId(data.recordId);
      setCaptureToken(
        data.captureToken
      );
    } catch (err) {
      console.error(
        '[Cast] Analysis failed:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Connection to the Core failed.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleNext() {
    if (
      !isAnswerValid ||
      loading ||
      currentStep > 10
    ) {
      return;
    }

    const newAnswers = [
      ...answers,
      currentAnswer.trim(),
    ];

    setAnswers(newAnswers);
    setCurrentAnswer('');

    if (currentStep < 10) {
      setCurrentStep(
        currentStep + 1
      );
      return;
    }

    setCurrentStep(11);

    await runAnalysis(newAnswers);
  }

  async function handleRetry() {
    if (
      answers.length !== 10 ||
      !language ||
      loading
    ) {
      return;
    }

    await runAnalysis(answers);
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      isAnswerValid &&
      !loading
    ) {
      e.preventDefault();
      void handleNext();
    }
  }

  async function handleEmailSubmit(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (
      !email.trim() ||
      !recordId ||
      !captureToken ||
      emailLoading
    ) {
      return;
    }

    setEmailLoading(true);
    setEmailError('');

    try {
      const res = await fetch(
        '/api/cast/capture',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            recordId,
            captureToken,
            email: email.trim(),
          }),
        }
      );

      const data = await res
        .json()
        .catch(() => null);

      if (!res.ok) {
        throw new Error(
          data?.error ||
            'Unable to secure the protocol.'
        );
      }

      setEmailSent(true);
      setCaptureToken(null);
    } catch (err) {
      console.error(
        '[Cast] Email capture failed:',
        err
      );

      setEmailError(
        err instanceof Error
          ? err.message
          : 'Unable to secure the protocol.'
      );
    } finally {
      setEmailLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-col overflow-x-hidden bg-[#141210] font-sans text-stone-200 antialiased selection:bg-amber-500/30">
      {/* Ambient Temple light */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-900/20 blur-[130px]" />

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(120,80,20,0.10),transparent_45%)]" />
      </div>

      <TempleTopBar backTo="temple" />

      {/* LANGUAGE SELECT */}
      {currentStep === 0 && (
        <main className="relative z-10 flex min-h-[100dvh] flex-1 items-center justify-center px-6 pb-16 pt-32 sm:pt-36">
          <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2 md:gap-8 animate-in fade-in duration-700">
            {[
              {
                lang: 'en' as const,
                label:
                  '[ START IN ENGLISH ]',
                title: 'Protocol 01',
                text:
                  'I spent 20 years building a personal myth and 2 years deconstructing it with AI. This Protocol deconstructs your answers and measures your Agency Index.',
              },
              {
                lang: 'ru' as const,
                label:
                  '[ НАЧАТЬ НА РУССКОМ ]',
                title: 'Протокол 01',
                text:
                  'Этот Протокол анализирует ваши ответы, вычисляет Индекс Агентности и определяет ваш психологический архетип.',
              },
            ].map(item => (
              <div
                key={item.lang}
                className="group flex flex-col justify-center space-y-6 rounded-[28px] border border-stone-800/80 bg-stone-900/80 p-7 shadow-2xl backdrop-blur-xl transition-all duration-300 hover:border-amber-300/30 hover:bg-stone-900/90 sm:p-9"
              >
                <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-300">
                  <Terminal size={13} />
                  {item.title}
                </div>

                <div className="h-px w-12 bg-amber-300/30 transition-all duration-300 group-hover:w-20" />

                <p className="text-sm leading-relaxed tracking-wide text-stone-300 md:text-base">
                  {item.text}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    handleLanguageSelect(
                      item.lang
                    )
                  }
                  className="group/button flex w-full cursor-pointer items-center justify-between rounded-full border border-amber-300/25 bg-white/5 px-6 py-4 font-serif text-xs uppercase tracking-[0.18em] text-stone-100 shadow-md backdrop-blur-md transition-all hover:border-amber-300/60 hover:bg-white/10"
                >
                  <span>
                    {item.label}
                  </span>

                  <ArrowRight
                    size={16}
                    className="text-amber-300 transition-transform group-hover/button:translate-x-1"
                  />
                </button>
              </div>
            ))}
          </div>
        </main>
      )}

      {/* QUESTIONS */}
      {currentStep > 0 &&
        currentStep <= 10 &&
        language && (
          <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 pb-16 pt-32 sm:pt-36">
            <div className="w-full">
              <div className="mb-5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-stone-500">
                <span className="flex items-center gap-2">
                  <Sparkles
                    size={12}
                    className="text-amber-300"
                  />

                  Query{' '}
                  {String(
                    currentStep
                  ).padStart(2, '0')}{' '}
                  / 10
                </span>

                <span>
                  Cast Protocol
                </span>
              </div>

              <div className="mb-6 rounded-[28px] border border-stone-800/80 bg-stone-900/80 p-6 text-lg leading-relaxed text-stone-100 shadow-xl backdrop-blur-xl md:p-8 md:text-xl">
                {renderQuestionText(
                  currentQuestion
                )}
              </div>

              <textarea
                autoFocus
                value={currentAnswer}
                onChange={e =>
                  setCurrentAnswer(
                    e.target.value
                  )
                }
                onKeyDown={handleKeyDown}
                disabled={loading}
                maxLength={4000}
                className="mb-6 min-h-[150px] w-full resize-none rounded-2xl border border-stone-800 bg-white/5 p-5 text-base text-stone-200 outline-none shadow-inner transition-all placeholder:text-stone-600 focus:border-amber-400/60 focus:bg-white/10"
                placeholder={
                  language === 'ru'
                    ? 'Пишите честно...'
                    : 'Answer honestly...'
                }
              />

              <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                <span className="order-2 font-mono text-[9px] uppercase tracking-[0.18em] text-stone-600 sm:order-1">
                  {language === 'ru'
                    ? '[ PRESS ENTER ДЛЯ ОТПРАВКИ ]'
                    : '[ PRESS ENTER TO TRANSMIT ]'}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    void handleNext()
                  }
                  disabled={
                    !isAnswerValid ||
                    loading
                  }
                  className="order-1 w-full cursor-pointer rounded-full border border-amber-300/30 bg-white/10 px-8 py-4 font-serif text-xs font-medium uppercase tracking-[0.18em] text-stone-100 shadow-md backdrop-blur-md transition-all hover:border-amber-300/60 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-25 sm:order-2 sm:w-auto"
                >
                  {currentStep === 10
                    ? language === 'ru'
                      ? 'АНАЛИЗ'
                      : 'ANALYZE'
                    : language === 'ru'
                      ? 'ДАЛЕЕ'
                      : 'NEXT'}
                </button>
              </div>
            </div>
          </main>
        )}

      {/* RESULT */}
      {currentStep === 11 && (
        <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-1 flex-col px-6 pb-20 pt-32 sm:pt-36">
          {loading ? (
            <div className="flex min-h-[60vh] flex-col items-center justify-center">
              <div
                className="flex items-center gap-2 text-center font-mono text-xs tracking-[0.28em] text-amber-300 md:text-sm"
                role="status"
                aria-live="polite"
              >
                <RefreshCw
                  className="animate-spin"
                  size={15}
                />

                {processingText ||
                  'INITIATING CORE...'}
              </div>

              <div className="mt-8 h-px w-64 overflow-hidden bg-stone-800">
                <div className="h-full w-1/3 animate-progress-indeterminate bg-amber-400" />
              </div>
            </div>
          ) : error ? (
            <div className="flex min-h-[60vh] items-center justify-center text-center">
              <div
                className="w-full max-w-lg rounded-[28px] border border-stone-800/80 bg-stone-900/80 p-8 shadow-2xl backdrop-blur-xl"
                role="alert"
              >
                <AlertTriangle
                  size={24}
                  className="mx-auto mb-5 text-amber-400"
                />

                <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.25em] text-amber-300">
                  Core Error
                </div>

                <p className="mb-7 text-sm leading-relaxed text-stone-400">
                  {error}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    void handleRetry()
                  }
                  disabled={
                    answers.length !==
                      10 || loading
                  }
                  className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-white/5 px-6 py-3 font-serif text-xs uppercase tracking-[0.18em] text-stone-100 transition-all hover:border-amber-300/60 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <RefreshCw size={14} />

                  {language === 'ru'
                    ? 'Повторить анализ'
                    : 'Retry Analysis'}
                </button>
              </div>
            </div>
          ) : analysisData ? (
            <>
              <div className="relative mb-8 overflow-hidden rounded-[28px] border border-stone-800/80 bg-stone-900/85 p-6 shadow-2xl backdrop-blur-2xl md:p-10">
                {showStamp &&
                  archetype && (
                    <Stamp
                      type={archetype}
                    />
                  )}

                <div className="mb-6 flex flex-col justify-between gap-2 border-b border-stone-800 pb-4 font-mono text-[9px] uppercase tracking-[0.2em] text-stone-500 sm:flex-row">
                  <span>
                    Subject:{' '}
                    {user?.email ||
                      'Anonymous'}
                  </span>

                  <span>
                    Protocol ID:{' '}
                    {recordId
                      ? recordId.slice(
                          0,
                          8
                        )
                      : 'LOCAL'}
                  </span>
                </div>

                <pre className="whitespace-pre-wrap font-mono text-xs font-light leading-loose text-stone-300 md:text-sm">
                  {displayedText}

                  {displayedText.length <
                    formatAnalysisText(
                      analysisData,
                      language
                    ).length && (
                    <span className="ml-1 inline-block w-2 bg-amber-400 px-1 text-stone-950 animate-pulse">
                      {' '}
                    </span>
                  )}
                </pre>
              </div>

              {!user &&
                recordId &&
                captureToken && (
                  <div className="mb-8 rounded-[28px] border border-stone-800/80 bg-stone-950/80 p-6 backdrop-blur-xl md:p-8">
                    <h3 className="mb-2 font-serif text-sm uppercase tracking-[0.12em] text-stone-100">
                      {language === 'ru'
                        ? 'Сохранить результат в Архиве'
                        : 'Persist Result in Archive'}
                    </h3>

                    <p className="mb-5 text-xs leading-relaxed text-stone-400">
                      {language === 'ru'
                        ? 'Введите email, чтобы привязать профиль и получить копию.'
                        : 'Enter email to secure your archetype and receive records.'}
                    </p>

                    {emailSent ? (
                      <div
                        className="py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-300"
                        role="status"
                      >
                        {language === 'ru'
                          ? '✓ Протокол зафиксирован за вашим email'
                          : '✓ Protocol secured to your email'}
                      </div>
                    ) : (
                      <>
                        <form
                          onSubmit={
                            handleEmailSubmit
                          }
                          className="flex flex-col gap-3 sm:flex-row"
                        >
                          <input
                            type="email"
                            required
                            maxLength={254}
                            placeholder="name@domain.com"
                            value={email}
                            onChange={e =>
                              setEmail(
                                e.target.value
                              )
                            }
                            disabled={
                              emailLoading
                            }
                            className="flex-1 rounded-full border border-stone-800 bg-white/5 px-5 py-3 text-sm text-stone-200 outline-none transition-all placeholder:text-stone-600 focus:border-amber-400/60 focus:bg-white/10 disabled:opacity-50"
                          />

                          <button
                            type="submit"
                            disabled={
                              emailLoading
                            }
                            className="rounded-full border border-amber-300/25 bg-white/5 px-6 py-3 font-serif text-xs uppercase tracking-[0.16em] text-stone-100 transition-all hover:border-amber-300/60 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {emailLoading
                              ? '...'
                              : language ===
                                  'ru'
                                ? 'Сохранить'
                                : 'Secure'}
                          </button>
                        </form>

                        {emailError && (
                          <p
                            className="mt-3 text-xs text-red-400"
                            role="alert"
                          >
                            {emailError}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

              <div className="mt-8 text-center">
                <Link
                  href="/temple"
                  className="inline-block rounded-full border border-amber-300/20 bg-white/5 px-6 py-3 font-serif text-xs uppercase tracking-[0.18em] text-stone-400 transition-all hover:border-amber-300/50 hover:bg-white/10 hover:text-stone-100"
                >
                  [ Return to Temple ]
                </Link>
              </div>
            </>
          ) : null}
        </main>
      )}
    </div>
  );
}