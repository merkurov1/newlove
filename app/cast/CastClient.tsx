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
import useTempleIdentity from '@/hooks/useTempleIdentity';
import { createClient } from '@/lib/supabase/client';
import {
  readRitualDraft,
  writeRitualDraft,
} from '@/lib/temple/ritualDraft';
import { readPublicIdentityPreference } from '@/lib/temple/publicIdentity';

const CAST_DRAFT_KEY = 'cast:draft:v1';

export type CastVariant = 'page' | 'modal';

type CastTheme = {
  page: string;
  title: string;
  ambientCore: string;
  ambientWash: string;
  panel: string;
  panelSoft: string;
  heading: string;
  body: string;
  muted: string;
  faint: string;
  accent: string;
  accentSoft: string;
  divider: string;
  input: string;
  primaryButton: string;
  secondaryButton: string;
  choiceButton: string;
  choiceMeta: string;
  analysis: string;
  cursor: string;
  errorText: string;
  stampSurface: string;
};

/**
 * Standalone /cast keeps the Sanctuary's daylight palette. The intercepted
 * modal uses the same type scale and geometry inside the dark ritual shell.
 */
const CAST_THEME: Record<CastVariant, CastTheme> = {
  page: {
    page: 'bg-[#FAF8F5] text-stone-900',
    title: 'text-amber-800',
    ambientCore: 'bg-amber-200/40',
    ambientWash:
      'bg-[radial-gradient(circle_at_50%_35%,rgba(160,120,60,0.12),transparent_48%)]',
    panel:
      'border-stone-300/80 bg-white/80 text-stone-900 shadow-[0_24px_80px_rgba(70,55,35,0.10)] backdrop-blur-xl',
    panelSoft:
      'border-stone-300/70 bg-white/65 text-stone-900 shadow-sm backdrop-blur-xl',
    heading: 'text-stone-900',
    body: 'text-stone-700',
    muted: 'text-stone-600',
    faint: 'text-stone-600',
    accent: 'text-amber-700',
    accentSoft: 'text-amber-800',
    divider: 'border-stone-300/80',
    input:
      'border-stone-300 bg-white/80 text-stone-900 placeholder:text-stone-500 focus:border-amber-600 focus:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700',
    primaryButton:
      'border-amber-700/35 bg-amber-100/70 text-stone-900 hover:border-amber-700/60 hover:bg-amber-100 disabled:opacity-30',
    secondaryButton:
      'border-stone-300 bg-white/80 text-stone-700 hover:border-amber-600/50 hover:bg-white',
    choiceButton:
      'border-stone-300 bg-white/80 text-stone-900 hover:border-amber-700/60 hover:bg-white',
    choiceMeta: 'text-amber-800',
    analysis: 'text-stone-700',
    cursor: 'bg-amber-600 text-stone-50',
    errorText: 'text-red-700',
    stampSurface: 'bg-white/70',
  },
  modal: {
    page: 'bg-[#141210] text-stone-200',
    title: 'text-amber-300/80',
    ambientCore: 'bg-amber-900/20',
    ambientWash:
      'bg-[radial-gradient(circle_at_50%_35%,rgba(120,80,20,0.10),transparent_45%)]',
    panel:
      'border-stone-800/80 bg-stone-900/80 text-stone-100 shadow-xl backdrop-blur-xl',
    panelSoft:
      'border-stone-800/80 bg-stone-950/80 text-stone-200 shadow-xl backdrop-blur-xl',
    heading: 'text-stone-100',
    body: 'text-stone-300',
    muted: 'text-stone-300',
    faint: 'text-stone-400',
    accent: 'text-amber-300',
    accentSoft: 'text-amber-300/80',
    divider: 'border-stone-800',
    input:
      'border-stone-800 bg-white/5 text-stone-200 placeholder:text-stone-400 focus:border-amber-400/60 focus:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300',
    primaryButton:
      'border-amber-300/30 bg-white/10 text-stone-100 hover:border-amber-300/60 hover:bg-white/15 disabled:opacity-25',
    secondaryButton:
      'border-amber-300/25 bg-white/5 text-stone-100 hover:border-amber-300/60 hover:bg-white/10',
    choiceButton:
      'border-stone-700/80 bg-white/[0.04] text-stone-100 hover:border-amber-300/50 hover:bg-white/[0.08]',
    choiceMeta: 'text-amber-200',
    analysis: 'text-stone-300',
    cursor: 'bg-amber-400 text-stone-950',
    errorText: 'text-red-300',
    stampSurface: 'bg-stone-950/50',
  },
};

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
  'Are you ready to see your archetype?',
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
  'Вы готовы увидеть свой архетип?',
];

