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

type Archetype =
  (typeof ARCHETYPES)[number];

interface AnalysisData {
  archetype: Archetype;
  agency_index: number;
  scores: Record<
    Archetype,
    number
  >;
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

function renderQuestionText(
  text: string
) {
  const parts = text.split(
    /(\*\*.*?\*\*)/g
  );

  return parts.map(
    (part, index) => {
      if (
        part.startsWith('**') &&
        part.endsWith('**')
      ) {
        return (
          <strong
            key={index}
            className="font-bold text-white"
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
    }
  );
}

function Stamp({
  type,
}: {
  type: string;
}) {
  const colors: Record<
    string,
    string
  > = {
    VOID:
      'text-zinc-500 border-zinc-500',
    NOISE:
      'text-red-500 border-red-500',
    STONE:
      'text-stone-400 border-stone-400',
    UNFRAMED:
      'text-white border-white',
  };

  const style =
    colors[type] ||
    colors.VOID;

  return (
    <div className="absolute top-6 right-6 md:top-10 md:right-10 rotate-6 opacity-0 animate-in fade-in zoom-in duration-500 z-20 pointer-events-none">
      <div
        className={`border-2 md:border-4 ${style} px-4 py-2 font-black text-2xl md:text-4xl uppercase tracking-widest backdrop-blur-sm bg-black/40 shadow-[0_0_30px_rgba(0,0,0,0.8)]`}
      >
        [{type}]
      </div>
    </div>
  );
}

function useProcessing(
  isLoading: boolean
) {
  const [text, setText] =
    useState('');

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

    const interval =
      window.setInterval(() => {
        currentStep += 1;

        if (
          currentStep <
          messages.length
        ) {
          setText(
            messages[currentStep]
          );
        }
      }, 1200);

    return () =>
      window.clearInterval(
        interval
      );
  }, [isLoading, messages]);

  return {
    processingText: text,
  };
}

export default function CastClient() {
  const { user } =
    useAuth();

  const [language, setLanguage] =
    useState<
      'en' | 'ru' | null
    >(null);

  const [currentStep, setCurrentStep] =
    useState(0);

  const [answers, setAnswers] =
    useState<string[]>([]);

  const [currentAnswer, setCurrentAnswer] =
    useState('');

  const [analysisData, setAnalysisData] =
    useState<AnalysisData | null>(
      null
    );

  const [displayedText, setDisplayedText] =
    useState('');

  const [archetype, setArchetype] =
    useState<Archetype | ''>(
      ''
    );

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  const [showStamp, setShowStamp] =
    useState(false);

  const [email, setEmail] =
    useState('');

  const [recordId, setRecordId] =
    useState<string | null>(
      null
    );

  const [captureToken, setCaptureToken] =
    useState<string | null>(
      null
    );

  const [emailSent, setEmailSent] =
    useState(false);

  const [emailLoading, setEmailLoading] =
    useState(false);

  const [emailError, setEmailError] =
    useState('');

  const {
    processingText,
  } = useProcessing(
    loading
  );

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
      ? questions[
          currentStep - 1
        ]
      : '';

  const isAnswerValid =
    currentAnswer.trim()
      .length > 2;

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
    let timeoutId: number | null =
      null;

    setDisplayedText('');
    setShowStamp(false);

    const interval =
      window.setInterval(() => {
        const nextChunk =
          formatted.slice(
            index,
            index + 3
          );

        index += nextChunk.length;

        setDisplayedText(
          formatted.slice(
            0,
            index
          )
        );

        if (
          index >=
          formatted.length
        ) {
          window.clearInterval(
            interval
          );

          timeoutId =
            window.setTimeout(
              () =>
                setShowStamp(
                  true
                ),
              400
            );
        }
      }, 18);

    return () => {
      window.clearInterval(
        interval
      );

      if (
        timeoutId !== null
      ) {
        window.clearTimeout(
          timeoutId
        );
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
            agency:
              'ИНДЕКС АГЕНТНОСТИ',
            scores:
              'БАЛЛЫ АРХЕТИПОВ',
            summary:
              'РЕЗЮМЕ',
            weaknesses:
              'СТРУКТУРНЫЕ СЛАБОСТИ',
            assets:
              'КЛЮЧЕВЫЕ АКТИВЫ',
            directive:
              'СТРАТЕГИЧЕСКАЯ ДИРЕКТИВА',
          }
        : {
            agency:
              'AGENCY INDEX',
            scores:
              'ARCHETYPE SCORES',
            summary:
              'EXECUTIVE SUMMARY',
            weaknesses:
              'STRUCTURAL WEAKNESSES',
            assets:
              'CORE ASSETS',
            directive:
              'STRATEGIC DIRECTIVE',
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
        data: {
          session,
        },
      } =
        await supabase.auth.getSession();

      const token =
        session?.access_token ||
        '';

      const res =
        await fetch(
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
              answers:
                finalAnswers,
              language,
            }),
          }
        );

      let data: CastResponse;

      try {
        data =
          await res.json();
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
        data.analysis
          .agency_index <
          0 ||
        data.analysis
          .agency_index >
          100
      ) {
        throw new Error(
          'The Core returned an invalid Agency Index.'
        );
      }

      setAnalysisData(
        data.analysis
      );

      setArchetype(
        normalizedArchetype
      );

      setRecordId(
        data.recordId
      );

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

    setAnswers(
      newAnswers
    );
    setCurrentAnswer('');

    if (currentStep < 10) {
      setCurrentStep(
        currentStep + 1
      );
      return;
    }

    setCurrentStep(11);

    await runAnalysis(
      newAnswers
    );
  }

  async function handleRetry() {
    if (
      answers.length !== 10 ||
      !language ||
      loading
    ) {
      return;
    }

    await runAnalysis(
      answers
    );
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
      const res =
        await fetch(
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
              email:
                email.trim(),
            }),
          }
        );

      const data =
        await res
          .json()
          .catch(
            () => null
          );

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
    <div className="min-h-screen bg-[#0A0A0A] text-white font-mono flex flex-col relative selection:bg-orange-500/30 overflow-x-hidden antialiased">
      <TempleTopBar backTo="temple" />

      {currentStep === 0 && (
        <div className="flex-1 flex items-center justify-center p-6 relative z-10 pt-28 pb-16">
          <div className="max-w-4xl w-full grid md:grid-cols-2 gap-8 animate-in fade-in duration-700">
            {[
              {
                lang: 'en' as const,
                label:
                  '[ START IN ENGLISH ]',
                title:
                  'Protocol 01',
                text:
                  'I spent 20 years building a personal myth and 2 years deconstructing it with AI. This Protocol deconstructs your answers and measures your Agency Index.',
              },
              {
                lang: 'ru' as const,
                label:
                  '[ НАЧАТЬ НА РУССКОМ ]',
                title:
                  'Протокол 01',
                text:
                  'Этот Протокол анализирует ваши ответы, вычисляет Индекс Агентности и определяет ваш психологический архетип.',
              },
            ].map(item => (
              <div
                key={item.lang}
                className="space-y-6 flex flex-col justify-center bg-zinc-900/40 border border-zinc-800/80 p-8 rounded-2xl backdrop-blur-xl"
              >
                <div className="flex items-center gap-2 text-xs text-orange-500 uppercase tracking-widest">
                  <Terminal
                    size={14}
                  />
                  {item.title}
                </div>

                <p className="text-zinc-300 text-sm md:text-base leading-relaxed tracking-wide">
                  {item.text}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    handleLanguageSelect(
                      item.lang
                    )
                  }
                  className="group flex items-center justify-between text-white text-sm tracking-[0.2em] transition-all bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-6 py-4 rounded-xl cursor-pointer"
                >
                  <span>
                    {item.label}
                  </span>

                  <ArrowRight
                    size={16}
                    className="group-hover:translate-x-1 transition-transform text-orange-500"
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {currentStep > 0 &&
        currentStep <= 10 &&
        language && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-28 relative z-10 max-w-2xl mx-auto w-full">
            <div className="w-full flex flex-col justify-center">
              <div className="flex justify-between items-center text-xs text-zinc-500 mb-6 uppercase tracking-[0.25em]">
                <span className="flex items-center gap-1.5">
                  <Sparkles
                    size={12}
                    className="text-orange-500"
                  />

                  Query{' '}
                  {String(
                    currentStep
                  ).padStart(
                    2,
                    '0'
                  )}{' '}
                  / 10
                </span>

                <span>
                  Cast Protocol
                </span>
              </div>

              <div className="text-white text-lg md:text-xl leading-relaxed mb-8 min-h-[90px] bg-zinc-950/60 border border-zinc-800 p-6 rounded-2xl backdrop-blur-md">
                {renderQuestionText(
                  currentQuestion
                )}
              </div>

              <textarea
                autoFocus
                value={
                  currentAnswer
                }
                onChange={e =>
                  setCurrentAnswer(
                    e.target.value
                  )
                }
                onKeyDown={
                  handleKeyDown
                }
                disabled={loading}
                maxLength={4000}
                className="w-full bg-zinc-900/60 text-zinc-200 text-base border border-zinc-800 focus:border-orange-500 focus:bg-black outline-none p-5 resize-none mb-6 placeholder-zinc-600 transition-all rounded-xl min-h-[130px] shadow-inner"
                placeholder={
                  language === 'ru'
                    ? 'Пишите честно...'
                    : 'Answer honestly...'
                }
              />

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <span className="text-[10px] text-zinc-600 uppercase tracking-widest order-2 sm:order-1">
                  {language ===
                  'ru'
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
                  className="w-full sm:w-auto text-xs text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-8 py-4 transition-all tracking-[0.2em] disabled:opacity-25 disabled:cursor-not-allowed uppercase font-bold rounded-xl cursor-pointer order-1 sm:order-2 shadow-lg"
                >
                  {currentStep ===
                  10
                    ? language ===
                      'ru'
                      ? 'АНАЛИЗ'
                      : 'ANALYZE'
                    : language ===
                        'ru'
                      ? 'ДАЛЕЕ'
                      : 'NEXT'}
                </button>
              </div>
            </div>
          </div>
        )}

      {currentStep === 11 && (
        <div className="flex-1 max-w-3xl mx-auto w-full px-6 pt-32 pb-20 relative z-10">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[50vh]">
              <div
                className="animate-pulse text-xs md:text-sm tracking-[0.3em] text-orange-400 flex items-center gap-2 text-center"
                role="status"
                aria-live="polite"
              >
                <RefreshCw
                  className="animate-spin shrink-0"
                  size={16}
                />

                {processingText ||
                  'INITIATING CORE...'}
              </div>

              <div className="w-64 h-1 bg-zinc-900 mt-8 overflow-hidden rounded-full">
                <div className="h-full bg-orange-500 animate-progress-indeterminate" />
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
              <div
                className="w-full max-w-lg border border-red-900/60 bg-red-950/20 rounded-3xl p-8 backdrop-blur-xl"
                role="alert"
              >
                <AlertTriangle
                  size={24}
                  className="text-red-500 mx-auto mb-5"
                />

                <div className="text-xs uppercase tracking-[0.25em] text-red-400 mb-4">
                  Core Error
                </div>

                <p className="text-sm leading-relaxed text-zinc-400 mb-7">
                  {error}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    void handleRetry()
                  }
                  disabled={
                    answers.length !==
                      10 ||
                    loading
                  }
                  className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-6 py-3 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <RefreshCw
                    size={14}
                  />

                  {language ===
                  'ru'
                    ? 'Повторить анализ'
                    : 'Retry Analysis'}
                </button>
              </div>
            </div>
          ) : analysisData ? (
            <>
              <div className="border border-zinc-800/80 p-6 md:p-10 bg-zinc-900/40 backdrop-blur-2xl relative shadow-2xl rounded-3xl overflow-hidden mb-8">
                {showStamp &&
                  archetype && (
                    <Stamp
                      type={
                        archetype
                      }
                    />
                  )}

                <div className="flex flex-col sm:flex-row justify-between gap-2 border-b border-zinc-800 pb-4 mb-6 text-[10px] text-zinc-500 tracking-[0.2em] uppercase">
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

                <pre className="whitespace-pre-wrap text-xs md:text-sm leading-loose text-zinc-300 font-light font-mono">
                  {displayedText}

                  {displayedText.length <
                    formatAnalysisText(
                      analysisData,
                      language
                    ).length && (
                    <span className="animate-pulse bg-orange-500 text-black px-1 ml-1 inline-block w-2">
                      {' '}
                    </span>
                  )}
                </pre>
              </div>

              {!user &&
                recordId &&
                captureToken && (
                  <div className="border border-zinc-800 p-6 md:p-8 bg-zinc-950/80 rounded-2xl mb-8 backdrop-blur-xl">
                    <h3 className="text-sm uppercase tracking-widest text-white mb-2">
                      {language ===
                      'ru'
                        ? 'Сохранить результат в Архиве'
                        : 'Persist Result in Archive'}
                    </h3>

                    <p className="text-xs text-zinc-400 mb-4">
                      {language ===
                      'ru'
                        ? 'Введите email, чтобы привязать профиль и получить копию.'
                        : 'Enter email to secure your archetype and receive records.'}
                    </p>

                    {emailSent ? (
                      <div
                        className="text-xs text-orange-400 uppercase tracking-widest py-3"
                        role="status"
                      >
                        {language ===
                        'ru'
                          ? '✓ Протокол зафиксирован за вашим email'
                          : '✓ Protocol secured to your email'}
                      </div>
                    ) : (
                      <>
                        <form
                          onSubmit={
                            handleEmailSubmit
                          }
                          className="flex flex-col sm:flex-row gap-3"
                        >
                          <input
                            type="email"
                            required
                            maxLength={
                              254
                            }
                            placeholder="name@domain.com"
                            value={
                              email
                            }
                            onChange={e =>
                              setEmail(
                                e.target
                                  .value
                              )
                            }
                            disabled={
                              emailLoading
                            }
                            className="flex-1 bg-zinc-900 text-zinc-200 text-sm border border-zinc-800 focus:border-orange-500 outline-none px-4 py-3 rounded-xl disabled:opacity-50"
                          />

                          <button
                            type="submit"
                            disabled={
                              emailLoading
                            }
                            className="text-xs font-bold uppercase tracking-widest bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 px-6 py-3 rounded-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
                            {
                              emailError
                            }
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

              <div className="text-center mt-8">
                <Link
                  href="/temple"
                  className="text-xs text-zinc-500 hover:text-white transition-colors tracking-[0.3em] uppercase border border-zinc-800 px-6 py-3 rounded-full inline-block bg-zinc-900/50"
                >
                  [ Return to Temple ]
                </Link>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}