const ARCHETYPES = [
  'VOID',
  'NOISE',
  'STONE',
  'UNFRAMED',
] as const;

type Archetype = (typeof ARCHETYPES)[number];

type CastLanguage = 'en' | 'ru';

/**
 * One locale policy for the Cast.
 *
 * The Temple, Vigil and Absolution are authored in English only. The Cast is
 * the single ritual that offers a full Russian reading, and the choice is
 * explicit, stored in the draft, and applied to every stage of the ritual
 * (questions, progress, result labels, errors and controls). Never mix the
 * two languages inside one stage.
 */
const CAST_COPY: Record<
  CastLanguage,
  {
    pageTitle: string;
    languageTitle: string;
    languageGroup: string;
    disclosureTitle: string;
    disclosure: string;
    questionCounter: (step: number) => string;
    stageLabel: string;
    shortDisclosure: string;
    placeholder: string;
    enterHint: string;
    next: string;
    analyze: string;
    processing: string[];
    initiating: string;
    errorTitle: string;
    retry: string;
    subject: string;
    readingNumber: string;
    interpretation: string;
    archiveTitle: string;
    archiveBody: string;
    saved: string;
    secure: string;
    returnToTemple: string;
    genericError: string;
    emailError: string;
    labels: {
      agency: string;
      scores: string;
      summary: string;
      weaknesses: string;
      assets: string;
      directive: string;
    };
  }
> = {
  en: {
    pageTitle: 'The Cast — A Reading of the Self',
    languageTitle: 'Choose your language',
    languageGroup: 'Reading language',
    disclosureTitle: 'Before you begin',
    disclosure:
      'Your answers are sent to an external AI model (DeepSeek) to generate this reflection. The result is stored privately in the Temple Cast archive; signed-in readings keep the answers in your account, while anonymous readings do not retain raw answers. Adding an email links the result to you. Only the archetype and a display name may appear in the public Temple trace — never your answers. This is an interpretive ritual, not a clinical diagnosis.',
    questionCounter: (step) =>
      `Question ${String(step).padStart(2, '0')} / 10`,
    stageLabel: 'The Cast',
    shortDisclosure:
      'Answers are sent to DeepSeek AI and stored privately. Only the archetype may appear publicly. This is not a diagnosis.',
    placeholder: 'Answer honestly...',
    enterHint: '[ PRESS ENTER TO SEND ]',
    next: 'NEXT',
    analyze: 'ANALYZE',
    processing: [
      'The Temple is listening…',
      'Reading what you left unsaid…',
      'Weighing your answers…',
      'Your archetype is taking shape…',
    ],
    initiating: 'The reading begins…',
    errorTitle: 'The reading was interrupted',
    retry: 'Try the reading again',
    subject: 'Pilgrim',
    readingNumber: 'Reading No.',
    interpretation: 'Archetype interpretation · not a clinical diagnosis',
    archiveTitle: 'Keep this reading',
    archiveBody:
      'Enter an email to keep this reading and receive a copy.',
    saved: '✓ Reading secured to your email',
    secure: 'Secure',
    returnToTemple: 'Return to the Temple',
    genericError: 'The reading could not be completed. Please try again.',
    emailError: 'This reading could not be linked to that email.',
    labels: {
      agency: 'AGENCY INDEX',
      scores: 'ARCHETYPE SCORES',
      summary: 'SUMMARY',
      weaknesses: 'WHERE YOU HESITATE',
      assets: 'WHAT HOLDS YOU',
      directive: 'WHAT TO DO NEXT',
    },
  },
  ru: {
    pageTitle: 'Каст — прочтение себя',
    languageTitle: 'Выберите язык',
    languageGroup: 'Язык прочтения',
    disclosureTitle: 'Прежде чем начать',
    disclosure:
      'Ответы отправляются внешней ИИ-модели (DeepSeek), чтобы создать это отражение. Результат хранится приватно в архиве Каста; у авторизованных чтений ответы остаются в аккаунте, а анонимные чтения не сохраняют сырые ответы. Если добавить email, результат привяжется к вам. В публичной хронике могут появиться только архетип и отображаемое имя — никогда ваши ответы. Это интерпретирующий ритуал, а не клинический диагноз.',
    questionCounter: (step) =>
      `Вопрос ${String(step).padStart(2, '0')} / 10`,
    stageLabel: 'Каст',
    shortDisclosure:
      'Ответы отправляются ИИ DeepSeek и хранятся приватно. Публично может появиться только архетип. Это не диагноз.',
    placeholder: 'Пишите честно...',
    enterHint: '[ ENTER — ОТПРАВИТЬ ]',
    next: 'ДАЛЕЕ',
    analyze: 'АНАЛИЗ',
    processing: [
      'Храм слушает…',
      'Читаем то, что осталось несказанным…',
      'Взвешиваем ваши ответы…',
      'Ваш архетип обретает форму…',
    ],
    initiating: 'Прочтение начинается…',
    errorTitle: 'Прочтение прервалось',
    retry: 'Попробовать снова',
    subject: 'Пилигрим',
    readingNumber: 'Прочтение №',
    interpretation: 'Интерпретация архетипа · не клинический диагноз',
    archiveTitle: 'Сохранить прочтение',
    archiveBody:
      'Введите email, чтобы сохранить прочтение и получить копию.',
    saved: '✓ Прочтение привязано к вашему email',
    secure: 'Сохранить',
    returnToTemple: 'Вернуться в Храм',
    genericError: 'Прочтение не завершилось. Попробуйте ещё раз.',
    emailError: 'Не удалось привязать прочтение к этому email.',
    labels: {
      agency: 'ИНДЕКС АГЕНТНОСТИ',
      scores: 'БАЛЛЫ АРХЕТИПОВ',
      summary: 'КОРОТКО',
      weaknesses: 'ГДЕ ВЫ МЕДЛИТЕ',
      assets: 'ЧТО ВАС ДЕРЖИТ',
      directive: 'ЧТО ДЕЛАТЬ ДАЛЬШЕ',
    },
  },
};

const CAST_TECHNICAL_ERROR =
  /core|protocol|database|supabase|payload|http\s*\d|network|invalid response|incomplete|internal|api|claim|unavailable/i;

function castErrorMessage(
  message: unknown,
  language: CastLanguage | null
): string {
  const copy = CAST_COPY[language ?? 'en'];

  if (typeof message !== 'string' || !message.trim()) {
    return copy.genericError;
  }

  if (
    CAST_TECHNICAL_ERROR.test(message) ||
    (language === 'ru' && !/[А-Яа-яЁё]/.test(message))
  ) {
    return copy.genericError;
  }

  return message;
}


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

type CastDraft = {
  language: 'en' | 'ru' | null;
  currentStep: number;
  answers: string[];
  currentAnswer: string;
  analysisData: AnalysisData | null;
  archetype: Archetype | '';
  recordId: string | null;
  captureToken: string | null;
  emailSent: boolean;
};

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
          className="font-semibold"
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
  variant,
}: {
  type: string;
  variant: CastVariant;
}) {
  const colors: Record<string, string> =
    variant === 'page'
      ? {
          VOID: 'text-stone-500 border-stone-500',
          NOISE: 'text-amber-700 border-amber-700',
          STONE: 'text-stone-700 border-stone-700',
          UNFRAMED: 'text-stone-900 border-stone-900',
        }
      : {
          VOID: 'text-stone-500 border-stone-500',
          NOISE: 'text-amber-400 border-amber-400',
          STONE: 'text-stone-300 border-stone-300',
          UNFRAMED: 'text-stone-100 border-stone-100',
        };

  const style = colors[type] || colors.VOID;

  return (
    <div className="cast-stamp pointer-events-none absolute right-5 top-5 z-20 md:right-8 md:top-8">
      <div
        className={`border-2 ${style} ${CAST_THEME[variant].stampSurface} px-2 py-1.5 font-mono text-lg font-bold uppercase tracking-[0.16em] backdrop-blur-sm sm:px-3 sm:py-2 sm:text-xl md:px-4 md:text-2xl md:text-3xl`}
      >
        [{type}]
      </div>
    </div>
  );
}

function useProcessing(
  isLoading: boolean,
  language: CastLanguage | null
) {
  const [text, setText] = useState('');

  const messages = useMemo(
    () => CAST_COPY[language ?? 'en'].processing,
    [language]
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

export default function CastClient({
  variant = 'page',
}: {
  variant?: CastVariant;
}) {
  const { user } = useAuth();
  const identity = useTempleIdentity();
  const isModal = variant === 'modal';
  const ui = CAST_THEME[variant];
  const subjectName = identity.displayName || user?.email || 'Anonymous';

  const [language, setLanguage] =
    useState<CastLanguage | null>(null);

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
    useProcessing(loading, language);

  const copy = CAST_COPY[language ?? 'en'];

  const supabase = useMemo(
    () => createClient(),
    []
  );

  const [draftReady, setDraftReady] =
    useState(false);

  // Restore once, then keep the draft in sync. Modal switching must not erase
  // answers or a finished analysis.
  useEffect(() => {
    const draft = readRitualDraft<CastDraft>(
      CAST_DRAFT_KEY
    );

    if (draft) {
      if (
        draft.language === 'en' ||
        draft.language === 'ru'
      ) {
        setLanguage(draft.language);
      }
      if (
        Number.isInteger(draft.currentStep) &&
        draft.currentStep >= 0 &&
        draft.currentStep <= 11
      ) {
        setCurrentStep(draft.currentStep);
      }
      if (Array.isArray(draft.answers)) {
        setAnswers(
          draft.answers.filter(
            (answer): answer is string =>
              typeof answer === 'string'
          )
        );
      }
      if (typeof draft.currentAnswer === 'string') {
        setCurrentAnswer(draft.currentAnswer);
      }
      if (draft.analysisData) {
        setAnalysisData(draft.analysisData);
      }
      if (isValidArchetype(draft.archetype)) {
        setArchetype(draft.archetype);
      }
      if (typeof draft.recordId === 'string') {
        setRecordId(draft.recordId);
      }
      if (typeof draft.captureToken === 'string') {
        setCaptureToken(draft.captureToken);
      }
      setEmailSent(Boolean(draft.emailSent));
    }

    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (!draftReady) return;

    writeRitualDraft<CastDraft>(CAST_DRAFT_KEY, {
      language,
      currentStep,
      answers,
      currentAnswer,
      analysisData,
      archetype,
      recordId,
      captureToken,
      emailSent,
    });
  }, [
    analysisData,
    answers,
    archetype,
    captureToken,
    currentAnswer,
    currentStep,
    draftReady,
    emailSent,
    language,
    recordId,
  ]);

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
    lang: CastLanguage
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
    resultArchetype: CastLanguage | null
  ) {
    const labels = CAST_COPY[resultArchetype ?? 'en'].labels;

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
            show_identity: readPublicIdentityPreference(),
          }),
        }
      );

      let data: CastResponse;

      try {
        data = await res.json();
      } catch {
        throw new Error(
          'The reading could not be completed.'
        );
      }

      if (!res.ok) {
        throw new Error(
          data.error ||
            'The reading could not be completed.'
        );
      }

      if (
        !data.analysis ||
        !data.archetype ||
        !data.recordId ||
        !data.captureToken
      ) {
        throw new Error(
          'The reading came back incomplete.'
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
          'The reading returned an unknown archetype.'
        );
      }

      if (
        data.analysis.agency_index < 0 ||
        data.analysis.agency_index > 100
      ) {
        throw new Error(
          'The reading returned an invalid score.'
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
        castErrorMessage(
          err instanceof Error ? err.message : null,
          language
        )
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
            'This reading could not be linked to that email.'
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
        castErrorMessage(
          err instanceof Error ? err.message : null,
          language
        )
      );
    } finally {
      setEmailLoading(false);
    }
  }

  return (
    <div
      className={`cast-page ${
        isModal ? 'cast-page--modal min-h-full' : 'min-h-[100dvh]'
      } relative flex w-full flex-col overflow-x-hidden font-sans antialiased selection:bg-amber-500/30 ${ui.page}`}
      data-cast-variant={variant}
      lang={language ?? 'en'}
    >
      {/* Ambient Temple light */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
      >
        <div
          className={`absolute left-1/2 top-[42%] h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[130px] ${ui.ambientCore}`}
        />

        <div
          className={`absolute inset-0 ${ui.ambientWash}`}
        />
      </div>

      {!isModal && <TempleTopBar backTo="temple" />}

      {!isModal && (
        <h1
          className={`relative z-10 mx-auto mt-24 max-w-4xl px-6 font-serif text-xs uppercase tracking-[0.3em] sm:mt-28 ${ui.title}`}
        >
          The Cast — A Reading of the Self
        </h1>
      )}

      {/* LANGUAGE SELECT — minimal first screen, no card pair */}
      {currentStep === 0 && (
        <div className="cast-stage relative z-10 flex flex-1 items-center justify-center px-6 pb-16 pt-12 sm:pt-16">
          <section
            className={`cast-intro w-full max-w-xl overflow-hidden rounded-[2rem] border p-7 text-center animate-in fade-in duration-700 sm:p-10 ${ui.panel}`}
            aria-labelledby="cast-language-title"
            data-testid="cast-language-select"
          >
            <span
              className={`inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.28em] ${ui.accentSoft}`}
            >
              <Terminal size={12} aria-hidden="true" />
              The Digital Temple
            </span>

            <h2
              id="cast-language-title"
              className={`mt-4 font-serif text-3xl tracking-[0.02em] sm:text-4xl ${ui.heading}`}
            >
              {copy.languageTitle}
            </h2>

            <div
              aria-hidden="true"
              className={`mx-auto mt-5 h-px w-14 ${
                isModal ? 'bg-amber-300/30' : 'bg-amber-700/30'
              }`}
            />

            {/*
             * Consent must precede participation. This disclosure is visible on
             * the first screen, before a language is chosen or any question is
             * answered, and names the AI processor, private storage and the
             * public boundary in plain language.
             */}
            <section
              data-testid="cast-disclosure"
              aria-labelledby="cast-disclosure-title"
              className={`mt-6 rounded-2xl border px-4 py-4 text-left ${
                isModal
                  ? 'border-stone-700/80 bg-stone-950/45'
                  : 'border-stone-300/80 bg-white/60'
              }`}
            >
              <h3
                id="cast-disclosure-title"
                className={`font-mono text-[9px] font-semibold uppercase tracking-[0.22em] ${ui.accentSoft}`}
              >
                Before you begin
              </h3>

              <p className={`mt-2 text-[11px] leading-relaxed ${ui.body}`}>
                Your answers are sent to an external AI model (DeepSeek) to
                generate this reflection. The result is stored privately in the
                Temple Cast archive; signed-in readings keep the answers in your
                account, while anonymous readings do not retain raw answers.
                Adding an email links the result to you. Only the archetype and
                a display name may appear in the public Temple trace — never
                your answers. This is an interpretive ritual, not a clinical
                diagnosis.
              </p>

              <p
                lang="ru"
                className={`mt-2 text-[10px] leading-relaxed ${ui.muted}`}
              >
                Ответы отправляются внешней ИИ-модели DeepSeek. Результат
                хранится приватно; у авторизованных чтений ответы остаются в
                аккаунте, а анонимные чтения не сохраняют сырые ответы. В
                публичной хронике появляются только архетип и отображаемое имя,
                но не ответы. Это не клинический диагноз.
              </p>
            </section>

            <div
              role="group"
              aria-label={copy.languageGroup}
              className="mt-8 flex flex-col gap-3 sm:flex-row"
            >
              {(
                [
                  {
                    lang: 'en' as const,
                    label: 'English',
                    meta: 'EN',
                  },
                  {
                    lang: 'ru' as const,
                    label: 'Русский',
                    meta: 'RU',
                  },
                ] as const
              ).map(item => (
                <button
                  key={item.lang}
                  type="button"
                  lang={item.lang}
                  aria-label={`Continue in ${item.label}`}
                  onClick={() =>
                    handleLanguageSelect(
                      item.lang
                    )
                  }
                  className={`group/button flex min-h-[3.5rem] flex-1 items-center justify-between gap-4 rounded-full border px-6 py-4 font-serif text-sm tracking-[0.08em] shadow-sm transition-all ${ui.choiceButton}`}
                >
                  <span>{item.label}</span>

                  <span className="flex items-center gap-3">
                    <span
                      className={`font-mono text-[10px] uppercase tracking-[0.2em] ${ui.choiceMeta}`}
                    >
                      {item.meta}
                    </span>

                    <ArrowRight
                      size={16}
                      aria-hidden="true"
                      className="transition-transform group-hover/button:translate-x-1"
                    />
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* QUESTIONS */}
      {currentStep > 0 &&
        currentStep <= 10 &&
        language && (
          <div className="cast-stage relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 pb-16 pt-10 sm:pt-14">
            <div className="w-full">
              <div
                className={`mb-5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] ${ui.muted}`}
              >
                <span className="flex items-center gap-2">
                  <Sparkles
                    size={12}
                    aria-hidden="true"
                    className={ui.accent}
                  />

                  {copy.questionCounter(currentStep)}
                </span>

                <span>
                  {copy.stageLabel}
                </span>
              </div>

              <p
                data-testid="cast-question-disclosure"
                className={`mb-3 text-[10px] uppercase leading-relaxed tracking-[0.12em] ${ui.faint}`}
              >
                {copy.shortDisclosure}
              </p>

              <div
                className={`mb-4 rounded-[28px] border p-4 text-base leading-relaxed sm:mb-6 sm:p-6 sm:text-lg md:p-8 md:text-xl ${ui.panel}`}
              >
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
                className={`mb-4 min-h-[96px] w-full resize-none rounded-2xl border p-4 text-sm outline-none shadow-inner transition-all sm:mb-6 sm:min-h-[150px] sm:p-5 sm:text-base ${ui.input}`}
                placeholder={copy.placeholder}
              />

              <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                <span
                  className={`order-2 hidden font-mono text-[10px] uppercase tracking-[0.18em] sm:order-1 sm:inline ${ui.faint}`}
                >
                  {copy.enterHint}
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
                  className={`order-1 min-h-[44px] w-full cursor-pointer rounded-full border px-8 py-3 font-serif text-xs font-medium uppercase tracking-[0.18em] shadow-md backdrop-blur-md transition-all disabled:cursor-not-allowed sm:order-2 sm:w-auto sm:py-4 ${ui.primaryButton}`}
                >
                  {currentStep === 10
                    ? copy.analyze
                    : copy.next}
                </button>
              </div>
            </div>
          </div>
        )}

      {/* RESULT */}
      {currentStep === 11 && (
        <div className="cast-stage relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pb-20 pt-10 sm:pt-14">
          {loading ? (
            <div className="flex min-h-[50vh] flex-col items-center justify-center">
              <div
                className={`flex items-center gap-2 text-center font-mono text-xs tracking-[0.28em] md:text-sm ${ui.accent}`}
                role="status"
                aria-live="polite"
              >
                <RefreshCw
                  className="animate-spin"
                  size={15}
                  aria-hidden="true"
                />

                {processingText ||
                  copy.initiating}
              </div>

              <div
                className={`mt-8 h-px w-64 overflow-hidden ${
                  isModal ? 'bg-stone-800' : 'bg-stone-200'
                }`}
              >
                <div className="h-full w-1/3 animate-progress-indeterminate bg-amber-400" />
              </div>
            </div>
          ) : error ? (
            <div className="flex min-h-[50vh] items-center justify-center text-center">
              <div
                className={`w-full max-w-lg rounded-[28px] border p-8 ${ui.panel}`}
                role="alert"
              >
                <AlertTriangle
                  size={24}
                  aria-hidden="true"
                  className={`mx-auto mb-5 ${ui.accent}`}
                />

                <div
                  className={`mb-4 font-mono text-[10px] uppercase tracking-[0.25em] ${ui.accent}`}
                >
                  {copy.errorTitle}
                </div>

                <p
                  className={`mb-7 text-sm leading-relaxed ${ui.muted}`}
                >
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
                  className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-6 py-3 font-serif text-xs uppercase tracking-[0.18em] transition-all disabled:cursor-not-allowed ${ui.secondaryButton}`}
                >
                  <RefreshCw
                    size={14}
                    aria-hidden="true"
                  />

                  {copy.retry}
                </button>
              </div>
            </div>
          ) : analysisData ? (
            <>
              <div
                className={`relative mb-8 overflow-hidden rounded-[28px] border p-6 md:p-10 ${ui.panel}`}
              >
                {showStamp &&
                  archetype && (
                    <Stamp
                      type={archetype}
                      variant={variant}
                    />
                  )}

                <div
                  className={`mb-6 flex flex-col justify-between gap-2 border-b pb-4 pr-24 font-mono text-[9px] uppercase tracking-[0.2em] sm:flex-row sm:pr-40 ${ui.divider} ${ui.muted}`}
                >
                  <span>{copy.subject}: {subjectName}</span>

                  <span>
                    {copy.readingNumber}{' '}
                    {recordId
                      ? recordId.slice(
                          0,
                          8
                        )
                      : 'LOCAL'}
                  </span>
                </div>

                <p
                  className={`mb-4 text-[10px] uppercase leading-relaxed tracking-[0.12em] ${ui.muted}`}
                >
                  {copy.interpretation}
                </p>

                <pre
                  className={`whitespace-pre-wrap font-mono text-xs font-light leading-loose md:text-sm ${ui.analysis}`}
                >
                  {displayedText}

                  {displayedText.length <
                    formatAnalysisText(
                      analysisData,
                      language
                    ).length && (
                    <span
                      className={`ml-1 inline-block w-2 animate-pulse px-1 ${ui.cursor}`}
                    >
                      {' '}
                    </span>
                  )}
                </pre>
              </div>

              {!user &&
                recordId &&
                (captureToken || emailSent) && (
                  <div
                    className={`mb-8 rounded-[28px] border p-6 md:p-8 ${ui.panelSoft}`}
                  >
                    <h3
                      className={`mb-2 font-serif text-sm uppercase tracking-[0.12em] ${ui.heading}`}
                    >
                      {copy.archiveTitle}
                    </h3>

                    <p
                      className={`mb-5 text-xs leading-relaxed ${ui.muted}`}
                    >
                      {copy.archiveBody}
                    </p>

                    {emailSent ? (
                      <div
                        className={`py-3 font-mono text-[10px] uppercase tracking-[0.18em] ${ui.accent}`}
                        role="status"
                      >
                        {copy.saved}
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
                            className={`min-h-[44px] flex-1 rounded-full border px-5 py-3 text-sm outline-none transition-all disabled:opacity-50 ${ui.input}`}
                          />

                          <button
                            type="submit"
                            disabled={
                              emailLoading
                            }
                            className={`min-h-[44px] rounded-full border px-6 py-3 font-serif text-xs uppercase tracking-[0.16em] transition-all disabled:cursor-not-allowed ${ui.secondaryButton}`}
                          >
                            {emailLoading
                              ? '...'
                              : copy.secure}
                          </button>
                        </form>

                        {emailError && (
                          <p
                            className={`mt-3 text-xs ${ui.errorText}`}
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
                  className={`inline-block min-h-[44px] rounded-full border px-6 py-3 font-serif text-xs uppercase tracking-[0.18em] transition-all ${ui.secondaryButton}`}
                >
                  {copy.returnToTemple}
                </Link>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}